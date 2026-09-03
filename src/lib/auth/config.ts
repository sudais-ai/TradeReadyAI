import { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import { prisma } from "@/lib/db/prisma";
import { log } from "@/lib/log";
import { verifyPassword } from "./password";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// Build the provider list dynamically so missing OAuth env vars simply skip
// the provider instead of crashing the entire app.
const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) {
        return null;
      }

      const user = await prisma.user.findUnique({
        where: { email: String(credentials.email).toLowerCase() },
      });

      if (!user || !user.passwordHash) {
        return null;
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
        throw new Error(`Account temporarily locked. Try again in ${minutesLeft} minutes.`);
      }

      const isValid = await verifyPassword(String(credentials.password), user.passwordHash);

      if (!isValid) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: { increment: 1 },
            lockedUntil:
              user.failedLoginAttempts + 1 >= 5
                ? new Date(Date.now() + 15 * 60 * 1000)
                : undefined,
          },
        });
        return null;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
      };
    },
  }),
];

// Google OAuth — only registered if the env vars are present.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

// Facebook OAuth — only registered if the env vars are present.
if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  providers.push(
    Facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    })
  );
}

export const authConfig: NextAuthConfig = {
  // JWT session strategy. The Credentials provider does not support database
  // sessions, and OAuth providers also work fine with JWT sessions in v5.
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  // Explicitly tell NextAuth which host to trust (required for non-localhost
  // hosts in production and for LAN dev testing).
  trustHost: true,
  providers,
  callbacks: {
    // Account linking handled here so we don't need a PrismaAdapter.
    //
    // Security model:
    //   1. Credentials provider handles its own user lookup + password verify.
    //   2. OAuth providers (Google, Facebook) trust the provider's email
    //      verification — if a user already exists with that email, we
    //      reuse the existing record rather than creating a duplicate.
    //      This is the same model used by "Sign in with Google" everywhere.
    //   3. We never overwrite an existing passwordHash — if the user
    //      originally signed up with email/password, they retain that
    //      ability even after linking Google.
    //   4. We never auto-link across providers for the same user without
    //      the user explicitly clicking the social button.
    async signIn({ user, account }) {
      if (!user?.email) return false;

      // Credentials provider handles its own user creation/lookup.
      if (account?.provider === "credentials") {
        return true;
      }

      const email = user.email.toLowerCase();

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        // Link the OAuth account to the existing email/password user.
        // We deliberately do NOT overwrite the passwordHash.
        user.id = existing.id;
        if (!user.name && existing.name) user.name = existing.name;
        // Update last login timestamp.
        await prisma.user.update({
          where: { id: existing.id },
          data: { lastLoginAt: new Date() },
        });
        log.info("auth:oauth", "OAuth sign-in linked to existing user", {
          userId: existing.id,
          provider: account?.provider,
        });
        return true;
      }

      // First-time OAuth user: create a User record so TradeCases and
      // other relations can attach to them. No passwordHash — this is
      // an OAuth-only account until the user sets a password.
      const created = await prisma.user.create({
        data: {
          email,
          name: user.name ?? null,
          // No passwordHash — OAuth-only account.
        },
        select: { id: true },
      });
      user.id = created.id;
      log.info("auth:oauth", "New OAuth user created", {
        userId: created.id,
        provider: account?.provider,
        email,
      });
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        // Phase 8: capture the passwordChangedAt timestamp at sign-in so we
        // can detect a stale JWT after a password rotation. We store the
        // value as a Unix millisecond number (not a Date) because the JWT
        // serializer would turn a Date into a string, breaking .getTime()
        // on the other side.
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { passwordChangedAt: true },
        });
        token.passwordChangedAt = dbUser?.passwordChangedAt
          ? dbUser.passwordChangedAt.getTime()
          : null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string;
      }
      // Keep the value as a number throughout — the session is serialized
      // to JSON, and Date objects become strings that break getTime().
      if (typeof token?.passwordChangedAt === "number") {
        session.user.passwordChangedAt = token.passwordChangedAt;
      }
      return session;
    },
  },
  // NextAuth v5 reads `AUTH_SECRET` by default. We also accept the legacy
  // `NEXTAUTH_SECRET` for compatibility. Generate via:
  //   openssl rand -base64 32
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
};
