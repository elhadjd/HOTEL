import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/modules/auth/password";
import { enforceRateLimit, RateLimitError } from "@/modules/auth/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Required behind reverse proxies / PM2 so the session cookie is set correctly
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.trim().toLowerCase();

        try {
          await enforceRateLimit({
            bucketKey: `login:${email}`,
            limit: 10,
            windowMs: 15 * 60_000,
          });
        } catch (err) {
          if (err instanceof RateLimitError) return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        if (
          user.mustChangePassword &&
          user.temporaryPasswordExpiresAt &&
          user.temporaryPasswordExpiresAt.getTime() < Date.now()
        ) {
          return null;
        }

        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        const membership = await prisma.membership.findFirst({
          where: {
            userId: user.id,
            status: { in: ["ACTIVE", "INVITED"] },
          },
        });
        if (!membership) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          mustChangePassword: user.mustChangePassword,
          sessionVersion: user.sessionVersion,
          institutionId: membership.institutionId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.mustChangePassword = Boolean(
          (user as { mustChangePassword?: boolean }).mustChangePassword,
        );
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion ?? 0;
        token.institutionId = (user as { institutionId?: string }).institutionId;
      }

      if (!token.sub) return token;

      const dbUser = await prisma.user.findUnique({
        where: { id: token.sub },
        select: {
          active: true,
          mustChangePassword: true,
          sessionVersion: true,
        },
      });
      if (!dbUser || !dbUser.active) {
        return { ...token, sub: undefined };
      }

      // Always enforce sessionVersion strictly — never let a client-triggered
      // session update resurrect a revoked JWT after password reset/role change.
      if (
        typeof token.sessionVersion !== "number" ||
        dbUser.sessionVersion !== token.sessionVersion
      ) {
        return { ...token, sub: undefined };
      }

      token.mustChangePassword = dbUser.mustChangePassword;
      token.sessionVersion = dbUser.sessionVersion;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
        session.user.institutionId =
          typeof token.institutionId === "string" ? token.institutionId : undefined;
      } else if (session.user && !token.sub) {
        // Invalidate client session shape
        session.user.id = "";
      }
      return session;
    },
  },
});
