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

const pessoaSchema = z.object({
  nome: z.string().min(1),
  cpfCnpj: z.string().optional(),
  email: z.string().email().optional(),
  telefone: z.string().optional(),
  endereco: z.string().optional(),
  tipo: z.enum(['fisica', 'juridica']).default('fisica'),
})

export async function pessoasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/pessoas', async (request) => {
    const { q, page = '1', limit = '50' } = request.query as Record<string, string | undefined>
    const offset = (Number(page) - 1) * Number(limit)

    if (q && q.trim().length > 1) {
      const filter = `%${q.trim()}%`
      const rows = await query(
        `SELECT id, nome, cpf_cnpj, email, telefone, endereco, tipo, created_at, updated_at
         FROM sigweb.pessoas
         WHERE nome ILIKE $1 OR cpf_cnpj ILIKE $1 OR email ILIKE $1
         ORDER BY nome
         LIMIT $2 OFFSET $3`,
        [filter, Number(limit), offset]
      )
      const [{ count }] = await query<{ count: string }>(
        `SELECT COUNT(*) FROM sigweb.pessoas
         WHERE nome ILIKE $1 OR cpf_cnpj ILIKE $1 OR email ILIKE $1`,
        [filter]
      )
      return { data: rows, pagination: { page: Number(page), limit: Number(limit), total: Number(count) } }
    }

    const rows = await query(
      `SELECT id, nome, cpf_cnpj, email, telefone, endereco, tipo, created_at, updated_at
       FROM sigweb.pessoas
       ORDER BY nome
       LIMIT $1 OFFSET $2`,
      [Number(limit), offset]
    )
    const [{ count }] = await query<{ count: string }>(
      `SELECT COUNT(*) FROM sigweb.pessoas`,
      []
    )
    return { data: rows, pagination: { page: Number(page), limit: Number(limit), total: Number(count) } }
  })

  app.get('/pessoas/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const pessoa = await queryOne(
      `SELECT id, nome, cpf_cnpj, email, telefone, endereco, tipo, created_at, updated_at
       FROM sigweb.pessoas
       WHERE id = $1`,
      [id]
    )
    if (!pessoa) return reply.code(404).send({ error: 'Pessoa não encontrada' })
    return pessoa
  })

  app.post(
    '/pessoas',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = pessoaSchema.parse(request.body)
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.pessoas (nome, cpf_cnpj, email, telefone, endereco, tipo)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [body.nome, body.cpfCnpj ?? null, body.email ?? null, body.telefone ?? null, body.endereco ?? null, body.tipo]
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.put(
    '/pessoas/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = pessoaSchema.partial().parse(request.body)
      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1

      if (body.nome !== undefined) { updates.push(`nome = $${idx++}`); params.push(body.nome) }
      if (body.cpfCnpj !== undefined) { updates.push(`cpf_cnpj = $${idx++}`); params.push(body.cpfCnpj) }
      if (body.email !== undefined) { updates.push(`email = $${idx++}`); params.push(body.email) }
      if (body.telefone !== undefined) { updates.push(`telefone = $${idx++}`); params.push(body.telefone) }
      if (body.endereco !== undefined) { updates.push(`endereco = $${idx++}`); params.push(body.endereco) }
      if (body.tipo !== undefined) { updates.push(`tipo = $${idx++}`); params.push(body.tipo) }

      if (!updates.length) {
        return reply.code(400).send({ error: 'Nenhum campo para atualizar' })
      }

      params.push(id)
      await query(`UPDATE sigweb.pessoas SET ${updates.join(', ')} WHERE id = $${idx}`, params)
      return { ok: true }
    }
  )

  app.delete(
    '/pessoas/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.pessoas WHERE id = $1`, [id])
      reply.code(204)
    }
  )

  app.get('/pessoas/export', async (request, reply) => {
    const { format = 'csv' } = request.query as { format?: string }
    if (!EXPORT_FORMATS.includes(format as ExportFormat)) {
      return reply.code(400).send({ error: 'Formato inválido. Use csv, xml ou xlsx.' })
    }

    const rows = await query<Record<string, unknown>>(
      `SELECT id, nome, cpf_cnpj, email, telefone, endereco, tipo, created_at, updated_at
       FROM sigweb.pessoas
       ORDER BY nome`
    )

    const filename = `pessoas.${format}`
    if (format === 'csv') {
      const csv = toCsv(rows)
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return csv
    }

    if (format === 'xml') {
      const xml = toXml('pessoas', rows)
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
