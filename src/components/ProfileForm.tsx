"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { MemberRole } from "@/types/domain";

interface ProfileFormProps {
  initialDisplayName: string;
  email: string;
  role: MemberRole;
  leagueName: string;
}

export function ProfileForm({ initialDisplayName, email, role, leagueName }: ProfileFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", user.id);

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile updated");
    router.refresh();
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="text-xs text-muted">League</div>
        <div className="font-medium">{leagueName}</div>
        <div className="mt-2 text-xs text-muted">Role</div>
        <div className="font-medium capitalize">{role}</div>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <label className="text-xs font-medium text-muted">Email</label>
        <input
          disabled
          value={email}
          className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-muted"
        />
        <label className="text-xs font-medium text-muted">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={saving}
          className="mt-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      <button
        onClick={handleLogout}
        className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-danger"
      >
        Log out
      </button>
    </div>
  );
}
