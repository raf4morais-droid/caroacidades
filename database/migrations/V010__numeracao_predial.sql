-- V010: Numeração Predial
SET search_path TO sigweb, public;

-- numero_predial_principal referenciado em spatial.service mas ausente do schema
ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS numero_predial_principal VARCHAR(20);

-- Operações de numeração realizadas por logradouro
CREATE TABLE numeracao_predial (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  logradouro_id       UUID NOT NULL REFERENCES logradouros(id),
  numero_inicio_par   INT NOT NULL DEFAULT 2,
  numero_inicio_impar INT NOT NULL DEFAULT 1,
  sentido             VARCHAR(20) NOT NULL DEFAULT 'crescente'
                        CHECK (sentido IN ('crescente','decrescente')),
  usuario_id          UUID REFERENCES usuarios(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_numeracao_predial_logradouro ON numeracao_predial (logradouro_id);

-- Divergências detectadas entre número atual e gerado
CREATE TABLE divergencias_numeracao (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  edificacao_id   UUID NOT NULL REFERENCES edificacoes(id) ON DELETE CASCADE,
  logradouro_id   UUID REFERENCES logradouros(id),
  numero_atual    VARCHAR(20),
  numero_gerado   VARCHAR(20),
  resolvida       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_divergencias_edificacao  ON divergencias_numeracao (edificacao_id);
CREATE INDEX IF NOT EXISTS idx_divergencias_resolvida   ON divergencias_numeracao (resolvida);
