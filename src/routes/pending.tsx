import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useAuth, primaryRole, dashboardPathForRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pending")({
  component: PendingPage,
});

function PendingPage() {
  const navigate = useNavigate();
  const { user, profile, roles, loading, signOut, refresh } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (profile?.status === "approved")
    return <Navigate to={dashboardPathForRole(primaryRole(roles))} />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-secondary/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground font-serif text-xl">
          ⏳
        </div>
        <h1 className="mt-4 font-serif text-2xl font-bold text-foreground">
          {profile?.status === "rejected" ? "Access denied" : "Awaiting approval"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {profile?.status === "rejected"
            ? "Your account was not approved. Please contact the school administrator."
            : "Your account is waiting for the school admin to approve and assign your role. You'll get access shortly."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" onClick={() => refresh()}>
            Refresh status
          </Button>
          <Button
            onClick={async () => {
              await signOut();
              navigate({ to: "/" });
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
