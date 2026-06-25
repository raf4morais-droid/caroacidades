import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const EXPORT_FORMATS = ['csv', 'xml', 'xlsx'] as const

type ExportFormat = (typeof EXPORT_FORMATS)[number]

function escapeCsv(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.map(escapeCsv).join(',')]
  for (const row of rows) {
    lines.push(headers.map((key) => escapeCsv(row[key])).join(','))
  }
  return lines.join('\r\n')
}

function toXml(rootName: string, rows: Record<string, unknown>[]) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += `<${rootName}>\n`
  for (const row of rows) {
    xml += '  <row>\n'
    for (const [key, value] of Object.entries(row)) {
      xml += `    <${key}>${value == null ? '' : String(value)}</${key}>\n`
    }
    xml += '  </row>\n'
  }
  xml += `</${rootName}>\n`
  return xml
}

function toXlsx(rows: Record<string, unknown>[]) {
  const { utils, write } = require('xlsx')
  const worksheet = utils.json_to_sheet(rows)
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, 'export')
  return write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

const quadraSchema = z.object({
  codigo: z.string().min(1),
  loteamentoId: z.string().uuid().optional(),
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }).optional(),
})

export async function quadrasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/quadras', async (request) => {
    const { q } = request.query as Record<string, string | undefined>
    if (q && q.trim().length > 0) {
      return query(
        `SELECT q.id, q.codigo, q.loteamento_id,
                ST_AsGeoJSON(ST_Transform(q.geometry, 4326))::json AS geometry,
                l.nome AS loteamento_nome
         FROM sigweb.quadras q
         LEFT JOIN sigweb.loteamentos l ON l.id = q.loteamento_id
         WHERE q.codigo ILIKE $1
         ORDER BY q.codigo
         LIMIT 10`,
        [`%${q.trim()}%`]
      )
    }
    return query(
      `SELECT q.id, q.codigo, q.loteamento_id,
              ST_AsGeoJSON(ST_Transform(q.geometry, 4326))::json AS geometry,
              l.nome AS loteamento_nome
       FROM sigweb.quadras q
       LEFT JOIN sigweb.loteamentos l ON l.id = q.loteamento_id
       ORDER BY q.codigo`
    )
  })

  app.get('/quadras/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const quadra = await queryOne(
      `SELECT q.id, q.codigo, q.loteamento_id,
              ST_AsGeoJSON(ST_Transform(q.geometry, 4326))::json AS geometry,
              l.nome AS loteamento_nome
       FROM sigweb.quadras q
       LEFT JOIN sigweb.loteamentos l ON l.id = q.loteamento_id
       WHERE q.id = $1`,
      [id]
    )
    if (!quadra) return reply.code(404).send({ error: 'Quadra não encontrada' })
    return quadra
  })

  app.post(
    '/quadras',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = quadraSchema.parse(request.body)
      const params: unknown[] = [body.codigo, body.loteamentoId ?? null]
      const geomSql = body.geometry
        ? `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 31982)`
        : 'NULL'
      if (body.geometry) params.push(JSON.stringify(body.geometry))

      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.quadras (codigo, loteamento_id, geometry)
         VALUES ($1, $2, ${geomSql})
         RETURNING id`,
        params
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.put(
    '/quadras/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = quadraSchema.partial().parse(request.body)
      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1

      if (body.codigo !== undefined) { updates.push(`codigo = $${idx++}`); params.push(body.codigo) }
      if (body.loteamentoId !== undefined) { updates.push(`loteamento_id = $${idx++}`); params.push(body.loteamentoId) }
      if (body.geometry) {
        updates.push(`geometry = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($${idx++}), 4326), 31982)`)
        params.push(JSON.stringify(body.geometry))
      }

      if (!updates.length) {
        return reply.code(400).send({ error: 'Nenhum campo para atualizar' })
      }

      params.push(id)
      await query(`UPDATE sigweb.quadras SET ${updates.join(', ')} WHERE id = $${idx}`, params)
      return { ok: true }
    }
  )

  app.delete(
    '/quadras/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.quadras WHERE id = $1`, [id])
      reply.code(204)
    }
  )

  app.post(
    '/quadras/unificar',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = z.object({ quadraIds: z.array(z.string().uuid()).min(2) }).parse(request.body)
      const { quadraIds } = body

      const placeholders = quadraIds.map((_, i) => `$${i + 1}`).join(',')
      const base = await queryOne<{ codigo: string; loteamento_id: string | null }>(
        `SELECT codigo, loteamento_id FROM sigweb.quadras WHERE id = $1`,
        [quadraIds[0]]
      )
      if (!base) return reply.code(404).send({ error: 'Quadra não encontrada' })

      await query(
        `UPDATE sigweb.quadras
         SET geometry = (
           SELECT ST_Union(geometry)
           FROM sigweb.quadras
           WHERE id IN (${placeholders})
         )
         WHERE id = $1`,
        quadraIds
      )

      const idsSecundarios = quadraIds.slice(1)
      if (idsSecundarios.length > 0) {
        const secPlaceholders = idsSecundarios.map((_, i) => `$${i + 1}`).join(',')
        await query(`DELETE FROM sigweb.quadras WHERE id IN (${secPlaceholders})`, idsSecundarios)
      }

      const resultado = await queryOne(
        `SELECT id, codigo, loteamento_id,
                ST_AsGeoJSON(ST_Transform(geometry, 4326))::json AS geometry
         FROM sigweb.quadras WHERE id = $1`,
        [quadraIds[0]]
      )
      return resultado
    }
  )

  app.get('/quadras/export', async (request, reply) => {
    const { format = 'csv' } = request.query as { format?: string }
    if (!EXPORT_FORMATS.includes(format as ExportFormat)) {
      return reply.code(400).send({ error: 'Formato inválido. Use csv, xml ou xlsx.' })
    }

    const rows = await query<Record<string, unknown>>(
      `SELECT q.id, q.codigo, q.loteamento_id, l.nome AS loteamento_nome
       FROM sigweb.quadras q
       LEFT JOIN sigweb.loteamentos l ON l.id = q.loteamento_id
       ORDER BY q.codigo`
    )
    const filename = `quadras.${format}`

    if (format === 'csv') {
      const csv = toCsv(rows)
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return csv
    }

    if (format === 'xml') {
      const xml = toXml('quadras', rows)
      reply.header('Content-Type', 'application/xml; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return xml
    }

    const buffer = toXlsx(rows)
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return buffer
  })
}
