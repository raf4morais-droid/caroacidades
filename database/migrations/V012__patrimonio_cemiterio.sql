-- V012: Patrimônio Público Imobiliário e Cemitérios
SET search_path TO sigweb, public;

-- Bens públicos com geometria variável (ponto, polígono, linha)
CREATE TABLE IF NOT EXISTS patrimonios (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome             VARCHAR(250) NOT NULL,
  finalidade       VARCHAR(100) NOT NULL,  -- escola, hospital, praca, predio_publico, etc.
  descricao        TEXT,
  numero_registro  VARCHAR(60),
  area_m2          FLOAT,
  geometry         GEOMETRY(GEOMETRY, 31982),
  documento_urls   TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patrimonios_geom       ON patrimonios USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_patrimonios_finalidade ON patrimonios (finalidade);

CREATE OR REPLACE TRIGGER trg_patrimonios_updated_at
  BEFORE UPDATE ON patrimonios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Cemitérios (perímetros)
CREATE TABLE IF NOT EXISTS cemiterios (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        VARCHAR(150) NOT NULL,
  geometry    GEOMETRY(POLYGON, 31982),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cemiterios_geom ON cemiterios USING GIST (geometry);

-- Sepulturas georreferenciadas
CREATE TABLE IF NOT EXISTS sepulturas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cemiterio_id        UUID REFERENCES cemiterios(id),
  codigo              VARCHAR(30) UNIQUE NOT NULL,
  geometry            GEOMETRY(POINT, 31982) NOT NULL,
  titular             VARCHAR(250),
  falecido            VARCHAR(250),
  data_falecimento    DATE,
  data_sepultamento   DATE,
  tipo_sepultura      VARCHAR(50),  -- gaveta, carneiro, jazigo, ossario
  situacao            VARCHAR(20) NOT NULL DEFAULT 'ocupada'
                        CHECK (situacao IN ('ocupada','disponivel','perpetua','transferida')),
  observacoes         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sepulturas_geom      ON sepulturas USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_sepulturas_cemiterio ON sepulturas (cemiterio_id);
CREATE INDEX IF NOT EXISTS idx_sepulturas_situacao  ON sepulturas (situacao);

CREATE OR REPLACE TRIGGER trg_sepulturas_updated_at
  BEFORE UPDATE ON sepulturas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
