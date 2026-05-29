import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const processoSchema = z.object({
  tipo: z.enum(['aprovacao_projeto', 'habite_se', 'reurb']),
  parcelaId: z.string().uuid().optional(),
  requerenteId: z.string().uuid().optional(),
  metadados: z.record(z.unknown()).optional(),
})

function gerarCodigo(tipo: string, seq: number): string {
  const prefix = { aprovacao_projeto: 'AP', habite_se: 'HS', reurb: 'RU' }[tipo] ?? 'PR'
  const ano = new Date().getFullYear()
  return `${prefix}-${ano}-${String(seq).padStart(5, '0')}`
}

export async function processosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/processos', async (request) => {
    const { tipo, situacao, page = '1', limit = '50' } = request.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    let i = 1

    if (tipo)     { conditions.push(`pr.tipo = $${i++}`);     params.push(tipo) }
    if (situacao) { conditions.push(`pr.situacao = $${i++}`); params.push(situacao) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (Number(page) - 1) * Number(limit)
    params.push(Number(limit), offset)

    const rows = await query(
      `SELECT pr.*, pe.nome AS requerente_nome, u.nome AS analista_nome
       FROM sigweb.processos pr
       LEFT JOIN sigweb.pessoas pe ON pe.id = pr.requerente_id
       LEFT JOIN sigweb.usuarios u ON u.id = pr.analista_id
       ${where}
       ORDER BY pr.created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      params
    )
    return { data: rows }
  })

  app.get('/processos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const processo = await queryOne(
      `SELECT pr.*, pe.nome AS requerente_nome, u.nome AS analista_nome,
              p.codigo AS parcela_codigo
       FROM sigweb.processos pr
       LEFT JOIN sigweb.pessoas pe ON pe.id = pr.requerente_id
       LEFT JOIN sigweb.usuarios u ON u.id = pr.analista_id
       LEFT JOIN sigweb.parcelas p ON p.id = pr.parcela_id
       WHERE pr.id = $1`,
      [id]
    )
    if (!processo) return reply.code(404).send({ error: 'Processo não encontrado' })

    const etapas = await query(`SELECT * FROM sigweb.etapas_processo WHERE processo_id = $1 ORDER BY ordem`, [id])
    const anexos = await query(`SELECT * FROM sigweb.anexos_processo WHERE processo_id = $1 ORDER BY created_at`, [id])

    return { ...processo, etapas, anexos }
  })

  // Solicitante abre processo (rascunho)
  app.post('/processos', async (request, reply) => {
    const body = processoSchema.parse(request.body)

    const seqRow = await queryOne<{ nextval: string }>(
      `SELECT nextval('sigweb.seq_${body.tipo}')::text AS nextval`
    )
    const codigo = gerarCodigo(body.tipo, Number(seqRow!.nextval))

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.processos (codigo, tipo, situacao, requerente_id, parcela_id, metadados, created_by)
       VALUES ($1,$2,'rascunho',$3,$4,$5,$6) RETURNING id`,
      [
        codigo, body.tipo, body.requerenteId ?? null,
        body.parcelaId ?? null, JSON.stringify(body.metadados ?? {}),
        request.user.uid,
      ]
    )
    reply.code(201)
    return { id: row.id, codigo }
  })

  // Solicitante envia processo (rascunho → aberto)
  app.patch('/processos/:id/enviar', async (request, reply) => {
    const { id } = request.params as { id: string }
    const processo = await queryOne<{ situacao: string; created_by: string }>(
      `SELECT situacao, created_by FROM sigweb.processos WHERE id = $1`, [id]
    )
    if (!processo) return reply.code(404).send({ error: 'Processo não encontrado' })
    if (processo.situacao !== 'rascunho') return reply.code(400).send({ error: 'Apenas rascunhos podem ser enviados' })

    await query(`UPDATE sigweb.processos SET situacao = 'aberto' WHERE id = $1`, [id])
    return { ok: true }
  })

  // Analista atribui processo
  app.patch(
    '/processos/:id/atribuir',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { analistaId } = request.body as { analistaId: string }
      await query(
        `UPDATE sigweb.processos SET analista_id = $2, situacao = 'em_analise' WHERE id = $1`,
        [id, analistaId]
      )
      return { ok: true }
    }
  )

  // Analista emite parecer em etapa
  app.post(
    '/processos/:processoId/etapas/:etapaId/parecer',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { processoId, etapaId } = request.params as { processoId: string; etapaId: string }
      const { situacao, parecer } = request.body as { situacao: 'aprovado' | 'reprovado'; parecer: string }

      await query(
        `UPDATE sigweb.etapas_processo
         SET situacao = $2, parecer = $3, analista_id = $4, concluida_em = now()
         WHERE id = $1 AND processo_id = $2`,
        [etapaId, situacao, parecer, request.user.uid]
      )

      // Verifica se todas as etapas foram aprovadas
      const pendentes = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM sigweb.etapas_processo
         WHERE processo_id = $1 AND situacao = 'pendente'`,
        [processoId]
      )
      if (Number(pendentes[0].count) === 0) {
        const reprovadas = await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM sigweb.etapas_processo
           WHERE processo_id = $1 AND situacao = 'reprovado'`,
          [processoId]
        )
        const novasSituacao = Number(reprovadas[0].count) > 0 ? 'reprovado' : 'aprovado'
        await query(`UPDATE sigweb.processos SET situacao = $2 WHERE id = $1`, [processoId, novasSituacao])
      }

      return { ok: true }
    }
  )
}
