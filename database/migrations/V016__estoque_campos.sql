-- Campos adicionais para módulo de estoque completo (req 49)
ALTER TABLE sigweb.produtos
  ADD COLUMN IF NOT EXISTS marca       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fabricante  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS familia     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fornecedor  VARCHAR(200);

ALTER TABLE sigweb.locais_estoque
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(50) NOT NULL DEFAULT 'principal';
