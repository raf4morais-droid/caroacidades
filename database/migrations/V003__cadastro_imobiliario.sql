-- V003: Cadastro Imobiliário — entidades base
-- Referencial: SIRGAS 2000 UTM 22S (EPSG:31982)
SET search_path TO sigweb, public;

-- Pessoas (proprietários, requerentes)
CREATE TABLE pessoas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        VARCHAR(255) NOT NULL,
  cpf_cnpj    VARCHAR(18),
  email       VARCHAR(255),
  telefone    VARCHAR(20),
  endereco    TEXT,
  tipo        VARCHAR(10) NOT NULL DEFAULT 'fisica' CHECK (tipo IN ('fisica','juridica')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pessoas_cpf_cnpj ON pessoas (cpf_cnpj);
CREATE INDEX idx_pessoas_nome      ON pessoas USING GIN (nome gin_trgm_ops);

-- Bairros
CREATE TABLE bairros (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        VARCHAR(150) NOT NULL,
  codigo      VARCHAR(20) UNIQUE NOT NULL,
  geometry    GEOMETRY(MULTIPOLYGON, 31982),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bairros_geom ON bairros USING GIST (geometry);

-- Logradouros
CREATE TABLE logradouros (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        VARCHAR(200) NOT NULL,
  tipo        VARCHAR(50) NOT NULL DEFAULT 'Rua',
  codigo      VARCHAR(20) UNIQUE NOT NULL,
  cep         VARCHAR(10),
  bairro_id   UUID REFERENCES bairros(id),
  geometry    GEOMETRY(MULTILINESTRING, 31982),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_logradouros_geom    ON logradouros USING GIST (geometry);
CREATE INDEX idx_logradouros_nome    ON logradouros USING GIN (nome gin_trgm_ops);
CREATE INDEX idx_logradouros_bairro  ON logradouros (bairro_id);

-- Loteamentos
CREATE TABLE loteamentos (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome             VARCHAR(200) NOT NULL,
  decreto          VARCHAR(50),
  data_aprovacao   DATE,
  geometry         GEOMETRY(MULTIPOLYGON, 31982),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loteamentos_geom ON loteamentos USING GIST (geometry);

-- Quadras
CREATE TABLE quadras (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo         VARCHAR(20) NOT NULL,
  loteamento_id  UUID REFERENCES loteamentos(id),
  geometry       GEOMETRY(POLYGON, 31982),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quadras_geom        ON quadras USING GIST (geometry);
CREATE INDEX idx_quadras_loteamento  ON quadras (loteamento_id);

-- Parcelas (lotes)
CREATE TABLE parcelas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo              VARCHAR(30),
  area_m2             FLOAT,
  testada_principal   FLOAT,
  testada_secundaria  FLOAT,
  bairro_id           UUID REFERENCES bairros(id),
  logradouro_id       UUID REFERENCES logradouros(id),
  loteamento_id       UUID REFERENCES loteamentos(id),
  quadra_id           UUID REFERENCES quadras(id),
  camada_id           UUID,
  atributos           JSONB NOT NULL DEFAULT '{}',
  geometry            GEOMETRY(POLYGON, 31982),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_parcelas_geom        ON parcelas USING GIST (geometry);
CREATE INDEX idx_parcelas_bairro      ON parcelas (bairro_id);
CREATE INDEX idx_parcelas_logradouro  ON parcelas (logradouro_id);
CREATE INDEX idx_parcelas_quadra      ON parcelas (quadra_id);

CREATE TRIGGER trg_parcelas_updated_at
  BEFORE UPDATE ON parcelas
  FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

CREATE TRIGGER trg_parcelas_historico
  AFTER UPDATE ON parcelas
  FOR EACH ROW EXECUTE FUNCTION sigweb.log_geometry_change();

-- Edificações (unidades imobiliárias)
CREATE TABLE edificacoes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inscricao_imobiliaria VARCHAR(30) UNIQUE,
  cadastro_imobiliario  VARCHAR(30),
  area_construida       FLOAT,
  parcela_id            UUID REFERENCES parcelas(id) ON DELETE CASCADE,
  proprietario_id       UUID REFERENCES pessoas(id),
  face_quadra           VARCHAR(10),
  numero_predial        VARCHAR(10),
  situacao              VARCHAR(20) NOT NULL DEFAULT 'regular'
                          CHECK (situacao IN ('regular','irregular','em_construcao','demolida','terreno_vazio')),
  geometry              GEOMETRY(POLYGON, 31982),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_edificacoes_geom     ON edificacoes USING GIST (geometry);
CREATE INDEX idx_edificacoes_parcela  ON edificacoes (parcela_id);

CREATE TRIGGER trg_edificacoes_updated_at
  BEFORE UPDATE ON edificacoes
  FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

CREATE TRIGGER trg_edificacoes_historico
  AFTER UPDATE ON edificacoes
  FOR EACH ROW EXECUTE FUNCTION sigweb.log_geometry_change();

-- Histórico de alterações cartográficas
CREATE TABLE historico_cartografico (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entidade        VARCHAR(50) NOT NULL,
  entidade_id     UUID NOT NULL,
  geometry_antes  GEOMETRY,
  geometry_depois GEOMETRY,
  usuario_id      UUID REFERENCES usuarios(id),
  operacao        VARCHAR(30) NOT NULL
                    CHECK (operacao IN ('insert','update','delete','desmembramento','unificacao')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historico_entidade ON historico_cartografico (entidade, entidade_id);
CREATE INDEX idx_historico_data     ON historico_cartografico (created_at DESC);

-- BICs (Boletins de Informação Cadastral) — coletados no app de recadastramento
CREATE TABLE bics (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parcela_id               UUID NOT NULL REFERENCES parcelas(id),
  edificacao_id            UUID REFERENCES edificacoes(id),
  situacao_recadastramento VARCHAR(20) NOT NULL DEFAULT 'pendente'
                             CHECK (situacao_recadastramento IN ('pendente','visitado','recadastrado','impedido')),
  area_terreno             FLOAT,
  area_edificada           FLOAT,
  numero_pavimentos        SMALLINT,
  tipologia_construtiva    VARCHAR(100),
  estado_conservacao       VARCHAR(50),
  numero_predial           VARCHAR(10),
  observacoes              TEXT,
  foto_urls                TEXT[] NOT NULL DEFAULT '{}',
  latitude_coleta          DOUBLE PRECISION,
  longitude_coleta         DOUBLE PRECISION,
  coletado_por             UUID REFERENCES usuarios(id),
  coletado_em              TIMESTAMPTZ,
  sincronizado_em          TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bics_parcela ON bics (parcela_id);
CREATE INDEX idx_bics_situacao ON bics (situacao_recadastramento);

-- Patrimônio público imobiliário
CREATE TABLE patrimonios (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome         VARCHAR(200) NOT NULL,
  finalidade   VARCHAR(100),
  area_m2      FLOAT,
  doc_urls     TEXT[] DEFAULT '{}',
  geometry     GEOMETRY(GEOMETRY, 31982),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patrimonios_geom ON patrimonios USING GIST (geometry);

-- Triggers para tabelas auxiliares
CREATE TRIGGER trg_pessoas_updated_at BEFORE UPDATE ON pessoas FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
CREATE TRIGGER trg_bairros_updated_at BEFORE UPDATE ON bairros FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
CREATE TRIGGER trg_logradouros_updated_at BEFORE UPDATE ON logradouros FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
CREATE TRIGGER trg_loteamentos_updated_at BEFORE UPDATE ON loteamentos FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
CREATE TRIGGER trg_quadras_updated_at BEFORE UPDATE ON quadras FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
CREATE TRIGGER trg_patrimonios_updated_at BEFORE UPDATE ON patrimonios FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
