/**
 * Prisma seed — creates the platform company and super-admin user.
 *
 * Run with:  npm run db:seed
 *
 * Required env vars (copy from .env.example):
 *   SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
 *
 * The seed is idempotent — safe to run multiple times.
 * Plans are managed via POST /subscriptions/plans once you have Stripe price IDs.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
});
const prisma = new PrismaClient({ adapter });

function require_env(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`❌  Missing required env var: ${key}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  console.log('🌱 Seeding database...');

  const email = require_env('SUPER_ADMIN_EMAIL');
  const password = require_env('SUPER_ADMIN_PASSWORD');
  const firstName = 'Super';
  const lastName = 'Admin';
  const companyName = 'Platform';
  const companySlug = 'platform';

  // ─── Platform company ───────────────────────────────────────────────────────

  const company = await prisma.company.upsert({
    where: { slug: companySlug },
    update: { name: companyName },
    create: { name: companyName, slug: companySlug },
  });

  console.log(`  ✓ Company "${company.name}" — ${company.id}`);

  // ─── Super-admin user ───────────────────────────────────────────────────────

  const hashedPassword = await bcrypt.hash(password, 12);

  const superAdmin = await prisma.user.upsert({
    where: { email },
    update: {
      firstName,
      lastName,
      role: 'SUPER_ADMIN',
      isActive: true,
      emailVerified: true,
    },
    create: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: 'SUPER_ADMIN',
      isActive: true,
      emailVerified: true,
      companyId: company.id,
    },
  });

  console.log(`  ✓ Super-admin "${superAdmin.email}" — ${superAdmin.id}`);
  console.log('\n✅ Seeding complete');
  console.log(
    '\n💡 Plans are managed via the admin API once you have Stripe price IDs:',
  );
  console.log(
    '   POST /api/v1/subscriptions/plans  (header: x-admin-api-key)',
  );
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
