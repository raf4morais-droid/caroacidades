# PRD — SIGWEB Tupanciretã
**Sistema de Georreferenciamento e Informações Geográficas**

| Campo | Valor |
|---|---|
| Versão | 2.0.0 |
| Data | Maio 2026 |
| Contrato | Pregão Eletrônico nº 28/2026 — Processo 903/2026 |
| Valor estimado | R$ 470.000,03 |
| Vigência | 12 meses (prorrogável até 60 meses) |
| Status | Em elaboração |
| Plataforma | Google Cloud Platform (GCP) |
| Banco de dados | PostgreSQL 15 + PostGIS 3.x (Cloud SQL) |
| Auth | Firebase Auth |
| Tiles | pg_tileserv (MVT) + GeoServer (WMS) |

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura GCP](#2-arquitetura-gcp)
3. [Stack Técnica](#3-stack-técnica)
4. [Itens Contratáveis](#4-itens-contratáveis)
5. [Módulos do Sistema](#5-módulos-do-sistema)
6. [Aplicativos Móveis](#6-aplicativos-móveis)
7. [Integrações](#7-integrações)
8. [Requisitos Não Funcionais](#8-requisitos-não-funcionais)
9. [Prova de Conceito](#9-prova-de-conceito)
10. [Cronograma e Pagamentos](#10-cronograma-e-pagamentos)
11. [Capacitação e Suporte](#11-capacitação-e-suporte)
12. [Critérios de Aceite](#12-critérios-de-aceite)
13. [Riscos e Mitigações](#13-riscos-e-mitigações)
14. [Condições Contratuais](#14-condições-contratuais)

---

## 1. Visão Geral

### 1.1 Objetivo do Produto

O SIGWEB Tupanciretã é uma plataforma pública de gestão territorial urbana contratada pelo Município de Tupanciretã/RS via Pregão Eletrônico nº 28/2026. O sistema moderniza integralmente a infraestrutura de dados espaciais do município, interligando:

- Cadastro imobiliário multifinalitário
- Cartografia digital urbana (~13 km²)
- Geoprocessamento 100% web (SIGWEB)
- Aplicativos móveis de campo (recadastramento, arborização, chamados)
- Alimentação obrigatória do SINTER até **31/12/2026**
- Geração de base compatível com o CIB

A solução é entregue como **SaaS hospedado integralmente no Google Cloud Platform (GCP)**, aproveitando Firebase para auth/storage/push e Cloud SQL + PostGIS para dados espaciais.

### 1.2 Problema a Resolver

Identificado no Estudo Técnico Preliminar (ETP) aprovado:

| # | Problema | Impacto |
|---|---|---|
| 1 | Defasagem cartográfica urbana | Base não reflete expansões recentes |
| 2 | Inconsistências no cadastro imobiliário | Lotes e edificações com dados divergentes |
| 3 | Obrigação legal do SINTER não cumprida | Risco de sanções federais ao município |
| 4 | Falta de integração sistêmica | Dados em silos entre Fazenda, Projetos e Fiscalização |
| 5 | Perda de arrecadação de IPTU | Imóveis sem cadastro correto ou edificações irregulares |
| 6 | Processos manuais e desconexos | Viabilidade, aprovação de projetos e habite-se sem sistema |

### 1.3 Stakeholders

**Contratante — Prefeitura de Tupanciretã/RS**

| Papel | Nome | Matrícula |
|---|---|---|
| Gestora do Contrato | Talita Cassiane Martins Santos | 1468-0 |
| Fiscal Administrativo | Ewerton Böer da Costa | 1548-2 |
| Fiscal Tributário | Gizelda Maria da Silveira Couto | 1658-6 |
| Prefeito | Gustavo Herter Terra | — |

**Usuários Primários**
- Fiscalização Tributária → manutenção de IPTU, notificações, auditoria
- Setor de Projetos → aprovação de projetos, habite-se, viabilidade urbana
- Receita Municipal → gestão do cadastro imobiliário multifinalitário
- Equipes de campo → apps móveis de recadastramento e arborização

**Usuários Secundários**
- Cidadãos → consulta pública de viabilidade e andamento de processos

**Órgãos Externos**
- Receita Federal (RFB) → integração SINTER e CIB
- Ministério da Defesa → autorização de aerolevantamento (categoria A)
- INPI → registro do software

### 1.4 Abrangência Geográfica

| Campo | Valor |
|---|---|
| Município | Tupanciretã — RS |
| Área de cobertura | Perímetro urbano municipal |
| Superfície mapeada | ~13 km² |
| Referencial geodésico | SIRGAS 2000 |
| Sistema de projeção | UTM — Zona 22S (EPSG:31982) |
| Escala cartográfica | 1:1.000 — PEC Classe A |
| Escala temática | 1:5.000 |
| Curvas de nível | 1 metro de espaçamento |
| GSD aerofotogrametria | ≤ 8 cm/pixel |

### 1.5 Decisão de Plataforma

**Plataforma selecionada: Google Cloud Platform (GCP) — plataforma única**

**Justificativa:**
- Firebase (Auth, Storage, Messaging) é produto nativo do GCP — mesmo console, mesmo faturamento, mesma região
- Latência mínima entre Firebase e Cloud SQL (mesma zona GCP)
- Cloud SQL oferece PostgreSQL gerenciado com PostGIS — obrigatório para os 234 requisitos espaciais
- pg_tileserv no Cloud Run substitui GeoServer com muito menos complexidade operacional
- Curva de aprendizado menor para equipes que já usam Firebase

**Alternativas descartadas:**

| Alternativa | Motivo do descarte |
|---|---|
| AWS | Segundo provedor sem vantagem clara; Firebase não tem equivalente nativo |
| Self-hosted | Custo de operação inviável dentro do orçamento do contrato |
| GeoServer como servidor principal | 600 MB idle vs 50 MB do pg_tileserv; configuração complexa |

---

## 2. Arquitetura GCP

### 2.1 Diagrama de Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                GOOGLE CLOUD PLATFORM — us-east1              │
│                                                              │
│  ┌──────────────────────┐   ┌────────────────────────────┐  │
│  │    FIREBASE SUITE    │   │    COMPUTE & DATA          │  │
│  │                      │   │                            │  │
│  │  Firebase Auth       │   │  Cloud Run → API Backend   │  │
│  │  Firebase Storage    │   │  (Node.js / Fastify)       │  │
│  │  Firebase Messaging  │   │                            │  │
│  │  Firebase Hosting    │   │  Cloud Run → pg_tileserv   │  │
│  │  (SIGWEB React)      │   │  (MVT tiles do PostGIS)    │  │
│  └──────────────────────┘   │                            │  │
│                              │  Cloud Run → GeoServer     │  │
│  ┌──────────────────────┐   │  (WMS externo + 360°)      │  │
│  │    APPS MÓVEIS       │   │                            │  │
│  │                      │   │  Cloud SQL (PostgreSQL 15) │  │
│  │  React Native        │   │  + PostGIS 3.x             │  │
│  │  Android + iOS       │   │  + uuid-ossp + pgcrypto    │  │
│  │  Firebase SDK nativo │   │                            │  │
│  └──────────────────────┘   │  Cloud Storage (GCS)       │  │
│                              │  Ortomosaico, 360°, Potree │  │
└──────────────────────────────────────────────────────────────┘

FLUXO DE DADOS:
Browser     → Firebase Auth (JWT) → Cloud Run API → Cloud SQL PostGIS
Apps móveis → Firebase Auth       → Cloud Run API → Cloud SQL PostGIS
Fotos/PDFs  → Firebase Storage    (direto do cliente, sem passar pela API)
Tiles mapa  → pg_tileserv (Cloud Run) → Leaflet MVT Layer
Imagens 3D  → Cloud Storage → Cloud CDN → Potree Viewer
```

### 2.2 Responsabilidades por Serviço

| Serviço GCP | Responsabilidade |
|---|---|
| **Firebase Auth** | Autenticação web + mobile; JWT tokens; perfis RBAC via Custom Claims |
| **Firebase Storage** | Fotos de fachada, PDFs de processos, documentos digitalizados |
| **Firebase Messaging (FCM)** | Push notifications Android e iOS dos apps móveis |
| **Firebase Hosting** | Frontend React (SIGWEB); CDN global; HTTPS automático |
| **Cloud SQL + PostGIS** | Cadastro imobiliário com geometrias; consultas espaciais ST_*; histórico de alterações |
| **Cloud Run — API** | Backend Node.js/Fastify; lógica de negócio; endpoints REST |
| **Cloud Run — pg_tileserv** | Servidor de MVT tiles direto do PostGIS; substitui GeoServer para 90% dos casos |
| **Cloud Run — GeoServer** | WMS para camadas externas (IBGE, ANA) e imageamento 360° |
| **Cloud Storage (GCS)** | Ortomosaico GeoTIFF (~6 GB); Potree 3D tiles (~35 GB); imagens 360° (~130 GB) |
| **Cloud CDN** | Cache de tiles raster e 3D; reduz latência do mapa |
| **Cloud Monitoring** | SLA, alertas de indisponibilidade, métricas de CPU/memória/latência |

### 2.3 Banco de Dados — Cloud SQL + PostGIS

**Configuração da instância:**

```
Engine:   PostgreSQL 15
Extensões: PostGIS 3.x, uuid-ossp, pgcrypto
Instância: 2 vCPU, 8 GB RAM, 200 GB SSD
HA:        Failover automático para réplica em zona diferente
Backup:    Automático diário, retenção 30 dias
Região:    us-east1 (mesma do Firebase)
Acesso:    Cloud SQL Auth Proxy (sem IP público)
```

**Tabelas principais com geometria:**

```sql
-- Parcelas (lotes)
CREATE TABLE parcelas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo              VARCHAR,
  geometry            GEOMETRY(POLYGON, 31982),  -- SIRGAS 2000 UTM 22S
  area_m2             FLOAT,
  testada_principal   FLOAT,
  testada_secundaria  FLOAT,
  bairro_id           UUID REFERENCES bairros(id),
  logradouro_id       UUID REFERENCES logradouros(id),
  loteamento_id       UUID REFERENCES loteamentos(id),
  quadra_id           UUID REFERENCES quadras(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Edificações (unidades imobiliárias)
CREATE TABLE edificacoes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inscricao_imobiliaria VARCHAR UNIQUE,
  cadastro_imobiliario  VARCHAR,
  geometry              GEOMETRY(POLYGON, 31982),
  area_construida       FLOAT,
  parcela_id            UUID REFERENCES parcelas(id),
  proprietario_id       UUID REFERENCES pessoas(id),
  face_quadra           VARCHAR,
  numero_predial        VARCHAR,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Histórico de alterações cartográficas
CREATE TABLE historico_cartografico (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entidade        VARCHAR,   -- 'parcela', 'edificacao', etc.
  entidade_id     UUID,
  geometry_antes  GEOMETRY,
  geometry_depois GEOMETRY,
  usuario_id      UUID,
  operacao        VARCHAR,   -- 'update', 'desmembramento', 'unificacao'
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Postes
CREATE TABLE postes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo         VARCHAR,
  geometry       GEOMETRY(POINT, 31982),
  logradouro_id  UUID REFERENCES logradouros(id),
  numero_predial VARCHAR,
  tipo           VARCHAR,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Árvores
CREATE TABLE arvores (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo         SERIAL UNIQUE,
  geometry       GEOMETRY(POINT, 31982),
  logradouro_id  UUID REFERENCES logradouros(id),
  data_cadastro  DATE
);

-- Amostras PGV
CREATE TABLE amostras_pgv (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  geometry            GEOMETRY(POINT, 31982),
  setor_id            UUID,
  valor_amostra       FLOAT,
  idade_aparente      INT,
  estado_conservacao  VARCHAR,
  tipologia           VARCHAR,
  padrao_cub          VARCHAR
);

-- Índices espaciais (obrigatórios para performance)
CREATE INDEX idx_parcelas_geom    ON parcelas    USING GIST (geometry);
CREATE INDEX idx_edificacoes_geom ON edificacoes USING GIST (geometry);
CREATE INDEX idx_postes_geom      ON postes      USING GIST (geometry);
CREATE INDEX idx_arvores_geom     ON arvores     USING GIST (geometry);
```

**Operações PostGIS usadas na API:**

```sql
-- Desmembramento de lote
SELECT ST_Split(parcela.geometry, linha_divisoria) FROM parcelas WHERE id = $1;

-- Buffer para análise de viabilidade
SELECT ST_Buffer(ST_Transform(geometry, 31982), $distancia) FROM parcelas WHERE id = $1;

-- Imóveis dentro de um polígono (bairro, zona)
SELECT * FROM parcelas WHERE ST_Within(geometry, $poligono);

-- Distância face de quadra → polo PGV
SELECT ST_Distance(face.geometry, polo.geometry) FROM faces_quadra, polos_pgv;

-- Área em m²
SELECT ST_Area(ST_Transform(geometry, 31982)) FROM parcelas WHERE id = $1;

-- GeoJSON para o frontend
SELECT ST_AsGeoJSON(geometry)::json FROM parcelas WHERE id = $1;

-- Confrontantes (para memorial descritivo)
SELECT b.id FROM parcelas a, parcelas b
WHERE ST_Touches(a.geometry, b.geometry) AND a.id = $1;
```

### 2.4 Servidor de Tiles — pg_tileserv vs GeoServer

| Critério | pg_tileserv | GeoServer |
|---|---|---|
| Memória idle | ~50 MB | ~600 MB |
| Configuração | Zero (automático) | XML complexo |
| Deploy | Cloud Run simples | VM ou container pesado |
| Formato de saída | MVT (Mapbox Vector Tiles) | WMS, WFS, WMTS |
| Performance (dados PostGIS) | Excelente | Boa |
| Suporte WMS externo | ❌ | ✅ |

**Estratégia adotada:**
- **pg_tileserv** → 90% dos casos: cadastro, lotes, edificações, postes, árvores, amostras PGV
- **GeoServer** → apenas: camadas WMS externas (IBGE, ANA), imageamento 360° como WMS

```yaml
# Cloud Run — pg_tileserv
image: ghcr.io/crunchydata/pg_tileserv:latest
env:
  DATABASE_URL: postgresql://user:pass@/sigweb?host=/cloudsql/project:region:instance
memory: 512Mi
cpu: 1
min-instances: 1   # evitar cold start no mapa
```

### 2.5 Armazenamento — Distribuição e Capacidade

| Item | Serviço | Estimativa | Custo/mês |
|---|---|---|---|
| Fotos de recadastramento (1.000 × 3 fotos × 3 MB) | Firebase Storage | ~9 GB | |
| Fotos dos apps móveis (campo, arborização) | Firebase Storage | ~5 GB | |
| PDFs (memoriais, processos, habite-se) | Firebase Storage | ~10 GB | |
| Documentos digitalizados do cadastro | Firebase Storage | ~5 GB | |
| **Subtotal Firebase Storage** | | **~30 GB** | **~US$ 1** |
| Ortomosaico GeoTIFF COG (13 km², GSD 8 cm) | Cloud Storage | ~6 GB | |
| MDT + Modelagem 3D | Cloud Storage | ~2 GB | |
| Nuvem de pontos .LAS original | Cloud Storage | ~15 GB | |
| Nuvem de pontos Potree (octree tiles, 2–3× o .LAS) | Cloud Storage | ~35 GB | |
| Imageamento 360° terrestre (~16.000 fotos × 8 MB) | Cloud Storage | ~128 GB | |
| Imageamento 360° aéreo (~100 fotos × 25 MB) | Cloud Storage | ~3 GB | |
| **Subtotal Cloud Storage (GCS)** | | **~190 GB** | **~US$ 4** |
| Geometrias + dados cadastrais | Cloud SQL SSD | ~8 GB | incluído |
| **TOTAL UTILIZADO** | | **~228 GB** | |
| **TOTAL PROVISIONADO** | | **~500 GB** | |

> **Nota:** O item que mais cresce é o imageamento 360° terrestre. Dependendo do intervalo de captura (< 5 m), esse volume pode dobrar facilmente.

### 2.6 Custo Mensal Estimado GCP

| Serviço | Especificação | US$/mês |
|---|---|---|
| Cloud SQL PostgreSQL (HA) | 2 vCPU, 8 GB RAM, 200 GB SSD | ~80 |
| Cloud Run — API Backend | 2 instâncias mínimas | ~25 |
| Cloud Run — pg_tileserv | 1 instância mínima | ~15 |
| Cloud Run — GeoServer | Scale to zero | ~10 |
| Firebase Storage | ~30 GB | ~1 |
| Cloud Storage (GCS) | ~200 GB | ~4 |
| Firebase Auth | até 10k MAU | 0 |
| Firebase Messaging (FCM) | ilimitado | 0 |
| Firebase Hosting | 10 GB/mês | 0 |
| Cloud CDN | 50 GB/mês | ~4 |
| **TOTAL MENSAL** | | **~US$ 139** |
| **TOTAL EM REAIS (~R$ 5,75/US$)** | | **~R$ 800/mês** |
| **12 meses de infraestrutura** | | **~R$ 9.600** |
| **% do contrato (R$ 470.000)** | | **~2%** |

### 2.7 Segurança e Controle de Acesso

**RBAC via Firebase Custom Claims:**

```
ADMIN              → acesso total ao sistema
FISCAL_TRIBUTARIO  → cadastro, notificações, auditoria de IPTU
SETOR_PROJETOS     → aprovação de projetos, viabilidade urbana
FISCAL_CAMPO       → apps móveis de recadastramento
CIDADAO            → consulta pública apenas
```

**Firebase Storage Rules:**

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Fotos de recadastramento — somente fiscal de campo escreve
    match /recadastramento/{uid}/{file} {
      allow read:  if request.auth.token.perfil in ['ADMIN', 'FISCAL_TRIBUTARIO'];
      allow write: if request.auth.token.perfil == 'FISCAL_CAMPO';
    }
    // Documentos de processos — usuários autenticados
    match /processos/{processoId}/{file} {
      allow read, write: if request.auth != null;
    }
    // Documentos do cadastro — somente internos
    match /cadastro/{file} {
      allow read, write: if request.auth.token.perfil in ['ADMIN', 'FISCAL_TRIBUTARIO'];
    }
  }
}
```

**Camadas de segurança:**

- Cloud SQL sem IP público (acesso via Cloud SQL Auth Proxy)
- Cloud Run valida JWT Firebase em todas as rotas protegidas
- Cloud Armor (WAF) protege a API contra DDoS e SQL Injection
- Criptografia em repouso: Cloud SQL AES-256, GCS AES-256
- HTTPS/TLS 1.3 obrigatório em todas as comunicações
- Campos sensíveis do Cadastro Social (CPF, NIS, PIS) criptografados com `pgcrypto`

### 2.8 Infraestrutura como Código (Terraform)

```
terraform/
├── main.tf          # Provider GCP, região, projeto
├── firebase.tf      # Storage rules, Hosting config
├── cloudsql.tf      # PostgreSQL + PostGIS, HA, backups
├── cloudrun.tf      # API, pg_tileserv, GeoServer
├── gcs.tf           # Buckets para dados geoespaciais
├── cdn.tf           # Cloud CDN + Load Balancer
├── iam.tf           # Service accounts e permissões
├── vpc.tf           # VPC privada, subnets, firewall
└── variables.tf     # Variáveis por ambiente

Ambientes:
  dev     → custo ~US$ 40/mês, sem HA
  staging → espelho da produção para testes de aceite
  prod    → configuração completa com HA e backups
```

---

## 3. Stack Técnica

### 3.1 Frontend — SIGWEB (React + Leaflet)

| Categoria | Tecnologia | Finalidade |
|---|---|---|
| Framework | React 18 + TypeScript | UI do SIGWEB |
| Build | Vite | Build rápido, HMR |
| Hospedagem | Firebase Hosting | CDN global, HTTPS automático |
| Mapa | Leaflet.js 1.9+ | Renderização do mapa base |
| Edição cartográfica | Leaflet Draw + Leaflet PMGlify | Snap, polígonos, edição de geometrias |
| Tiles vetoriais | Leaflet + protocol-buffers | Consumir MVT do pg_tileserv |
| Análise espacial cliente | Turf.js | Buffer, área, distância, intersect no browser |
| Reprojeção | proj4js | SIRGAS 2000 UTM ↔ WGS84 |
| Nuvem de pontos 3D | Potree Viewer | Visualização do aerolevantamento |
| Editor BPMN | bpmn-js | Módulo REURB — fluxos configuráveis |
| Gráficos | Recharts | PGV (regressão), Cadastro Social (pizza) |
| PDF | jsPDF | Memoriais descritivos, consultas de viabilidade |
| Excel | SheetJS (xlsx) | Exportação XLS de relatórios |
| Auth | Firebase Auth SDK | Login, JWT, refresh automático |
| Estado global | Zustand | Filtros de mapa, estado da UI |
| Dados assíncronos | React Query | Cache e sincronização com a API |
| HTTP | Axios | Chamadas REST ao Cloud Run |

### 3.2 Backend — Cloud Run API (Node.js/Fastify)

```
Runtime:    Node.js 20 LTS
Framework:  Fastify + TypeScript
Container:  Docker → Cloud Run (us-east1)
Escala:     2 instâncias mínimas → 100 máximo (automático)
DB Driver:  pg (node-postgres) com pool de 10 conexões
Auth:       Firebase Admin SDK (validação JWT)

src/
├── routes/
│   ├── cadastro/         # CRUD imobiliário
│   ├── cartografia/      # Edição de geometrias PostGIS
│   ├── viabilidade/      # Consultas de viabilidade + CNAE
│   ├── processos/        # Aprovação, habite-se, REURB
│   ├── iluminacao/       # Postes, OS, estoque
│   ├── arborizacao/      # Árvores, manutenção
│   ├── pgv/              # Planta Genérica de Valores
│   ├── social/           # Cadastro social
│   ├── sinter/           # Geração de dados para o SINTER
│   └── mobile/           # Endpoints específicos para apps
├── services/
│   ├── spatial.service.ts    # Operações PostGIS
│   ├── firebase.service.ts   # Firebase Admin SDK
│   ├── storage.service.ts    # Firebase Storage + GCS
│   └── sinter.service.ts     # Formatação para layout SINTER
├── middleware/
│   ├── auth.middleware.ts    # Validação JWT Firebase
│   └── rbac.middleware.ts    # Controle de acesso por perfil
└── db/
    ├── pool.ts               # Pool PostgreSQL
    └── migrations/           # Flyway SQL migrations
```

### 3.3 Apps Móveis — React Native

```
Framework:  React Native 0.73+ (Expo Managed Workflow)
Plataformas: Android 8+ e iOS 14+ (App de Chamados)
             Android 8+ apenas (Recadastramento e Arborização)
```

**Bibliotecas comuns:**

| Biblioteca | Finalidade |
|---|---|
| `react-native-maps` | Mapas (Google Maps SDK) |
| `@react-native-firebase/auth` | Autenticação Firebase |
| `@react-native-firebase/storage` | Upload de fotos |
| `@react-native-firebase/messaging` | Push notifications (FCM) |
| `@react-native-community/geolocation` | GPS |
| `react-native-image-picker` | Câmera e galeria |
| `react-native-image-editor` | Recorte e rotação de fotos |
| `react-native-sqlite-storage` | Banco local para modo offline |
| `@react-native-community/netinfo` | Detecção online/offline |
| `react-native-fs` | Geração de ZIP para backup |

**Fluxo de sincronização offline → online:**

```
1. Dados coletados salvos no SQLite local
2. App detecta conexão Wi-Fi via NetInfo
3. Upload das fotos → Firebase Storage
4. POST /api/mobile/bics com dados + URLs das fotos
5. API salva no PostGIS e marca lote como "recadastrado"
6. Confirmação visual no app
```

### 3.4 Processamento Geoespacial — Aerolevantamento

```
FLUXO COMPLETO:

1. CAPTURA
   Drone ala fixa ou multirotor → GSD ≤ 8 cm
   GCPs com GNSS dupla frequência (SIRGAS 2000)
   Câmera 360° em veículo (terrestre) e drone (aéreo, 80 m)

2. PROCESSAMENTO FOTOGRAMÉTRICO
   Software: Agisoft Metashape Pro ou OpenDroneMap
   a. Structure from Motion (alinhamento)
   b. Nuvem densa de pontos
   c. MDT (Modelo Digital do Terreno)
   d. Ortomosaico (GeoTIFF, SIRGAS 2000/UTM)
   e. Validação PEC Classe A
   f. Curvas de nível 1 m (GDAL/QGIS)
   g. KMZ para Google Earth

3. NUVEM DE PONTOS → POTREE
   Input:  .LAS (nuvem bruta)
   Tool:   PotreeConverter (open source)
   Output: octree para streaming web
   Deploy: Cloud Storage (GCS) → Cloud CDN
   View:   Potree Viewer via iframe no SIGWEB

4. IMAGEAMENTO 360° TERRESTRE
   a. Captura com câmera 360° em veículo
   b. Processamento e georreferenciamento
   c. Renderização: .JPEG, 5.000 × 2.500 px mínimo
   d. Upload → Cloud Storage (GCS)
   e. Camada WMS configurada no GeoServer
   f. Integração como camada no Leaflet

5. IMAGEAMENTO 360° AÉREO
   a. Drone, 80 m de altura, espaçamento 400 m
   b. Renderização: .JPEG, 16.000 × 8.000 px
   c. Upload → Cloud Storage
   d. WMS no GeoServer → camada no SIGWEB
```

**Comandos GDAL utilizados:**

```bash
# Converter GeoTIFF para COG (Cloud Optimized GeoTIFF) para streaming
gdal_translate -of COG -co COMPRESS=DEFLATE \
  ortomosaico.tif ortomosaico_cog.tif

# Gerar curvas de nível a partir do MDT
gdal_contour -a elevation -i 1.0 mdt.tif curvas_1m.gpkg

# Reprojetar para SIRGAS 2000 UTM 22S (se dado vier em outro datum)
gdalwarp -s_srs EPSG:4326 -t_srs EPSG:31982 \
  input.tif output_sirgas_utm22s.tif

# Verificar metadados e EPSG do arquivo recebido
gdalinfo ortomosaico.tif | grep -E "EPSG|GSD|Size|Pixel"
```

---

## 4. Itens Contratáveis

### 4.1 Item 1 — Implantação do SIGWEB

| Campo | Valor |
|---|---|
| Quantidade | 1 unidade |
| Prazo | 120 dias corridos da assinatura (Jun–Jul) |
| Pagamento | 2 parcelas iguais: 30 e 60 dias após implantação |

**Entregáveis:**

- SIGWEB React deployado no Firebase Hosting (HTTPS, CDN)
- Cloud SQL com schema PostGIS completo e dados migrados
- Integração com banco de dados da Prefeitura via webservice
- Todos os 15 módulos obrigatórios ativos e funcionais
- Ambiente sandbox configurado (Cloud Run dev + Cloud SQL dev)
- pg_tileserv e GeoServer deployados e servindo tiles
- Treinamento presencial para ≥ 5 servidores
- Documentação técnica (API docs + manual do usuário)

**Critérios de aceite:**

- [ ] SIGWEB acessível em Edge, Firefox e Chrome sem instalação
- [ ] ≥ 95% dos 234 requisitos funcionais comprovados na Prova de Conceito
- [ ] Integração funcional com cadastro imobiliário existente
- [ ] Módulo de viabilidade com dados do Plano Diretor configurados
- [ ] Lista de presença do treinamento assinada

### 4.2 Item 2 — Licença + Manutenção (12 meses)

| Campo | Valor |
|---|---|
| Quantidade | 12 meses |
| Início de faturamento | 30 dias após assinatura do contrato |
| Pagamento | Até o 10º dia útil do mês subsequente |

**Incluso na licença:**

- Hospedagem GCP com SLA ≥ 99,5%
- Backup automático diário (retenção 30 dias)
- Atualizações de versão (SIGWEB + apps móveis)
- Manutenção corretiva, adaptativa e evolutiva
- Suporte técnico em horário comercial por qualquer canal
- Monitoramento 24/7 com alertas automáticos (Cloud Monitoring)

**Não incluso:** equipamentos, pacotes de dados móveis para a Prefeitura.

### 4.3 Item 3 — Aerofotogrametria (13 km²)

| Campo | Valor |
|---|---|
| Quantidade | 13 km² |
| Prazo | Jun–Jul (meses 1–2) |
| GSD | ≤ 8 cm/pixel |
| Escala | 1:1.000 — PEC Classe A |
| Referencial | SIRGAS 2000 / UTM 22S (EPSG:31982) |
| Curvas de nível | 1 metro de espaçamento |
| Requisito legal | Inscrição Ministério da Defesa categoria "A" (Decreto 2278/1997) |

**Produtos entregues:**
- Ortomosaico GeoTIFF + COG hospedado no GCS
- MDT em GeoTIFF
- Nuvem de pontos 3D classificada (.LAS)
- Nuvem de pontos Potree (tiles) no GCS + CDN, integrada ao SIGWEB
- Modelagem 3D da área urbana
- Arquivo KMZ

### 4.4 Item 4 — Imageamento 360° (13 km²)

| Campo | Valor |
|---|---|
| Quantidade | 13 km² |
| Prazo | Jun–Jul (meses 1–2) |

**Terrestre:**
- Cobertura: 100% do sistema viário urbano
- Resolução mínima: 5.000 × 2.500 px (5K)
- Câmera 360° embarcada em veículo
- SIRGAS 2000/UTM, data e hora registradas

**Aéreo:**
- Espaçamento: 400 m entre fotos, altura 80 m
- Resolução: 16.000 × 8.000 px (128 MP)
- Rede de pontos cobrindo toda a área urbana

### 4.5 Item 5 — Vetorização Cartográfica (10.000 unidades)

| Campo | Valor |
|---|---|
| Quantidade | 10.000 unidades imobiliárias |
| Prazo | Ago–Out (meses 3–5) |

**Processo:**
1. Vetorização de edificações sobre ortofoto (item 3)
2. Comparativo automático via PostGIS `ST_Area` (vetorizado vs. cadastro)
3. Identificação de imóveis com divergência acima de threshold
4. Exclusão de imóveis especiais conforme lista da Prefeitura

**Mapa temático 1:5.000 entregue:**
- Quadras com codificação
- Bairros conforme legislação municipal
- Parcelamento do solo e estabelecimentos comerciais (cruzamento com Plano Diretor)
- Áreas de Regularização Fundiária
- Patrimônio Público Imobiliário
- Numeração predial, sistema viário, perímetro urbano
- Logradouros com codificação de seções
- Curvas de nível 1 m

**Assessoria incluída:**
- Elaboração de novos BICs e Boletins de Logradouros
- Treinamento de servidores do Cadastro Imobiliário
- Definição de nova tipologia construtiva municipal
- Critérios de preenchimento padronizados para campos do BCI
- Ferramenta de carta de notificação a contribuintes

### 4.6 Item 6 — Recadastramento In Loco (1.000 unidades)

| Campo | Valor |
|---|---|
| Quantidade | 1.000 unidades imobiliárias |
| Prazo | Ago–Dez (meses 3–7) |

> ⚠️ **Regra fundamental:** Medições presenciais são OBRIGATÓRIAS. Vetorização sobre ortofoto SEM medição in loco NÃO é aceita.

**Processo por unidade (via App de Recadastramento):**
1. Técnico seleciona lote no app
2. Realiza medições com trena
3. Preenche BCI completo
4. Fotografa a fachada (mínimo 1 foto)
5. Registra coordenada GPS da coleta
6. App salva offline → sincroniza via Wi-Fi

**Casos de impedimento (registrados no app):**
- Proprietário ausente → retorno aos sábados
- Proprietário não autoriza → estimativa por imagem
- Edificação não habitada → estimativa por imagem

**Definição de unidade imobiliária:**
- Lote sem edificação = 1 unidade
- Edificação distinta = 1 unidade
- Uso diferente na mesma edificação = unidades separadas
- Cada unidade autônoma de condomínio = 1 unidade

---

## 5. Módulos do Sistema

### M01 — Cadastro Imobiliário

**Entidades gerenciadas (tabelas PostGIS):**
`pessoas`, `bairros`, `logradouros`, `loteamentos`, `quadras`, `parcelas`, `edificacoes`, `bics`

**CRUD + Exportação:**
- Todas as entidades: inserir, editar, remover
- Exportação: XLS, PDF, CSV, XML
- Pesquisa categorizada por bairro, quadra, lote, logradouro
- Seleção na tabela → Leaflet `flyTo` (posiciona no mapa)
- Clique no mapa → abre o registro na tabela

**Memorial descritivo (PDF gerado na requisição):**
- Dados completos do imóvel
- Mapa com vértices e medidas das arestas
- Azimutes, distâncias e confrontantes (via `ST_Touches`)
- Coordenadas UTM de cada vértice

**Funcionalidades avançadas:**
- Importação de BICs coletados pelos apps móveis
- Vetorização de edificações irregulares no mapa
- Emissão de notificação de irregularidade
- Visualização Street View via Google Maps API
- Patrimônios públicos com documentos digitalizados
- Acompanhamento georreferenciado do recadastramento (pendente / visitado / recadastrado)
- Histórico de alterações por entidade

**Endpoints principais:**

```
GET    /api/parcelas?bbox={minx,miny,maxx,maxy}
GET    /api/parcelas/:id
POST   /api/parcelas
PUT    /api/parcelas/:id
DELETE /api/parcelas/:id
GET    /api/parcelas/:id/memorial-descritivo   → PDF
GET    /api/parcelas/:id/edificacoes
POST   /api/edificacoes/importar-mobile        → bulk import do app
```

---

### M02 — Edição Cartográfica Web

> 100% web — sem software desktop (QGIS, AutoCAD, ArcGIS).

**Implementação:** Leaflet Draw + Leaflet PMGlify + lógica PostGIS no backend

**Ferramentas de desenho:**

| Ferramenta | Descrição |
|---|---|
| Criação | Polígonos, linhas, pontos |
| Snap | Endpoint (fim de linha) e midpoint (meio de linha) |
| Edição | Mover vértice, mover geometria inteira |
| Rotação | Rotacionar geometria |
| Espelho | Mirror horizontal e vertical |
| Clone | Duplicar geometria |
| Dividir / Unir | Split e merge de polígonos |
| Buffer | Expandir/contrair (`ST_Buffer` no backend) |
| Ortogonal | Desenho ortogonal a partir de linha base |
| Por XY | Criação informando coordenadas de cada vértice |
| Por azimutes | XY inicial + azimutes + distâncias de cada aresta |
| Linhas guia | Adicionar/remover guias auxiliares |

**Operações cadastrais (PostGIS no backend):**

```sql
-- Desmembramento: usuário desenha linha de divisão
SELECT ST_Split(parcela.geometry, $linha_divisoria) FROM parcelas WHERE id = $1;
-- Resultado: dois polígonos → dois novos lotes criados

-- Unificação: usuário seleciona 2+ lotes adjacentes
SELECT ST_Union(ARRAY[geom1, geom2, geom3]);
-- Resultado: polígono único → novo lote atualizado imediatamente

-- Histórico salvo automaticamente
INSERT INTO historico_cartografico
  (entidade, entidade_id, geometry_antes, geometry_depois, usuario_id, operacao)
VALUES ('parcela', $id, $geom_antes, $geom_depois, $user_id, 'desmembramento');
```

---

### M03 — Consulta de Viabilidade

**Tipos de consulta:**
1. Viabilidade para edificação (parâmetros construtivos por zona)
2. Viabilidade para parcelamento do solo
3. Viabilidade para abertura de estabelecimento comercial (por CNAE)

**Fluxo:**

```
1. Usuário seleciona parcela no mapa (clique)
2. Sistema: ST_Within(parcela.geom, zona.geom) → identifica a zona de uso
3. Sistema recupera parâmetros: TO, CA, afastamentos, gabarito
4. Para CNAE: autocomplete por código ou descrição
5. Sistema gera PDF com código UUID de verificação (não sequencial)
6. PDF salvo no Firebase Storage → link enviado ao solicitante
```

**Código de verificação:**
- UUID v4 gerado no backend (não sequencial)
- Verificação pública disponível em URL aberta (sem login)

**Endpoints:**

```
POST /api/viabilidade/edificacao     → {parcela_id, tipo_obra}
POST /api/viabilidade/parcelamento   → {parcela_id}
POST /api/viabilidade/cnae           → {parcela_id, cnae_codigo}
GET  /api/viabilidade/verificar/:codigo  → verificação pública
GET  /api/viabilidade/historico      → listagem (autenticado)
```

---

### M04 — Iluminação Pública

**Entidades:** `postes`, `tipos_defeito`, `equipes_manutencao`, `ordens_servico_ip`
**Estoque:** `estabelecimentos`, `produtos`, `marcas`, `locais_estoque`, `movimentacoes_estoque`

**Fluxo: solicitação → ordem de serviço:**

```
1. Clique no poste no mapa → popup com botão "Abrir solicitação"
2. Usuário informa tipo de defeito + comentário
3. Ícone do poste muda → vermelho (defeito pendente)
4. Analista abre OS: equipe + tipo + itens da OS
5. Ícone muda → amarelo (em manutenção)
6. Conclusão da OS → sistema movimenta estoque via operação interna de saída
7. Ícone volta → verde (normalizado)
8. Impressão da OS em PDF com mapa de localização
```

**Listagem bidirecional:** tabela ↔ mapa (selecionar na tabela posiciona no mapa e vice-versa)

**Estoque:** controle por lote/série, transferência entre locais, relatórios de movimentação/saldo/garantia.

---

### M05 — Arborização Urbana

**Entidades:** `arvores`, `boletins_arborizacao`, `tipos_servico_arb`, `solicitacoes_arb`, `ordens_servico_arb`

**Fluxo operacional:** idêntico à Iluminação Pública — clique na árvore → solicitação → OS → conclusão → impressão com mapa.

**Campos da árvore:**
- Código único incremental (`SERIAL` no PostgreSQL)
- Ponto georreferenciado (`GEOMETRY POINT, 31982`)
- Logradouro mais próximo + número predial aproximado
- Data do cadastro

---

### M06 — Numeração Predial

**Fluxo automatizado:**

```
1. Usuário clica no logradouro no mapa
2. Backend: ST_DWithin(lotes.geom, logradouro.geom, tolerancia)
   → identifica lotes lindeiros
3. Frontend: lotes pares (azul), ímpares (laranja), sem número (cinza)
4. Usuário ajusta: remove/reinsere lotes, inverte pares/ímpares
5. Usuário clica no ponto de partida no mapa
6. Informa números iniciais (par e ímpar)
7. Backend gera numeração sequencial para cada edificação por parcela
8. Sistema lista edificações com faixa de numeração disponível
9. Usuário confirma ou ajusta manualmente casos especiais
10. Salvar: atualiza numero_predial no banco
11. Mapa exibe divergências em vermelho: número atual ≠ número gerado
```

---

### M07 — Planta Genérica de Valores (PGV)

**Entidades:** `amostras_pgv`, `setores_pgv`, `polos_pgv`, `faces_quadra`, `simulacoes_iptu`

**Fluxo de cálculo:**

```
1. Usuário desenha setores de cálculo (polígonos no mapa)
2. Usuário cadastra polos valorizantes (pontos no mapa)
3. Clique no mapa → cadastrar amostras (valor, idade, estado, tipologia, CUB)
4. Sistema calcula regressão linear (distância ao polo × valor)
5. Gráfico de dispersão com linha de tendência (Recharts)
6. Usuário remove amostras espúrias → recalcula equação
7. ST_Distance(face.geom, polo.geom) para cada face de quadra
8. Equação aplicada a todas as faces no setor
9. Mapa exibe heatmap de valores por face
10. Simulação de IPTU com alíquotas + teto de aumento configuráveis
11. Comparativo: IPTU atual vs IPTU simulado
```

**Endpoints:**

```
POST   /api/pgv/setores
POST   /api/pgv/amostras
POST   /api/pgv/calcular
DELETE /api/pgv/amostras/:id   → remover espúria
POST   /api/pgv/simular-iptu
GET    /api/pgv/relatorio       → relatório por face de quadra
```

---

### M08 — Cadastro Social

**Entidades:** `pessoas_social`, `familias`, `tipos_renda`, `entidades`, `programas`, `eventos`, `informacoes_sociais`, `empreendimentos`

**Cálculos automáticos:**
- Índice de vulnerabilidade (score por informações sociais da família)
- Renda bruta familiar: `SUM(rendas) WHERE compoe_renda = true`
- Renda per capita: `renda_bruta / qtd_membros`

**Visualização integrada ao mapa:**
- Gráfico pizza (Recharts) por situação cadastral
- Clique em fatia → Leaflet destaca famílias daquela situação no mapa
- `ST_Within` filtra edificações associadas às famílias selecionadas

**Dados sensíveis:** CPF, NIS, PIS armazenados criptografados via `pgcrypto` (AES-256).

---

### M09 — Aprovação de Projetos (Processo Digital)

**Entidades:** `processos`, `etapas_processo`, `pareceres`, `anexos_processo`, `formularios_processo`

**Perfil Solicitante:**
- Dashboard com processos abertos e etapa atual
- Iniciar preenchimento → salvar como rascunho → enviar
- Selecionar imóvel no mapa (clique → preenchimento automático)
- Corrigir somente formulários com parecer "reprovado"

**Perfil Analista:**
- Fila de processos por setor
- Encaminhar para outro analista / desatribuir
- Filtrar por: código, requerente, telefone, e-mail, campos do fluxo
- Aprovar / reprovar com comentário

**Anexos:** Firebase Storage com path `/processos/{processoId}/{arquivo}`, tipos PDF/JPG/PNG, máximo 20 MB por arquivo.

---

### M10 — Habite-se Online (Atestado de Conclusão de Obra)

Mesmo conjunto de funcionalidades do M09 (Aprovação de Projetos), aplicado ao fluxo de Habite-se.

---

### M11 — REURB Digital

**Editor BPMN:**
- Biblioteca: `bpmn-js` (React)
- Configurável por setor/departamento
- Perfis de usuário associados por fluxo via Firebase Custom Claims
- Formulários com 4 tipos de campo: texto simples, checkbox múltiplo, mapa (Leaflet marker), CPF/telefone com máscara

**Funcionalidades do processo:**
- Encaminhar para pessoa específica dentro da fase
- Anexar documentos (Firebase Storage)
- Anotações em PDFs sem sobrescrever original (cópia versionada)
- Selecionar lote no mapa → preenchimento automático de dados cadastrais
- Histórico completo de fases

**Visualização no mapa:**
- Lotes pintados por etapa/fase (Leaflet choropleth)
- Dashboards personalizáveis em tempo real (Recharts)
- Clique na fatia do gráfico → filtra lotes no mapa

---

### M12 — Gestão do App Móvel

- Configuração de fluxos de trabalho e categorias para os apps
- Gerenciamento de solicitações com tabela ↔ mapa bidirecional
- Envio de mensagens públicas (FCM push) e privadas (internas)
- Notificação automática de mudança de categoria e fase
- Impressão de solicitação com mapa, mensagens e histórico

---

### M13 — Visualização de Nuvem de Pontos 3D

- Potree Viewer integrado via iframe no SIGWEB
- Dados hospedados no Cloud Storage + Cloud CDN
- Ferramentas: zoom, rotação, medições (distância, área, volume, seções)
- Personalização de cores, intensidade e classificação de pontos
- Marcadores e anotações sobre a nuvem
- Controles de densificação, qualidade e tamanho mínimo dos pontos

---

### M14 — Patrimônio Imobiliário Urbano

- CRUD de bens públicos com geometria no PostGIS
- Exibição no mapa por finalidade (escola, hospital, praça, etc.)
- Clique no patrimônio → dados + documentos (Firebase Storage)
- Exportação: XLS, PDF, CSV, XML

---

### M15 — Gestão de Cemitérios

- Cadastro de sepulturas georreferenciadas (`POINT` no PostGIS)
- Dados: identificação, titular, falecido, data, tipo de sepultura
- Visualização e seleção no mapa
- CRUD + relatórios exportáveis

---

## 6. Aplicativos Móveis

### 6.1 App de Chamados (Android + iOS)

| Campo | Valor |
|---|---|
| Plataformas | Android 8+ e iOS 14+ |
| Framework | React Native (Expo) |
| Auth | Firebase Auth (email/senha) |

**Telas:**
- Login
- Mapa principal com marcadores de solicitações
- Nova solicitação: posicionar marcador + fotos + observações
- Minhas solicitações: lista com status
- Perfil: editar dados pessoais

**Funcionalidades:**
- Mover marcador no mapa para posicionar
- Busca automática de endereço por reverse geocoding (Nominatim)
- Upload de 1+ fotos com recorte e rotação
- Push notifications (FCM): mudança de fase, mensagens públicas
- Fiscais da Prefeitura: acesso a categorias privadas (Custom Claim `FISCAL`)

---

### 6.2 App de Recadastramento (Android)

| Campo | Valor |
|---|---|
| Plataforma | Android 8+ |
| Framework | React Native (Expo) |
| Offline | Sim — SQLite + sync Wi-Fi |

**Telas:**
- Login
- Seleção de loteamento
- Mapa de lotes com camada de situação do recadastramento
- Formulário BIC completo
- Fotos (mínimo 1 obrigatória)
- Lista de BICs coletados
- Sincronização

**Fluxo offline:**

```
1. SQLite armazena todos os BICs preenchidos
2. Tiles do mapa cacheados localmente
3. Ao conectar Wi-Fi:
   a. Upload das fotos → Firebase Storage
   b. POST /api/mobile/bics com dados + URLs das fotos
   c. API salva no PostGIS, marca lote como "recadastrado"
   d. App exibe confirmação
```

**Backup:** botão que gera ZIP (react-native-fs) com todos os BICs + fotos do dia.

---

### 6.3 App de Arborização (Android)

| Campo | Valor |
|---|---|
| Plataforma | Android 8+ |
| Framework | React Native (Expo) |
| Offline | Sim — SQLite + sync Wi-Fi |

**Funcionalidades:**
- Cadastro de árvore com BIC (espécie, altura, DAP, estado, calçada)
- Fotos: árvore, calçada, documentos coletados
- Recuperação de coordenada GPS do ponto de coleta
- Export: ZIP com BICs + fotos → importação manual no SIGWEB
- Ou POST direto à API quando online

---

## 7. Integrações

### 7.1 SINTER — Obrigação de Resultado

> ⚠️ **Prazo impretérivel: 31/12/2026**
> Concluída somente após **validação no ambiente oficial** da Receita Federal. Responsabilidade integral da contratada.

**Arquitetura do serviço SINTER:**

```
sinter-service/ (Cloud Run dedicado)
├── extract.ts   → consulta PostGIS com todos os dados necessários
├── transform.ts → formata conforme layout SINTER (RFB)
├── validate.ts  → validação prévia antes do envio
├── upload.ts    → envio para o ambiente SINTER
└── monitor.ts  → acompanha status e erros de validação
```

**Dados extraídos do PostGIS:**
- Parcelas territoriais com geometria (`ST_AsGeoJSON`)
- Cadastro imobiliário (proprietários, inscrições)
- Confrontantes (`ST_Touches`)
- Memoriais descritivos (vértices, azimutes, distâncias)
- Coordenadas UTM de cada vértice

**Estratégia de envio incremental:**

| Mês | Marco |
|---|---|
| 2 | 1º envio de teste — análise de erros |
| 4 | Envio de 50% das parcelas |
| 5 | Envio completo |
| 6–7 | Correções e reenvios até validação final |

### 7.2 CIB — Cadastro Imobiliário Base

- Geração de base compatível com o CIB (Receita Federal)
- Estruturação dos dados no padrão exigido
- Entrega dos arquivos para uso pelo município

### 7.3 Sistema de Cadastro Imobiliário Existente

- Integração via webservices REST/SOAP ou conexão direta ao banco da Prefeitura
- Sincronização em tempo real dos dados de produção
- Sandbox para testes sem interferência na produção
- Exposição de webservices para consulta pelo sistema de aprovação de projetos

### 7.4 Google Maps — Street View

- Google Maps API integrada ao SIGWEB
- Visualização panorâmica inline (sem redirecionamento externo)
- Ativada a partir da seleção do imóvel no mapa

### 7.5 WMS Externos

- Fontes WMS externas (IBGE, ANA, servidores municipais) via GeoServer
- Cadastro de mapas temáticos WMS hierarquizado por categoria
- Imageamento 360° servido como camada WMS

---

## 8. Requisitos Não Funcionais

### 8.1 Disponibilidade e Performance

| Requisito | Valor |
|---|---|
| SLA | ≥ 99,5% em horário comercial (07h–17h dias úteis) |
| Indisponibilidade máxima | ~3,6 horas/mês |
| Latência tiles MVT (p95) | < 200 ms (Cloud CDN) |
| Latência API CRUD (p95) | < 500 ms |
| Latência operações espaciais (p95) | < 2.000 ms |
| Cloud Run — instâncias mínimas | 2 (sem cold start) |
| Cloud Run — instâncias máximas | 50 (auto-scaling) |
| Uptime checks | A cada 1 minuto (Cloud Monitoring) |

### 8.2 Compatibilidade

| Requisito | Valor |
|---|---|
| Browsers obrigatórios | Edge, Firefox e Chrome (versões estáveis) |
| Instalação no cliente | Nenhuma |
| EPSG de armazenamento | 31982 (SIRGAS 2000 UTM 22S) |
| EPSG do frontend | 4326 (WGS84) — conversão via `ST_Transform` |
| Android mínimo | 8.0 (API 26) |
| iOS mínimo | 14.0 (App de Chamados) |
| Acessibilidade | WCAG 2.1 Nível AA |

### 8.3 Segurança

| Camada | Medida |
|---|---|
| Comunicação | HTTPS/TLS 1.3, HSTS habilitado |
| API | Cloud Armor WAF (DDoS, SQL Injection) |
| Banco de dados | Sem IP público; acesso via Cloud SQL Auth Proxy |
| Dados em repouso | AES-256 (Cloud SQL, GCS) |
| Dados sensíveis | CPF, NIS, PIS criptografados com `pgcrypto` |
| Auth tokens | JWT Firebase, expiração 1h, refresh automático |
| Auditoria | Trigger em todas as tabelas críticas; logs 90 dias no Cloud Logging |

### 8.4 Backup e Recuperação

| Item | Configuração |
|---|---|
| Cloud SQL backup | Automático diário, retenção 30 dias |
| Cloud SQL HA | Failover automático para réplica em zona diferente |
| GCS versioning | Habilitado |
| Firebase Storage | Object Versioning habilitado |
| RTO estimado | < 4 horas |
| RPO estimado | < 24 horas (último backup diário) |

---

## 9. Prova de Conceito

### 9.1 Regras

| Campo | Valor |
|---|---|
| Prazo | 5 dias úteis após habilitação da licitante vencedora |
| Local | Instalações da Prefeitura de Tupanciretã |
| Duração máxima | 4 horas |
| Internet | Mínimo 5 Mb (disponibilizado pela Prefeitura) |
| Infraestrutura | Nuvem GCP ou equipamentos da licitante com dados próprios |
| Comissão avaliadora | Servidores da Secretaria Municipal da Fazenda |
| Critério de aprovação | ≥ 95% dos 234 requisitos funcionais demonstrados |
| Demonstração | Operações completas: entrada + gravação + consulta |

### 9.2 Consequências

| Resultado | Ação |
|---|---|
| Aprovada (≥ 95%) | Licitante declarada vencedora |
| Itens faltantes (≤ 5%) | Implementar sem ônus até produção ou em 120 dias |
| Reprovada (< 95%) | Proposta recusada; pregoeiro convoca a segunda classificada |

### 9.3 Checklist dos 234 Requisitos Funcionais

| Grupo | Itens | Módulos cobertos |
|---|---|---|
| Características gerais do SIGWEB | 01–09 | Mapa, navegação, edição web |
| Controle de acesso de usuários | 10–14 | Auth, perfis, admin |
| Módulo Imobiliário | 15–30 | Cadastro imobiliário |
| Módulo Edição Cartográfica | 31–42 | Edição web PostGIS |
| Módulo Consulta de Viabilidade | 43–48 | Viabilidade urbana |
| Módulo Estoque (Iluminação) | 49–55 | Estoque de materiais |
| Módulo Iluminação Pública | 56–71 | Postes, OS |
| Módulo Arborização | 72–86 | Árvores, manutenção |
| Módulo Cadastro Social | 87–94 | Famílias, vulnerabilidade |
| Numeração Predial | 95–104 | Numeração automatizada |
| Aprovação de Projetos | 105–115 | Processo digital |
| Habite-se Online | 116–126 | Atestado de conclusão |
| Gestão do App Móvel | 127–152 | Fluxos, categorias, chamados |
| App de Chamados (Android + iOS) | 153–166 | App móvel |
| App de Recadastramento (Android) | 167–181 | App móvel offline |
| App de Arborização (Android) | 182–188 | App móvel arborização |
| REURB Digital | 189–208 | BPMN, processos |
| Planta Genérica de Valores | 209–227 | PGV, IPTU |
| Visualização Nuvem de Pontos 3D | 228–234 | Potree |

---

## 10. Cronograma e Pagamentos

### 10.1 Cronograma de Execução

> Referência: Mês 1 = Junho (assinatura do contrato)

| Mês | Atividade |
|---|---|
| **1 (Jun)** | Provisionamento GCP; schema PostGIS; migração de dados legados; início do aerolevantamento; início do imageamento 360°; análise do layout SINTER |
| **2 (Jul)** | Todos os módulos SIGWEB ativos; entrega do ortomosaico + MDT + nuvem de pontos; entrega do imageamento 360°; Potree configurado no GCS; treinamento dos servidores; 1º envio de teste ao SINTER |
| **3 (Ago)** | Início da vetorização (10.000 unidades); início do recadastramento in loco; análise de erros do SINTER |
| **4 (Set)** | 50% da vetorização concluída; 40% do recadastramento; envio de 50% das parcelas ao SINTER |
| **5 (Out)** | 100% da vetorização concluída — entrega final; 70% do recadastramento; envio completo ao SINTER |
| **6 (Nov)** | 90% do recadastramento; acompanhamento de validação do SINTER |
| **7 (Dez)** | 100% do recadastramento — entrega final; **validação SINTER até 31/12 ⚠️**; funcionário dedicado inicia 30 dias na Secretaria da Fazenda |
| **8–12 (Jan–Mai)** | Licença + suporte e manutenção mensais; assessoramento à Fiscalização Tributária |

> ⚠️ **Prazo máximo de implantação:** 120 dias corridos = até final de Setembro

### 10.2 Modelo de Pagamento

| Item | Forma |
|---|---|
| Implantação SIGWEB | 2 parcelas iguais: 30 e 60 dias após implantação |
| Licença mensal (12×) | Até o 10º dia útil do mês subsequente |
| Aerofotogrametria | 30 dias após aceite formal da entrega |
| Imageamento 360° | 30 dias após aceite formal da entrega |
| Vetorização | 30 dias após aceite formal da entrega |
| Recadastramento | 30 dias após aceite formal da entrega |

**Certidões obrigatórias a cada NF:**
- CND Federal (Receita Federal + PGFN)
- CND Estadual (RS)
- CND Municipal (Tupanciretã)
- CRF — Certificado de Regularidade do FGTS
- CNDT — Certidão Negativa de Débitos Trabalhistas

**Retenções:**
- IRRF: conforme IN RFB 1.234/2012 + IN RFB 2145/2023
- Simples Nacional: isento de retenção de IR (comprovar optante)
- Tributos municipais conforme Decreto Municipal 6346/2022

### 10.3 Dotação Orçamentária

| Campo | Valor |
|---|---|
| Órgão | 18 — Secretaria Municipal da Fazenda e Fomento Empresarial |
| Unidade | 01 — Diretoria de Arrecadação |
| Atividade | 1163 — Atualização Cadastral — Serviços de Georreferenciamento |
| Natureza | 339039 — Outros Serviços de Terceiros — Pessoa Jurídica |
| Fonte | 1500 — Recursos Não Vinculados de Impostos |
| Código 1 | 6053 — Serviços Técnicos Profissionais |
| Código 2 | 6054 — Serviços Técnicos Profissionais |
| Valor total | R$ 470.000,03 |

---

## 11. Capacitação e Suporte

### 11.1 Treinamento Obrigatório

| Campo | Valor |
|---|---|
| Público-alvo | Mínimo 5 servidores municipais |
| Setores | Receita Municipal e Setor de Projetos |
| Local | Prefeitura Municipal de Tupanciretã |
| Modalidade | Presencial ou remoto (pré-agendado com o Fiscal) |
| Carga horária | Sem limite |

**Conteúdo:**
- Gestão e atualização do SIGWEB (operações básicas e avançadas)
- Domínio dos processos cadastrais (coleta → importação de dados)
- Atualização cartográfica web (edição sem software desktop)
- Operacionalidade dos apps móveis
- Metodologia de recadastramento in loco

**Funcionário dedicado pós-entrega:**
- 1 funcionário da contratada na Secretaria da Fazenda
- Período: 30 dias após a entrega das notificações
- Função: revisão e atualização do cadastro + manutenção dos dados

### 11.2 Suporte Técnico

| Campo | Valor |
|---|---|
| Cobertura | Toda a vigência do contrato |
| Horário | Horário comercial |
| Canais | Qualquer (telefone, e-mail, chat, ticket) |

**Manutenções cobertas:**
- Corretiva: bugs, falhas de funcionamento
- Adaptativa: ajustes para mudanças legais e normativas
- Evolutiva: melhorias e novas versões

### 11.3 Assessoria Técnica Continuada

Prestada durante toda a vigência do contrato à Fiscalização Tributária, com foco em:
- Manutenção do cadastro de IPTU
- Consistência de dados imobiliários
- Dúvidas operacionais sobre o SIGWEB
- Orientações sobre processos de recadastramento

---

## 12. Critérios de Aceite

### 12.1 Implantação do SIGWEB

- [ ] SIGWEB acessível via HTTPS (Firebase Hosting)
- [ ] Funciona em Edge, Firefox e Chrome sem instalação
- [ ] Firebase Auth operacional para todos os perfis
- [ ] Cloud SQL + PostGIS com schema completo e dados migrados
- [ ] pg_tileserv servindo MVT tiles das camadas cadastrais
- [ ] GeoServer servindo WMS para imageamento 360°
- [ ] Todos os 15 módulos acessíveis e funcionais
- [ ] Integração com sistema legado da Prefeitura testada e funcional
- [ ] Módulo de viabilidade com Plano Diretor configurado
- [ ] Sandbox configurado e separado do ambiente de produção
- [ ] Cloud Monitoring ativo com alertas configurados
- [ ] Prova de Conceito aprovada (≥ 95% dos 234 requisitos)
- [ ] Treinamento realizado (lista de presença com ≥ 5 servidores)
- [ ] Documentação técnica entregue

### 12.2 Aerofotogrametria

- [ ] Ortomosaico COG disponível no GCS e exibido no SIGWEB
- [ ] GSD ≤ 8 cm confirmado nos metadados (`gdalinfo`)
- [ ] Referencial SIRGAS 2000/UTM (EPSG:31982) verificado
- [ ] PEC Classe A verificado em ≥ 20 pontos de controle independentes
- [ ] MDT entregue e exibido no SIGWEB
- [ ] Curvas de nível 1 m entregues em GeoPackage/Shapefile
- [ ] Nuvem de pontos .LAS entregue e convertida para Potree
- [ ] Potree abrindo no SIGWEB com navegação e medições funcionais
- [ ] KMZ abrindo no Google Earth sem erros
- [ ] Área total coberta ≥ 13 km²

### 12.3 Imageamento 360°

**Terrestre:**
- [ ] Track GPS confirma cobertura de ≥ 95% das vias urbanas
- [ ] Amostragem de 10 imagens: resolução ≥ 5.000 × 2.500 px
- [ ] Metadados com coordenadas SIRGAS 2000/UTM e timestamp
- [ ] Camada WMS abrindo no SIGWEB com Street View interno funcional

**Aéreo:**
- [ ] Distribuição espacial: ≤ 400 m entre fotos em toda a área
- [ ] Amostragem de 5 imagens: resolução ≥ 16.000 × 8.000 px
- [ ] Camada WMS abrindo no SIGWEB

### 12.4 Vetorização Cartográfica

- [ ] 10.000 geometrias de edificações no PostGIS (`SELECT COUNT(*) FROM edificacoes`)
- [ ] Comparativo de áreas exibido no SIGWEB por lote
- [ ] Relatório de divergências gerado e entregue
- [ ] Mapas temáticos 1:5.000 carregados como camadas no SIGWEB
- [ ] Nova tipologia construtiva definida e documentada

### 12.5 Recadastramento In Loco

- [ ] 1.000 BICs no PostGIS (`SELECT COUNT(*) FROM bics WHERE tipo = 'recadastramento'`)
- [ ] ≥ 1 foto de fachada por unidade no Firebase Storage
- [ ] Coordenada GPS do ponto de coleta em cada BIC
- [ ] Registro de impedimentos documentados
- [ ] Relatório final com 100% das unidades (visitadas + impedidas + estimadas)

### 12.6 SINTER — Critério Único

> ⚠️ **Critério único e impretérivel:**
> Confirmação escrita de validação no ambiente oficial do SINTER emitida pela Receita Federal do Brasil até **31/12/2026**.
> Sem este documento, a etapa **não** é considerada concluída.

---

## 13. Riscos e Mitigações

| # | Risco | Probabilidade | Impacto | Classificação |
|---|---|---|---|---|
| 1 | Atraso na validação do SINTER | Alta | Crítico | 🔴 |
| 2 | Reprovação na Prova de Conceito | Baixa | Alto | 🟡 |
| 3 | Incompatibilidade com sistema legado | Média | Alto | 🟠 |
| 4 | Condições climáticas para aerolevantamento | Média | Médio | 🟡 |
| 5 | Proprietários ausentes no recadastramento | Alta | Médio | 🟡 |
| 6 | Falha de infraestrutura GCP | Baixa | Alto | 🟡 |
| 7 | Datum incorreto nos dados legados | Média | Médio | 🟡 |

### Detalhamento dos Riscos

**R1 — Atraso na validação do SINTER 🔴**
- Causa: SINTER rejeita dados por inconsistências de layout ou EPSG incorreto
- Mitigação: início no mês 1; envio incremental para detectar erros cedo; responsável técnico exclusivo; marco contratual de 1º envio até mês 2

**R2 — Reprovação na Prova de Conceito 🟡**
- Causa: Sistema não atinge 95% dos 234 requisitos na demonstração
- Mitigação: mapeamento e teste de todos os 234 requisitos antes da prova; simulação interna 48h antes com cronômetro de 4 horas; ambiente de demo com dados pré-carregados

**R3 — Incompatibilidade com sistema legado 🟠**
- Causa: modelo de dados ou API do sistema atual incompatível com o SIGWEB
- Mitigação: obter documentação do sistema atual antes da assinatura; análise de integração no sandbox; ETL validado pela Prefeitura antes da migração

**R4 — Condições climáticas para aerolevantamento 🟡**
- Causa: inverno no RS com nebulosidade em Jun–Jul
- Mitigação: monitoramento INMET 15 dias antes; janelas de reserva nos fins de semana; cláusula de prorrogação por força maior

**R5 — Proprietários ausentes no recadastramento 🟡**
- Causa: imóveis fechados ou proprietários resistentes
- Mitigação: comunicação prévia via Prefeitura; equipes programadas para sábados; estimativa por ortofoto com registro de impedimento no app

**R6 — Falha de infraestrutura GCP 🟡**
- Causa: indisponibilidade de zona GCP
- Mitigação: Cloud SQL HA (failover automático); Cloud Run multi-zona; RTO < 4h, RPO < 24h; alertas de SLA no Cloud Monitoring

**R7 — Datum incorreto nos dados legados 🟡**
- Causa: cadastro em SAD69 ou Córrego Alegre (comum em arquivos do RS)
- Mitigação: verificar EPSG de todos os arquivos com `gdalinfo`; reprojetar para SIRGAS 2000/UTM via GDAL; validar com pontos de controle GNSS

---

## 14. Condições Contratuais

### 14.1 Habilitação Técnica Obrigatória

**Documentos exigidos:**

1. **Registro CREA ou CAU** — empresa + responsável técnico

2. **Atestados de capacidade técnica** (empresa + responsável técnico) com CAT registrada no CREA/CAU comprovando:
   - [ ] Implantação de SIG na web
   - [ ] Integração de Geoprocessamento com sistemas de gestão
   - [ ] Cadastramento e/ou recadastramento imobiliário
   - [ ] Atualização do Plano Diretor
   - [ ] Imageamento Terrestre 360°
   - [ ] Atualização da Planta Genérica de Valores
   - [ ] Aprovação de Projeto e Habite-se online

3. **Vínculo do responsável técnico** com a empresa: contrato social (sócio), CTPS (empregado) ou contrato de prestação de serviços com firma reconhecida

4. **Inscrição no Ministério da Defesa** categoria "A" (Decreto nº 2278/1997) para aerolevantamento

5. **Registro do SIGWEB no INPI** (próprio) ou carta de credenciamento do proprietário + registro INPI em nome do proprietário

> ⚠️ O responsável técnico indicado deve ser o mesmo em **todas** as fases da licitação e durante toda a execução do contrato.

### 14.2 Sanções Administrativas

| Infração | Penalidade |
|---|---|
| Inexecução total | Multa 0,5%–30% do contrato + rescisão |
| Inexecução parcial | Multa proporcional |
| Documentação falsa | Impedimento até 3 anos |
| Fraude na licitação | Inidoneidade 3–6 anos (âmbito federal) |
| Atraso injustificado | Multa de mora |

**Defesa:** 15 dias úteis após intimação para contestar multa, impedimento ou inidoneidade.

### 14.3 Vigência, Reajuste e Extinção

| Campo | Valor |
|---|---|
| Vigência | 12 meses (prorrogável até 60 meses — art. 106/107, Lei 14.133/2021) |
| Reajuste | IPCA a partir do 13º mês (renovação) |
| Ampliação/Redução | Até 25% do objeto (art. 125, Lei 14.133/2021) |
| Alterações | Via Termo Aditivo |
| Foro | Comarca de Tupanciretã — RS |

**Motivos de extinção:** descumprimento contratual; desatendimento à fiscalização; falência/insolvência; caso fortuito/força maior; interesse público justificado.

---

*PRD versão 2.0.0 — SIGWEB Tupanciretã — Pregão Eletrônico nº 28/2026*
*Referência: Edital assinado em 28/04/2026 por Gustavo Herter Terra e Fábio dos Santos Silveira*
