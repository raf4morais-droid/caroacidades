-- V005: Viabilidade Urbana e Plano Diretor
SET search_path TO sigweb, public;

-- Zonas de uso do solo (Plano Diretor)
CREATE TABLE zonas_uso (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome                  VARCHAR(100) NOT NULL,
  sigla                 VARCHAR(20) NOT NULL,
  descricao             TEXT,
  to_percent            FLOAT,  -- Taxa de Ocupação
  ca_min                FLOAT,  -- Coeficiente de Aproveitamento mínimo
  ca_max                FLOAT,  -- Coeficiente de Aproveitamento máximo
  afastamento_frontal   FLOAT,
  afastamento_lateral   FLOAT,
  afastamento_posterior FLOAT,
  gabarito_max          FLOAT,
  uso_permitido         TEXT[],
  geometry              GEOMETRY(MULTIPOLYGON, 31982),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_zonas_uso_geom ON zonas_uso USING GIST (geometry);

-- Tabela de CNAEs permitidos por zona
CREATE TABLE cnae_zona (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zona_id      UUID NOT NULL REFERENCES zonas_uso(id) ON DELETE CASCADE,
  cnae_codigo  VARCHAR(10) NOT NULL,
  cnae_descr   VARCHAR(255),
  permitido    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_cnae_zona_zona   ON cnae_zona (zona_id);
CREATE INDEX idx_cnae_zona_cnae   ON cnae_zona (cnae_codigo);

-- Consultas de viabilidade emitidas
CREATE TABLE consultas_viabilidade (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_verificacao  UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  parcela_id          UUID NOT NULL REFERENCES parcelas(id),
  tipo                VARCHAR(20) NOT NULL CHECK (tipo IN ('edificacao','parcelamento','cnae')),
  cnae_codigo         VARCHAR(10),
  cnae_descricao      VARCHAR(255),
  zona_uso            VARCHAR(100),
  parametros          JSONB,
  resultado           VARCHAR(20) NOT NULL CHECK (resultado IN ('viavel','inviavel','condicional')),
  observacoes         TEXT,
  pdf_url             TEXT,
  solicitante_nome    VARCHAR(255),
  solicitante_email   VARCHAR(255),
  created_by          UUID REFERENCES usuarios(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_viabilidade_parcela    ON consultas_viabilidade (parcela_id);
CREATE INDEX idx_viabilidade_codigo     ON consultas_viabilidade (codigo_verificacao);
CREATE INDEX idx_viabilidade_created_at ON consultas_viabilidade (created_at DESC);

-- Faces de quadra (para numeração predial e PGV)
CREATE TABLE faces_quadra (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quadra_id        UUID REFERENCES quadras(id),
  logradouro_id    UUID REFERENCES logradouros(id),
  numero_inicio    INT,
  numero_fim       INT,
  lado             VARCHAR(5) CHECK (lado IN ('par','impar')),
  valor_calculado  FLOAT,
  distancia_polo   FLOAT,
  setor_pgv_id     UUID,
  geometry         GEOMETRY(LINESTRING, 31982)
);

CREATE INDEX idx_faces_quadra_geom      ON faces_quadra USING GIST (geometry);
CREATE INDEX idx_faces_quadra_quadra    ON faces_quadra (quadra_id);
CREATE INDEX idx_faces_quadra_logradouro ON faces_quadra (logradouro_id);
