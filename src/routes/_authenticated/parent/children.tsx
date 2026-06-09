import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole, dashboardPathForRole } from "@/lib/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/parent/children")({
  component: ParentChildrenPage,
});

function ParentChildrenPage() {
  const { roles, user } = useAuth();
  const role = primaryRole(roles);

  const { data: children } = useQuery({
    queryKey: ["my-children", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, full_name, admission_no, classes(name), fee_invoices(id, term, amount, status, fee_payments(amount)), results(id, term, score, grade, remarks, subjects(name))",
        )
        .eq("parent_id", user!.id);
      if (error) throw error;
      return data as Array<{
        id: string;
        full_name: string;
        admission_no: string | null;
        classes: { name: string } | null;
        fee_invoices: Array<{
          id: string;
          term: string;
          amount: number;
          status: string;
          fee_payments: { amount: number }[];
        }>;
        results: Array<{
          id: string;
          term: string;
          score: number;
          grade: string | null;
          remarks: string | null;
          subjects: { name: string } | null;
        }>;
      }>;
    },
  });

  if (role !== "parent") return <Navigate to={dashboardPathForRole(role)} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">My children</h1>
        <p className="text-sm text-muted-foreground">
          Track fees and academic results for each of your children.
        </p>
      </div>

      {children?.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No children linked yet</CardTitle>
            <CardDescription>
              The school admin will add your children to your account.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="space-y-6">
        {children?.map((child) => {
          const totalDue = child.fee_invoices.reduce((s, i) => s + Number(i.amount), 0);
          const totalPaid = child.fee_invoices.reduce(
            (s, i) => s + i.fee_payments.reduce((x, p) => x + Number(p.amount), 0),
            0,
          );
          return (
            <Card key={child.id}>
              <CardHeader>
                <CardTitle className="font-serif">{child.full_name}</CardTitle>
                <CardDescription>
                  {child.classes?.name ?? "Unassigned class"}
                  {child.admission_no ? ` • ${child.admission_no}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="fees">
                  <TabsList>
                    <TabsTrigger value="fees">Fees</TabsTrigger>
                    <TabsTrigger value="results">Results</TabsTrigger>
                  </TabsList>
                  <TabsContent value="fees" className="space-y-3">
                    <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-secondary/30 p-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Total billed</p>
                        <p className="font-semibold">KSh{totalDue.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Paid</p>
                        <p className="font-semibold">KSh{totalPaid.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Balance</p>
                        <p className="font-semibold">
                          KSh{(totalDue - totalPaid).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Term</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Paid</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {child.fee_invoices.map((i) => {
                          const paid = i.fee_payments.reduce(
                            (s, p) => s + Number(p.amount),
                            0,
                          );
                          return (
                            <TableRow key={i.id}>
                              <TableCell>{i.term}</TableCell>
                              <TableCell>KSh{Number(i.amount).toLocaleString()}</TableCell>
                              <TableCell>KSh{paid.toLocaleString()}</TableCell>
                              <TableCell className="capitalize">{i.status}</TableCell>
                            </TableRow>
                          );
                        })}
                        {child.fee_invoices.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              No invoices yet
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>
                  <TabsContent value="results">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Term</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Remarks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {child.results.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{r.term}</TableCell>
                            <TableCell>{r.subjects?.name}</TableCell>
                            <TableCell>{r.score}</TableCell>
                            <TableCell>{r.grade ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {r.remarks ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {child.results.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                              No results yet
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
