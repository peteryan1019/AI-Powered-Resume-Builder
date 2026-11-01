# AI-Powered Resume Builder · Tailr

[![CI](https://github.com/peteryan1019/AI-Powered-Resume-Builder/actions/workflows/ci.yml/badge.svg)](https://github.com/peteryan1019/AI-Powered-Resume-Builder/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Tailr turns a structured profile and a job description into a tailored resume.
An AI writer drafts the content, a coach reviews it, and you choose which
suggestions to apply before editing and downloading the final PDF.

- **Guided AI workflow:** background resume builds with progress updates,
  persistent checkpoints, and a pause for your review.
- **Editable PDF previews:** update content, reorder sections, and preview the
  generated document in the browser.
- **Three PDF templates:** Signal, Evergreen, and Atelier.
- **Profiles and saved resumes:** passwordless email and Google sign-in,
  structured profile import, and durable storage.
- **Subscription access:** Stripe integration with a seven-day account trial.
- **Deployment infrastructure:** Docker Compose, Helm charts, Terraform for AWS
  EKS, and KEDA worker autoscaling.

![Three resume templates rendered from fictional sample data](docs/resume-templates.png)

### Architecture

```mermaid
flowchart LR
  Browser[Angular frontend] --> API[Express API]
  API --> DB[(PostgreSQL / Prisma)]
  API --> Redis[(Redis / BullMQ)]
  Redis --> Worker[LangGraph resume worker]
  Worker --> AI[Gemini on Vertex AI]
  Worker --> PDF[Python / ReportLab]
  Worker --> DB
  Worker --> Redis
```

### Project and attribution

Maintained by [Peter Yan](https://github.com/peteryan1019). Originally developed
as a CSCC09 team project at the University of Toronto Scarborough with
[Tornadoguy26](https://github.com/Tornadoguy26) and
Ruoxin. The public repository retains
contributor attribution in its sanitized Git history. Private resume samples,
deployment backups, and local credentials are excluded.

Licensed under [MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md)
for the font and template licenses, and [contributing](CONTRIBUTING.md) to help.

### Running your own copy

Use your own database, Redis, Vertex AI project, email sender, Google OAuth
application, and Stripe test credentials. `.env.example` documents the service
settings; for local development, put the applicable values in `backend/.env`
and set `FRONTEND_URL` and `BACKEND_URL` to your localhost URLs. Install Python
dependencies from `assets/requirements.txt` for PDF rendering.

CI runs on pushes to `main` and pull requests. The production release workflow
is manual and disabled unless `ENABLE_PRODUCTION_RELEASE=true` is explicitly
configured as a repository variable. Deployment examples contain the original
installation's domain, image names, and AWS identifiers; replace them with your
own values before deploying. No production secrets are included.

## Prerequisites

Install these before starting:

- Node.js
- npm
- Docker
- Docker Desktop, if using macOS or Windows

## 1. Start PostgreSQL With Docker

From the project root, run:

```bash
docker run --name resume-pg \
  -e POSTGRES_PASSWORD=myPassword \
  -e POSTGRES_DB=resumebuilder \
  -p 5432:5432 \
  -d postgres:17
```

This creates a PostgreSQL container with:

```text
container name: resume-pg
database name: resumebuilder
username: postgres
password: myPassword
port: 5432
```
And runs it in the background. Note that you might need to have Docker Desktop opened for this command to work.

If the container already exists but is stopped somehow, you can restart it with:

```bash
docker start resume-pg
```

Check that it is running:

```bash
docker ps
```

## 2. Configure Backend Environment Variables

Go into the backend folder:

```bash
cd backend
```

Create a `.env` file:

```bash
touch .env
```

Add this database connection URL to `backend/.env`:

```env
DATABASE_URL="postgresql://postgres:myPassword@localhost:5432/resumebuilder"
```

This tells Prisma how to connect to the PostgreSQL database running in Docker.

The AI features use Vertex AI. Download a JSON key for a dedicated Google Cloud
service account that has the Vertex AI User role, keep the key outside this
repository, and add its absolute path and project to `backend/.env`:

```env
GOOGLE_CLOUD_PROJECT="your-google-cloud-project-id"
GOOGLE_CLOUD_LOCATION="global"
GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
```

The Google Cloud project must have billing and the Vertex AI API enabled. The
credential path is read by Google's Application Default Credentials support;
the application never parses or copies the private key itself.

## 3. Install Backend Dependencies

From the `backend` folder, run:

```bash
npm ci
```

## 4. Create or Update the Database Tables

Still inside the `backend` folder, run:

```bash
npm run db:setup
```

This runs two separate steps:

- `prisma migrate deploy` applies pending SQL migrations from `backend/prisma/migrations` to the database configured by `DATABASE_URL`.
- `prisma generate` regenerates the TypeScript client from `schema.prisma` so the backend can query those tables.

The schema is a description of the database. Generating the client does not create
the actual tables: the migrations do that. Use `npm run db:setup` on first setup
and after pulling database changes. It applies existing migrations without
creating new ones or resetting the database.

When you intentionally edit `schema.prisma`, create and apply a new migration in
your development database, then regenerate the client:

```bash
npx prisma migrate dev --name describe_your_change
npx prisma generate
```

Include the schema change and its migration in version control together. Prisma 7
does not run `prisma generate` automatically after `prisma migrate dev`.

## 5. Start the Backend Server

From the `backend` folder, run:

```bash
npm run dev
```

`npm run dev` automatically runs `db:setup` before starting the server. If migration
or client generation fails, startup stops so requests cannot reach an outdated
database. Start PostgreSQL first. After pulling new migrations while the server
is running, restart `npm run dev` to run setup again.

The backend should start on:

```text
http://localhost:3000
```

The resume workflow also needs Redis. For local development, start Redis 8:

```bash
docker run --name resume-redis -p 6379:6379 -d redis:8.2-alpine
```

Add this to `backend/.env`:

```env
REDIS_URL="redis://localhost:6379"
```

Then start the asynchronous resume worker in a second backend terminal:

```bash
npm run dev:worker
```

The API enqueues only a build ID. The worker loads the build input from Redis,
runs the LangGraph writer/coach workflow, pauses at coach feedback without
holding a worker slot, and resumes from its Redis checkpoint after the user
submits decisions. PostgreSQL stores only durable profile changes and the final
resume; transient drafts, reviews, and progress events expire from Redis after
three days.

You can test the backend with its public liveness endpoint:

```bash
curl http://localhost:3000/api/health
```

Expected response includes:

```json
{ "status": "ok" }
```

Database readiness is available at `GET /api/health/ready`.

The worker has separate probe endpoints on port `3001`:

```bash
curl http://localhost:3001/health
curl http://localhost:3001/health/ready
```

For container deployments, database migration is intentionally separate from
API startup. `docker compose up` runs the one-shot `migrate` service first;
Kubernetes deployments should run `npm run db:migrate:deploy` from the backend
image in a Job before updating the API or worker Deployments.

The production Kubernetes charts, secret template, deployment order, and
worker autoscaling explanation are in [`k8s/README.md`](k8s/README.md).

## 6. Install Frontend Dependencies

Open a new terminal. From the project root, go into the frontend folder:

```bash
cd frontend
```

Install dependencies:

```bash
npm ci
```

## 7. Start the Angular Frontend

From the `frontend` folder, run:

```bash
npm start
```

The frontend should start on:

```text
http://localhost:4200
```

Open that URL in your browser.

## 8. Test the Full Flow

Check `GET /api/health/ready`, sign in, create or import a profile, start a
resume build, respond to the coach review, and download the generated PDF. A
complete run exercises the frontend, API, PostgreSQL, Redis, background worker,
AI providers, and PDF generator.

The resume editor renders the saved PDF using a locally hosted PDF.js worker.
Pencil buttons outside the sheet align with the first line of each bullet and
focus its form field. The adjacent hamburger handle moves the bullet's entire
section; the up/down arrow keys provide the same operation when a handle is
focused. Opening the editor or saving changes regenerates the PDF and returns
its exact bytes together with the generator's measured positions. The controls
stay disabled while changes are waiting to be saved, so they cannot reorder
sections using an outdated preview. Zoom and Fit change only the preview size.

## Useful Commands

Start the database container:

```bash
docker start resume-pg
```

Stop the database container:

```bash
docker stop resume-pg
```

View running containers:

```bash
docker ps
```

View all containers:

```bash
docker ps -a
```

Run the backend:

```bash
cd backend
npm run dev
```

Run the frontend:

```bash
cd frontend
npm start
```

Apply existing database migrations and regenerate the client:

```bash
cd backend
npm run db:setup
```

Regenerate Prisma client:

```bash
cd backend
npx prisma generate
```

Open Prisma Studio to inspect database data:

```bash
cd backend
npx prisma studio
```

### Subscription access and the free trial

Every account can use paid features for seven full days from its database
`User.createdAt` timestamp without visiting Stripe Checkout. The trial deadline
is calculated on the backend, so signing out, requesting another login code, or
starting a checkout session cannot reset it. After that deadline, an `ACTIVE`
or `TRIALING` Stripe subscription is required. The frontend route guard handles
navigation, while the profile and resume-workflow APIs enforce the same rule
server-side.

## Troubleshooting

### The table `public.Subscription` does not exist

The backend has subscription query code, but the connected database is missing
the table. From `backend`, run:

```bash
npx prisma migrate status
npm run db:setup
```

The migration `20260911000000_track_stripe_subscriptions` creates the subscription
table, status enum, indexes, and user relationship. `prisma generate` alone cannot
fix a missing table. If migrations are already up to date, verify that the server
and Prisma CLI use the same `DATABASE_URL`.

### Database `peteryan` does not exist

This usually means the backend is not using the expected `DATABASE_URL`.

Make sure `backend/.env` contains:

```env
DATABASE_URL="postgresql://postgres:myPassword@localhost:5432/resumebuilder"
```

Also make sure dotenv is loaded before the Prisma/Postgres connection is created. If using ES module imports, adding this at the top of the route file can help:

```ts
import 'dotenv/config';
```

### Backend Cannot Connect to the Database

Make sure the Docker container is running:

```bash
docker ps
```

If it is stopped, run:

```bash
docker start resume-pg
```

Also confirm the port is mapped correctly:

```text
5432:5432
```

### Angular Cannot Call the Backend

Make sure the backend is running on:

```text
http://localhost:3000
```

Make sure the frontend is running on:

```text
http://localhost:4200
```

The backend should allow CORS from the configured Angular origin:

```env
FRONTEND_URL="http://localhost:4200"
```

### `NG0908: In this configuration Angular requires Zone.js`

If using Zone.js-based Angular change detection, make sure `zone.js` is installed and included in Angular polyfills.

If using zoneless Angular, make sure `frontend/src/app/app.config.ts` uses:

```ts
provideZonelessChangeDetection()
```

instead of:

```ts
provideZoneChangeDetection(...)
```
