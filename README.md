# LearnSpace

A course platform with short, practical lessons. Free and paid courses, priced in INR,
with Stripe payments, server-verified access control and per-lesson progress tracking.

- **Live app:** https://learn-space-coral.vercel.app
- **API:** https://learnspace-api-oyiv.onrender.com
- **Health check:** https://learnspace-api-oyiv.onrender.com/api/health

> The API runs on Render's free tier and sleeps when idle. The first request after a
> period of inactivity can take up to a minute to respond.

---

## Technical architecture

### System overview

```text
                    ┌──────────────────────────────┐
   Browser ────────▶│  Vercel (static hosting)     │
                    │  React 18 + Vite build       │
                    └──────────────┬───────────────┘
                                   │ /api/* rewrite (same-origin, no CORS)
                                   ▼
                    ┌──────────────────────────────┐
                    │  Render (Node web service)   │
                    │  Express 4 REST API          │
                    └───┬──────────┬───────────┬───┘
                        │          │           │
              ┌─────────▼──┐  ┌────▼─────┐  ┌──▼──────────┐
              │ MongoDB    │  │  Stripe  │  │ SMTP        │
              │ Atlas      │  │ Payments │  │ (optional)  │
              └────────────┘  └──────────┘  └─────────────┘
                                   ▲
                                   │ webhook: payment_intent.succeeded
                                   └── Stripe ──▶ /api/webhooks/stripe
```

The client calls `/api/*` as a relative path. On Vercel a rewrite proxies that to
Render, so the browser only ever talks to one origin and no CORS preflight is
needed. Setting `VITE_API_URL` switches the client to calling Render directly,
which then relies on the `CLIENT_ORIGIN` allowlist in the API.

### Stack

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite 5, hand-written CSS (no UI framework) |
| Backend | Node.js, Express 4, ES modules |
| Database | MongoDB Atlas via Mongoose 8 |
| Auth | JWT bearer tokens, bcrypt (cost 12) |
| Payments | Stripe PaymentIntents + Payment Element |
| Email | Nodemailer over SMTP, optional |
| Hosting | Vercel (client), Render (API) |

### Repository layout

```text
client/                     React app, deployed to Vercel
  index.html                Favicons, manifest, social meta
  public/                   Generated icon set + site.webmanifest
  src/
    main.jsx                App shell: session, enrollment, checkout state
    LearnSpace.jsx          Catalogue, course detail, My courses
    AuthModal.jsx           Split-panel sign in / register dialog
    AccountPage.jsx         Profile, session, account deletion
    CheckoutModal.jsx       Stripe Elements payment flow
    Avatar.jsx              Generated SVG avatars
    lib/api.js              Fetch wrapper, auth headers, INR formatting
    learnspace.css          All styling
  vite.config.js

server/                     Express API, deployed to Render
  src/
    index.js                Routes and middleware wiring
    seed.js                 Imports the course catalogue from CSV
    migrate.js              Backfills fields added after the initial seed
    lib/
      env.js                Loads .env before any other module reads it
      db.js                 Cached Mongoose connection
      stripe.js             Lazy Stripe client, config detection
      mailer.js             SMTP transport, degrades to logging
    middleware/auth.js      requireAuth, requireRole
    models/                 User, Course, Lesson, Enrollment, Progress,
                            DeletionRequest

vercel.json                 Build config, /api rewrite, security headers
render.yaml                 API service definition
```

### Data model

```text
User ──┬── Enrollment ──── Course ──── Lesson
       │   (status:            (price,      (videoId,
       │    pending/           priceInPaise, verification
       │    active/            currency)     status)
       │    refunded)              ▲
       │                           │
       └── Progress ───────────────┘
           (per lesson: completed, secondsWatched)

User ──── DeletionRequest (hashed one-time token, TTL indexed)
```

Design decisions worth calling out:

- **Money is stored twice, deliberately.** `price` in whole rupees drives display,
  filtering and sorting. `priceInPaise` is an integer in the smallest currency unit
  and is the only value sent to Stripe. Deriving the charge from a float at request
  time risks drift, and Stripe rejects non-integer amounts.
- **Progress is derived, not stored.** Course completion percentage is computed from
  `Progress` rows against the current lesson count, so a course gaining or losing
  lessons can never leave a stale total behind.
- **Enrollments start as `pending`.** Only `active` unlocks content. Nothing is
  granted at PaymentIntent creation.

### Payment lifecycle

```text
1. User clicks Buy
2. Client POSTs { courseId } only, never a price
3. Server reads priceInPaise from the database and creates a PaymentIntent,
   embedding userId + courseId in metadata. Enrollment recorded as `pending`.
4. Stripe Payment Element collects card details in the browser
5. stripe.confirmPayment() with redirect: 'if_required'
6. Access granted by either path, both server-verified and idempotent:
     a. Webhook  payment_intent.succeeded  (source of truth)
     b. POST /api/payments/confirm, which retrieves the intent from Stripe
        and trusts only Stripe's reported status
```

Card details never reach the LearnSpace server. The client cannot assert that a
payment succeeded; both unlock paths ask Stripe directly. The webhook and the
confirm endpoint share one idempotent upsert, so duplicate delivery is harmless.

### Security model

| Concern | Approach |
|---|---|
| Passwords | bcrypt, cost 12 |
| Sessions | JWT bearer token, verified per request against the database |
| Paid content | `videoId` is stripped from catalogue responses entirely and returned only by the gated playback route after an `active` enrollment is confirmed |
| Price tampering | The client sends only a `courseId`; amounts come from the database |
| Webhooks | Rejected unless the Stripe signature verifies against `STRIPE_WEBHOOK_SECRET` |
| Search input | Regex metacharacters escaped before reaching a `$regex` query |
| Account deletion | Two-step, confirmed by an emailed one-time token stored only as a SHA-256 hash, 30-minute TTL |
| Email address | Immutable at the schema level and rejected by the profile route |
| Secrets | Server-only variables never reach the client bundle; only `VITE_*` values are inlined |

### API surface

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | – | Service and integration status |
| GET | `/api/stats` | – | Catalogue counts, computed from the database |
| GET | `/api/courses` | – | Paginated catalogue: search, filter, sort |
| POST | `/api/auth/register` | – | Create an account |
| POST | `/api/auth/login` | – | Exchange credentials for a token |
| GET | `/api/auth/me` | ✓ | Restore a session |
| GET | `/api/courses/mine` | ✓ | Enrolled courses with progress |
| GET | `/api/enrollments` | ✓ | Enrollment records |
| POST | `/api/enrollments/free` | ✓ | Enroll in a free course |
| POST | `/api/payments/create-payment-intent` | ✓ | Start a paid purchase |
| POST | `/api/payments/confirm` | ✓ | Server-verified unlock |
| POST | `/api/webhooks/stripe` | signature | Authoritative payment events |
| GET | `/api/lessons/:id/playback` | ✓ | Gated video URL |
| PUT | `/api/progress/lessons/:id` | ✓ | Mark a lesson complete |
| PATCH | `/api/account/profile` | ✓ | Update display name |
| POST | `/api/account/avatar/shuffle` | ✓ | Regenerate avatar |
| POST | `/api/account/deletion-request` | ✓ | Email a deletion link |
| POST | `/api/account/deletion-confirm` | token | Delete the account |

---

## Configuration

All variables live in a single `.env` at the repository root. Vite is configured to
read from there via `envDir`, so the publishable key is not duplicated.

| Variable | Scope | Notes |
|---|---|---|
| `MONGODB_URI` | server | Atlas connection string |
| `JWT_ACCESS_SECRET` | server | Signing secret for access tokens |
| `STRIPE_SECRET_KEY` | server | Never exposed to the browser |
| `STRIPE_WEBHOOK_SECRET` | server | Required for webhook verification |
| `CLIENT_ORIGIN` | server | Comma-separated CORS allowlist |
| `PUBLIC_APP_URL` | server | Used to build links inside emails |
| `CURRENCY` | server | Defaults to `inr` |
| `SMTP_*`, `MAIL_FROM` | server | Optional; without them deletion links are logged |
| `VITE_STRIPE_PUBLISHABLE_KEY` | client | Safe to expose, inlined at build time |
| `VITE_API_URL` | client | Leave empty to use the Vercel rewrite |

Start from `.env.example`. Secrets are set in the Render and Vercel dashboards for
deployed environments and are never committed.

## Working on the project

Requirements: Node.js 18+ and npm 9+.

```bash
npm install
npm run dev            # client and API together
```

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server and API with file watching |
| `npm run build` | Production client build |
| `npm start` | Run the API |
| `npm run seed` | Import the course catalogue from CSV |
| `npm run migrate` | Backfill fields added after the initial seed |

Seeding requires `free_course_catalog_100.csv` at the repository root. It is only
needed to populate an empty database; the running application reads from MongoDB.

To exercise webhooks during development, forward them with the Stripe CLI:

```bash
stripe listen --forward-to localhost:4000/api/webhooks/stripe
```

Then set the printed `whsec_` value as `STRIPE_WEBHOOK_SECRET`. Without it, the
webhook route rejects requests rather than trusting an unsigned payload, and
purchases complete through the verified confirm endpoint instead.

## Deployment

**Vercel (client).** Root Directory must be the repository root so `vercel.json` is
read; it supplies the build command, output directory and the `/api` rewrite. Set
`VITE_STRIPE_PUBLISHABLE_KEY` in project settings.

**Render (API).** Defined by `render.yaml`. Installs from the repository root so npm
workspaces resolve, health-checks `/api/health`. Set every variable marked
`sync: false` in the dashboard.

Point the Stripe webhook endpoint at the Render URL directly rather than through the
Vercel rewrite:

```text
https://learnspace-api-oyiv.onrender.com/api/webhooks/stripe
```

## Current limitations

- Each seeded course has a single lesson, so progress is either 0% or 100% until
  courses carry multiple lessons.
- Course ratings come from the seed script and are synthetic; there is no review
  system yet.
- Access tokens last 7 days with no refresh rotation. Shortening the lifetime
  requires implementing refresh tokens first.
- The admin role exists on the user model but no admin-only interface is built.
