# Resume Builder

This project is a simple full-stack resume builder setup with:

- Angular frontend
- Express backend
- Prisma ORM
- PostgreSQL database running in Docker

The current smoke test verifies that the frontend, backend, and database are connected correctly. When the test button is clicked, the frontend asks the backend to create a dummy user, the backend inserts that user into PostgreSQL, counts the total users, and sends the count back to the frontend.

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
npm install
```

## 4. Create or Update the Database Tables

Still inside the `backend` folder, run:

```bash
npx prisma migrate dev
```

The command name contains the word `migrate`, but the practical meaning here is: "make the real database match `schema.prisma`."

This reads `backend/prisma/schema.prisma` and updates the actual PostgreSQL database so its tables match the models in that file.

In this project, the Prisma schema defines models like `User` and `Resume`. Running `npx prisma migrate dev` makes sure the real database has matching tables, columns, indexes, and relationships.

For example, if `schema.prisma` says there is a `User` model, this command makes sure PostgreSQL has a real `User` table. If the schema says a user has an `email` field, this command makes sure the table has an `email` column.

Use this command when:

- setting up the project for the first time
- changing `backend/prisma/schema.prisma`
- adding, removing, or editing database tables/columns/relations

If needed, regenerate the Prisma client:

```bash
npx prisma generate
```

This does not change the database. It regenerates the TypeScript Prisma client code that the backend imports and uses to query the database.

Use `npx prisma generate` when:

- the generated Prisma client is missing
- TypeScript cannot find the generated Prisma client
- you changed `schema.prisma` but did not run the command that updates the real database tables
- you pulled new Prisma schema changes from someone else

Most of the time, `npx prisma migrate dev` also runs `prisma generate` automatically afterward. That is why `npx prisma generate` is usually only needed as a repair/regeneration command.

## 5. Start the Backend Server

From the `backend` folder, run:

```bash
npm run dev
```

The backend should start on:

```text
http://localhost:3000
```

You can test the backend with:

```bash
curl http://localhost:3000/api/users/count
```

Expected response:

```json
{
  "count": 0
}
```

The number may be higher if users already exist in your database.

## 6. Install Frontend Dependencies

Open a new terminal. From the project root, go into the frontend folder:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
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

Click the test button in the frontend.

Expected behavior:

```text
1. The Angular frontend sends a POST request to the backend.
2. The Express backend creates a dummy user.
3. Prisma inserts the user into PostgreSQL.
4. The backend counts the total users in the User table.
5. The backend sends the count back to Angular.
6. Angular updates the number displayed on the page.
```

If the number increases after each click, the frontend, backend, and database are connected correctly.

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

Create or update the database tables from `schema.prisma`:

```bash
cd backend
npx prisma migrate dev
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

The backend should allow CORS from the Angular frontend:

```ts
app.use(cors({ origin: 'http://localhost:4200' }));
```

### Frontend Page Does Not Update After the API Succeeds

Check that the backend response field matches the frontend code.

For example, if the backend sends:

```json
{
  "totalCount": 5
}
```

then the frontend should read:

```ts
response.totalCount
```

not:

```ts
response.count
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
