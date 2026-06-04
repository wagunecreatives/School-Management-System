import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useAuth, primaryRole, dashboardPathForRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading, profile, roles } = useAuth();

  if (!loading && user) {
    if (user.user_metadata?.must_change_password) return <Navigate to="/change-password" />;
    if (profile?.status !== "approved") return <Navigate to="/pending" />;
    return <Navigate to={dashboardPathForRole(primaryRole(roles))} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/40">
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-serif text-lg font-bold">
            SA
          </div>
          <span className="font-serif text-lg font-semibold text-foreground">
            Santa Ana Calm Waters Academy
          </span>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/register">Register</Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-accent-foreground">
            School Management System
          </p>
          <h1 className="mt-4 font-serif text-5xl font-bold leading-tight text-foreground sm:text-6xl">
            Calm waters for learning, fees, and results.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            One unified platform for administrators, teachers, accountants, and parents — manage
            students, track fees, and publish results with clarity.
          </p>
          <div className="mt-10 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/register">Create an account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">I already have an account</Link>
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-20 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "Admin", d: "Approve users, manage students, and oversee the school." },
            { t: "Teacher", d: "Enter scores, grades, and remarks for each term." },
            { t: "Accountant", d: "Issue invoices, record payments, and track balances." },
            { t: "Parent", d: "Follow your child's results and school fees." },
          ].map((c) => (
            <div
              key={c.t}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <h3 className="font-serif text-lg font-semibold text-foreground">{c.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
