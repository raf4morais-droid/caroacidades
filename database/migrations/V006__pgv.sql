-- V006: Planta Genérica de Valores (PGV)
SET search_path TO sigweb, public;

-- Setores de cálculo PGV
CREATE TABLE setores_pgv (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome      VARCHAR(100) NOT NULL,
  equacao   TEXT,
  r2        FLOAT,
  geometry  GEOMETRY(POLYGON, 31982),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_setores_pgv_geom ON setores_pgv USING GIST (geometry);

-- Atualizar FK em faces_quadra
ALTER TABLE faces_quadra
  ADD CONSTRAINT fk_faces_setor_pgv FOREIGN KEY (setor_pgv_id) REFERENCES setores_pgv(id);

-- Polos valorizantes
CREATE TABLE polos_pgv (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome       VARCHAR(150) NOT NULL,
  tipo       VARCHAR(50),
  geometry   GEOMETRY(POINT, 31982),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_polos_pgv_geom ON polos_pgv USING GIST (geometry);

-- Amostras de mercado (pontos de coleta de preço)
CREATE TABLE amostras_pgv (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setor_id            UUID REFERENCES setores_pgv(id),
  valor_amostra       FLOAT NOT NULL,
  idade_aparente      INT,
  estado_conservacao  VARCHAR(50),
  tipologia           VARCHAR(100),
  padrao_cub          VARCHAR(50),
  distancia_polo      FLOAT,
  espuria             BOOLEAN NOT NULL DEFAULT FALSE,
  geometry            GEOMETRY(POINT, 31982),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_amostras_pgv_geom  ON amostras_pgv USING GIST (geometry);
CREATE INDEX idx_amostras_pgv_setor ON amostras_pgv (setor_id);

-- Simulações de IPTU
CREATE TABLE simulacoes_iptu (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  descricao             VARCHAR(200) NOT NULL,
  aliquota_residencial  FLOAT NOT NULL,
  aliquota_comercial    FLOAT NOT NULL,
  aliquota_industrial   FLOAT NOT NULL,
  aliquota_terreno      FLOAT NOT NULL,
  teto_aumento_percent  FLOAT NOT NULL DEFAULT 15,
  created_by            UUID REFERENCES usuarios(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
