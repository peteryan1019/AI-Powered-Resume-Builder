import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '../../generated/prisma/client.js'; // Adjust this import to your file path
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const PORT = process.env.PORT || 3000;
const router = Router();

// Endpoint to fetch the total number of users
router.get('/count', async (req: Request, res: Response) => {
  try {
    const count = await prisma.user.count();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user count' });
  }
});

// Endpoint to create a test user
router.post('/add', async (req: Request, res: Response) => {
  try {
    const newUser = await prisma.user.create({
      data: {
        email: `testuser-${Date.now()}@example.com`,
        name: 'Test Generated User',
      },
    });
    
    // Fetch the updated total count immediately
    const totalCount = await prisma.user.count();
    res.status(201).json({ user: newUser, totalCount });
  } catch (error: Error | unknown) {
    console.log('Error creating user:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

export default router;
