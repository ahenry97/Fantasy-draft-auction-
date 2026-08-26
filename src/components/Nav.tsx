"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Gavel, ListChecks, Trophy, Shield, User, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavProps {
  displayName: string;
  isCommissioner: boolean;
}

const baseLinks = [
  { href: "/auction", label: "Auction", icon: Gavel },
  { href: "/my-bids", label: "My Bids", icon: ListChecks },
  { href: "/draft-order", label: "Draft Order", icon: Trophy },
];

export function Nav({ displayName, isCommissioner }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const links = isCommissioner
    ? [...baseLinks, { href: "/admin", label: "Admin", icon: Shield }]
    : baseLinks;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link
            href="/auction"
            prefetch={false}
            className="flex items-center gap-2 font-bold tracking-tight"
          >
            <Gavel size={20} className="text-accent" />
            <span>Draft Auction</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch={false}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/profile"
              prefetch={false}
              className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm sm:flex"
            >
              <User size={14} />
              {displayName}
            </Link>
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:bg-surface-2 hover:text-foreground sm:hidden"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur sm:hidden">
        <div className="flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
          {[...links, { href: "/profile", label: "Profile", icon: User }].map((link) => {
            const active = pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <Icon size={20} />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}