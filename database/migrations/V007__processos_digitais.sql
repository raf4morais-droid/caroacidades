-- V007: Processos Digitais (Aprovação de Projetos, Habite-se, REURB)
SET search_path TO sigweb, public;

-- Processos
CREATE TABLE processos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo        VARCHAR(30) UNIQUE NOT NULL,
  tipo          VARCHAR(20) NOT NULL CHECK (tipo IN ('aprovacao_projeto','habite_se','reurb')),
  situacao      VARCHAR(20) NOT NULL DEFAULT 'rascunho'
                  CHECK (situacao IN ('rascunho','aberto','em_analise','aprovado','reprovado','cancelado')),
  requerente_id UUID REFERENCES pessoas(id),
  parcela_id    UUID REFERENCES parcelas(id),
  analista_id   UUID REFERENCES usuarios(id),
  setor_atual   VARCHAR(100),
  metadados     JSONB DEFAULT '{}',
  created_by    UUID REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_processos_codigo    ON processos (codigo);
CREATE INDEX idx_processos_tipo      ON processos (tipo);
CREATE INDEX idx_processos_situacao  ON processos (situacao);
CREATE INDEX idx_processos_parcela   ON processos (parcela_id);
CREATE INDEX idx_processos_analista  ON processos (analista_id);

CREATE TRIGGER trg_processos_updated_at BEFORE UPDATE ON processos FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

-- Gerador de código sequencial por tipo de processo
CREATE SEQUENCE seq_aprovacao_projeto START 1;
CREATE SEQUENCE seq_habite_se         START 1;
CREATE SEQUENCE seq_reurb             START 1;

-- Etapas do processo
CREATE TABLE etapas_processo (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  processo_id  UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome         VARCHAR(100) NOT NULL,
  ordem        SMALLINT NOT NULL,
  situacao     VARCHAR(20) NOT NULL DEFAULT 'pendente'
                 CHECK (situacao IN ('pendente','aprovado','reprovado')),
  analista_id  UUID REFERENCES usuarios(id),
  parecer      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluida_em TIMESTAMPTZ
);

CREATE INDEX idx_etapas_processo ON etapas_processo (processo_id, ordem);

-- Anexos de processos (armazenados no Firebase Storage)
CREATE TABLE anexos_processo (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  processo_id     UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome            VARCHAR(255) NOT NULL,
  tipo_mime       VARCHAR(100),
  tamanho_bytes   INT,
  storage_path    TEXT NOT NULL,
  url             TEXT,
  created_by      UUID REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_anexos_processo ON anexos_processo (processo_id);

-- Fluxos BPMN (REURB — configuráveis por setor)
CREATE TABLE fluxos_bpmn (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        VARCHAR(150) NOT NULL,
  tipo        VARCHAR(30) NOT NULL DEFAULT 'reurb',
  definicao   TEXT NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- App de Chamados — categorias e solicitações
CREATE TABLE categorias_chamado (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome      VARCHAR(100) NOT NULL,
  descricao TEXT,
  privada   BOOLEAN NOT NULL DEFAULT FALSE,
  ativa     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE solicitacoes_chamado (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  categoria_id  UUID NOT NULL REFERENCES categorias_chamado(id),
  descricao     TEXT NOT NULL,
  situacao      VARCHAR(30) NOT NULL DEFAULT 'aberta',
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  endereco      TEXT,
  foto_urls     TEXT[] DEFAULT '{}',
  solicitante_id UUID REFERENCES usuarios(id),
  analista_id   UUID REFERENCES usuarios(id),
  mensagens     JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_solicitacoes_categoria ON solicitacoes_chamado (categoria_id);
CREATE INDEX idx_solicitacoes_situacao  ON solicitacoes_chamado (situacao);

CREATE TRIGGER trg_solicitacoes_updated_at BEFORE UPDATE ON solicitacoes_chamado FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
