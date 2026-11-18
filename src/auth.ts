import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { PassStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      passStatus: PassStatus;
      passExpiresAt: Date | null;
    } & DefaultSession["user"];
  }

  interface User {
    passStatus?: PassStatus;
    passExpiresAt?: Date | null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      authorization: {
        params: {
          scope:
            "openid email profile https://mail.google.com/ https://www.googleapis.com/auth/gmail.settings.basic",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account }) {
      // Auth.js does not overwrite existing OAuth tokens on subsequent logins,
      // so we persist refreshed scopes and tokens when an existing Google account signs in.
      if (account?.provider === "google" && account.providerAccountId) {
        const existingAccount = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          select: { id: true },
        });

        if (existingAccount) {
          await prisma.account.update({
            where: { id: existingAccount.id },
            data: {
              access_token: account.access_token ?? null,
              ...(account.refresh_token
                ? { refresh_token: account.refresh_token }
                : {}),
              expires_at: account.expires_at ?? null,
              scope: account.scope ?? null,
              token_type: account.token_type ?? null,
              id_token: account.id_token ?? null,
            },
          });
        }
      }

      return true;
    },
    async session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
        session.user.passStatus = user.passStatus ?? "TRIAL";
        session.user.passExpiresAt = user.passExpiresAt ?? null;
      }

      return session;
    },
  },
});
