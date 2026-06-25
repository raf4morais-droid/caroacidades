import { Pool } from 'pg'

// Cloud SQL via Unix socket (host=/cloudsql/...) não suporta SSL —
// SSL só faz sentido em conexões TCP puras.
const connStr = process.env.DATABASE_URL ?? ''
const isUnixSocket = connStr.includes('host=/')

const pool = new Pool({
  connectionString: connStr,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: isUnixSocket ? false : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
})

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client', err)
})

export default pool

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(sql, params)
  return result.rows as T[]
}

export async function queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
  const result = await pool.query(sql, params)
  return result.rows[0] ?? null
}
