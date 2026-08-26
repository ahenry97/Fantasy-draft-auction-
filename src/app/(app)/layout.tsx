import { Nav } from "@/components/Nav";
import { getLeagueContext } from "@/lib/league-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getLeagueContext();

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Nav displayName={ctx.profile.display_name} isCommissioner={ctx.role === "commissioner"} />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
