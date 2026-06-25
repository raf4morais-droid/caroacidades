import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

// Pessoa social ganha campos de identificação completos (RG, CTPS, certidão,
// telefone, estado civil, filiação, cônjuge) e CPF/NIS/PIS passam a ser
// armazenados criptografados via pgcrypto (req 88)
export const MIGRATION_SOCIAL_V2 = `
  ALTER TABLE sigweb.pessoas_social
    ADD COLUMN IF NOT EXISTS codigo VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS rg VARCHAR(20),
    ADD COLUMN IF NOT EXISTS ctps VARCHAR(30),
    ADD COLUMN IF NOT EXISTS certidao VARCHAR(50),
    ADD COLUMN IF NOT EXISTS telefone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(30),
    ADD COLUMN IF NOT EXISTS nome_pai VARCHAR(255),
    ADD COLUMN IF NOT EXISTS nome_mae VARCHAR(255),
    ADD COLUMN IF NOT EXISTS conjuge_id UUID REFERENCES sigweb.pessoas_social(id);

  CREATE SEQUENCE IF NOT EXISTS sigweb.seq_pessoa_social START 1;

  INSERT INTO sigweb.tipos_renda (nome)
  SELECT v FROM (VALUES ('Salário'), ('Aposentadoria'), ('Pensão'), ('Bolsa Família'), ('BPC/LOAS'), ('Autônomo'), ('Outro')) AS t(v)
  WHERE NOT EXISTS (SELECT 1 FROM sigweb.tipos_renda);
`

// Chave simétrica (pgcrypto pgp_sym_*) para CPF/NIS/PIS — req 88
const ENC_KEY = process.env.SOCIAL_ENC_KEY ?? 'sigweb-social-dev-key'

// Renda per capita de referência (~ 1/2 salário mínimo) usada no cálculo
// do índice de vulnerabilidade — req 92
const LIMIAR_RENDA_PER_CAPITA = 660

// Recalcula renda bruta/per capita e o índice de vulnerabilidade (0-100) da
// família com base nas rendas dos membros, nas informações sociais
// registradas e na composição familiar (presença de idosos/crianças) — req 92
async function recalcularIndicadores(familiaId: string) {
  await query(
    `UPDATE sigweb.familias f
     SET renda_bruta = sub.renda_bruta,
         renda_per_capita = sub.renda_pc,
         indice_vulnerabilidade = LEAST(100, GREATEST(0,
           (CASE WHEN sub.renda_pc IS NULL OR sub.renda_pc = 0 THEN 60
                 ELSE GREATEST(0, 60 * (1 - sub.renda_pc / $2))
            END)
           + LEAST(30, sub.score_social)
           + (CASE WHEN sub.tem_idoso THEN 5 ELSE 0 END)
           + (CASE WHEN sub.tem_crianca THEN 5 ELSE 0 END)
         ))
     FROM (
       SELECT f2.id,
              COALESCE(SUM(r.valor) FILTER (WHERE r.compoe_renda), 0) AS renda_bruta,
              COALESCE(SUM(r.valor) FILTER (WHERE r.compoe_renda), 0) / NULLIF(f2.qtd_membros, 0) AS renda_pc,
              COALESCE((SELECT SUM(score) FROM sigweb.informacoes_sociais WHERE familia_id = f2.id), 0) AS score_social,
              EXISTS (SELECT 1 FROM sigweb.pessoas_social ps2 WHERE ps2.familia_id = f2.id AND ps2.data_nascimento <= CURRENT_DATE - INTERVAL '60 years') AS tem_idoso,
              EXISTS (SELECT 1 FROM sigweb.pessoas_social ps2 WHERE ps2.familia_id = f2.id AND ps2.data_nascimento >= CURRENT_DATE - INTERVAL '6 years') AS tem_crianca
       FROM sigweb.familias f2
       LEFT JOIN sigweb.pessoas_social ps ON ps.familia_id = f2.id
       LEFT JOIN sigweb.rendas r ON r.pessoa_id = ps.id
       WHERE f2.id = $1
       GROUP BY f2.id, f2.qtd_membros
     ) sub
     WHERE f.id = sub.id`,
    [familiaId, LIMIAR_RENDA_PER_CAPITA]
  )
}

export async function socialRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS'))

  app.get('/social/familias', async (request) => {
    const { situacao, page = '1', limit = '50' } = request.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)
    const where = situacao ? `WHERE f.situacao_cadastral = $3` : ''
    const params: unknown[] = [Number(limit), offset]
    if (situacao) params.push(situacao)

    return query(
      `SELECT f.*, e.inscricao_imobiliaria,
              ST_AsGeoJSON(ST_Transform(ST_Centroid(ed.geometry), 4326))::json AS geometry
       FROM sigweb.familias f
       LEFT JOIN sigweb.edificacoes e ON e.id = f.edificacao_id
       LEFT JOIN sigweb.edificacoes ed ON ed.id = f.edificacao_id
       ${where}
       ORDER BY f.codigo
       LIMIT $1 OFFSET $2`,
      params
    )
  })

  app.get('/social/familias/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const familia = await queryOne(
      `SELECT f.*, emp.nome AS empreendimento_nome
       FROM sigweb.familias f
       LEFT JOIN sigweb.empreendimentos emp ON emp.id = f.empreendimento_id
       WHERE f.id = $1`,
      [id]
    )
    if (!familia) return reply.code(404).send({ error: 'Família não encontrada' })

    // CPF/NIS/PIS são decriptados aqui — acesso já restrito a ADMIN/FISCAL_TRIBUTARIO/SETOR_PROJETOS (req 88)
    const membros = await query(
      `SELECT id, codigo, nome, data_nascimento, sexo, escolaridade, parentesco, compoe_renda,
              rg, ctps, certidao, telefone, estado_civil, nome_pai, nome_mae, conjuge_id,
              CASE WHEN cpf_enc IS NOT NULL THEN pgp_sym_decrypt(cpf_enc, $2) END AS cpf,
              CASE WHEN nis_enc IS NOT NULL THEN pgp_sym_decrypt(nis_enc, $2) END AS nis,
              CASE WHEN pis_enc IS NOT NULL THEN pgp_sym_decrypt(pis_enc, $2) END AS pis
       FROM sigweb.pessoas_social WHERE familia_id = $1 ORDER BY created_at`,
      [id, ENC_KEY]
    )
    const rendas = await query(
      `SELECT r.*, tr.nome AS tipo_renda_nome
       FROM sigweb.rendas r
       JOIN sigweb.pessoas_social ps ON ps.id = r.pessoa_id
       LEFT JOIN sigweb.tipos_renda tr ON tr.id = r.tipo_renda_id
       WHERE ps.familia_id = $1`,
      [id]
    )
    const informacoes = await query(
      `SELECT * FROM sigweb.informacoes_sociais WHERE familia_id = $1 ORDER BY created_at DESC`,
      [id]
    )
    // Deficiências (CID) por membro — req 89
    const deficiencias = await query(
      `SELECT d.* FROM sigweb.pessoa_deficiencias d
       JOIN sigweb.pessoas_social ps ON ps.id = d.pessoa_id
       WHERE ps.familia_id = $1`,
      [id]
    )
    // Ocorrências e documentos da família — req 89/91
    const ocorrencias = await query(
      `SELECT * FROM sigweb.ocorrencias_social WHERE familia_id = $1 ORDER BY data_ocorrencia DESC`,
      [id]
    )
    const documentos = await query(
      `SELECT * FROM sigweb.documentos_social WHERE familia_id = $1 ORDER BY created_at DESC`,
      [id]
    )
    return { ...familia, membros, rendas, informacoes, deficiencias, ocorrencias, documentos }
  })

  // Atualizar dados gerais da família: situação cadastral, programas sociais,
  // empreendimento vinculado, imóvel de moradia e terreno (req 90/91)
  app.patch('/social/familias/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      situacaoCadastral: z.string().optional(),
      programasSociais: z.array(z.string()).optional(),
      empreendimentoId: z.string().uuid().nullable().optional(),
      tipoImovelMoradia: z.string().nullable().optional(),
      situacaoTerreno: z.string().nullable().optional(),
      areaTerrenoM2: z.number().nullable().optional(),
    }).parse(request.body)

    const params: unknown[] = []
    let idx = 1
    const updates: string[] = []
    const set = (col: string, val: unknown) => { updates.push(`${col} = $${idx++}`); params.push(val) }

    if (body.situacaoCadastral !== undefined) set('situacao_cadastral', body.situacaoCadastral)
    if (body.programasSociais !== undefined) set('programas_sociais', body.programasSociais)
    if (body.empreendimentoId !== undefined) set('empreendimento_id', body.empreendimentoId)
    if (body.tipoImovelMoradia !== undefined) set('tipo_imovel_moradia', body.tipoImovelMoradia)
    if (body.situacaoTerreno !== undefined) set('situacao_terreno', body.situacaoTerreno)
    if (body.areaTerrenoM2 !== undefined) set('area_terreno_m2', body.areaTerrenoM2)

    if (updates.length === 0) return { ok: true }

    params.push(id)
    const [row] = await query<{ id: string }>(
      `UPDATE sigweb.familias SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id`,
      params
    )
    if (!row) return reply.code(404).send({ error: 'Família não encontrada' })
    return { ok: true }
  })

  app.post(
    '/social/familias',
    async (request, reply) => {
      const body = z.object({
        edificacaoId: z.string().uuid().optional(),
        situacaoCadastral: z.string().default('ativo'),
        qtdMembros: z.number().int().min(1),
        programasSociais: z.array(z.string()).default([]),
      }).parse(request.body)

      const [row] = await query<{ id: string; codigo: string }>(
        `INSERT INTO sigweb.familias (codigo, edificacao_id, situacao_cadastral, qtd_membros, programas_sociais)
         VALUES ('FAM-' || LPAD(nextval('sigweb.seq_reurb')::text, 6, '0'), $1,$2,$3,$4)
         RETURNING id, codigo`,
        [body.edificacaoId ?? null, body.situacaoCadastral, body.qtdMembros, body.programasSociais]
      )
      reply.code(201)
      return { id: row.id, codigo: row.codigo }
    }
  )

  // Recalcula renda e índice de vulnerabilidade (req 92)
  app.post('/social/familias/:id/recalcular-renda', async (request, reply) => {
    const { id } = request.params as { id: string }
    await recalcularIndicadores(id)
    return { ok: true }
  })

  // Tipos de renda disponíveis para o formulário de membro/renda
  app.get('/social/tipos-renda', async () =>
    query(`SELECT id, nome FROM sigweb.tipos_renda ORDER BY nome`)
  )

  // Adicionar membro à família — campos completos do BIC social, com
  // CPF/NIS/PIS criptografados via pgcrypto (req 88)
  app.post('/social/familias/:id/membros', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      nome: z.string().min(2),
      dataNascimento: z.string().nullable().optional(),
      sexo: z.enum(['M', 'F']).nullable().optional(),
      escolaridade: z.string().nullable().optional(),
      parentesco: z.string().nullable().optional(),
      compoeRenda: z.boolean().default(false),
      rg: z.string().nullable().optional(),
      ctps: z.string().nullable().optional(),
      certidao: z.string().nullable().optional(),
      telefone: z.string().nullable().optional(),
      estadoCivil: z.string().nullable().optional(),
      nomePai: z.string().nullable().optional(),
      nomeMae: z.string().nullable().optional(),
      conjugeId: z.string().uuid().nullable().optional(),
      cpf: z.string().nullable().optional(),
      nis: z.string().nullable().optional(),
      pis: z.string().nullable().optional(),
    }).parse(request.body)

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.pessoas_social (
         familia_id, codigo, nome, data_nascimento, sexo, escolaridade, parentesco, compoe_renda,
         rg, ctps, certidao, telefone, estado_civil, nome_pai, nome_mae, conjuge_id,
         cpf_enc, nis_enc, pis_enc
       ) VALUES (
         $1, 'PES-' || LPAD(nextval('sigweb.seq_pessoa_social')::text, 6, '0'), $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14, $15,
         CASE WHEN $16::text IS NOT NULL THEN pgp_sym_encrypt($16::text, $19) END,
         CASE WHEN $17::text IS NOT NULL THEN pgp_sym_encrypt($17::text, $19) END,
         CASE WHEN $18::text IS NOT NULL THEN pgp_sym_encrypt($18::text, $19) END
       ) RETURNING id`,
      [
        id, body.nome, body.dataNascimento ?? null, body.sexo ?? null, body.escolaridade ?? null,
        body.parentesco ?? null, body.compoeRenda,
        body.rg ?? null, body.ctps ?? null, body.certidao ?? null, body.telefone ?? null,
        body.estadoCivil ?? null, body.nomePai ?? null, body.nomeMae ?? null, body.conjugeId ?? null,
        body.cpf ?? null, body.nis ?? null, body.pis ?? null, ENC_KEY,
      ]
    )
    await recalcularIndicadores(id)
    reply.code(201)
    return { id: row.id }
  })

  // Atualizar dados de um membro (req 88)
  app.patch('/social/membros/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      nome: z.string().min(2).optional(),
      dataNascimento: z.string().nullable().optional(),
      sexo: z.enum(['M', 'F']).nullable().optional(),
      escolaridade: z.string().nullable().optional(),
      parentesco: z.string().nullable().optional(),
      compoeRenda: z.boolean().optional(),
      rg: z.string().nullable().optional(),
      ctps: z.string().nullable().optional(),
      certidao: z.string().nullable().optional(),
      telefone: z.string().nullable().optional(),
      estadoCivil: z.string().nullable().optional(),
      nomePai: z.string().nullable().optional(),
      nomeMae: z.string().nullable().optional(),
      conjugeId: z.string().uuid().nullable().optional(),
      cpf: z.string().nullable().optional(),
      nis: z.string().nullable().optional(),
      pis: z.string().nullable().optional(),
    }).parse(request.body)

    // $1 reservado para a chave de criptografia (usada só se cpf/nis/pis vierem no body)
    const params: unknown[] = [ENC_KEY]
    let idx = 2
    const updates: string[] = []
    const set = (col: string, val: unknown) => { updates.push(`${col} = $${idx++}`); params.push(val) }
    const setEnc = (col: string, val: string | null | undefined) => {
      if (val === undefined) return
      if (val === null) { updates.push(`${col} = NULL`); return }
      updates.push(`${col} = pgp_sym_encrypt($${idx++}, $1)`)
      params.push(val)
    }

    if (body.nome !== undefined) set('nome', body.nome)
    if (body.dataNascimento !== undefined) set('data_nascimento', body.dataNascimento)
    if (body.sexo !== undefined) set('sexo', body.sexo)
    if (body.escolaridade !== undefined) set('escolaridade', body.escolaridade)
    if (body.parentesco !== undefined) set('parentesco', body.parentesco)
    if (body.compoeRenda !== undefined) set('compoe_renda', body.compoeRenda)
    if (body.rg !== undefined) set('rg', body.rg)
    if (body.ctps !== undefined) set('ctps', body.ctps)
    if (body.certidao !== undefined) set('certidao', body.certidao)
    if (body.telefone !== undefined) set('telefone', body.telefone)
    if (body.estadoCivil !== undefined) set('estado_civil', body.estadoCivil)
    if (body.nomePai !== undefined) set('nome_pai', body.nomePai)
    if (body.nomeMae !== undefined) set('nome_mae', body.nomeMae)
    if (body.conjugeId !== undefined) set('conjuge_id', body.conjugeId)
    setEnc('cpf_enc', body.cpf)
    setEnc('nis_enc', body.nis)
    setEnc('pis_enc', body.pis)

    if (updates.length === 0) return { ok: true }

    params.push(id)
    const [row] = await query<{ familia_id: string }>(
      `UPDATE sigweb.pessoas_social SET ${updates.join(', ')} WHERE id = $${idx} RETURNING familia_id`,
      params
    )
    if (!row) return reply.code(404).send({ error: 'Membro não encontrado' })
    await recalcularIndicadores(row.familia_id)
    return { ok: true }
  })

  // Remover membro da família (req 88)
  app.delete('/social/membros/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await query<{ familia_id: string }>(
      `DELETE FROM sigweb.pessoas_social WHERE id = $1 RETURNING familia_id`, [id]
    )
    if (!row) return reply.code(404).send({ error: 'Membro não encontrado' })
    await recalcularIndicadores(row.familia_id)
    return { ok: true }
  })

  // Adicionar renda a um membro (alimenta o cálculo de renda per capita / req 92)
  app.post('/social/membros/:id/rendas', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      tipoRendaId: z.string().uuid().nullable().optional(),
      valor: z.number().positive(),
      compoeRenda: z.boolean().default(true),
    }).parse(request.body)

    const pessoa = await queryOne<{ familia_id: string }>(
      `SELECT familia_id FROM sigweb.pessoas_social WHERE id = $1`, [id]
    )
    if (!pessoa) return reply.code(404).send({ error: 'Membro não encontrado' })

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.rendas (pessoa_id, tipo_renda_id, valor, compoe_renda) VALUES ($1,$2,$3,$4) RETURNING id`,
      [id, body.tipoRendaId ?? null, body.valor, body.compoeRenda]
    )
    await recalcularIndicadores(pessoa.familia_id)
    reply.code(201)
    return { id: row.id }
  })

  app.delete('/social/rendas/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await query<{ familia_id: string }>(
      `DELETE FROM sigweb.rendas r
       USING sigweb.pessoas_social ps
       WHERE r.id = $1 AND ps.id = r.pessoa_id
       RETURNING ps.familia_id`,
      [id]
    )
    if (!row) return reply.code(404).send({ error: 'Renda não encontrada' })
    await recalcularIndicadores(row.familia_id)
    return { ok: true }
  })

  // Informações sociais da família — alimentam o índice de vulnerabilidade (req 92)
  app.post('/social/familias/:id/informacoes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      tipo: z.string().min(2),
      descricao: z.string().nullable().optional(),
      score: z.number().int().min(0).max(30).default(0),
    }).parse(request.body)

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.informacoes_sociais (familia_id, tipo, descricao, score) VALUES ($1,$2,$3,$4) RETURNING id`,
      [id, body.tipo, body.descricao ?? null, body.score]
    )
    await recalcularIndicadores(id)
    reply.code(201)
    return { id: row.id }
  })

  app.delete('/social/informacoes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await query<{ familia_id: string }>(
      `DELETE FROM sigweb.informacoes_sociais WHERE id = $1 RETURNING familia_id`, [id]
    )
    if (!row) return reply.code(404).send({ error: 'Informação não encontrada' })
    await recalcularIndicadores(row.familia_id)
    return { ok: true }
  })

  // Deficiências (CID) de um membro — req 89
  app.post('/social/membros/:id/deficiencias', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      cidCodigo: z.string().nullable().optional(),
      descricao: z.string().min(2),
    }).parse(request.body)

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.pessoa_deficiencias (pessoa_id, cid_codigo, descricao) VALUES ($1,$2,$3) RETURNING id`,
      [id, body.cidCodigo ?? null, body.descricao]
    )
    reply.code(201)
    return { id: row.id }
  })

  app.delete('/social/deficiencias/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await query<{ id: string }>(`DELETE FROM sigweb.pessoa_deficiencias WHERE id = $1 RETURNING id`, [id])
    if (!row) return reply.code(404).send({ error: 'Deficiência não encontrada' })
    return { ok: true }
  })

  // Ocorrências da família — req 89/91
  app.post('/social/familias/:id/ocorrencias', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      tipo: z.string().min(2),
      descricao: z.string().nullable().optional(),
      dataOcorrencia: z.string().nullable().optional(),
    }).parse(request.body)

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.ocorrencias_social (familia_id, tipo, descricao, data_ocorrencia)
       VALUES ($1,$2,$3, COALESCE($4::date, CURRENT_DATE)) RETURNING id`,
      [id, body.tipo, body.descricao ?? null, body.dataOcorrencia ?? null]
    )
    reply.code(201)
    return { id: row.id }
  })

  app.delete('/social/ocorrencias/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await query<{ id: string }>(`DELETE FROM sigweb.ocorrencias_social WHERE id = $1 RETURNING id`, [id])
    if (!row) return reply.code(404).send({ error: 'Ocorrência não encontrada' })
    return { ok: true }
  })

  // Documentos/fotos da família ou de um membro — req 89
  app.post('/social/familias/:id/documentos', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      nome: z.string().min(1),
      url: z.string().url(),
      pessoaId: z.string().uuid().nullable().optional(),
    }).parse(request.body)

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.documentos_social (familia_id, pessoa_id, nome, url) VALUES ($1,$2,$3,$4) RETURNING id`,
      [id, body.pessoaId ?? null, body.nome, body.url]
    )
    reply.code(201)
    return { id: row.id }
  })

  app.delete('/social/documentos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [row] = await query<{ id: string }>(`DELETE FROM sigweb.documentos_social WHERE id = $1 RETURNING id`, [id])
    if (!row) return reply.code(404).send({ error: 'Documento não encontrado' })
    return { ok: true }
  })

  // Estatísticas para o gráfico pizza no mapa
  app.get('/social/stats', async () =>
    query(
      `SELECT situacao_cadastral, COUNT(*)::int AS total
       FROM sigweb.familias GROUP BY situacao_cadastral ORDER BY total DESC`
    )
  )
}
