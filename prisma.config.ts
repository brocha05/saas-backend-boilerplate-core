import path from 'path';
import { defineConfig } from 'prisma/config';

// Load .env manually for CLI usage (migrate, seed, studio)
import 'dotenv/config';

/**
 * Prisma 7 configuration — must live at the project root.
 *
 * - `datasource.url` — used by the CLI (migrate dev/deploy, db push, studio)
 * - The PrismaPg adapter in PrismaService — used at runtime by the NestJS app
 *
 * See: https://pris.ly/d/config-datasource
 */
export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
