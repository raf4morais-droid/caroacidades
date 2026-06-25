-- V014: Triggers de auditoria em tabelas críticas (retenção 90 dias)
SET search_path TO sigweb, public;

-- Tabela de auditoria centralizada
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tabela       VARCHAR(100) NOT NULL,
  operacao     VARCHAR(10)  NOT NULL CHECK (operacao IN ('INSERT','UPDATE','DELETE')),
  registro_id  UUID,
  dados_antes  JSONB,
  dados_depois JSONB,
  usuario_id   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tabela  ON audit_log (tabela, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_usuario ON audit_log (usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_data    ON audit_log (created_at DESC);

-- Função genérica de auditoria
CREATE OR REPLACE FUNCTION fn_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO sigweb.audit_log (tabela, operacao, registro_id, dados_antes)
    VALUES (TG_TABLE_NAME, TG_OP, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO sigweb.audit_log (tabela, operacao, registro_id, dados_antes, dados_depois)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE -- INSERT
    INSERT INTO sigweb.audit_log (tabela, operacao, registro_id, dados_depois)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplica auditoria às tabelas críticas
CREATE OR REPLACE TRIGGER trg_audit_parcelas
  AFTER INSERT OR UPDATE OR DELETE ON parcelas
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_edificacoes
  AFTER INSERT OR UPDATE OR DELETE ON edificacoes
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_pessoas
  AFTER INSERT OR UPDATE OR DELETE ON pessoas
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_usuarios
  AFTER INSERT OR UPDATE OR DELETE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_processos
  AFTER INSERT OR UPDATE OR DELETE ON processos
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_consultas_viabilidade
  AFTER INSERT OR UPDATE OR DELETE ON consultas_viabilidade
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_envios_sinter
  AFTER INSERT OR UPDATE OR DELETE ON envios_sinter
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

-- Limpeza automática de registros com mais de 90 dias
CREATE OR REPLACE FUNCTION cleanup_audit_log() RETURNS INT AS $$
DECLARE
  removidos INT;
BEGIN
  DELETE FROM sigweb.audit_log WHERE created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS removidos = ROW_COUNT;
  RETURN removidos;
END;
$$ LANGUAGE plpgsql;
