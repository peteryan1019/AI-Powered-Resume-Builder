# Resume Builder

This project is a simple full-stack resume builder setup with:

- Angular frontend
- Express backend
- Prisma ORM
- PostgreSQL database running in Docker
- Redis 8 for BullMQ jobs, LangGraph checkpoints, and progress streams
- A separate resume worker process

The application supports passwordless and Google authentication, structured
profiles, asynchronous AI-assisted resume builds, PDF generation, saved
resumes, and Stripe subscription access.

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
