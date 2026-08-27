import { createBrowserClient } from "@supabase/ssr";
import { recovery } from "@/lib/auth/recovery";

let observing = false;

export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  // Subscribe at singleton creation, before URL initialization can emit recovery.
  // Navbar and other consumers can initialize the shared client before the page.
  if (typeof window !== "undefined" && !observing) {
    observing = true;
    client.auth.onAuthStateChange((event, session) => {
      recovery.event(event, session?.user.id);
    });
  }
  return client;
}
