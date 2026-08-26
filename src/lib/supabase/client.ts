import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton: every call to createClient() in the browser returns the SAME
// GoTrueClient instance. Creating a fresh client per call/render (e.g. in a
// component body without memoizing) spins up multiple independent auth
// clients in the same tab, all racing to refresh the same session's refresh
// token. Since refresh tokens are single-use, that race can exceed Supabase
// Auth's reuse-detection grace window and get the whole session permanently
// revoked — which shows up as an unrecoverable login<->auction redirect
// loop. One client per tab, always, avoids this entirely.
let browserClient: SupabaseClient | undefined;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}