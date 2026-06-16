import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const app = express();
const prisma = new PrismaClient({ adapter });
const PORT = process.env.PORT || 3000;
app.use(cors({ origin: 'http://localhost:4200' }));
app.use(express.json());
app.get('/api/health', async (_req, res) => {
    res.json({ status: 'ok' });
});
app.get('/api/test-resumes', async (_req, res) => {
    const resumes = await prisma.resume.findMany({
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
    });
    res.json(resumes);
});
app.post('/api/test-resume', async (req, res) => {
    const { email, name, title } = req.body;
    if (!email || !title) {
        res.status(400).json({ error: 'Email and title are required.' });
        return;
    }
    const user = await prisma.user.upsert({
        where: { email },
        update: { name },
        create: { email, name },
    });
    const resume = await prisma.resume.create({
        data: {
            title,
            content: {
                summary: 'Database smoke test resume',
                skills: ['Angular', 'Express', 'Prisma', 'Postgres'],
            },
            userId: user.id,
        },
        include: { user: true },
    });
    res.status(201).json(resume);
});
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
//# sourceMappingURL=index.js.map