import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole, dashboardPathForRole } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/parent/dashboard")({
  component: ParentDashboardPage,
});

function ParentDashboardPage() {
  const { roles, user, profile } = useAuth();
  const role = primaryRole(roles);

  const { data: children, isLoading } = useQuery({
    queryKey: ["parent-dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, full_name, admission_no, classes(name), fee_invoices(amount, fee_payments(amount)), results(id)",
        )
        .eq("parent_id", user!.id);
      if (error) throw error;
      return data as Array<{
        id: string;
        full_name: string;
        admission_no: string | null;
        classes: { name: string } | null;
        fee_invoices: Array<{ amount: number; fee_payments: { amount: number }[] }>;
        results: { id: string }[];
      }>;
    },
  });

  if (role !== "parent") return <Navigate to={dashboardPathForRole(role)} />;

  const totalChildren = children?.length ?? 0;
  let billed = 0;
  let paid = 0;
  let resultsCount = 0;
  for (const c of children ?? []) {
    for (const inv of c.fee_invoices) {
      billed += Number(inv.amount);
      for (const p of inv.fee_payments) paid += Number(p.amount);
    }
    resultsCount += c.results.length;
  }
  const balance = billed - paid;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">
          Welcome, {profile?.full_name ?? "Parent"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Overview of your children at Santa Ana Calm Waters Academy.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Children" value={totalChildren.toString()} />
        <SummaryCard label="Total billed" value={`KSh${billed.toLocaleString()}`} />
        <SummaryCard label="Total paid" value={`KSh${paid.toLocaleString()}`} />
        <SummaryCard
          label="Outstanding"
          value={`KSh${balance.toLocaleString()}`}
          highlight={balance > 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Your children</CardTitle>
          <CardDescription>
            {resultsCount} result {resultsCount === 1 ? "entry" : "entries"} on file
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && totalChildren === 0 && (
            <p className="text-sm text-muted-foreground">
              No children linked yet. The school admin will add them to your account.
            </p>
          )}
          {children?.map((c) => (
            <Link
              key={c.id}
              to="/parent/students/$studentId"
              params={{ studentId: c.id }}
              className="flex items-center justify-between rounded-md border border-border bg-card p-3 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <div>
                <p className="font-medium">{c.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.classes?.name ?? "Unassigned"}
                  {c.admission_no ? ` • ${c.admission_no}` : ""}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">View profile →</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p
          className={`font-serif text-2xl font-bold ${
            highlight ? "text-destructive" : "text-foreground"
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
