import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

// Reconcilia o esquema de fluxos_bpmn/fases_bpmn (V007 x V011 divergiam) e
// cria a view de lotes REURB coloridos por situação no mapa (req 207) — idempotente
export const MIGRATION_REURB_BPMN = `
  ALTER TABLE sigweb.fluxos_bpmn
    ADD COLUMN IF NOT EXISTS setor      VARCHAR(100),
    ADD COLUMN IF NOT EXISTS descricao  TEXT,
    ADD COLUMN IF NOT EXISTS bpmn_xml   TEXT;
  ALTER TABLE sigweb.fluxos_bpmn ALTER COLUMN definicao DROP NOT NULL;
  ALTER TABLE sigweb.fluxos_bpmn ALTER COLUMN definicao SET DEFAULT '';

  CREATE TABLE IF NOT EXISTS sigweb.fases_bpmn (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fluxo_id    UUID NOT NULL REFERENCES sigweb.fluxos_bpmn(id) ON DELETE CASCADE,
    nome        VARCHAR(150) NOT NULL,
    ordem       INT NOT NULL,
    perfis      TEXT[] NOT NULL DEFAULT '{}',
    formulario  JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_fases_bpmn_fluxo ON sigweb.fases_bpmn (fluxo_id, ordem);
  ALTER TABLE sigweb.fases_bpmn ADD COLUMN IF NOT EXISTS tempo_medio_horas INT;
  ALTER TABLE sigweb.fases_bpmn ADD COLUMN IF NOT EXISTS cor               VARCHAR(9);
  ALTER TABLE sigweb.fases_bpmn ADD COLUMN IF NOT EXISTS duracao_minutos   INT;
  ALTER TABLE sigweb.fases_bpmn ADD COLUMN IF NOT EXISTS avisar_duracao    BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE sigweb.fases_bpmn ADD COLUMN IF NOT EXISTS encerra_processo  BOOLEAN NOT NULL DEFAULT false;

  ALTER TABLE sigweb.etapas_processo
    ADD COLUMN IF NOT EXISTS fase_id UUID REFERENCES sigweb.fases_bpmn(id);
  ALTER TABLE sigweb.anexos_processo
    ADD COLUMN IF NOT EXISTS anexo_original_id UUID REFERENCES sigweb.anexos_processo(id);

  CREATE OR REPLACE VIEW sigweb.v_lotes_reurb AS
  SELECT
    p.id, p.codigo, p.geometry,
    pr.id AS processo_id, pr.codigo AS processo_codigo,
    pr.situacao AS processo_situacao,
    f.nome AS fase_nome
  FROM sigweb.parcelas p
  JOIN sigweb.processos pr ON pr.parcela_id = p.id AND pr.tipo = 'reurb'
  LEFT JOIN sigweb.fases_bpmn f ON f.id = pr.fase_atual_id;

  COMMENT ON VIEW sigweb.v_lotes_reurb IS 'Lotes em processo de REURB coloridos por situação — camada para o mapa do SIGWEB';
`

const PERFIS = ['ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO', 'CIDADAO'] as const

const campoFormularioSchema = z.object({
  nome: z.string().min(1),
  rotulo: z.string().min(1),
  tipo: z.enum(['texto', 'checkbox', 'mapa', 'cpf_telefone']),
  obrigatorio: z.boolean().optional().default(false),
})

const faseSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(1),
  ordem: z.number().int(),
  perfis: z.array(z.enum(PERFIS)).default([]),
  tempoMedioHoras: z.number().int().positive().nullable().optional(),
  cor: z.string().nullable().optional(),
  duracaoMinutos: z.number().int().positive().nullable().optional(),
  avisarDuracao: z.boolean().optional().default(false),
  encerraProcesso: z.boolean().optional().default(false),
  formulario: z.array(campoFormularioSchema).default([]),
})

const fluxoCreateSchema = z.object({
  nome: z.string().min(1),
  setor: z.string().optional(),
  descricao: z.string().optional(),
})

const fluxoUpdateSchema = z.object({
  nome: z.string().min(1).optional(),
  setor: z.string().optional(),
  descricao: z.string().optional(),
  bpmnXml: z.string().optional(),
  fases: z.array(faseSchema).optional(),
})

export async function reurbRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get(
    '/reurb/fluxos',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') },
    async () => {
      return query(
        `SELECT id, nome, setor, descricao, ativo, updated_at
         FROM sigweb.fluxos_bpmn ORDER BY nome`
      )
    }
  )

  app.get(
    '/reurb/fluxos/:id',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const fluxo = await queryOne(
        `SELECT id, nome, setor, descricao, bpmn_xml, ativo, updated_at
         FROM sigweb.fluxos_bpmn WHERE id = $1`,
        [id]
      )
      if (!fluxo) return reply.code(404).send({ error: 'Fluxo não encontrado' })

      const fases = await query(
        `SELECT id, nome, ordem, perfis, tempo_medio_horas, cor, duracao_minutos, avisar_duracao, encerra_processo, formulario
         FROM sigweb.fases_bpmn WHERE fluxo_id = $1 ORDER BY ordem`,
        [id]
      )
      return { ...fluxo, fases }
    }
  )

  app.post(
    '/reurb/fluxos',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS') },
    async (request, reply) => {
      const body = fluxoCreateSchema.parse(request.body)
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.fluxos_bpmn (nome, setor, descricao, definicao)
         VALUES ($1, $2, $3, '') RETURNING id`,
        [body.nome, body.setor ?? null, body.descricao ?? null]
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.put(
    '/reurb/fluxos/:id',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = fluxoUpdateSchema.parse(request.body)

      const fluxo = await queryOne<{ id: string }>(`SELECT id FROM sigweb.fluxos_bpmn WHERE id = $1`, [id])
      if (!fluxo) return reply.code(404).send({ error: 'Fluxo não encontrado' })

      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1
      if (body.nome !== undefined)      { updates.push(`nome = $${idx++}`);      params.push(body.nome) }
      if (body.setor !== undefined)     { updates.push(`setor = $${idx++}`);     params.push(body.setor) }
      if (body.descricao !== undefined) { updates.push(`descricao = $${idx++}`); params.push(body.descricao) }
      if (body.bpmnXml !== undefined)   { updates.push(`bpmn_xml = $${idx++}`);  params.push(body.bpmnXml) }
      if (updates.length) {
        updates.push(`updated_at = now()`)
        params.push(id)
        await query(`UPDATE sigweb.fluxos_bpmn SET ${updates.join(', ')} WHERE id = $${idx}`, params)
      }

      if (body.fases) {
        await query(`DELETE FROM sigweb.fases_bpmn WHERE fluxo_id = $1`, [id])
        for (const fase of body.fases) {
          await query(
            `INSERT INTO sigweb.fases_bpmn (fluxo_id, nome, ordem, perfis, tempo_medio_horas, cor, duracao_minutos, avisar_duracao, encerra_processo, formulario)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              id, fase.nome, fase.ordem, fase.perfis, fase.tempoMedioHoras ?? null,
              fase.cor ?? null, fase.duracaoMinutos ?? null, fase.avisarDuracao ?? false,
              fase.encerraProcesso ?? false, JSON.stringify(fase.formulario),
            ]
          )
        }
      }

      return { ok: true }
    }
  )

  app.patch(
    '/reurb/fluxos/:id/ativo',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { ativo } = z.object({ ativo: z.boolean() }).parse(request.body)
      const fluxo = await queryOne<{ id: string }>(`SELECT id FROM sigweb.fluxos_bpmn WHERE id = $1`, [id])
      if (!fluxo) return reply.code(404).send({ error: 'Fluxo não encontrado' })
      await query(`UPDATE sigweb.fluxos_bpmn SET ativo = $2, updated_at = now() WHERE id = $1`, [id, ativo])
      return { ok: true }
    }
  )

  app.delete(
    '/reurb/fluxos/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.fluxos_bpmn WHERE id = $1`, [id])
      reply.code(204)
    }
  )
}
