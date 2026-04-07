import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

/**
 * Prisma CLI does not load Next.js `.env.local` automatically. Without this,
 * `db push` / `migrate` can target a different DB than the running app (e.g. fallback
 * `callendra` vs `.env.local` → `callendra_dev`).
 */
function loadEnvLocal(): void {
  const p = path.join(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvLocal()

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://callendra_user:callendra123@localhost:5432/callendra',
  },
})
