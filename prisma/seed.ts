/**
 * Prisma seed — populates the database with sample Plan records and a default admin.
 *
 * Run with:  npm run db:seed
 *
 * For Stripe integration, set these env vars or replace the placeholder IDs:
 *   STRIPE_PRICE_STARTER, STRIPE_PRODUCT_STARTER
 *   STRIPE_PRICE_PRO, STRIPE_PRODUCT_PRO
 *   STRIPE_PRICE_ENTERPRISE, STRIPE_PRODUCT_ENTERPRISE
 *
 * The seed is idempotent — safe to run multiple times.
 */

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

  // ─── Plans ─────────────────────────────────────────────────────────────────

  const planDefs = [
    {
      name: 'Starter',
      slug: 'starter',
      stripePriceId:
        process.env.STRIPE_PRICE_STARTER ?? 'price_starter_placeholder',
      stripeProductId:
        process.env.STRIPE_PRODUCT_STARTER ?? 'prod_starter_placeholder',
      interval: PlanInterval.MONTH,
      price: 2900, // $29.00 / month
      currency: 'usd',
      features: [
        'Up to 5 team members',
        '10 GB storage',
        'Email support',
        'API access',
      ],
      limits: { members: 5, storageGb: 10 },
    },
    {
      name: 'Pro',
      slug: 'pro',
      stripePriceId: process.env.STRIPE_PRICE_PRO ?? 'price_pro_placeholder',
      stripeProductId:
        process.env.STRIPE_PRODUCT_PRO ?? 'prod_pro_placeholder',
      interval: PlanInterval.MONTH,
      price: 7900, // $79.00 / month
      currency: 'usd',
      features: [
        'Up to 25 team members',
        '100 GB storage',
        'Priority email & chat support',
        'API access',
        'Advanced analytics',
        'Custom integrations',
      ],
      limits: { members: 25, storageGb: 100 },
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      stripePriceId:
        process.env.STRIPE_PRICE_ENTERPRISE ?? 'price_enterprise_placeholder',
      stripeProductId:
        process.env.STRIPE_PRODUCT_ENTERPRISE ?? 'prod_enterprise_placeholder',
      interval: PlanInterval.MONTH,
      price: 29900, // $299.00 / month
      currency: 'usd',
      features: [
        'Unlimited team members',
        '1 TB storage',
        'Dedicated account manager',
        'SLA 99.99% uptime',
        'API access',
        'Advanced analytics',
        'Custom integrations',
        'SSO / SAML',
        'Audit log exports',
      ],
      limits: { members: -1, storageGb: 1024 }, // -1 = unlimited
    },
  ];

  const createdPlans: { name: string; id: string }[] = [];

  for (const plan of planDefs) {
    const result = await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        stripePriceId: plan.stripePriceId,
        stripeProductId: plan.stripeProductId,
        price: plan.price,
        features: plan.features,
        limits: plan.limits,
        isActive: true,
      },
      create: {
        name: plan.name,
        slug: plan.slug,
        stripePriceId: plan.stripePriceId,
        stripeProductId: plan.stripeProductId,
        interval: plan.interval,
        price: plan.price,
        currency: plan.currency,
        features: plan.features,
        limits: plan.limits,
        isActive: true,
      },
    });
    createdPlans.push({ name: result.name, id: result.id });
    console.log(`  ✓ Plan "${result.name}" — ${result.id}`);
  }

  // ─── Default company & admin ────────────────────────────────────────────────

  const defaultCompany = await prisma.company.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Default Company',
      slug: 'default',
    },
  });

  const hashedPassword = await bcrypt.hash('Admin1234!', 12);

  const admin = await prisma.user.upsert({
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

  console.log('\n✅ Seeding complete');
  console.log(`   Plans: ${createdPlans.map((p) => p.name).join(', ')}`);
  console.log(
    `   Company: ${defaultCompany.name} (${defaultCompany.id})`,
  );
  console.log(`   Admin: ${admin.email} / Admin1234!`);

  if (planDefs.some((p) => p.stripePriceId.includes('placeholder'))) {
    console.log(
      '\n⚠️  Stripe IDs contain placeholders. Set STRIPE_PRICE_* and STRIPE_PRODUCT_* env vars before going to production.',
    );
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
