import { getLeagueContext } from "@/lib/league-context";
import { ProfileForm } from "@/components/ProfileForm";

export default async function ProfilePage() {
  const ctx = await getLeagueContext();

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-lg font-semibold">Profile</h1>
      <ProfileForm
        initialDisplayName={ctx.profile.display_name}
        email={ctx.profile.email}
        role={ctx.role}
        leagueName={ctx.league.name}
      />
    </div>
  );
}
