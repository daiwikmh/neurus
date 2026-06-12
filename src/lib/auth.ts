import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

async function refreshGoogle(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`google refresh ${res.status}`);
  return res.json() as Promise<{ access_token: string; expires_in: number; refresh_token?: string }>;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: { scope: `openid email profile ${CALENDAR_SCOPE}`, access_type: "offline", prompt: "consent" },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at ? account.expires_at * 1000 : undefined;
      } else if (token.expiresAt && Date.now() > (token.expiresAt as number) - 60_000 && token.refreshToken) {
        try {
          const r = await refreshGoogle(token.refreshToken as string);
          token.accessToken = r.access_token;
          token.expiresAt = Date.now() + r.expires_in * 1000;
          if (r.refresh_token) token.refreshToken = r.refresh_token;
        } catch {
          token.accessToken = undefined;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.userId = token.sub;
      return session;
    },
  },
});
