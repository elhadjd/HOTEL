"use client";

import { SessionProvider } from "next-auth/react";

/**
 * SessionProvider must not take down the tree if /api/auth/session flaps
 * behind a reverse proxy (HEAD may 400; GET should still work).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
      // Avoid aggressive polling that amplifies proxy/auth quirks on mobile networks
      refetchInterval={0}
    >
      {children}
    </SessionProvider>
  );
}
