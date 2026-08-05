import authSystem from "passport";
import {Strategy as GS} from "passport-google-oauth20";
import prisma from "../lib/prisma.js";

authSystem.serializeUser((user: any, done) => { done(null, user.id); });

authSystem.deserializeUser(async (id: string, done) => { try { const user = await prisma.user.findUnique({ where: { id }, }); done(null, user); } catch (err) { done(err, null); } });

authSystem.use(
  new GS(
    {
      clientID: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      callbackURL: `${process.env.BACKEND_URL}/auth/google/callback`,
      state: true
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(new Error("Google account has no email"), undefined);
        }

        const user = await prisma.user.upsert({
          where: { email },
          update: {
            googleid: profile.id,
            name: profile.displayName,
       
          },
          create: {
            email,
            googleid: profile.id,
            name: profile.displayName,
          },
        });

        return done(null, user);
      } catch (err) {
        return done(err as Error, undefined);
      }
    }
  )
);

export default authSystem;