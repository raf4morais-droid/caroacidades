-- V011: REURB Digital — fluxos BPMN configuráveis
SET search_path TO sigweb, public;

-- Definições de fluxo BPMN por setor/departamento
CREATE TABLE IF NOT EXISTS fluxos_bpmn (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        VARCHAR(150) NOT NULL,
  setor       VARCHAR(100),
  descricao   TEXT,
  bpmn_xml    TEXT,        -- XML completo exportado pelo bpmn-js
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fases dentro de cada fluxo
CREATE TABLE IF NOT EXISTS fases_bpmn (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fluxo_id        UUID NOT NULL REFERENCES fluxos_bpmn(id) ON DELETE CASCADE,
  nome            VARCHAR(150) NOT NULL,
  ordem           INT NOT NULL,
  -- perfis RBAC que podem atuar nesta fase
  perfis          TEXT[] NOT NULL DEFAULT '{}',
  -- definição dos campos do formulário (array de objetos JSON)
  -- tipo_campo: 'texto' | 'checkbox' | 'mapa' | 'cpf_telefone'
  formulario      JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fases_bpmn_fluxo ON fases_bpmn (fluxo_id, ordem);

-- Associa fluxo BPMN e fase atual ao processo genérico (tabela processos de V007)
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS fluxo_bpmn_id  UUID REFERENCES fluxos_bpmn(id),
  ADD COLUMN IF NOT EXISTS fase_atual_id  UUID REFERENCES fases_bpmn(id);

-- Histórico de movimentações de fases
CREATE TABLE IF NOT EXISTS historico_fases_processo (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  processo_id     UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  fase_id         UUID REFERENCES fases_bpmn(id),
  usuario_id      UUID REFERENCES usuarios(id),
  acao            VARCHAR(30) NOT NULL
                    CHECK (acao IN ('encaminhar','aprovar','reprovar','devolver','arquivar')),
  comentario      TEXT,
  dados_formulario JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historico_fases_processo ON historico_fases_processo (processo_id, created_at DESC);
