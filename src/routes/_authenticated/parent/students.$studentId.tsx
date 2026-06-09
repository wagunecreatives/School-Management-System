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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { generateFeeStatementPdf, generateResultReportPdf } from "@/lib/pdf";

export const Route = createFileRoute("/_authenticated/parent/students/$studentId")({
  component: StudentProfilePage,
});

function StudentProfilePage() {
  const { roles, user } = useAuth();
  const role = primaryRole(roles);
  const { studentId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["parent-student", studentId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, full_name, admission_no, parent_id, classes(name), fee_invoices(id, term, amount, due_date, status, fee_payments(id, amount, paid_on, method, receipt_no)), results(id, term, score, grade, remarks, subjects(name))",
        )
        .eq("id", studentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (role !== "parent") return <Navigate to={dashboardPathForRole(role)} />;
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  // RLS already restricts to parent's own; extra guard:
  if (!data || data.parent_id !== user?.id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not found</CardTitle>
          <CardDescription>
            This student is not linked to your account.{" "}
            <Link to="/parent/dashboard" className="text-primary underline">
              Back to dashboard
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const billed = data.fee_invoices.reduce((s, i) => s + Number(i.amount), 0);
  const paid = data.fee_invoices.reduce(
    (s, i) => s + i.fee_payments.reduce((x, p) => x + Number(p.amount), 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Link
            to="/parent/dashboard"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-1 font-serif text-2xl font-bold text-foreground">
            {data.full_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.classes?.name ?? "Unassigned class"}
            {data.admission_no ? ` • Admission ${data.admission_no}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              generateFeeStatementPdf({
                studentName: data.full_name,
                className: data.classes?.name,
                admissionNo: data.admission_no ?? undefined,
                invoices: data.fee_invoices.map((i) => ({
                  term: i.term,
                  amount: Number(i.amount),
                  due_date: i.due_date,
                  status: i.status,
                  paid: i.fee_payments.reduce((s, p) => s + Number(p.amount), 0),
                })),
                payments: data.fee_invoices.flatMap((i) =>
                  i.fee_payments.map((p) => ({
                    paid_on: p.paid_on,
                    amount: Number(p.amount),
                    method: p.method,
                    receipt_no: p.receipt_no,
                    term: i.term,
                  })),
                ),
              })
            }
          >
            <Download /> Fee statement
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              generateResultReportPdf({
                studentName: data.full_name,
                className: data.classes?.name,
                admissionNo: data.admission_no ?? undefined,
                results: data.results.map((r) => ({
                  term: r.term,
                  subject: r.subjects?.name ?? "—",
                  score: Number(r.score),
                  grade: r.grade,
                  remarks: r.remarks,
                })),
              })
            }
          >
            <Download /> Result report
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Billed" value={`KSh${billed.toLocaleString()}`} />
        <SummaryCard label="Paid" value={`KSh${paid.toLocaleString()}`} />
        <SummaryCard
          label="Balance"
          value={`KSh${(billed - paid).toLocaleString()}`}
          highlight={billed - paid > 0}
        />
      </div>

      <Tabs defaultValue="fees">
        <TabsList>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="payments">Payment history</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="fees">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Term</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.fee_invoices.map((i) => {
                    const p = i.fee_payments.reduce(
                      (s, x) => s + Number(x.amount),
                      0,
                    );
                    return (
                      <TableRow key={i.id}>
                        <TableCell>{i.term}</TableCell>
                        <TableCell>KSh{Number(i.amount).toLocaleString()}</TableCell>
                        <TableCell>KSh{p.toLocaleString()}</TableCell>
                        <TableCell>{i.due_date ?? "—"}</TableCell>
                        <TableCell className="capitalize">{i.status}</TableCell>
                      </TableRow>
                    );
                  })}
                  {data.fee_invoices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No invoices yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Receipt #</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.fee_invoices
                    .flatMap((i) => i.fee_payments)
                    .sort((a, b) => (a.paid_on < b.paid_on ? 1 : -1))
                    .map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.paid_on}</TableCell>
                        <TableCell>KSh{Number(p.amount).toLocaleString()}</TableCell>
                        <TableCell>{p.method ?? "—"}</TableCell>
                        <TableCell>{p.receipt_no ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  {data.fee_invoices.flatMap((i) => i.fee_payments).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No payments recorded
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results">
          <Card>
            <CardContent className="pt-6">
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
                  {data.results.map((r) => (
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
                  {data.results.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No results yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
