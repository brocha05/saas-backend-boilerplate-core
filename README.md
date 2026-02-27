# NestJS SaaS B2B Boilerplate

Production-ready NestJS backend for multi-tenant SaaS applications. Includes JWT auth, Stripe billing, S3 uploads, Redis caching, email via SES, invitation flow, and account lockout — out of the box.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 |
| Language | TypeScript 5 |
| Database | PostgreSQL 16 + Prisma ORM 7 |
| Auth | JWT access + refresh (secure rotation) |
| Payments | Stripe (subscriptions, checkout, webhooks) |
| Storage | AWS S3 (file uploads + company logos) |
| Email | AWS SES (event-driven templates) |
| Cache | Redis 7 via ioredis |
| Validation | class-validator + class-transformer |
| Security | Helmet, CORS, throttling, account lockout |
| Containerisation | Docker + docker-compose |
| Docs | Swagger UI (non-production only) |

---

## Architecture

```
src/
├── config/                   # Typed config namespaces (app, jwt, redis, stripe, s3, ses)
├── common/
│   ├── decorators/           # @CurrentUser, @Roles, @Public, @SkipAudit
│   ├── dto/                  # PaginationDto
│   ├── filters/              # GlobalExceptionFilter
│   ├── guards/               # RolesGuard
│   ├── interceptors/         # LoggingInterceptor, ResponseInterceptor
│   ├── interfaces/           # JwtPayload, MulterFile, RequestWithUser
│   └── middleware/           # AuditMiddleware, CompanyMiddleware
├── infrastructure/
│   ├── cache/                # Global CacheService (Redis get/set/del/incr/ttl)
│   └── logger/               # Structured JSON logger
├── prisma/                   # PrismaModule (global)
└── modules/
    ├── auth/                 # Register, login, refresh, logout, change-password, accept-invite
    ├── users/                # CRUD + /users/me self-service
    ├── companies/            # Company settings, invitations, S3 logo, plan change
    ├── subscriptions/        # Stripe checkout, webhooks, billing portal, public plans
    ├── files/                # S3 server-side upload + presigned URLs
    ├── notifications/        # In-app notifications + SES email (event-driven)
    ├── audit-logs/           # Request audit trail
    └── health/               # /health (DB + Redis)
```

### Request lifecycle

```
Request
  → Helmet / CORS / body-parser
  → ThrottlerGuard (global rate limit)
  → JwtAuthGuard  (skip with @Public)
  → RolesGuard    (skip without @Roles)
  → AuditMiddleware (logs to audit_logs table)
  → Controller → Service → Prisma / Redis / S3 / Stripe
  → ClassSerializerInterceptor (strips @Exclude fields)
  → ResponseInterceptor (wraps in { data, meta, … })
  → GlobalExceptionFilter (normalises errors)
```

---

## Local Development

### Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 20 LTS |
| npm | 10 |
| Docker + Docker Compose | any recent version |

### 1. Clone and install

```bash
git clone <repo-url> my-saas
cd my-saas
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required values. At minimum for local development you need:

```dotenv
# Must match docker-compose.yml postgres credentials
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas_db?schema=public"

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_ACCESS_SECRET=<random-32-byte-hex>
JWT_REFRESH_SECRET=<different-random-32-byte-hex>

# Get from https://dashboard.stripe.com/test/apikeys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # filled after step 6

# AWS credentials with S3 + SES permissions (or use MinIO locally — see below)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=your-dev-bucket
SES_FROM_EMAIL=dev@yourdomain.com
```

> **Tip — skip AWS locally:** Set `SES_FROM_EMAIL` to any value and the email service will log emails to the console instead of sending them when SES is not configured. For S3, use [MinIO](#local-s3-with-minio-optional).

### 3. Start infrastructure

```bash
# Start only the database and Redis (not the app itself)
docker-compose up -d postgres redis
```

Verify they are healthy:

```bash
docker-compose ps
# Both should show "healthy"
```

### 4. Database setup

```bash
# Generate the Prisma client from prisma/schema.prisma
npm run db:generate

# Create tables and run all migrations
npm run db:migrate

# Seed: 3 plans (Starter/Pro/Enterprise) + default admin user
npm run db:seed
```

After seeding, a default admin account is available:

| Field | Value |
|---|---|
| Email | `admin@example.com` |
| Password | `Admin1234!` |
| Company slug | `default` |

> Change these credentials before any deployment.

### 5. Start the development server

```bash
npm run start:dev
```

The server hot-reloads on file changes.

| URL | Description |
|---|---|
| `http://localhost:3000/api/v1` | API base |
| `http://localhost:3000/api/docs` | Swagger UI |
| `http://localhost:3000/api/v1/health` | Health check |

### 6. Stripe webhook forwarding (for billing features)

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and run:

```bash
stripe listen --forward-to localhost:3000/api/v1/subscriptions/webhook
```

Copy the `whsec_…` signing secret printed to the terminal and add it to `.env`:

```dotenv
STRIPE_WEBHOOK_SECRET=whsec_...
```

Restart the dev server. You can now trigger test events:

```bash
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
```

---

## Local S3 with MinIO (optional)

MinIO provides an S3-compatible API you can run locally without an AWS account.

Add this service to `docker-compose.yml`:

```yaml
  minio:
    image: minio/minio
    ports:
      - '9000:9000'
      - '9001:9001'        # MinIO Console UI
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    networks:
      - saas-network
```

And add `minio_data` to the `volumes:` block.

Then update `.env`:

```dotenv
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
AWS_S3_BUCKET=local-bucket
AWS_S3_ENDPOINT=http://localhost:9000
AWS_S3_FORCE_PATH_STYLE=true
```

Create the bucket via the MinIO Console at `http://localhost:9001` (login: `minioadmin / minioadmin`).

---

## Docker (full stack)

To run the entire stack (API + PostgreSQL + Redis) with Docker:

```bash
# Build and start all services
docker-compose up --build

# Run in background
docker-compose up --build -d

# Follow API logs
docker-compose logs -f api

# Stop everything
docker-compose down
```

The Dockerfile uses a **two-stage build**:
1. **Builder stage** — installs all deps, compiles TypeScript → `dist/`
2. **Production stage** — copies only compiled output + production deps, runs `prisma migrate deploy && node dist/main`

> The container automatically applies pending migrations on startup, making it safe for rolling deployments.

---

## API Reference

All endpoints are prefixed with `/api/v1`. Protected endpoints require `Authorization: Bearer <access_token>`.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Create account + company |
| `POST` | `/auth/login` | Public | Login, receive token pair |
| `POST` | `/auth/refresh` | Refresh token | Exchange refresh token for a new pair |
| `POST` | `/auth/logout` | ✓ | Revoke refresh token |
| `GET` | `/auth/me` | ✓ | Full authenticated user profile |
| `POST` | `/auth/change-password` | ✓ | Change password (requires current password) |
| `POST` | `/auth/accept-invite` | Public | Accept invitation, create account in invited company |
| `POST` | `/auth/forgot-password` | Public | Request password reset email |
| `POST` | `/auth/reset-password` | Public | Reset password with token from email |
| `POST` | `/auth/confirm-email` | Public | Verify email address |
| `POST` | `/auth/resend-confirmation` | ✓ | Resend email verification link |

### Users — self-service (`/users/me`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users/me` | ✓ | Get own profile (cached) |
| `PATCH` | `/users/me` | ✓ | Update own name |
| `DELETE` | `/users/me` | ✓ | Delete own account (requires password) |

### Users — admin management

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users` | ✓ | List users in company (paginated) |
| `GET` | `/users/:id` | ✓ | Get user by ID |
| `POST` | `/users` | ADMIN | Create user directly |
| `PATCH` | `/users/:id` | ✓ | Update user (admin can change role/status) |
| `DELETE` | `/users/:id` | ADMIN | Soft-delete user |
| `POST` | `/users/:id/resend-invite` | ADMIN | Resend invite email |

### Companies

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/companies/me` | ✓ | Company details + active subscription (cached) |
| `GET` | `/companies/me/members` | ✓ | List all members |
| `PATCH` | `/companies/me` | ADMIN | Update company name/settings |
| `POST` | `/companies/me/invite` | ADMIN | Invite user by email (generates token, sends email) |
| `POST` | `/companies/me/logo` | ADMIN | Upload logo to S3 (`multipart/form-data`) |
| `POST` | `/companies/me/change-plan/:planId` | ADMIN | Upgrade/downgrade Stripe subscription |
| `DELETE` | `/companies/me` | ADMIN | Soft-delete company |

### Subscriptions

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/subscriptions/plans` | **Public** | List all active pricing plans |
| `GET` | `/subscriptions` | ✓ | Current subscription |
| `POST` | `/subscriptions/checkout` | ADMIN | Create Stripe checkout session |
| `DELETE` | `/subscriptions/cancel` | ADMIN | Cancel at period end |
| `POST` | `/subscriptions/resume` | ADMIN | Resume a pending cancellation |
| `GET` | `/subscriptions/portal` | ADMIN | Stripe billing portal URL |
| `GET` | `/subscriptions/invoices` | ✓ | Invoice history |
| `POST` | `/subscriptions/webhook` | **Public** | Stripe webhook receiver |

### Files

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/files/upload` | ✓ | Server-side upload to S3 |
| `POST` | `/files/presign` | ✓ | Get presigned URL for direct client-to-S3 upload |
| `POST` | `/files/confirm` | ✓ | Confirm a completed presigned upload |
| `GET` | `/files` | ✓ | List files (filterable by resourceType/resourceId) |
| `GET` | `/files/:id` | ✓ | File metadata |
| `GET` | `/files/:id/download-url` | ✓ | Short-lived S3 download URL |
| `DELETE` | `/files/:id` | ✓ | Soft-delete file |

### Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/notifications` | ✓ | List notifications (paginated) |
| `PATCH` | `/notifications/:id/read` | ✓ | Mark as read |
| `PATCH` | `/notifications/read-all` | ✓ | Mark all as read |

### Audit Logs

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/audit-logs` | ADMIN | Query audit log (filterable, paginated) |

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | **Public** | DB + Redis health check |

---

## Key patterns

### Protect an endpoint behind an active subscription

```typescript
import { ActiveSubscriptionGuard } from '../subscriptions/guards/active-subscription.guard';

@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
@Get('analytics')
getAnalytics() { ... }
```

### Restrict to a role

```typescript
@Roles(UserRole.ADMIN)
@Delete(':id')
delete() { ... }
```

### Mark an endpoint as public (skip JWT)

```typescript
@Public()
@Post('register')
register() { ... }
```

### Read the current user in any controller

```typescript
@Get('profile')
profile(@CurrentUser() user: JwtPayload) {
  return user; // { sub, email, companyId, role }
}
```

### Cache a value in Redis

```typescript
constructor(private readonly cache: CacheService) {}

// Write — TTL in seconds
await this.cache.set(`user:${id}`, userData, 300);

// Read
const data = await this.cache.get<UserData>(`user:${id}`);

// Invalidate
await this.cache.del(`user:${id}`);
```

---

## Invitation flow

1. Admin calls `POST /companies/me/invite` with `{ email, role }`.
2. An `InvitationToken` (7-day TTL) is created in the database.
3. An email is sent with a link to `{APP_URL}/auth/accept-invite?token=<hex>`.
4. The invitee opens the link and calls `POST /auth/accept-invite` with `{ token, firstName, lastName, password }`.
5. The user is created in the correct company with `emailVerified: true` (the invite link proves email ownership).
6. Tokens are returned — the user is logged in immediately.

---

## Multi-tenancy

Every request is company-scoped via the JWT payload:

```typescript
// JWT payload shape
interface JwtPayload {
  sub: string;       // userId
  email: string;
  companyId: string; // tenant isolation key
  role: UserRole;
}
```

All service queries include `companyId` in the `where` clause — data is always isolated per tenant.

---

## Stripe webhook events handled

| Event | Action |
|---|---|
| `checkout.session.completed` | Activate subscription, link Stripe customer to company |
| `invoice.paid` | Renew subscription period, emit `INVOICE_PAID` event |
| `invoice.payment_failed` | Mark subscription as `PAST_DUE`, emit `PAYMENT_FAILED` event |
| `customer.subscription.updated` | Sync plan, status, period, and cancellation flag |
| `customer.subscription.deleted` | Mark subscription as `CANCELED`, emit `SUBSCRIPTION_CANCELED` event |

Webhook processing is **idempotent** — duplicate Stripe deliveries are ignored via the `ProcessedStripeEvent` table.

---

## Database scripts

```bash
npm run db:generate          # Regenerate Prisma client after schema changes
npm run db:migrate           # Create a new migration and apply it (dev only)
npm run db:migrate:deploy    # Apply existing migrations without creating new ones (production)
npm run db:seed              # Seed plans + default admin
npm run db:studio            # Open Prisma Studio GUI
npm run db:reset             # Drop and recreate the database (dev only — destructive)
```

> **After every schema change** run `npm run db:generate` so TypeScript picks up the new types, then `npm run db:migrate` to create the SQL migration file.

---

## Testing

### Unit tests

Unit tests mock all external dependencies (Prisma, Redis, JWT, …). They run in milliseconds and need no running services.

```bash
# Run all unit tests
npm test

# Run a specific spec file
npx jest auth.service

# Watch mode
npm run test:watch

# With coverage report
npm run test:cov
```

`src/modules/auth/auth.service.spec.ts` is the reference example. It demonstrates:
- How to mock `PrismaService` and `CacheService`
- How to handle both the array-form and callback-form of `$transaction`
- Testing happy paths, conflict detection, lockout, and token validation

### E2E tests

E2E tests boot the full NestJS application and send real HTTP requests. They require a running database and Redis.

```bash
# Start services
docker-compose up -d postgres redis

# Apply migrations to the test DB (if different from dev)
DATABASE_URL=<test-db-url> npm run db:migrate:deploy

# Run E2E suite
npm run test:e2e
```

`test/app.e2e-spec.ts` covers:
- Health check
- Public plans endpoint
- Registration validation and happy path
- Full login flow (register → login → `/auth/me` → `/users/me`)
- Protected route rejection

---

## Environment Variables Reference

### Application

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `PORT` | `3000` | HTTP port |
| `APP_URL` | `http://localhost:3000` | Public base URL (used in email links) |

### Database

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✓ | PostgreSQL connection string |

### JWT

| Variable | Required | Description |
|---|---|---|
| `JWT_ACCESS_SECRET` | ✓ | Secret for signing access tokens (min 32 chars) |
| `JWT_ACCESS_EXPIRES_IN` | — | Default `15m` |
| `JWT_REFRESH_SECRET` | ✓ | Secret for signing refresh tokens (must differ from access) |
| `JWT_REFRESH_EXPIRES_IN` | — | Default `7d` |

### Redis

| Variable | Default | Description |
|---|---|---|
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password (required in production) |

### Stripe

| Variable | Required | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | ✓ | `sk_test_…` (test) or `sk_live_…` (production) |
| `STRIPE_WEBHOOK_SECRET` | ✓ | `whsec_…` — from Stripe CLI or Dashboard |

### AWS S3

| Variable | Required | Description |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | ✓ | IAM key with S3 read/write permissions |
| `AWS_SECRET_ACCESS_KEY` | ✓ | IAM secret |
| `AWS_REGION` | ✓ | e.g. `us-east-1` |
| `AWS_S3_BUCKET` | ✓ | Target bucket name |
| `AWS_S3_ENDPOINT` | — | Override endpoint (e.g. MinIO: `http://localhost:9000`) |
| `AWS_S3_FORCE_PATH_STYLE` | `false` | Set `true` for MinIO / LocalStack |

### AWS SES (email)

| Variable | Required | Description |
|---|---|---|
| `AWS_SES_REGION` | ✓ | SES region (can differ from S3 region) |
| `SES_FROM_EMAIL` | ✓ | Verified sender address |
| `SES_FROM_NAME` | — | Display name in From header |

### CORS & Rate limiting

| Variable | Default | Description |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Comma-separated allowed origins |
| `THROTTLE_TTL` | `60000` | Rate limit window in ms |
| `THROTTLE_LIMIT` | `100` | Max requests per window |

---

## Seed data

After `npm run db:seed` the following records exist:

| Resource | Value |
|---|---|
| Admin email | `admin@example.com` |
| Admin password | `Admin1234!` |
| Company | `Default Company` (slug: `default`) |
| Plans | Starter ($29/mo), Pro ($79/mo), Enterprise ($299/mo) |

Plan Stripe IDs default to placeholders. Set these env vars before running the seed in an environment connected to a real Stripe account:

```dotenv
STRIPE_PRICE_STARTER=price_...
STRIPE_PRODUCT_STARTER=prod_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRODUCT_PRO=prod_...
STRIPE_PRICE_ENTERPRISE=price_...
STRIPE_PRODUCT_ENTERPRISE=prod_...
```

---

## Production Deployment

### Option A — Docker (recommended)

**1. Build and push the image**

```bash
docker build -t my-saas-api:latest .

# Or with a registry
docker build -t registry.example.com/my-saas-api:1.0.0 .
docker push registry.example.com/my-saas-api:1.0.0
```

**2. Prepare production environment variables**

Copy `.env.example` to `.env.production` and fill in all values with production secrets. Never commit this file.

```dotenv
NODE_ENV=production
PORT=3000
APP_URL=https://api.yourdomain.com

DATABASE_URL=postgresql://user:pass@db-host:5432/saas_prod

JWT_ACCESS_SECRET=<strong-random-secret-min-32-chars>
JWT_REFRESH_SECRET=<different-strong-random-secret>

REDIS_HOST=redis-host
REDIS_PASSWORD=<strong-redis-password>

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

**3. Run with docker-compose (production)**

Modify `docker-compose.yml` for production — at minimum:
- Remove exposed database/redis ports (`5432`, `6379`)
- Use a managed database (RDS, Cloud SQL, …) instead of the local postgres service
- Pass secrets via environment or a secrets manager

```bash
docker-compose -f docker-compose.yml up -d
```

The container runs `prisma migrate deploy` on startup before starting the server, applying any pending migrations atomically.

**4. Register Stripe webhooks**

In the [Stripe Dashboard](https://dashboard.stripe.com/webhooks), add an endpoint:

```
https://api.yourdomain.com/api/v1/subscriptions/webhook
```

Subscribe to these events:
- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy the signing secret and set `STRIPE_WEBHOOK_SECRET` in production.

---

### Option B — VPS with PM2

**1. Install Node.js 20 LTS on the server**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**2. Clone the repository and install dependencies**

```bash
git clone <repo-url> /srv/my-saas
cd /srv/my-saas
npm ci --only=production
```

**3. Build**

```bash
npm run build
```

**4. Apply migrations and seed** (first deploy only)

```bash
DATABASE_URL=<prod-db-url> npm run db:migrate:deploy
DATABASE_URL=<prod-db-url> npm run db:seed
```

**5. Start with PM2**

```bash
npm install -g pm2

pm2 start dist/main.js --name my-saas-api \
  --env production \
  -i max \                   # cluster mode — one process per CPU core
  --update-env

pm2 save                    # persist across reboots
pm2 startup                 # generate startup script
```

**6. Nginx reverse proxy**

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

### Production checklist

- [ ] `NODE_ENV=production`
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are strong, unique, random strings (≥ 32 chars)
- [ ] `CORS_ORIGINS` is set to your exact frontend domain(s) — no wildcards
- [ ] Stripe live keys in place (`sk_live_…`), webhook endpoint registered
- [ ] `REDIS_PASSWORD` is set — Redis is not exposed to the public internet
- [ ] Database is on a managed service (RDS / Supabase / Cloud SQL) with daily backups
- [ ] Run `db:migrate:deploy` (not `db:migrate`) — never run `db:reset` in production
- [ ] SSL/TLS termination at the reverse proxy (Nginx / Caddy / load balancer)
- [ ] Swagger UI is disabled automatically when `NODE_ENV=production`
- [ ] `SES_FROM_EMAIL` uses a verified domain/email address in AWS SES
- [ ] S3 bucket has appropriate IAM policy — block public access, enable server-side encryption
- [ ] Log aggregation configured (CloudWatch, Datadog, Grafana Loki, …)
- [ ] Health check endpoint wired to your load balancer or uptime monitor (`GET /api/v1/health`)
- [ ] Remove or change the seed admin credentials (`admin@example.com / Admin1234!`)
