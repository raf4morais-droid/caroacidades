import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

// Composição do poste — itens (reator, lâmpada, luminária) vinculados a um lote de estoque (req 56)
export const MIGRATION_ITENS_POSTE = `
  CREATE TABLE IF NOT EXISTS sigweb.itens_poste (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poste_id     UUID NOT NULL REFERENCES sigweb.postes(id) ON DELETE CASCADE,
    estoque_id   UUID NOT NULL REFERENCES sigweb.estoque(id),
    quantidade   FLOAT NOT NULL DEFAULT 1 CHECK (quantidade > 0),
    observacoes  TEXT,
    created_by   UUID REFERENCES sigweb.usuarios(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_itens_poste_poste ON sigweb.itens_poste (poste_id);
`

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

function sendExport(reply: any, rootName: string, format: string, rows: Record<string, unknown>[]) {
  if (!EXPORT_FORMATS.includes(format as ExportFormat)) {
    return reply.code(400).send({ error: 'Formato inválido. Use csv, xml ou xlsx.' })
  }
  const filename = `${rootName}.${format}`
  if (format === 'csv') {
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return toCsv(rows)
  }
  if (format === 'xml') {
    reply.header('Content-Type', 'application/xml; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return toXml(rootName, rows)
  }
  reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  reply.header('Content-Disposition', `attachment; filename="${filename}"`)
  return toXlsx(rows)
}

const osSchema = z.object({
  posteId: z.string().uuid(),
  tipoDefeitoId: z.string().uuid().optional(),
  equipeId: z.string().uuid().optional(),
  observacoes: z.string().optional(),
  itens: z.array(z.object({
    estoqueId: z.string().uuid(),
    quantidade: z.number().positive(),
  })).optional(),
})

export async function iluminacaoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Postes — listagem por bbox
  app.get('/iluminacao/postes', async (request) => {
    const { minx, miny, maxx, maxy } = request.query as Record<string, string>
    if (minx && miny && maxx && maxy) {
      return query(
        `SELECT p.id, p.codigo, p.tipo, p.potencia_w, p.situacao,
                l.nome AS logradouro,
                ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
         FROM sigweb.postes p
         LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
         WHERE ST_Intersects(p.geometry, ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,4326),31982))`,
        [minx, miny, maxx, maxy]
      )
    }
    return query(`SELECT id, codigo, tipo, situacao FROM sigweb.postes LIMIT 500`)
  })

  app.get('/iluminacao/postes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const row = await queryOne(
      `SELECT p.*, l.nome AS logradouro_nome,
              ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
       FROM sigweb.postes p
       LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
       WHERE p.id = $1`,
      [id]
    )
    if (!row) return reply.code(404).send({ error: 'Poste não encontrado' })
    return row
  })

  // OS por poste (req 64, 69)
  app.get('/iluminacao/postes/:id/os', async (request) => {
    const { id } = request.params as { id: string }
    return query(
      `SELECT os.*, td.nome AS tipo_defeito, e.nome AS equipe_nome
       FROM sigweb.ordens_servico_ip os
       LEFT JOIN sigweb.tipos_defeito td ON td.id = os.tipo_defeito_id
       LEFT JOIN sigweb.equipes_manutencao e ON e.id = os.equipe_id
       WHERE os.poste_id = $1
       ORDER BY os.created_at DESC`,
      [id]
    )
  })

  // Composição do poste — itens vinculados a lote de estoque (req 56)
  app.get('/iluminacao/postes/:id/itens', async (request) => {
    const { id } = request.params as { id: string }
    return query(
      `SELECT ip.*, p.nome AS produto_nome, p.unidade, p.familia,
              e.lote_serie, e.local_id, l.nome AS local_nome
       FROM sigweb.itens_poste ip
       JOIN sigweb.estoque e ON e.id = ip.estoque_id
       JOIN sigweb.produtos p ON p.id = e.produto_id
       JOIN sigweb.locais_estoque l ON l.id = e.local_id
       WHERE ip.poste_id = $1
       ORDER BY ip.created_at DESC`,
      [id]
    )
  })

  app.post('/iluminacao/postes/:id/itens', { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'FISCAL_CAMPO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { estoqueId, quantidade = 1, observacoes } = z.object({
        estoqueId:   z.string().uuid(),
        quantidade:  z.number().positive().optional(),
        observacoes: z.string().optional(),
      }).parse(request.body)

      const lote = await queryOne<{ id: string; quantidade: number }>(
        `SELECT id, quantidade FROM sigweb.estoque WHERE id = $1`,
        [estoqueId]
      )
      if (!lote) return reply.code(404).send({ error: 'Lote de estoque não encontrado' })
      if (lote.quantidade < quantidade) return reply.code(400).send({ error: 'Saldo insuficiente no lote' })

      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.itens_poste (poste_id, estoque_id, quantidade, observacoes, created_by)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [id, estoqueId, quantidade, observacoes ?? null, request.user.uid]
      )

      await query(`UPDATE sigweb.estoque SET quantidade = quantidade - $2 WHERE id = $1`, [estoqueId, quantidade])
      await query(
        `INSERT INTO sigweb.movimentacoes_estoque (estoque_id, tipo, quantidade, observacoes, created_by)
         VALUES ($1,'saida',$2,$3,$4)`,
        [estoqueId, quantidade, `Instalado no poste ${id}`, request.user.uid]
      )

      reply.code(201)
      return { id: row.id }
    }
  )

  app.delete('/iluminacao/postes/:id/itens/:itemId', { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'FISCAL_CAMPO') },
    async (request, reply) => {
      const { id, itemId } = request.params as { id: string; itemId: string }
      const item = await queryOne<{ id: string; estoque_id: string; quantidade: number }>(
        `SELECT id, estoque_id, quantidade FROM sigweb.itens_poste WHERE id = $1 AND poste_id = $2`,
        [itemId, id]
      )
      if (!item) return reply.code(404).send({ error: 'Item não encontrado' })

      await query(`DELETE FROM sigweb.itens_poste WHERE id = $1`, [item.id])
      await query(`UPDATE sigweb.estoque SET quantidade = quantidade + $2 WHERE id = $1`, [item.estoque_id, item.quantidade])
      await query(
        `INSERT INTO sigweb.movimentacoes_estoque (estoque_id, tipo, quantidade, observacoes, created_by)
         VALUES ($1,'entrada',$2,$3,$4)`,
        [item.estoque_id, item.quantidade, `Removido do poste ${id}`, request.user.uid]
      )

      return { ok: true }
    }
  )

  // Ordens de Serviço
  app.get('/iluminacao/os', async (request) => {
    const { situacao, page = '1', limit = '50' } = request.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)
    const where = situacao ? `WHERE os.situacao = $3` : ''
    const params: unknown[] = [Number(limit), offset]
    if (situacao) params.push(situacao)

    return query(
      `SELECT os.*, p.codigo AS poste_codigo, td.nome AS tipo_defeito,
              e.nome AS equipe_nome, l.nome AS logradouro_nome,
              ST_AsGeoJSON(ST_Transform(p2.geometry, 4326))::json AS poste_geometry
       FROM sigweb.ordens_servico_ip os
       JOIN sigweb.postes p2 ON p2.id = os.poste_id
       LEFT JOIN sigweb.tipos_defeito td ON td.id = os.tipo_defeito_id
       LEFT JOIN sigweb.equipes_manutencao e ON e.id = os.equipe_id
       LEFT JOIN sigweb.postes p ON p.id = os.poste_id
       LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
       ${where}
       ORDER BY os.created_at DESC LIMIT $1 OFFSET $2`,
      params
    )
  })

  app.post('/iluminacao/os', async (request, reply) => {
    const body = osSchema.parse(request.body)
    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.ordens_servico_ip (poste_id, tipo_defeito_id, equipe_id, observacoes, created_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [body.posteId, body.tipoDefeitoId ?? null, body.equipeId ?? null, body.observacoes ?? null, request.user.uid]
    )

    await query(`UPDATE sigweb.postes SET situacao = 'defeito' WHERE id = $1`, [body.posteId])

    // Movimenta estoque ao abrir OS (req 71)
    if (body.itens?.length) {
      for (const item of body.itens) {
        await query(
          `UPDATE sigweb.estoque SET quantidade = quantidade - $2 WHERE id = $1`,
          [item.estoqueId, item.quantidade]
        )
        await query(
          `INSERT INTO sigweb.movimentacoes_estoque (estoque_id, tipo, quantidade, os_id, created_by)
           VALUES ($1,'saida',$2,$3,$4)`,
          [item.estoqueId, item.quantidade, row.id, request.user.uid]
        )
      }
    }

    reply.code(201)
    return { id: row.id }
  })

  // Auxiliares — tipos de defeito e equipes
  app.get('/iluminacao/tipos-defeito', async () =>
    query(`SELECT id, nome FROM sigweb.tipos_defeito ORDER BY nome`)
  )

  app.get('/iluminacao/equipes', async () =>
    query(`SELECT id, nome FROM sigweb.equipes_manutencao ORDER BY nome`)
  )

  app.patch(
    '/iluminacao/os/:id/situacao',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { situacao, equipeId } = request.body as { situacao: string; equipeId?: string }

      await query(
        `UPDATE sigweb.ordens_servico_ip
         SET situacao = $2,
             equipe_id = COALESCE($3, equipe_id),
             concluida_em = CASE WHEN $2 = 'concluida' THEN now() ELSE NULL END
         WHERE id = $1`,
        [id, situacao, equipeId ?? null]
      )

      if (situacao === 'concluida') {
        const os = await queryOne<{ poste_id: string }>(`SELECT poste_id FROM sigweb.ordens_servico_ip WHERE id = $1`, [id])
        if (os) await query(`UPDATE sigweb.postes SET situacao = 'normal' WHERE id = $1`, [os.poste_id])
      } else if (situacao === 'em_andamento') {
        const os = await queryOne<{ poste_id: string }>(`SELECT poste_id FROM sigweb.ordens_servico_ip WHERE id = $1`, [id])
        if (os) await query(`UPDATE sigweb.postes SET situacao = 'em_manutencao' WHERE id = $1`, [os.poste_id])
      }

      return { ok: true }
    }
  )

  // ── Produtos ──────────────────────────────────────────────────────────
  app.get('/iluminacao/produtos', async () =>
    query(`SELECT * FROM sigweb.produtos ORDER BY nome`)
  )

  app.post('/iluminacao/produtos', { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { nome, unidade = 'un', descricao, marca, fabricante, familia, fornecedor } = request.body as any
      if (!nome?.trim()) return reply.code(400).send({ error: 'nome obrigatório' })
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.produtos (nome, unidade, descricao, marca, fabricante, familia, fornecedor)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [nome.trim(), unidade, descricao ?? null, marca ?? null, fabricante ?? null, familia ?? null, fornecedor ?? null]
      )
      reply.code(201)
      return row
    }
  )

  app.patch('/iluminacao/produtos/:id', { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request) => {
      const { id } = request.params as { id: string }
      const { nome, unidade, descricao, marca, fabricante, familia, fornecedor } = request.body as any
      await query(
        `UPDATE sigweb.produtos SET nome=$2, unidade=$3, descricao=$4, marca=$5, fabricante=$6, familia=$7, fornecedor=$8 WHERE id=$1`,
        [id, nome, unidade, descricao ?? null, marca ?? null, fabricante ?? null, familia ?? null, fornecedor ?? null]
      )
      return { ok: true }
    }
  )

  app.delete('/iluminacao/produtos/:id', { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.produtos WHERE id = $1`, [id])
      return reply.code(204).send()
    }
  )

  // ── Locais de Estoque ─────────────────────────────────────────────────
  app.get('/iluminacao/locais', async () =>
    query(`SELECT * FROM sigweb.locais_estoque ORDER BY nome`)
  )

  app.post('/iluminacao/locais', { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { nome, tipo = 'principal', descricao } = request.body as any
      if (!nome?.trim()) return reply.code(400).send({ error: 'nome obrigatório' })
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.locais_estoque (nome, tipo, descricao) VALUES ($1,$2,$3) RETURNING id`,
        [nome.trim(), tipo, descricao ?? null]
      )
      reply.code(201)
      return row
    }
  )

  app.patch('/iluminacao/locais/:id', { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request) => {
      const { id } = request.params as { id: string }
      const { nome, tipo, descricao } = request.body as any
      await query(
        `UPDATE sigweb.locais_estoque SET nome=$2, tipo=$3, descricao=$4 WHERE id=$1`,
        [id, nome, tipo ?? 'principal', descricao ?? null]
      )
      return { ok: true }
    }
  )

  app.delete('/iluminacao/locais/:id', { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.locais_estoque WHERE id = $1`, [id])
      return reply.code(204).send()
    }
  )

  // ── Saldo de estoque (itens) — req 54: filtros por produto, local, tipo, família ──
  function saldoQuery(filters: Record<string, string>) {
    const { produtoId, localId, localTipo, familia } = filters
    const conds: string[] = []
    const params: unknown[] = []
    if (produtoId) conds.push(`e.produto_id = $${params.push(produtoId)}`)
    if (localId)   conds.push(`e.local_id = $${params.push(localId)}`)
    if (localTipo) conds.push(`l.tipo = $${params.push(localTipo)}`)
    if (familia)   conds.push(`p.familia = $${params.push(familia)}`)
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    return {
      sql: `SELECT e.*, p.nome AS produto_nome, p.unidade, p.marca, p.familia,
              l.nome AS local_nome, l.tipo AS local_tipo
       FROM sigweb.estoque e
       JOIN sigweb.produtos p ON p.id = e.produto_id
       JOIN sigweb.locais_estoque l ON l.id = e.local_id
       ${where}
       ORDER BY p.nome, l.nome`,
      params,
    }
  }

  app.get('/iluminacao/estoque/itens', async (request) => {
    const { sql, params } = saldoQuery(request.query as Record<string, string>)
    return query(sql, params)
  })

  app.get('/iluminacao/estoque/itens/export', async (request, reply) => {
    const { format = 'csv', ...filters } = request.query as Record<string, string>
    const { sql, params } = saldoQuery(filters)
    const rows = await query<Record<string, unknown>>(sql, params)
    return sendExport(reply, 'saldo_estoque', format, rows)
  })

  app.post('/iluminacao/estoque/itens', { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { produtoId, localId, loteSerie, quantidade = 0, garantiaAte } = request.body as any
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.estoque (produto_id, local_id, lote_serie, quantidade, garantia_ate)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (produto_id, local_id, lote_serie) DO UPDATE SET quantidade = sigweb.estoque.quantidade + $4
         RETURNING id`,
        [produtoId, localId, loteSerie ?? null, quantidade, garantiaAte ?? null]
      )
      reply.code(201)
      return row
    }
  )

  // ── Movimentações (req 53) ────────────────────────────────────────────
  function movimentacoesQuery(filters: Record<string, string>) {
    const { produtoId, localId, loteSerie, tipo, de, ate } = filters
    const conds: string[] = []
    const params: unknown[] = []
    if (produtoId) conds.push(`e.produto_id = $${params.push(produtoId)}`)
    if (localId)   conds.push(`e.local_id = $${params.push(localId)}`)
    if (loteSerie) conds.push(`e.lote_serie = $${params.push(loteSerie)}`)
    if (tipo)      conds.push(`m.tipo = $${params.push(tipo)}`)
    if (de)        conds.push(`m.created_at >= $${params.push(de)}`)
    if (ate)       conds.push(`m.created_at <= $${params.push(ate)}`)
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    return {
      sql: `SELECT m.*, p.nome AS produto_nome, p.unidade, e.lote_serie, l.nome AS local_nome
       FROM sigweb.movimentacoes_estoque m
       JOIN sigweb.estoque e ON e.id = m.estoque_id
       JOIN sigweb.produtos p ON p.id = e.produto_id
       JOIN sigweb.locais_estoque l ON l.id = e.local_id
       ${where}
       ORDER BY m.created_at DESC`,
      params,
    }
  }

  app.get('/iluminacao/movimentacoes', async (request) => {
    const { page = '1', limit = '50', ...filters } = request.query as Record<string, string>
    const { sql, params } = movimentacoesQuery(filters)
    const offset = (Number(page) - 1) * Number(limit)
    return query(`${sql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, Number(limit), offset])
  })

  app.get('/iluminacao/movimentacoes/export', async (request, reply) => {
    const { format = 'csv', ...filters } = request.query as Record<string, string>
    const { sql, params } = movimentacoesQuery(filters)
    const rows = await query<Record<string, unknown>>(sql, params)
    return sendExport(reply, 'movimentacoes_estoque', format, rows)
  })

  // ── Relatório de garantia (req 55) — filtros por produto, local, tipo, família ──
  function garantiaQuery(filters: Record<string, string>) {
    const { produtoId, localId, localTipo, familia } = filters
    const conds: string[] = [`e.garantia_ate IS NOT NULL`]
    const params: unknown[] = []
    if (produtoId) conds.push(`e.produto_id = $${params.push(produtoId)}`)
    if (localId)   conds.push(`e.local_id = $${params.push(localId)}`)
    if (localTipo) conds.push(`l.tipo = $${params.push(localTipo)}`)
    if (familia)   conds.push(`p.familia = $${params.push(familia)}`)
    return {
      sql: `SELECT e.id, e.lote_serie, e.quantidade, e.garantia_ate,
              p.nome AS produto_nome, p.unidade, p.marca, p.familia,
              l.nome AS local_nome, l.tipo AS local_tipo,
              CASE
                WHEN e.garantia_ate < CURRENT_DATE THEN 'vencida'
                WHEN e.garantia_ate < CURRENT_DATE + INTERVAL '30 days' THEN 'a_vencer'
                ELSE 'vigente'
              END AS situacao_garantia
       FROM sigweb.estoque e
       JOIN sigweb.produtos p ON p.id = e.produto_id
       JOIN sigweb.locais_estoque l ON l.id = e.local_id
       WHERE ${conds.join(' AND ')}
       ORDER BY e.garantia_ate ASC`,
      params,
    }
  }

  app.get('/iluminacao/estoque/garantia', async (request) => {
    const { sql, params } = garantiaQuery(request.query as Record<string, string>)
    return query(sql, params)
  })

  app.get('/iluminacao/estoque/garantia/export', async (request, reply) => {
    const { format = 'csv', ...filters } = request.query as Record<string, string>
    const { sql, params } = garantiaQuery(filters)
    const rows = await query<Record<string, unknown>>(sql, params)
    return sendExport(reply, 'garantia_produtos', format, rows)
  })

  // Estoque (compat legado — frontend antigo usa esta rota)
  app.get('/iluminacao/estoque', async () => {
    return query(
      `SELECT e.*, p.nome AS produto_nome, p.unidade, l.nome AS local_nome
       FROM sigweb.estoque e
       JOIN sigweb.produtos p ON p.id = e.produto_id
       JOIN sigweb.locais_estoque l ON l.id = e.local_id
       ORDER BY p.nome, l.nome`
    )
  })

  // Transferência entre locais (req 52)
  app.post(
    '/iluminacao/estoque/transferencia',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { produtoId, localOrigemId, localDestinoId, loteSerie, quantidade, observacoes } = request.body as {
        produtoId: string; localOrigemId: string; localDestinoId: string
        loteSerie?: string; quantidade: number; observacoes?: string
      }
      if (!quantidade || quantidade <= 0) return reply.code(400).send({ error: 'quantidade inválida' })
      if (localOrigemId === localDestinoId) return reply.code(400).send({ error: 'origem e destino iguais' })

      // Busca item de origem
      const origem = await queryOne<{ id: string; quantidade: number }>(
        `SELECT id, quantidade FROM sigweb.estoque
         WHERE produto_id = $1 AND local_id = $2 AND COALESCE(lote_serie,'') = COALESCE($3,'')`,
        [produtoId, localOrigemId, loteSerie ?? null]
      )
      if (!origem) return reply.code(404).send({ error: 'Item não encontrado na origem' })
      if (origem.quantidade < quantidade) return reply.code(400).send({ error: 'Saldo insuficiente na origem' })

      // Debita origem
      await query(`UPDATE sigweb.estoque SET quantidade = quantidade - $2 WHERE id = $1`, [origem.id, quantidade])

      // Upsert destino
      const [destino] = await query<{ id: string }>(
        `INSERT INTO sigweb.estoque (produto_id, local_id, lote_serie, quantidade)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (produto_id, local_id, lote_serie) DO UPDATE SET quantidade = sigweb.estoque.quantidade + $4
         RETURNING id`,
        [produtoId, localDestinoId, loteSerie ?? null, quantidade]
      )

      // Registra movimentações
      await query(
        `INSERT INTO sigweb.movimentacoes_estoque (estoque_id, tipo, quantidade, observacoes, created_by)
         VALUES ($1,'transferencia',$2,$3,$4),($5,'transferencia',$2,$3,$4)`,
        [origem.id, quantidade, observacoes ?? null, request.user.uid, destino.id]
      )

      reply.code(201)
      return { origemId: origem.id, destinoId: destino.id }
    }
  )

  app.post(
    '/iluminacao/estoque/movimentacao',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { estoqueId, tipo, quantidade, osId, observacoes } = request.body as {
        estoqueId: string; tipo: string; quantidade: number; osId?: string; observacoes?: string
      }

      const delta = tipo === 'entrada' ? quantidade : -quantidade
      await query(
        `UPDATE sigweb.estoque SET quantidade = quantidade + $2 WHERE id = $1`,
        [estoqueId, delta]
      )
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.movimentacoes_estoque (estoque_id, tipo, quantidade, os_id, observacoes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [estoqueId, tipo, quantidade, osId ?? null, observacoes ?? null, request.user.uid]
      )
      reply.code(201)
      return { id: row.id }
    }
  )
}
