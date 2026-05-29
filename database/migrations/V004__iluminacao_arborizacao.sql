-- V004: Iluminação Pública e Arborização Urbana
SET search_path TO sigweb, public;

-- Postes
CREATE TABLE postes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo         VARCHAR(30) UNIQUE,
  logradouro_id  UUID REFERENCES logradouros(id),
  numero_predial VARCHAR(10),
  tipo           VARCHAR(50),
  potencia_w     FLOAT,
  situacao       VARCHAR(20) NOT NULL DEFAULT 'normal'
                   CHECK (situacao IN ('normal','defeito','em_manutencao')),
  geometry       GEOMETRY(POINT, 31982),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_postes_geom       ON postes USING GIST (geometry);
CREATE INDEX idx_postes_logradouro ON postes (logradouro_id);
CREATE INDEX idx_postes_situacao   ON postes (situacao);

CREATE TRIGGER trg_postes_updated_at BEFORE UPDATE ON postes FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

-- Equipes de manutenção
CREATE TABLE equipes_manutencao (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome       VARCHAR(100) NOT NULL,
  responsavel VARCHAR(100),
  telefone   VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tipos de defeito para iluminação
CREATE TABLE tipos_defeito (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome      VARCHAR(100) NOT NULL,
  descricao TEXT
);

-- Ordens de Serviço — Iluminação Pública
CREATE TABLE ordens_servico_ip (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poste_id     UUID NOT NULL REFERENCES postes(id),
  tipo_defeito_id UUID REFERENCES tipos_defeito(id),
  equipe_id    UUID REFERENCES equipes_manutencao(id),
  situacao     VARCHAR(20) NOT NULL DEFAULT 'aberta'
                 CHECK (situacao IN ('aberta','em_andamento','concluida','cancelada')),
  observacoes  TEXT,
  aberta_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluida_em TIMESTAMPTZ,
  created_by   UUID REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_os_ip_poste   ON ordens_servico_ip (poste_id);
CREATE INDEX idx_os_ip_situacao ON ordens_servico_ip (situacao);

CREATE TRIGGER trg_os_ip_updated_at BEFORE UPDATE ON ordens_servico_ip FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

-- Estoque de materiais (iluminação)
CREATE TABLE locais_estoque (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome       VARCHAR(100) NOT NULL,
  descricao  TEXT
);

CREATE TABLE produtos (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome       VARCHAR(200) NOT NULL,
  unidade    VARCHAR(20) NOT NULL DEFAULT 'un',
  descricao  TEXT
);

CREATE TABLE estoque (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  produto_id      UUID NOT NULL REFERENCES produtos(id),
  local_id        UUID NOT NULL REFERENCES locais_estoque(id),
  lote_serie      VARCHAR(50),
  quantidade      FLOAT NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  garantia_ate    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (produto_id, local_id, lote_serie)
);

CREATE TABLE movimentacoes_estoque (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  estoque_id   UUID NOT NULL REFERENCES estoque(id),
  tipo         VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada','saida','transferencia')),
  quantidade   FLOAT NOT NULL,
  os_id        UUID REFERENCES ordens_servico_ip(id),
  destino_id   UUID REFERENCES locais_estoque(id),
  observacoes  TEXT,
  created_by   UUID REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Árvores
CREATE TABLE arvores (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo                SERIAL UNIQUE,
  logradouro_id         UUID REFERENCES logradouros(id),
  especie               VARCHAR(150),
  nome_popular          VARCHAR(150),
  altura_m              FLOAT,
  dap_cm                FLOAT,
  estado_fitossanitario VARCHAR(50),
  situacao_calcada      VARCHAR(50),
  data_cadastro         DATE,
  geometry              GEOMETRY(POINT, 31982),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_arvores_geom       ON arvores USING GIST (geometry);
CREATE INDEX idx_arvores_logradouro ON arvores (logradouro_id);

CREATE TRIGGER trg_arvores_updated_at BEFORE UPDATE ON arvores FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

-- Ordens de Serviço — Arborização
CREATE TABLE ordens_servico_arb (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  arvore_id    UUID NOT NULL REFERENCES arvores(id),
  tipo         VARCHAR(100) NOT NULL,
  equipe_id    UUID REFERENCES equipes_manutencao(id),
  situacao     VARCHAR(20) NOT NULL DEFAULT 'aberta'
                 CHECK (situacao IN ('aberta','em_andamento','concluida','cancelada')),
  observacoes  TEXT,
  foto_urls    TEXT[] DEFAULT '{}',
  concluida_em TIMESTAMPTZ,
  created_by   UUID REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_os_arb_arvore   ON ordens_servico_arb (arvore_id);
CREATE INDEX idx_os_arb_situacao ON ordens_servico_arb (situacao);

-- Sepulturas (cemitérios)
CREATE TABLE sepulturas (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo       VARCHAR(30) UNIQUE,
  titular      VARCHAR(255),
  falecido     VARCHAR(255),
  data_obito   DATE,
  data_entrada DATE,
  tipo         VARCHAR(50),
  quadra       VARCHAR(20),
  numero       VARCHAR(20),
  observacoes  TEXT,
  geometry     GEOMETRY(POINT, 31982),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sepulturas_geom ON sepulturas USING GIST (geometry);
