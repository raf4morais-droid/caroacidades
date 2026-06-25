import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const imagem360Schema = z.object({
  titulo: z.string().min(1).max(200),
  urlPanorama: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  heading: z.number().min(0).max(360).default(0),
  capturadoEm: z.string().optional(),
})

export const MIGRATION_IMAGENS_360 = `
  CREATE TABLE IF NOT EXISTS sigweb.imagens_360 (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo       VARCHAR(200) NOT NULL,
    url_panorama TEXT NOT NULL,
    geometry     GEOMETRY(POINT, 31982) NOT NULL,
    heading      DECIMAL(6,2) DEFAULT 0,
    capturado_em DATE,
    created_at   TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS imagens_360_gist_idx
    ON sigweb.imagens_360 USING GIST(geometry);
`

export async function imagens360Routes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Listar panoramas — opcionalmente filtrar por proximidade
  app.get('/imagens360', async (request) => {
    const { lat, lng, radius = '300' } = request.query as Record<string, string>

    if (lat && lng) {
      const rows = await query(`
        SELECT id, titulo, url_panorama,
               ST_Y(ST_Transform(geometry, 4326)) AS lat,
               ST_X(ST_Transform(geometry, 4326)) AS lng,
               heading, capturado_em,
               ST_Distance(geometry,
                 ST_Transform(ST_SetSRID(ST_MakePoint($2, $1), 4326), 31982)) AS distancia
        FROM sigweb.imagens_360
        WHERE ST_DWithin(
          geometry,
          ST_Transform(ST_SetSRID(ST_MakePoint($2, $1), 4326), 31982),
          $3
        )
        ORDER BY distancia
      `, [parseFloat(lat), parseFloat(lng), parseFloat(radius)])
      return { data: rows }
    }

    const rows = await query(`
      SELECT id, titulo, url_panorama,
             ST_Y(ST_Transform(geometry, 4326)) AS lat,
             ST_X(ST_Transform(geometry, 4326)) AS lng,
             heading, capturado_em
      FROM sigweb.imagens_360
      ORDER BY created_at DESC
    `)
    return { data: rows }
  })

  // Detalhe de um panorama + vizinhos para o virtual tour
  app.get('/imagens360/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const panorama = await queryOne(`
      SELECT id, titulo, url_panorama,
             ST_Y(ST_Transform(geometry, 4326)) AS lat,
             ST_X(ST_Transform(geometry, 4326)) AS lng,
             heading, capturado_em
      FROM sigweb.imagens_360 WHERE id = $1
    `, [id])

    if (!panorama) return reply.code(404).send({ error: 'Panorama não encontrado' })

    // Todos os panoramas próximos (para montar o grafo do virtual tour)
    const todos = await query(`
      SELECT id, titulo, url_panorama,
             ST_Y(ST_Transform(geometry, 4326)) AS lat,
             ST_X(ST_Transform(geometry, 4326)) AS lng,
             heading
      FROM sigweb.imagens_360
      ORDER BY created_at DESC
    `)

    return { ...panorama, todos }
  })

  // Criar panorama
  app.post('/imagens360',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = imagem360Schema.parse(request.body)

      const [row] = await query<{ id: string }>(`
        INSERT INTO sigweb.imagens_360 (titulo, url_panorama, geometry, heading, capturado_em)
        VALUES (
          $1, $2,
          ST_Transform(ST_SetSRID(ST_MakePoint($4, $3), 4326), 31982),
          $5, $6
        )
        RETURNING id
      `, [body.titulo, body.urlPanorama, body.lat, body.lng, body.heading, body.capturadoEm ?? null])

      reply.code(201)
      return { id: row.id }
    }
  )

  // Atualizar
  app.put('/imagens360/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = imagem360Schema.partial().parse(request.body)
      const sets: string[] = []
      const params: unknown[] = []
      let i = 1

      if (body.titulo)       { sets.push(`titulo = $${i++}`);       params.push(body.titulo) }
      if (body.urlPanorama)  { sets.push(`url_panorama = $${i++}`); params.push(body.urlPanorama) }
      if (body.heading != null) { sets.push(`heading = $${i++}`);   params.push(body.heading) }
      if (body.lat != null && body.lng != null) {
        sets.push(`geometry = ST_Transform(ST_SetSRID(ST_MakePoint($${i++}, $${i++}), 4326), 31982)`)
        params.push(body.lng, body.lat)
      }

      if (!sets.length) return reply.code(400).send({ error: 'Nada para atualizar' })

      params.push(id)
      await query(`UPDATE sigweb.imagens_360 SET ${sets.join(', ')} WHERE id = $${i}`, params)
      return { ok: true }
    }
  )

  // Deletar
  app.delete('/imagens360/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.imagens_360 WHERE id = $1`, [id])
      reply.code(204)
    }
  )
}
