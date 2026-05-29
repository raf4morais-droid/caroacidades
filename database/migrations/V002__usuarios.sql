-- V002: Usuários e controle de acesso
SET search_path TO sigweb, public;

CREATE TABLE usuarios (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firebase_uid    VARCHAR(128) UNIQUE NOT NULL,
  email           VARCHAR(255) NOT NULL,
  nome            VARCHAR(255),
  perfil          VARCHAR(32) NOT NULL DEFAULT 'CIDADAO'
                    CHECK (perfil IN ('ADMIN','FISCAL_TRIBUTARIO','SETOR_PROJETOS','FISCAL_CAMPO','CIDADAO')),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usuarios_firebase_uid ON usuarios (firebase_uid);
CREATE INDEX idx_usuarios_email        ON usuarios (email);

CREATE TRIGGER trg_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
