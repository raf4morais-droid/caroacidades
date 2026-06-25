import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

// Cadastros auxiliares do Módulo Social — Entidade, Tipo de Entidade,
// Serviço Social, Programa, Evento e Empreendimento (req 87), além dos
// campos de empreendimento/imóvel de moradia/terreno na família (req 90/91)
export const MIGRATION_SOCIAL_CATALOGOS = `
  CREATE TABLE IF NOT EXISTS sigweb.tipos_entidade (
    id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS sigweb.entidades (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome             VARCHAR(255) NOT NULL,
    tipo_entidade_id UUID REFERENCES sigweb.tipos_entidade(id),
    cnpj             VARCHAR(20),
    endereco         VARCHAR(255),
    telefone         VARCHAR(20),
    contato          VARCHAR(255),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sigweb.servicos_sociais (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome        VARCHAR(255) NOT NULL,
    entidade_id UUID REFERENCES sigweb.entidades(id),
    descricao   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sigweb.programas_sociais_cat (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome      VARCHAR(255) NOT NULL UNIQUE,
    descricao TEXT
  );

  CREATE TABLE IF NOT EXISTS sigweb.empreendimentos (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome         VARCHAR(255) NOT NULL,
    descricao    TEXT,
    situacao     VARCHAR(50) NOT NULL DEFAULT 'planejamento',
    qtd_unidades INT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sigweb.eventos_sociais (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome        VARCHAR(255) NOT NULL,
    tipo        VARCHAR(100),
    data_evento DATE,
    entidade_id UUID REFERENCES sigweb.entidades(id),
    servico_id  UUID REFERENCES sigweb.servicos_sociais(id),
    descricao   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sigweb.pessoa_deficiencias (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pessoa_id  UUID NOT NULL REFERENCES sigweb.pessoas_social(id) ON DELETE CASCADE,
    cid_codigo VARCHAR(10),
    descricao  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sigweb.ocorrencias_social (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    familia_id      UUID NOT NULL REFERENCES sigweb.familias(id) ON DELETE CASCADE,
    tipo            VARCHAR(100) NOT NULL,
    descricao       TEXT,
    data_ocorrencia DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sigweb.documentos_social (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    familia_id UUID NOT NULL REFERENCES sigweb.familias(id) ON DELETE CASCADE,
    pessoa_id  UUID REFERENCES sigweb.pessoas_social(id) ON DELETE CASCADE,
    nome       VARCHAR(255) NOT NULL,
    url        TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  ALTER TABLE sigweb.familias
    ADD COLUMN IF NOT EXISTS empreendimento_id UUID REFERENCES sigweb.empreendimentos(id),
    ADD COLUMN IF NOT EXISTS tipo_imovel_moradia VARCHAR(50),
    ADD COLUMN IF NOT EXISTS situacao_terreno VARCHAR(50),
    ADD COLUMN IF NOT EXISTS area_terreno_m2 FLOAT;

  INSERT INTO sigweb.tipos_entidade (nome)
  SELECT v FROM (VALUES ('CRAS'), ('CREAS'), ('ONG'), ('Igreja'), ('Associação Comunitária'), ('Órgão Público'), ('Outro')) AS t(v)
  WHERE NOT EXISTS (SELECT 1 FROM sigweb.tipos_entidade);

  INSERT INTO sigweb.programas_sociais_cat (nome)
  SELECT v FROM (VALUES ('Bolsa Família'), ('BPC/LOAS'), ('PETI'), ('Tarifa Social de Energia'), ('Cesta Básica Municipal'), ('Habitação de Interesse Social')) AS t(v)
  WHERE NOT EXISTS (SELECT 1 FROM sigweb.programas_sociais_cat);
`

export async function socialCatalogosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS'))

  // Tipos de Entidade
  app.get('/social/tipos-entidade', async () =>
    query('SELECT id, nome FROM sigweb.tipos_entidade ORDER BY nome')
  )
  app.post('/social/tipos-entidade', async (request, reply) => {
    const body = z.object({ nome: z.string().min(2) }).parse(request.body)
    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.tipos_entidade (nome) VALUES ($1) RETURNING id`, [body.nome]
    )
    reply.code(201)
    return { id: row.id }
  })
  app.delete('/social/tipos-entidade/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await query<{ id: string }>(`DELETE FROM sigweb.tipos_entidade WHERE id = $1 RETURNING id`, [id])
    if (!row) return reply.code(404).send({ error: 'Tipo de entidade não encontrado' })
    return { ok: true }
  })

  // Entidades
  app.get('/social/entidades', async () =>
    query(
      `SELECT e.*, te.nome AS tipo_entidade_nome
       FROM sigweb.entidades e
       LEFT JOIN sigweb.tipos_entidade te ON te.id = e.tipo_entidade_id
       ORDER BY e.nome`
    )
  )
  app.post('/social/entidades', async (request, reply) => {
    const body = z.object({
      nome: z.string().min(2),
      tipoEntidadeId: z.string().uuid().nullable().optional(),
      cnpj: z.string().nullable().optional(),
      endereco: z.string().nullable().optional(),
      telefone: z.string().nullable().optional(),
      contato: z.string().nullable().optional(),
    }).parse(request.body)
    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.entidades (nome, tipo_entidade_id, cnpj, endereco, telefone, contato)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [body.nome, body.tipoEntidadeId ?? null, body.cnpj ?? null, body.endereco ?? null, body.telefone ?? null, body.contato ?? null]
    )
    reply.code(201)
    return { id: row.id }
  })
  app.delete('/social/entidades/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await query<{ id: string }>(`DELETE FROM sigweb.entidades WHERE id = $1 RETURNING id`, [id])
    if (!row) return reply.code(404).send({ error: 'Entidade não encontrada' })
    return { ok: true }
  })

  // Serviços Sociais
  app.get('/social/servicos', async () =>
    query(
      `SELECT s.*, e.nome AS entidade_nome
       FROM sigweb.servicos_sociais s
       LEFT JOIN sigweb.entidades e ON e.id = s.entidade_id
       ORDER BY s.nome`
    )
  )
  app.post('/social/servicos', async (request, reply) => {
    const body = z.object({
      nome: z.string().min(2),
      entidadeId: z.string().uuid().nullable().optional(),
      descricao: z.string().nullable().optional(),
    }).parse(request.body)
    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.servicos_sociais (nome, entidade_id, descricao) VALUES ($1,$2,$3) RETURNING id`,
      [body.nome, body.entidadeId ?? null, body.descricao ?? null]
    )
    reply.code(201)
    return { id: row.id }
  })
  app.delete('/social/servicos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await query<{ id: string }>(`DELETE FROM sigweb.servicos_sociais WHERE id = $1 RETURNING id`, [id])
    if (!row) return reply.code(404).send({ error: 'Serviço não encontrado' })
    return { ok: true }
  })

  // Programas Sociais (catálogo)
  app.get('/social/programas', async () =>
    query('SELECT id, nome, descricao FROM sigweb.programas_sociais_cat ORDER BY nome')
  )
  app.post('/social/programas', async (request, reply) => {
    const body = z.object({ nome: z.string().min(2), descricao: z.string().nullable().optional() }).parse(request.body)
    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.programas_sociais_cat (nome, descricao) VALUES ($1,$2) RETURNING id`,
      [body.nome, body.descricao ?? null]
    )
    reply.code(201)
    return { id: row.id }
  })
  app.delete('/social/programas/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await query<{ id: string }>(`DELETE FROM sigweb.programas_sociais_cat WHERE id = $1 RETURNING id`, [id])
    if (!row) return reply.code(404).send({ error: 'Programa não encontrado' })
    return { ok: true }
  })

  // Empreendimentos (req 90/91)
  app.get('/social/empreendimentos', async () =>
    query('SELECT * FROM sigweb.empreendimentos ORDER BY nome')
  )
  app.post('/social/empreendimentos', async (request, reply) => {
    const body = z.object({
      nome: z.string().min(2),
      descricao: z.string().nullable().optional(),
      situacao: z.string().default('planejamento'),
      qtdUnidades: z.number().int().nullable().optional(),
    }).parse(request.body)
    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.empreendimentos (nome, descricao, situacao, qtd_unidades) VALUES ($1,$2,$3,$4) RETURNING id`,
      [body.nome, body.descricao ?? null, body.situacao, body.qtdUnidades ?? null]
    )
    reply.code(201)
    return { id: row.id }
  })
  app.delete('/social/empreendimentos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await query<{ id: string }>(`DELETE FROM sigweb.empreendimentos WHERE id = $1 RETURNING id`, [id])
    if (!row) return reply.code(404).send({ error: 'Empreendimento não encontrado' })
    return { ok: true }
  })

  // Eventos Sociais
  app.get('/social/eventos', async () =>
    query(
      `SELECT ev.*, e.nome AS entidade_nome, s.nome AS servico_nome
       FROM sigweb.eventos_sociais ev
       LEFT JOIN sigweb.entidades e ON e.id = ev.entidade_id
       LEFT JOIN sigweb.servicos_sociais s ON s.id = ev.servico_id
       ORDER BY ev.data_evento DESC NULLS LAST, ev.nome`
    )
  )
  app.post('/social/eventos', async (request, reply) => {
    const body = z.object({
      nome: z.string().min(2),
      tipo: z.string().nullable().optional(),
      dataEvento: z.string().nullable().optional(),
      entidadeId: z.string().uuid().nullable().optional(),
      servicoId: z.string().uuid().nullable().optional(),
      descricao: z.string().nullable().optional(),
    }).parse(request.body)
    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.eventos_sociais (nome, tipo, data_evento, entidade_id, servico_id, descricao)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [body.nome, body.tipo ?? null, body.dataEvento ?? null, body.entidadeId ?? null, body.servicoId ?? null, body.descricao ?? null]
    )
    reply.code(201)
    return { id: row.id }
  })
  app.delete('/social/eventos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await query<{ id: string }>(`DELETE FROM sigweb.eventos_sociais WHERE id = $1 RETURNING id`, [id])
    if (!row) return reply.code(404).send({ error: 'Evento não encontrado' })
    return { ok: true }
  })
}
