-- V017: Campos do Boletim Cadastral de Arborização (req 72)
SET search_path TO sigweb, public;

ALTER TABLE arvores
  ADD COLUMN IF NOT EXISTS conflito_rede  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS observacoes    TEXT,
  ADD COLUMN IF NOT EXISTS numero_predial VARCHAR(10),
  ADD COLUMN IF NOT EXISTS data_plantio   DATE;
