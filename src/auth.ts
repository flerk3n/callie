import NextAuth, { getServerSession, type NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";
import { persistGoogleIdentity } from "@/lib/persistence";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          response_type: "code",
          scope: "openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google" || !profile) return false;
      await persistGoogleIdentity(profile, account);
      return true;
    },
    async jwt({ token, profile }) {
      if (profile && "sub" in profile && typeof profile.sub === "string") token.userId = profile.sub;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) session.user.id = token.userId;
      return session;
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}

export const authHandler = NextAuth(authOptions);
