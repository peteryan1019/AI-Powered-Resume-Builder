import { Router, type Request, type Response } from 'express';
import stripe from '../lib/stripeClient.js';
import { refreshMissingSubscriptionAccess } from '../services/subscriptionAccess.js';

const router = Router();

router.get('/me/subscription', async (req: Request, res: Response) => {
  const user = req.user as any;
  res.json(await refreshMissingSubscriptionAccess(stripe, user));
});

export default router;
