-- V001: Extensões e schema base
-- SIGWEB Tupanciretã — PostgreSQL 15 + PostGIS 3.x

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Schema principal
CREATE SCHEMA IF NOT EXISTS sigweb;
SET search_path TO sigweb, public;

-- Função utilitária: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION sigweb.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função utilitária: registra histórico cartográfico automaticamente
CREATE OR REPLACE FUNCTION sigweb.log_geometry_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT ST_Equals(COALESCE(OLD.geometry, 'GEOMETRYCOLLECTION EMPTY'), COALESCE(NEW.geometry, 'GEOMETRYCOLLECTION EMPTY')) THEN
    INSERT INTO sigweb.historico_cartografico
      (entidade, entidade_id, geometry_antes, geometry_depois, operacao)
    VALUES
      (TG_TABLE_NAME, OLD.id, OLD.geometry, NEW.geometry, 'update');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
