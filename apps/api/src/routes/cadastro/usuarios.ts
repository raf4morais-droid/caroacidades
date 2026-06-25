import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getAuth } from 'firebase-admin/auth'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'
import { query } from '../../db/pool'
import { setUserPerfil } from '../../services/firebase.service'

const PERFIS = ['ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO', 'CIDADAO'] as const
const perfilSchema = z.enum(PERFIS)

export async function usuariosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Listar usuários do banco de dados
  app.get('/usuarios', { preHandler: requireRole('ADMIN') }, async () => {
    const rows = await query<{
      firebase_uid: string
      email: string | null
      nome: string | null
      perfil: string
      ativo: boolean
    }>(
      `SELECT firebase_uid, email, nome, perfil, ativo
       FROM sigweb.usuarios
       ORDER BY nome`)
    return rows.map(u => ({
      id: u.firebase_uid,
      firebase_uid: u.firebase_uid,
      email: u.email ?? '',
      nome: u.nome ?? '',
      perfil: u.perfil,
      ativo: u.ativo,
    }))
  })

  // Criar usuário com senha temporária e persistir no banco
  app.post('/usuarios', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      nome: z.string().min(2),
      senha: z.string().min(6),
      perfil: perfilSchema.default('FISCAL_CAMPO'),
    }).parse(request.body)

    const userRecord = await getAuth().createUser({
      email: body.email,
      displayName: body.nome,
      password: body.senha,
      emailVerified: false,
    })
    await setUserPerfil(userRecord.uid, body.perfil)

    await query(
      `INSERT INTO sigweb.usuarios (firebase_uid, email, nome, perfil, ativo)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (firebase_uid) DO UPDATE
         SET email = EXCLUDED.email,
             nome = EXCLUDED.nome,
             perfil = EXCLUDED.perfil,
             ativo = true,
             updated_at = now()`,
      [userRecord.uid, body.email, body.nome, body.perfil]
    )

    reply.code(201)
    return { id: userRecord.uid }
  })

  // Alterar perfil (seta custom claim — usuário precisa refazer login)
  app.patch('/usuarios/:uid/perfil', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { uid } = request.params as { uid: string }
    const { perfil } = z.object({ perfil: perfilSchema }).parse(request.body)
    await setUserPerfil(uid, perfil)
    await query(
      `UPDATE sigweb.usuarios SET perfil = $2, updated_at = now() WHERE firebase_uid = $1`,
      [uid, perfil]
    )
    return { ok: true }
  })

  // Ativar / desativar acesso
  app.patch('/usuarios/:uid/ativo', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { uid } = request.params as { uid: string }
    const { ativo } = z.object({ ativo: z.boolean() }).parse(request.body)
    await getAuth().updateUser(uid, { disabled: !ativo })
    await query(
      `UPDATE sigweb.usuarios SET ativo = $2, updated_at = now() WHERE firebase_uid = $1`,
      [uid, ativo]
    )
    return { ok: true }
  })

  // Excluir permanentemente
  app.delete('/usuarios/:uid', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { uid } = request.params as { uid: string }
    await getAuth().deleteUser(uid)
    await query(`DELETE FROM sigweb.usuarios WHERE firebase_uid = $1`, [uid])
    reply.code(204)
  })
}
