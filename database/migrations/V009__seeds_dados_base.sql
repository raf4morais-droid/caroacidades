-- V009: Dados base (seeds) para operação inicial
SET search_path TO sigweb, public;

-- Tipos de defeito para iluminação
INSERT INTO tipos_defeito (nome, descricao) VALUES
  ('Lâmpada apagada', 'Ponto de iluminação sem funcionar'),
  ('Lâmpada piscando', 'Lâmpada com oscilação'),
  ('Poste danificado', 'Estrutura física do poste danificada'),
  ('Fiação exposta', 'Fio elétrico exposto com risco'),
  ('Luminária quebrada', 'Carcaça da luminária danificada'),
  ('Chave automática com defeito', NULL);

-- Equipe padrão
INSERT INTO equipes_manutencao (nome, responsavel) VALUES
  ('Equipe Elétrica Municipal', 'Responsável Técnico');

-- Local de estoque padrão
INSERT INTO locais_estoque (nome) VALUES
  ('Almoxarifado Central'),
  ('Depósito Zona Norte'),
  ('Depósito Zona Sul');

-- Tipos de renda (Cadastro Social)
INSERT INTO tipos_renda (nome) VALUES
  ('Salário'),
  ('Aposentadoria'),
  ('Pensão'),
  ('Benefício Social (BPC)'),
  ('Bolsa Família'),
  ('Autônomo / Informal'),
  ('Aluguel'),
  ('Outros');

-- Categorias de chamado
INSERT INTO categorias_chamado (nome, privada) VALUES
  ('Iluminação Pública', FALSE),
  ('Pavimentação', FALSE),
  ('Limpeza Urbana', FALSE),
  ('Arborização', FALSE),
  ('Sinalização', FALSE),
  ('Fiscalização', TRUE),
  ('Outros', FALSE);

-- Zonas de uso do solo (Tupanciretã — valores exemplares para configuração)
-- Os valores reais devem ser importados do Plano Diretor municipal
INSERT INTO zonas_uso (nome, sigla, to_percent, ca_min, ca_max, afastamento_frontal, gabarito_max) VALUES
  ('Zona Residencial 1', 'ZR1', 60, 0.5, 1.2, 4.0, 7.5),
  ('Zona Residencial 2', 'ZR2', 70, 0.5, 2.0, 3.0, 12.0),
  ('Zona Comercial Central', 'ZCC', 100, 1.0, 4.0, 0.0, 20.0),
  ('Zona Industrial', 'ZI', 60, 0.5, 2.0, 10.0, NULL),
  ('Zona de Expansão Urbana', 'ZEU', 50, 0.2, 1.0, 5.0, 7.5),
  ('Área de Preservação Permanente', 'APP', 0, 0, 0, NULL, NULL);

-- Informações sociais padrão (score de vulnerabilidade)
-- Score: quanto maior, mais vulnerável
INSERT INTO informacoes_sociais (familia_id, tipo, score) SELECT NULL, tipo, score FROM (VALUES
  ('Família em situação de rua', 10),
  ('Criança em situação de vulnerabilidade', 8),
  ('Idoso acima de 80 anos', 5),
  ('Deficiente físico', 5),
  ('Doença crônica grave', 6),
  ('Desemprego', 4)
) AS t(tipo, score) WHERE FALSE; -- Template, não insere dados reais
