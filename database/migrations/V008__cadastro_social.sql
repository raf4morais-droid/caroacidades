-- V008: Cadastro Social
-- CPF, NIS, PIS armazenados criptografados via pgcrypto
SET search_path TO sigweb, public;

CREATE TABLE familias (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo                VARCHAR(20) UNIQUE NOT NULL,
  edificacao_id         UUID REFERENCES edificacoes(id),
  situacao_cadastral    VARCHAR(50) NOT NULL DEFAULT 'ativo',
  qtd_membros           SMALLINT NOT NULL DEFAULT 1,
  renda_bruta           FLOAT,
  renda_per_capita      FLOAT,
  indice_vulnerabilidade FLOAT,
  programas_sociais     TEXT[] DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_familias_edificacao ON familias (edificacao_id);
CREATE INDEX idx_familias_situacao   ON familias (situacao_cadastral);

CREATE TRIGGER trg_familias_updated_at BEFORE UPDATE ON familias FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

-- Pessoas do cadastro social (com dados sensíveis criptografados)
-- CPF, NIS, PIS são armazenados como bytea criptografados com pgcrypto AES-256
CREATE TABLE pessoas_social (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  familia_id       UUID REFERENCES familias(id) ON DELETE CASCADE,
  nome             VARCHAR(255) NOT NULL,
  cpf_enc          BYTEA,   -- pgcrypto.encrypt(cpf, key, 'aes')
  nis_enc          BYTEA,
  pis_enc          BYTEA,
  data_nascimento  DATE,
  sexo             CHAR(1),
  escolaridade     VARCHAR(50),
  parentesco       VARCHAR(50),
  compoe_renda     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pessoas_social_familia ON pessoas_social (familia_id);

CREATE TABLE tipos_renda (
  id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome  VARCHAR(100) NOT NULL
);

CREATE TABLE rendas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id       UUID NOT NULL REFERENCES pessoas_social(id) ON DELETE CASCADE,
  tipo_renda_id   UUID REFERENCES tipos_renda(id),
  valor           FLOAT NOT NULL,
  compoe_renda    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE informacoes_sociais (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  familia_id UUID NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
  tipo       VARCHAR(100) NOT NULL,
  descricao  TEXT,
  score      SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
