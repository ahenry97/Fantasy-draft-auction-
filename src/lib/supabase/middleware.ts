import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Next.js prefetches every visible <Link> automatically and tags those
  // requests with this header. A prefetch doesn't need auth enforcement or
  // redirects — the real navigation does that — so let it straight through
  // without touching Supabase at all. This matters a lot here: every
  // prefetch would otherwise run its own independent getUser() call, and
  // several of those firing at once race to refresh the same single-use
  // refresh token, which can trip Supabase's reuse-abuse detection and
  // permanently revoke the whole session (session-death loop). Belt and
  // suspenders alongside prefetch={false} on the actual <Link>s.
  if (request.headers.get("next-router-prefetch") === "1") {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login") || path.startsWith("/signup");
  const isPublicAsset = path.startsWith("/_next") || path.startsWith("/favicon");

  function redirectTo(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  if (!user && !isAuthRoute && !isPublicAsset) {
    return redirectTo("/login");
  }

  if (user && isAuthRoute) {
    return redirectTo("/auction");
  }

  return supabaseResponse;
}