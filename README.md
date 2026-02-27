# NestJS SaaS B2B Boilerplate

Production-ready NestJS backend boilerplate for multi-tenant SaaS applications.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | NestJS 11 |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT (access + refresh rotation) |
| Payments | Stripe (subscriptions + webhooks) |
| Cache/Queue | Redis (ioredis) |
| Containerization | Docker + docker-compose |
| Validation | class-validator + class-transformer |
| Security | Helmet, CORS, rate limiting, whitelist validation |

---

## Architecture

```
src/
├── config/                    # Environment-aware configuration namespaces
│   ├── app.config.ts
│   ├── jwt.config.ts
│   ├── redis.config.ts
│   └── stripe.config.ts
├── common/                    # Shared cross-cutting concerns
│   ├── decorators/            # @CurrentUser, @Roles, @Public
│   ├── filters/               # GlobalExceptionFilter
│   ├── guards/                # RolesGuard
│   ├── interceptors/          # LoggingInterceptor, TransformInterceptor
│   ├── middleware/            # AuditMiddleware, TenantMiddleware
│   ├── interfaces/            # JwtPayload, RequestWithUser
│   └── dto/                   # PaginationDto
├── prisma/                    # PrismaModule (global)
├── infrastructure/
│   └── logger/                # Structured JSON logger
└── modules/
    ├── auth/                  # Register, Login, Refresh, Logout
    ├── users/                 # CRUD + soft delete + roles
    ├── tenants/               # Org management + member invitations
    ├── subscriptions/         # Stripe checkout, webhooks, billing portal
    └── health/                # /health (DB + Redis checks)
```

---

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url> my-saas
cd my-saas
npm install
```

### 2. Environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Start infrastructure

```bash
docker-compose up -d postgres redis
```

### 4. Database setup

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed initial data (plans + admin user)
npm run db:seed
```

### 5. Run the application

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run build && npm run start:prod
```

The API will be available at: `http://localhost:3000/api/v1`

---

## Running with Docker (full stack)

```bash
docker-compose up --build
```

This starts: API + PostgreSQL + Redis

---

## API Endpoints

### Authentication
```
POST   /api/v1/auth/register      Create account + organization
POST   /api/v1/auth/login         Login, receive token pair
POST   /api/v1/auth/refresh       Refresh access token (secure rotation)
POST   /api/v1/auth/logout        Revoke refresh token
POST   /api/v1/auth/me            Get current user info
```

### Users
```
GET    /api/v1/users              List users (scoped to tenant)
GET    /api/v1/users/:id          Get user
POST   /api/v1/users              Create user [ADMIN]
PATCH  /api/v1/users/:id          Update user
DELETE /api/v1/users/:id          Soft delete user [ADMIN]
```

### Tenants
```
GET    /api/v1/tenants/me          Get current org + subscription
GET    /api/v1/tenants/me/members  List members
PATCH  /api/v1/tenants/me          Update org name [ADMIN]
POST   /api/v1/tenants/me/invite   Invite user by email [ADMIN]
POST   /api/v1/tenants/me/change-plan/:planId  Change plan [ADMIN]
```

### Subscriptions
```
GET    /api/v1/subscriptions              Get current subscription
POST   /api/v1/subscriptions/checkout     Create Stripe checkout session [ADMIN]
DELETE /api/v1/subscriptions/cancel       Cancel at period end [ADMIN]
GET    /api/v1/subscriptions/portal       Get billing portal URL [ADMIN]
POST   /api/v1/subscriptions/webhook      Stripe webhook receiver (public)
```

### Health
```
GET    /api/v1/health             Health check (DB + Redis)
```

---

## Multi-Tenancy

Every request is tenant-scoped. The flow:

1. User logs in → JWT payload includes `tenantId`
2. `JwtAuthGuard` validates token and populates `req.user`
3. All service queries include `where: { tenantId }` — data is always isolated

```typescript
// Example: tenant-scoped query
await prisma.user.findMany({
  where: { tenantId: user.tenantId, deletedAt: null }
});
```

---

## Stripe Webhook Setup

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Forward webhooks to local server:

```bash
stripe listen --forward-to localhost:3000/api/v1/subscriptions/webhook
```

3. Copy the webhook signing secret to `.env`:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Handled events:**
- `checkout.session.completed` → activate subscription
- `invoice.paid` → renew subscription period
- `invoice.payment_failed` → mark as `PAST_DUE`
- `customer.subscription.updated` → sync plan/status changes
- `customer.subscription.deleted` → mark as `CANCELED`

---

## Subscription Guard

Protect endpoints behind active subscription:

```typescript
import { ActiveSubscriptionGuard } from '../subscriptions/guards/active-subscription.guard';

@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
@Get('analytics')
getAnalytics() { ... }
```

Protect behind a specific plan feature:

```typescript
import { RequiresFeature } from '../subscriptions/guards/active-subscription.guard';

@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
@RequiresFeature('feature_analytics')
@Get('analytics')
getAnalytics() { ... }
```

---

## Auth Usage

```typescript
// Mark endpoint as public (skip JWT)
@Public()
@Post('register')
register() { ... }

// Get current user in any controller
@Get('profile')
profile(@CurrentUser() user: JwtPayload) {
  return user;
}

// Restrict to admin only
@Roles(UserRole.ADMIN)
@Delete(':id')
delete() { ... }
```

---

## Database Scripts

```bash
npm run db:generate          # Regenerate Prisma client after schema changes
npm run db:migrate           # Create and apply migration (dev)
npm run db:migrate:deploy    # Apply migrations (production)
npm run db:seed              # Insert seed data
npm run db:studio            # Open Prisma Studio GUI
npm run db:reset             # Reset database (dev only — destructive)
```

---

## Testing

```bash
# Unit tests
npm run test

# Unit tests with coverage
npm run test:cov

# E2E tests (requires running DB and Redis)
npm run test:e2e
```

---

## Environment Variables

See `.env.example` for all required variables.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Secret for access tokens |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `REDIS_HOST` | Redis host |
| `CORS_ORIGINS` | Comma-separated allowed origins |

---

## Seed Data

After `npm run db:seed`:

| Resource | Value |
|----------|-------|
| Admin email | `admin@example.com` |
| Admin password | `Admin1234!` |
| Plans | `starter` ($29/mo), `pro` ($79/mo) |

> Change seed credentials before any public deployment.

---

## Production Checklist

- [ ] Set strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ORIGINS` to your frontend domain
- [ ] Set real Stripe keys (live mode)
- [ ] Run `npm run db:migrate:deploy` (not `migrate dev`)
- [ ] Set up Redis with authentication (`REDIS_PASSWORD`)
- [ ] Configure process manager (PM2) or use Docker
- [ ] Set up monitoring and log aggregation (Datadog, Grafana, etc.)
- [ ] Enable SSL/TLS termination at the reverse proxy level
