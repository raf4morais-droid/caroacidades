-- V013: SINTER — controle de envios à Receita Federal
-- Prazo impretérivel: validação no ambiente oficial RFB até 31/12/2026
SET search_path TO sigweb, public;

-- Lotes de envio ao SINTER
CREATE TABLE IF NOT EXISTS envios_sinter (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_envio    INT GENERATED ALWAYS AS IDENTITY,
  tipo            VARCHAR(20) NOT NULL DEFAULT 'incremental'
                    CHECK (tipo IN ('teste','incremental','completo')),
  status          VARCHAR(30) NOT NULL DEFAULT 'preparando'
                    CHECK (status IN ('preparando','validando','enviado','aceito','rejeitado','erro')),
  qtd_parcelas    INT NOT NULL DEFAULT 0,
  arquivo_gcs     TEXT,       -- path no Cloud Storage
  erros           JSONB NOT NULL DEFAULT '[]',
  resposta_rfb    TEXT,       -- retorno literal do SINTER
  enviado_em      TIMESTAMPTZ,
  validado_em     TIMESTAMPTZ,
  criado_por      UUID REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_envios_sinter_status ON envios_sinter (status);

-- Status individual por parcela no SINTER
CREATE TABLE IF NOT EXISTS parcelas_sinter (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parcela_id  UUID NOT NULL REFERENCES parcelas(id) ON DELETE CASCADE,
  envio_id    UUID REFERENCES envios_sinter(id),
  status      VARCHAR(30) NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','incluida','aceita','rejeitada','erro')),
  codigo_nitu VARCHAR(60),   -- NITU atribuído pela RFB após validação
  erros       TEXT[] NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma parcela tem apenas um registro de status atual
CREATE UNIQUE INDEX IF NOT EXISTS idx_parcelas_sinter_parcela ON parcelas_sinter (parcela_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_sinter_status         ON parcelas_sinter (status);
CREATE INDEX IF NOT EXISTS idx_parcelas_sinter_envio          ON parcelas_sinter (envio_id);
