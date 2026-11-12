import type { ReactNode } from "react";
import { RenewSession } from "@/auth/renew-session";
import { FeedStoreProvider } from "@/feed/feed-store";
import { SearchStoreProvider } from "@/search/search-store";

/**
 * Pages that hold personal data. The layout renews the cookie and holds the
 * feed store, which keeps the loaded picks in memory while the user visits a
 * movie page (spec 0010, AC-14), and the search store, which keeps the last
 * bite search the same way (spec 0012, AC-13). It cannot guard the pages, because layouts do
 * not re-run on client navigation. Each page calls `requireUser` itself
 * (spec 0005, AC-8).
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <FeedStoreProvider>
      <SearchStoreProvider>
        <RenewSession />
        {children}
      </SearchStoreProvider>
    </FeedStoreProvider>
  );
}
