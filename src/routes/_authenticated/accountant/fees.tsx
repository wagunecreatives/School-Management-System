import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole, dashboardPathForRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/accountant/fees")({
  component: AccountantFeesPage,
});

function AccountantFeesPage() {
  const { roles, user } = useAuth();
  const role = primaryRole(roles);
  const qc = useQueryClient();

  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState("First Term");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [payInvoiceId, setPayInvoiceId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [receiptNo, setReceiptNo] = useState("");

  const { data: students } = useQuery({
    queryKey: ["a-students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, classes(name)")
        .order("full_name");
      if (error) throw error;
      return data as { id: string; full_name: string; classes: { name: string } | null }[];
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_invoices")
        .select(
          "id, term, amount, due_date, status, students(full_name), fee_payments(amount)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string;
        term: string;
        amount: number;
        due_date: string | null;
        status: string;
        students: { full_name: string } | null;
        fee_payments: { amount: number }[];
      }>;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_payments")
        .select(
          "id, amount, paid_on, method, receipt_no, fee_invoices(term, students(full_name))",
        )
        .order("paid_on", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Array<{
        id: string;
        amount: number;
        paid_on: string;
        method: string | null;
        receipt_no: string | null;
        fee_invoices: { term: string; students: { full_name: string } | null } | null;
      }>;
    },
  });

  const createInvoice = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fee_invoices").insert({
        student_id: studentId,
        term,
        amount: Number(amount),
        due_date: dueDate || null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice created");
      setStudentId("");
      setAmount("");
      setDueDate("");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordPayment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fee_payments").insert({
        invoice_id: payInvoiceId,
        amount: Number(payAmount),
        method,
        receipt_no: receiptNo || null,
        recorded_by: user?.id,
      });
      if (error) throw error;
      // optionally update invoice status
      const inv = invoices?.find((i) => i.id === payInvoiceId);
      if (inv) {
        const paid = inv.fee_payments.reduce((s, p) => s + Number(p.amount), 0) + Number(payAmount);
        const newStatus = paid >= Number(inv.amount) ? "paid" : "partial";
        await supabase.from("fee_invoices").update({ status: newStatus }).eq("id", payInvoiceId);
      }
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      setPayInvoiceId("");
      setPayAmount("");
      setReceiptNo("");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "accountant" && role !== "admin")
    return <Navigate to={dashboardPathForRole(role)} />;

  const onCreateInvoice = (e: FormEvent) => {
    e.preventDefault();
    if (!studentId || !amount) {
      toast.error("Select a student and enter the amount");
      return;
    }
    createInvoice.mutate();
  };

  const onRecordPayment = (e: FormEvent) => {
    e.preventDefault();
    if (!payInvoiceId || !payAmount) {
      toast.error("Pick an invoice and enter the amount");
      return;
    }
    recordPayment.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Fees</h1>
        <p className="text-sm text-muted-foreground">
          Issue invoices and record payments.
        </p>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-4">
          <form
            onSubmit={onCreateInvoice}
            className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="space-y-2">
              <Label>Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select student" />
                </SelectTrigger>
                <SelectContent>
                  {students?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Term</Label>
              <Select value={term} onValueChange={setTerm}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="First Term">First Term</SelectItem>
                  <SelectItem value="Second Term">Second Term</SelectItem>
                  <SelectItem value="Third Term">Third Term</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={createInvoice.isPending}>
                {createInvoice.isPending ? "Saving..." : "Create invoice"}
              </Button>
            </div>
          </form>

          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices?.map((i) => {
                  const paid = i.fee_payments.reduce((s, p) => s + Number(p.amount), 0);
                  const balance = Number(i.amount) - paid;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.students?.full_name}</TableCell>
                      <TableCell>{i.term}</TableCell>
                      <TableCell>₦{Number(i.amount).toLocaleString()}</TableCell>
                      <TableCell>₦{paid.toLocaleString()}</TableCell>
                      <TableCell>₦{balance.toLocaleString()}</TableCell>
                      <TableCell>{i.due_date ?? "—"}</TableCell>
                      <TableCell className="capitalize">{i.status}</TableCell>
                    </TableRow>
                  );
                })}
                {invoices?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No invoices yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <form
            onSubmit={onRecordPayment}
            className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="space-y-2 lg:col-span-2">
              <Label>Invoice</Label>
              <Select value={payInvoiceId} onValueChange={setPayInvoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  {invoices
                    ?.filter((i) => i.status !== "paid")
                    .map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.students?.full_name} — {i.term} — ₦
                        {Number(i.amount).toLocaleString()}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="POS">POS</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>Receipt no</Label>
              <Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={recordPayment.isPending}>
                {recordPayment.isPending ? "Saving..." : "Record payment"}
              </Button>
            </div>
          </form>

          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.paid_on}</TableCell>
                    <TableCell className="font-medium">
                      {p.fee_invoices?.students?.full_name}
                    </TableCell>
                    <TableCell>{p.fee_invoices?.term}</TableCell>
                    <TableCell>₦{Number(p.amount).toLocaleString()}</TableCell>
                    <TableCell>{p.method ?? "—"}</TableCell>
                    <TableCell>{p.receipt_no ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {payments?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No payments yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
