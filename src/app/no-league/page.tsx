export default function NoLeaguePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div className="max-w-sm">
        <h1 className="text-xl font-bold">No league yet</h1>
        <p className="mt-2 text-sm text-muted">
          Your account isn&apos;t attached to a league yet. Ask your commissioner to set one up,
          or try signing out and back in once it exists.
        </p>
      </div>
    </main>
  );
}
