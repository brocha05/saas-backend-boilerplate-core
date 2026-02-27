import { PrismaClient, PlanInterval } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Plans ───────────────────────────────────────────────────────────────────
  const starterPlan = await prisma.plan.upsert({
    where: { slug: 'starter' },
    update: {},
    create: {
      name: 'Starter',
      slug: 'starter',
      stripePriceId: 'price_starter_monthly',
      stripeProductId: 'prod_starter',
      interval: PlanInterval.MONTH,
      price: 2900, // $29.00
      currency: 'usd',
      isActive: true,
      features: ['feature_basic', 'feature_api_access'],
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { slug: 'pro' },
    update: {},
    create: {
      name: 'Pro',
      slug: 'pro',
      stripePriceId: 'price_pro_monthly',
      stripeProductId: 'prod_pro',
      interval: PlanInterval.MONTH,
      price: 7900, // $79.00
      currency: 'usd',
      isActive: true,
      features: [
        'feature_basic',
        'feature_api_access',
        'feature_advanced',
        'feature_analytics',
      ],
    },
  });

  // ─── Default company & admin ──────────────────────────────────────────────────
  const defaultCompany = await prisma.company.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Default Company',
      slug: 'default',
    },
  });

  const hashedPassword = await bcrypt.hash('Admin1234!', 12);

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isActive: true,
      emailVerified: true,
      companyId: defaultCompany.id,
    },
  });

  console.log('✅ Seeding complete');
  console.log(
    `   Plans created: starter (${starterPlan.id}), pro (${proPlan.id})`,
  );
  console.log(`   Company: ${defaultCompany.name} (${defaultCompany.id})`);
  console.log(`   Admin: admin@example.com / Admin1234!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
