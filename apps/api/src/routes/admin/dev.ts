import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

export async function devRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Apaga todos os dados do banco (TRUNCATE, mantém o schema) — uso exclusivo
  // de desenvolvimento. Bloqueado em produção e protegido por senha de servidor
  // (DEV_WIPE_PASSWORD), nunca exposta ao frontend.
  app.post(
    '/admin/wipe-db',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      if (process.env.NODE_ENV === 'production') {
        return reply.code(403).send({ error: 'Ação não disponível em produção' })
      }

      const { senha } = z.object({ senha: z.string().min(1) }).parse(request.body)
      const esperada = process.env.DEV_WIPE_PASSWORD
      if (!esperada || senha !== esperada) {
        return reply.code(401).send({ error: 'Senha incorreta' })
      }

      const tabelas = await query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'sigweb' AND table_type = 'BASE TABLE'`
      )

      if (tabelas.length > 0) {
        const lista = tabelas.map(t => `sigweb.${t.table_name}`).join(', ')
        await query(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`)
      }

      return { ok: true, tabelas: tabelas.length }
    }
  )
}
