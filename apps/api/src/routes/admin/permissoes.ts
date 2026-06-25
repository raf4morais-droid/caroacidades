import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

export const MIGRATION_PERMISSOES = `
  CREATE TABLE IF NOT EXISTS sigweb.permissoes_modulo (
    modulo     TEXT    NOT NULL,
    perfil     TEXT    NOT NULL,
    habilitado BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (modulo, perfil)
  );
`

export async function permissoesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/permissoes', async () => {
    return query<{ modulo: string; perfil: string; habilitado: boolean }>(
      `SELECT modulo, perfil, habilitado FROM sigweb.permissoes_modulo`
    )
  })

  app.put(
    '/permissoes',
    { preHandler: requireRole('ADMIN') },
    async (request) => {
      const { modulo, perfil, habilitado } = z.object({
        modulo:     z.string().min(1),
        perfil:     z.string().min(1),
        habilitado: z.boolean(),
      }).parse(request.body)

      await query(
        `INSERT INTO sigweb.permissoes_modulo (modulo, perfil, habilitado)
         VALUES ($1, $2, $3)
         ON CONFLICT (modulo, perfil) DO UPDATE SET habilitado = EXCLUDED.habilitado`,
        [modulo, perfil, habilitado]
      )
      return { ok: true }
    }
  )
}
