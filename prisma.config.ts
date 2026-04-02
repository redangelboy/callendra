import path from 'node:path'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  earlyAccess: true,
  schema: path.join('prisma', 'schema.prisma'),
  migrate: {
    async adapter() {
      const { PrismaPg } = await import('@prisma/adapter-pg')
      const connectionString = 'postgresql://callendra_user:callendra123@localhost:5432/callendra'
      return new PrismaPg({ connectionString })
    },
  },
  datasource: {
    url: 'postgresql://callendra_user:callendra123@localhost:5432/callendra'
  }
})