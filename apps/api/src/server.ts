import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { initFirebase } from './services/firebase.service'
import { parcelasRoutes } from './routes/cadastro/parcelas'
import { edificacoesRoutes } from './routes/cadastro/edificacoes'
import { cartografiaRoutes } from './routes/cartografia/index'
import { viabilidadeRoutes } from './routes/viabilidade/index'
import { iluminacaoRoutes } from './routes/iluminacao/index'
import { arborizacaoRoutes } from './routes/arborizacao/index'
import { pgvRoutes } from './routes/pgv/index'
import { processosRoutes } from './routes/processos/index'
import { socialRoutes } from './routes/social/index'
import { mobileRoutes } from './routes/mobile/index'

initFirebase()

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
  },
})

async function bootstrap() {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  })

  await app.register(helmet, {
    contentSecurityPolicy: false,
  })

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  })

  // Health check (sem auth — usado pelo Cloud Run e Cloud Monitoring)
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // Rotas da API
  const prefix = '/api'
  await app.register(parcelasRoutes,    { prefix })
  await app.register(edificacoesRoutes, { prefix })
  await app.register(cartografiaRoutes, { prefix })
  await app.register(viabilidadeRoutes, { prefix })
  await app.register(iluminacaoRoutes,  { prefix })
  await app.register(arborizacaoRoutes, { prefix })
  await app.register(pgvRoutes,         { prefix })
  await app.register(processosRoutes,   { prefix })
  await app.register(socialRoutes,      { prefix })
  await app.register(mobileRoutes,      { prefix })

  // Rotas de usuário (admin)
  app.get('/api/usuarios', async () => {
    const { query } = await import('./db/pool')
    return query(`SELECT id, email, nome, perfil, ativo, created_at FROM sigweb.usuarios ORDER BY nome`)
  })

  app.patch('/api/usuarios/:uid/perfil', async (request, reply) => {
    const { uid } = request.params as { uid: string }
    const { perfil } = request.body as { perfil: string }
    const { query } = await import('./db/pool')
    const { setUserPerfil } = await import('./services/firebase.service')
    await setUserPerfil(uid, perfil)
    await query(`UPDATE sigweb.usuarios SET perfil = $2 WHERE firebase_uid = $1`, [uid, perfil])
    return { ok: true }
  })

  const port = Number(process.env.PORT ?? 3001)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`SIGWEB API rodando na porta ${port}`)
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
