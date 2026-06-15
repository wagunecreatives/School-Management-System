import { createFileRoute, Navigate, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth, primaryRole, dashboardPathForRole, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import schoolLogo from "@/assets/school logo.png";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetClose,
} from "@/components/ui/sheet";



export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

const NAV: Record<AppRole, { label: string; to: string }[]> = {
  admin: [
    { label: "Approve users", to: "/admin/users" },
    { label: "Students", to: "/admin/students" },
  ],
  teacher: [{ label: "Results", to: "/teacher/results" }],
  accountant: [{ label: "Fees", to: "/accountant/fees" }],
  parent: [
    { label: "Dashboard", to: "/parent/dashboard" },
    { label: "My children", to: "/parent/children" },
  ],
};

function AuthenticatedLayout() {
  const { user, profile, roles, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (user.user_metadata?.must_change_password) return <Navigate to="/change-password" />;
  if (profile?.status !== "approved") return <Navigate to="/pending" />;

  const role = primaryRole(roles);
  const items = role ? NAV[role] : [];

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:block">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <img
            src={schoolLogo}
            alt="Santa Ana CWA"
            className="h-9 w-9 object-contain"
          />
          <span className="font-serif text-sm font-semibold text-foreground">Santa Ana CWA</span>
        </div>
        <nav className="space-y-1 p-3">
          {items.map((it) => {
            const active = location.pathname.startsWith(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-6">
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Open menu">
                    ☰
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                  <div className="flex h-16 items-center gap-2 border-b border-border px-5">
                    <img
                      src={schoolLogo}
                      alt="Santa Ana CWA"
                      className="h-9 w-9 object-contain"
                    />
                    <span className="font-serif text-sm font-semibold text-foreground">Santa Ana CWA</span>
                  </div>
                  <nav className="space-y-1 p-3">
                    {items.map((it) => {
                      const active = location.pathname.startsWith(it.to);
                      return (
                        <SheetClose asChild key={it.to}>
                          <Link
                            to={it.to}
                            className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground"
                                : "text-foreground hover:bg-accent hover:text-accent-foreground"
                            }`}
                          >
                            {it.label}
                          </Link>
                        </SheetClose>
                      );
                    })}
                  </nav>
                </SheetContent>
              </Sheet>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {role ?? "user"} dashboard
              </p>
              <p className="font-serif text-base font-semibold text-foreground">
                {profile?.full_name ?? profile?.email}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await signOut();
              navigate({ to: "/" });
            }}
          >
            Sign out
          </Button>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function RoleGuard({
  allow,
  children,
}: {
  allow: AppRole[];
  children: React.ReactNode;
}) {
  const { roles } = useAuth();
  const role = primaryRole(roles);
  if (!role || !allow.includes(role)) {
    return <Navigate to={dashboardPathForRole(role)} />;
  }
  return <>{children}</>;
}
