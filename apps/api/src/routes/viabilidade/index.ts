import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'

const edificacaoSchema = z.object({ parcelaId: z.string().uuid(), tipoObra: z.string() })
const parcelamentoSchema = z.object({ parcelaId: z.string().uuid() })
const cnaeSchema = z.object({ parcelaId: z.string().uuid(), cnaeCodigo: z.string() })

async function identificarZona(parcelaId: string) {
  return queryOne<{
    id: string; nome: string; sigla: string; to_percent: number
    ca_min: number; ca_max: number; afastamento_frontal: number
    afastamento_lateral: number; afastamento_posterior: number; gabarito_max: number
  }>(
    `SELECT z.*
     FROM sigweb.zonas_uso z
     JOIN sigweb.parcelas p ON ST_Within(p.geometry, z.geometry)
     WHERE p.id = $1
     LIMIT 1`,
    [parcelaId]
  )
}

async function salvarConsulta(
  parcelaId: string,
  tipo: string,
  params: object,
  resultado: string,
  obs: string,
  usuarioId?: string,
  cnae?: string,
  cnaeDescr?: string,
  zonaNome?: string
) {
  const [row] = await query<{ id: string; codigo_verificacao: string }>(
    `INSERT INTO sigweb.consultas_viabilidade
       (parcela_id, tipo, parametros, resultado, observacoes, created_by, cnae_codigo, cnae_descricao, zona_uso)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, codigo_verificacao`,
    [parcelaId, tipo, JSON.stringify(params), resultado, obs, usuarioId ?? null, cnae ?? null, cnaeDescr ?? null, zonaNome ?? null]
  )
  return row
}

export async function viabilidadeRoutes(app: FastifyInstance) {
  // Verificação pública (sem login) — por código UUID
  app.get('/viabilidade/verificar/:codigo', async (request, reply) => {
    const { codigo } = request.params as { codigo: string }
    const row = await queryOne(
      `SELECT cv.*, p.codigo AS parcela_codigo
       FROM sigweb.consultas_viabilidade cv
       JOIN sigweb.parcelas p ON p.id = cv.parcela_id
       WHERE cv.codigo_verificacao = $1`,
      [codigo]
    )
    if (!row) return reply.code(404).send({ error: 'Consulta não encontrada' })
    return row
  })

  // Rotas autenticadas
  app.addHook('preHandler', authMiddleware)

  app.post('/viabilidade/edificacao', async (request, reply) => {
    const { parcelaId, tipoObra } = edificacaoSchema.parse(request.body)
    const zona = await identificarZona(parcelaId)

    if (!zona) {
      const row = await salvarConsulta(parcelaId, 'edificacao', { tipoObra },
        'inviavel', 'Parcela fora de zona de uso definida', request.user.uid)
      return { ...row, resultado: 'inviavel', observacoes: 'Parcela fora de zona de uso definida' }
    }

    const params = {
      tipoObra, zona: zona.sigla, to: zona.to_percent,
      caMin: zona.ca_min, caMax: zona.ca_max,
      afastamentoFrontal: zona.afastamento_frontal,
      afastamentoLateral: zona.afastamento_lateral,
      afastamentoPosterior: zona.afastamento_posterior,
      gabarito: zona.gabarito_max,
    }
    const obs = `Zona ${zona.sigla}: TO=${zona.to_percent}%, CA=${zona.ca_min}–${zona.ca_max}, Afastamento frontal=${zona.afastamento_frontal}m, Gabarito máx=${zona.gabarito_max ?? 'sem limite'}m`
    const row = await salvarConsulta(parcelaId, 'edificacao', params, 'viavel', obs, request.user.uid, undefined, undefined, zona.nome)

    return { ...row, resultado: 'viavel', parametros: params, observacoes: obs }
  })

  app.post('/viabilidade/parcelamento', async (request, reply) => {
    const { parcelaId } = parcelamentoSchema.parse(request.body)
    const zona = await identificarZona(parcelaId)

    const params = { zona: zona?.sigla }
    const resultado = zona ? 'condicional' : 'inviavel'
    const obs = zona
      ? `Verificar área mínima de lote conforme ${zona.sigla} e legislação municipal de parcelamento`
      : 'Parcela fora de zona de uso definida'

    const row = await salvarConsulta(parcelaId, 'parcelamento', params, resultado, obs, request.user.uid, undefined, undefined, zona?.nome)
    return { ...row, resultado, observacoes: obs }
  })

  app.post('/viabilidade/cnae', async (request, reply) => {
    const { parcelaId, cnaeCodigo } = cnaeSchema.parse(request.body)
    const zona = await identificarZona(parcelaId)

    if (!zona) {
      const row = await salvarConsulta(parcelaId, 'cnae', { cnaeCodigo },
        'inviavel', 'Parcela fora de zona de uso definida', request.user.uid)
      return { ...row, resultado: 'inviavel' }
    }

    const cnaeRow = await queryOne<{ cnae_descr: string; permitido: boolean }>(
      `SELECT cnae_descr, permitido FROM sigweb.cnae_zona WHERE zona_id = $1 AND cnae_codigo = $2`,
      [zona.id, cnaeCodigo]
    )

    const permitido = cnaeRow?.permitido ?? false
    const resultado = permitido ? 'viavel' : 'inviavel'
    const obs = permitido
      ? `CNAE ${cnaeCodigo} (${cnaeRow!.cnae_descr}) é permitido na zona ${zona.sigla}`
      : `CNAE ${cnaeCodigo} não é permitido na zona ${zona.sigla}`

    const row = await salvarConsulta(parcelaId, 'cnae', { cnaeCodigo },
      resultado, obs, request.user.uid, cnaeCodigo, cnaeRow?.cnae_descr, zona.nome)
    return { ...row, resultado, observacoes: obs }
  })

  app.get('/viabilidade/historico', async (request, reply) => {
    const { page = '1', limit = '50' } = request.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)
    const rows = await query(
      `SELECT cv.*, p.codigo AS parcela_codigo
       FROM sigweb.consultas_viabilidade cv
       JOIN sigweb.parcelas p ON p.id = cv.parcela_id
       ORDER BY cv.created_at DESC
       LIMIT $1 OFFSET $2`,
      [Number(limit), offset]
    )
    const [{ count }] = await query<{ count: string }>(`SELECT COUNT(*) FROM sigweb.consultas_viabilidade`)
    return { data: rows, pagination: { page: Number(page), limit: Number(limit), total: Number(count) } }
  })
}
