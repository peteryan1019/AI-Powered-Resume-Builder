import express from 'express';
import dotenv from 'dotenv';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import cors from 'cors';
import userRouter from './routes/user_routes.ts';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const app = express();
const prisma = new PrismaClient({ adapter });
const PORT = process.env.PORT || 3000;


app.use(cors({ origin: 'http://localhost:4200' }));
app.use(express.json());

// Mount the user routes
app.use('/api/users', userRouter);

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
