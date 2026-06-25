import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const TOLERANCIA_METROS = 25  // distância máxima entre parcela e eixo do logradouro

export async function numeracaoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Lotes lindeiros ao logradouro, ordenados pela posição ao longo da via
  // Inclui a determinação de lado (par/ímpar) via produto vetorial
  app.get('/numeracao/logradouro/:id/lotes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tolerancia = String(TOLERANCIA_METROS), pontoLon, pontoLat } = request.query as {
      tolerancia?: string
      pontoLon?: string
      pontoLat?: string
    }

    const logradouro = await queryOne<{ nome: string }>(
      `SELECT nome FROM sigweb.logradouros WHERE id = $1`,
      [id]
    )
    if (!logradouro) return reply.code(404).send({ error: 'Logradouro não encontrado' })

    // req 99: ponto de partida informado no mapa — define qual extremidade do
    // eixo do logradouro corresponde a fracAoLongo=0 (origem da numeração)
    const lon = pontoLon !== undefined ? Number(pontoLon) : null
    const lat = pontoLat !== undefined ? Number(pontoLat) : null

    // Produto vetorial do eixo × vetor (centroide - ponto_mais_próximo):
    //   lado > 0 → parcela à esquerda da via (ímpar)
    //   lado < 0 → parcela à direita da via (par)
    // Usa ST_LineMerge para lidar com MULTILINESTRING
    const lotes = await query<{
      parcelaId: string
      codigo: string
      areaM2: number
      fracAoLongo: number
      lado: number
      edificacaoId: string | null
      numeroPredialAtual: string | null
      inscricaoImobiliaria: string | null
      geometry: object
    }>(
      `WITH eixo AS (
         SELECT ST_LineMerge(l.geometry) AS geom
         FROM sigweb.logradouros l WHERE l.id = $1
       ),
       ponto AS (
         SELECT CASE WHEN $3::float8 IS NOT NULL AND $4::float8 IS NOT NULL THEN
           ST_LineLocatePoint(
             (SELECT geom FROM eixo),
             ST_Transform(ST_SetSRID(ST_MakePoint($3::float8, $4::float8), 4326), 31982)
           )
         END AS frac
       )
       SELECT
         p.id                                              AS "parcelaId",
         p.codigo,
         COALESCE(p.area_m2, 0)                           AS "areaM2",
         CASE WHEN (SELECT frac FROM ponto) > 0.5
           THEN 1 - ST_LineLocatePoint(e.geom, ST_ClosestPoint(e.geom, ST_Centroid(p.geometry)))
           ELSE ST_LineLocatePoint(e.geom, ST_ClosestPoint(e.geom, ST_Centroid(p.geometry)))
         END                                              AS "fracAoLongo",
         SIGN(
           ST_X(ST_Centroid(p.geometry)) *
             (ST_Y(ST_EndPoint(e.geom)) - ST_Y(ST_StartPoint(e.geom)))
           - ST_Y(ST_Centroid(p.geometry)) *
             (ST_X(ST_EndPoint(e.geom)) - ST_X(ST_StartPoint(e.geom)))
           + ST_X(ST_StartPoint(e.geom)) * ST_Y(ST_EndPoint(e.geom))
           - ST_X(ST_EndPoint(e.geom)) * ST_Y(ST_StartPoint(e.geom))
         )                                                AS lado,
         ed.id                                            AS "edificacaoId",
         ed.numero_predial                                AS "numeroPredialAtual",
         ed.inscricao_imobiliaria                         AS "inscricaoImobiliaria",
         ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
       FROM sigweb.parcelas p
       CROSS JOIN eixo e
       LEFT JOIN sigweb.edificacoes ed ON ed.parcela_id = p.id
       WHERE ST_DWithin(p.geometry, e.geom, $2)
       ORDER BY "fracAoLongo", lado`,
      [id, Number(tolerancia), lon, lat]
    )

    return {
      logradouro: { id, nome: logradouro.nome },
      lotes,
      totalLotes: lotes.length,
    }
  })

  // Gera numeração sequencial par/ímpar para uma lista ordenada de edificações
  // O frontend envia a lista já ordenada (após ajustes manuais do usuário)
  app.post(
    '/numeracao/gerar',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = z.object({
        logradouroId:    z.string().uuid(),
        numeroinicioPar:  z.number().int().positive().default(2),
        numeroInicioImpar: z.number().int().positive().default(1),
        // [{parcelaId, edificacaoId, lado: 1=ímpar -1=par}] na ordem desejada
        lotes: z.array(z.object({
          parcelaId:    z.string().uuid(),
          edificacaoId: z.string().uuid().nullable(),
          lado:         z.number(),  // 1 = ímpar, -1 = par
          inverter:     z.boolean().default(false),
        })),
      }).parse(request.body)

      let proximoPar   = body.numeroinicioPar
      let proximoImpar = body.numeroInicioImpar

      const resultado = body.lotes.map(lote => {
        // inverter permite o usuário trocar o lado manualmente
        const ladoEfetivo = lote.inverter ? -lote.lado : lote.lado
        const isImpar = ladoEfetivo >= 0

        let numero: number
        if (isImpar) {
          numero = proximoImpar
          proximoImpar += 2
        } else {
          numero = proximoPar
          proximoPar += 2
        }

        return {
          parcelaId:       lote.parcelaId,
          edificacaoId:    lote.edificacaoId,
          lado:            isImpar ? 'impar' : 'par',
          numeroPredialGerado: String(numero),
        }
      })

      return { numeracoes: resultado, totalPar: proximoPar - 2, totalImpar: proximoImpar - 2 }
    }
  )

  // Persiste a numeração gerada nas edificações e detecta divergências
  app.post(
    '/numeracao/confirmar',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = z.object({
        logradouroId: z.string().uuid(),
        numeroinicioPar:   z.number().int().positive().default(2),
        numeroInicioImpar: z.number().int().positive().default(1),
        numeracoes: z.array(z.object({
          edificacaoId:       z.string().uuid(),
          numeroPredialGerado: z.string(),
        })),
      }).parse(request.body)

      let atualizadas = 0
      let divergencias = 0

      for (const n of body.numeracoes) {
        const atual = await queryOne<{ numero_predial: string | null }>(
          `SELECT numero_predial FROM sigweb.edificacoes WHERE id = $1`,
          [n.edificacaoId]
        )

        await query(
          `UPDATE sigweb.edificacoes SET numero_predial = $2 WHERE id = $1`,
          [n.edificacaoId, n.numeroPredialGerado]
        )
        atualizadas++

        // Registra divergência se o número mudou
        if (atual && atual.numero_predial && atual.numero_predial !== n.numeroPredialGerado) {
          await query(
            `INSERT INTO sigweb.divergencias_numeracao
               (edificacao_id, logradouro_id, numero_atual, numero_gerado)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [n.edificacaoId, body.logradouroId, atual.numero_predial, n.numeroPredialGerado]
          )
          divergencias++
        }
      }

      // Salva o histórico da operação
      await query(
        `INSERT INTO sigweb.numeracao_predial
           (logradouro_id, numero_inicio_par, numero_inicio_impar, usuario_id)
         VALUES ($1, $2, $3, $4)`,
        [body.logradouroId, body.numeroinicioPar, body.numeroInicioImpar, request.user.uid]
      )

      return { atualizadas, divergencias }
    }
  )

  // Divergências detectadas (número atual ≠ número gerado), para exibir em vermelho no mapa
  app.get('/numeracao/divergencias', async (request) => {
    const { logradouroId, resolvida = 'false' } = request.query as Record<string, string>
    const params: unknown[] = [resolvida === 'true']
    let where = `WHERE d.resolvida = $1`
    if (logradouroId) {
      params.push(logradouroId)
      where += ` AND d.logradouro_id = $${params.length}`
    }

    return query(
      `SELECT d.*, e.inscricao_imobiliaria, l.nome AS logradouro_nome,
              ST_AsGeoJSON(ST_Transform(e.geometry, 4326))::json AS geometry
       FROM sigweb.divergencias_numeracao d
       JOIN sigweb.edificacoes e ON e.id = d.edificacao_id
       LEFT JOIN sigweb.logradouros l ON l.id = d.logradouro_id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT 500`,
      params
    )
  })

  // Resolve manualmente uma divergência
  app.patch(
    '/numeracao/divergencias/:id/resolver',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(
        `UPDATE sigweb.divergencias_numeracao SET resolvida = TRUE WHERE id = $1`,
        [id]
      )
      return { ok: true }
    }
  )
}
