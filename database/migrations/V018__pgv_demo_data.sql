-- V018: Dados de demonstração para módulo PGV (req 219)
-- Gera um setor de cálculo com faces de quadra georreferenciadas e valores calculados
-- para demonstração na PoC. Centro aproximado de Tupanciretã: (209200, 6784500) EPSG:31982.
-- Substituir por cálculo real após importação do cadastro imobiliário.
SET search_path TO sigweb, public;

-- Setor de cálculo PGV — área central do município
WITH setor AS (
  INSERT INTO setores_pgv (nome, equacao, r2, geometry)
  VALUES (
    'Centro Tupanciretã (PoC)',
    'V = 1200 - 1.8 × d',
    0.89,
    ST_GeomFromText(
      'POLYGON((208800 6784000, 209700 6784000, 209700 6785100, 208800 6785100, 208800 6784000))',
      31982
    )
  )
  RETURNING id
),

-- Polo valorizante — Praça Central
polo AS (
  INSERT INTO polos_pgv (nome, tipo, geometry)
  VALUES (
    'Praça Pinheiro Machado', 'comercial',
    ST_GeomFromText('POINT(209200 6784500)', 31982)
  )
)

-- Faces de quadra com valor calculado (R$/m²)
-- Grade 4×3 de quadras em torno do centro, valor decrescente com distância ao polo
INSERT INTO faces_quadra (setor_pgv_id, valor_calculado, distancia_polo, geometry)
SELECT s.id, v.valor, v.dist,
       ST_GeomFromText(v.geom, 31982)
FROM setor s
CROSS JOIN (VALUES
  -- Eixo central (Av. principal N-S)
  (1180.00,  55.0, 'LINESTRING(209200 6784250, 209200 6784450)'),
  (1200.00,  10.0, 'LINESTRING(209200 6784450, 209200 6784550)'),
  (1150.00,  90.0, 'LINESTRING(209200 6784550, 209200 6784750)'),

  -- Rua paralela (100m a leste)
  ( 980.00, 155.0, 'LINESTRING(209300 6784250, 209300 6784450)'),
  ( 960.00, 105.0, 'LINESTRING(209300 6784450, 209300 6784550)'),
  ( 940.00, 160.0, 'LINESTRING(209300 6784550, 209300 6784750)'),

  -- Rua paralela (100m a oeste)
  ( 980.00, 155.0, 'LINESTRING(209100 6784250, 209100 6784450)'),
  ( 960.00, 105.0, 'LINESTRING(209100 6784450, 209100 6784550)'),
  ( 940.00, 160.0, 'LINESTRING(209100 6784550, 209100 6784750)'),

  -- Rua paralela (200m a leste)
  ( 820.00, 220.0, 'LINESTRING(209400 6784250, 209400 6784450)'),
  ( 800.00, 205.0, 'LINESTRING(209400 6784450, 209400 6784550)'),
  ( 780.00, 225.0, 'LINESTRING(209400 6784550, 209400 6784750)'),

  -- Rua paralela (200m a oeste)
  ( 820.00, 220.0, 'LINESTRING(209000 6784250, 209000 6784450)'),
  ( 800.00, 205.0, 'LINESTRING(209000 6784450, 209000 6784550)'),
  ( 780.00, 225.0, 'LINESTRING(209000 6784550, 209000 6784750)'),

  -- Transversais (E-W)
  (1050.00,  80.0, 'LINESTRING(209100 6784500, 209200 6784500)'),
  (1050.00,  80.0, 'LINESTRING(209200 6784500, 209300 6784500)'),
  ( 870.00, 185.0, 'LINESTRING(209000 6784500, 209100 6784500)'),
  ( 870.00, 185.0, 'LINESTRING(209300 6784500, 209400 6784500)'),
  ( 920.00, 155.0, 'LINESTRING(209100 6784300, 209200 6784300)'),
  ( 920.00, 155.0, 'LINESTRING(209200 6784300, 209300 6784300)'),
  ( 850.00, 210.0, 'LINESTRING(209000 6784300, 209100 6784300)'),
  ( 850.00, 210.0, 'LINESTRING(209300 6784300, 209400 6784300)'),
  ( 910.00, 160.0, 'LINESTRING(209100 6784700, 209200 6784700)'),
  ( 910.00, 160.0, 'LINESTRING(209200 6784700, 209300 6784700)'),
  ( 840.00, 215.0, 'LINESTRING(209000 6784700, 209100 6784700)'),
  ( 840.00, 215.0, 'LINESTRING(209300 6784700, 209400 6784700)'),

  -- Periferia (300m do centro)
  ( 660.00, 320.0, 'LINESTRING(208900 6784200, 208900 6784500)'),
  ( 640.00, 350.0, 'LINESTRING(208900 6784500, 208900 6784800)'),
  ( 650.00, 315.0, 'LINESTRING(209500 6784200, 209500 6784500)'),
  ( 630.00, 345.0, 'LINESTRING(209500 6784500, 209500 6784800)')
) AS v(valor, dist, geom);
