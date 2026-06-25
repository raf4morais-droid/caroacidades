-- View para camada de situação de recadastramento no mapa (req 07)
-- pg_tileserv auto-descobre views e as serve como MVT
-- Situações: pendente (cinza) | visitado (amarelo) | recadastrado (verde) | impedido (vermelho)

CREATE OR REPLACE VIEW sigweb.v_parcelas_recadastramento AS
SELECT
  p.id,
  p.codigo,
  p.geometry,
  COALESCE(b.situacao_recadastramento, 'pendente') AS situacao
FROM sigweb.parcelas p
LEFT JOIN LATERAL (
  SELECT situacao_recadastramento
  FROM sigweb.bics
  WHERE parcela_id = p.id
  ORDER BY created_at DESC
  LIMIT 1
) b ON true;

-- Necessário para pg_tileserv descobrir a view como camada publicável
COMMENT ON VIEW sigweb.v_parcelas_recadastramento IS 'Situação de recadastramento por parcela — camada para o mapa do SIGWEB';
