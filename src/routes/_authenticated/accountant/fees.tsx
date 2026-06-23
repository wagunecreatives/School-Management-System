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
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { generateInvoicePdf } from "@/lib/pdf";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/accountant/fees")({
  component: AccountantFeesPage,
});

type StudentRow = {
  id: string;
  full_name: string;
  admission_no: string | null;
  class_id: string | null;
  classes: { id: string; name: string } | null;
};

type InvoiceRow = {
  id: string;
  term: string;
  amount: number;
  due_date: string | null;
  status: string;
  deleted_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  student_id: string;
  students: {
    full_name: string;
    class_id: string | null;
    classes: { name: string } | null;
  } | null;
  fee_payments: { amount: number; receipt_no: string | null }[];
  invoice_items: { item_name: string; amount: number }[];
};

type PaymentRow = {
  id: string;
  amount: number;
  paid_on: string;
  method: string | null;
  receipt_no: string | null;
  fee_invoices: { term: string; students: { full_name: string } | null } | null;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function AccountantFeesPage() {
  const { roles, user } = useAuth();
  const role = primaryRole(roles);
  const qc = useQueryClient();

  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState("First Term");
 const [items, setItems] = useState([
  { item_name: "Tuition", amount: "" }
]);
const totalAmount = useMemo(() => {
  return items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
}, [items]);
  const [dueDate, setDueDate] = useState("");

  const [payInvoiceId, setPayInvoiceId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [receiptNo, setReceiptNo] = useState("");

  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadReport, setUploadReport] = useState<{
    matched: number;
    unmatched: { row: number; identifier: string }[];
    invoicesCreated: number;
    paymentsRecorded: number;
  } | null>(null);

  const { data: students } = useQuery({
    queryKey: ["a-students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no, class_id, classes(id, name)")
        .order("full_name");
      if (error) throw error;
      return data as StudentRow[];
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_invoices")
        .select(`
          id,
          term,
          amount,
          due_date,
          status,
          deleted_at,
          cancelled_at,
          cancel_reason,
          student_id,
          notes,
          students(full_name, class_id, classes(name)),
          fee_payments(amount, receipt_no),
          invoice_items(item_name, amount)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as InvoiceRow[];
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
        .limit(100);
      if (error) throw error;
      return data as PaymentRow[];
    },
  });

 const createInvoice = useMutation({
  mutationFn: async () => {
    // Create invoice first
    const { data: invoice, error } = await supabase
      .from("fee_invoices")
      .insert({
        student_id: studentId,
        term,
        amount: totalAmount,
        due_date: dueDate || null,
        created_by: user?.id,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Save breakdown items
    const invoiceItems = items
      .filter(
        (item) =>
          item.item_name.trim() !== "" &&
          Number(item.amount) > 0
      )
      .map((item) => ({
        invoice_id: invoice.id,
        item_name: item.item_name,
        amount: Number(item.amount),
      }));

    if (invoiceItems.length > 0) {
      const { error: itemError } = await supabase
        .from("invoice_items")
        .insert(invoiceItems);

      if (itemError) throw itemError;
    }
  },

  onSuccess: () => {
    toast.success("Invoice created");

    setStudentId("");
    setDueDate("");
    setItems([{ item_name: "", amount: "" }]);

    qc.invalidateQueries({ queryKey: ["invoices"] });
  },

  onError: (e: Error) => toast.error(e.message),
});
  const recordPayment = useMutation({
    mutationFn: async () => {
  // 1. Insert payment
  const { error: insertError } = await supabase
    .from("fee_payments")
    .insert({
      invoice_id: payInvoiceId,
      amount: Number(payAmount),
      method,
      receipt_no: receiptNo || null,
      recorded_by: user?.id,
    });

  if (insertError) throw insertError;

  // 2. Recalculate total paid from DB (source of truth)
  const { data: payments, error: payError } = await supabase
    .from("fee_payments")
    .select("amount")
    .eq("invoice_id", payInvoiceId);

  if (payError) throw payError;

  const totalPaid = payments?.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  ) || 0;

  // 3. Get invoice amount from DB
  const { data: invoice, error: invError } = await supabase
    .from("fee_invoices")
    .select("amount")
    .eq("id", payInvoiceId)
    .single();

  if (invError) throw invError;

  // 4. Determine status
  const newStatus =
    totalPaid >= Number(invoice.amount) ? "paid" : "partial";

  // 5. Update invoice status
  const { error: updateError } = await supabase
    .from("fee_invoices")
    .update({ status: newStatus })
    .eq("id", payInvoiceId);

  if (updateError) throw updateError;
},
    onSuccess: () => {
  toast.success("Invoice created");
  setStudentId("");
  setDueDate("");
  setItems([{ item_name: "Tuition", amount: "" }]);
  setNotes("");
  qc.invalidateQueries({ queryKey: ["invoices"] });
},
    onError: (e: Error) => toast.error(e.message),
  });

  // Per-class analytics
  const classAnalytics = useMemo(() => {
  if (!invoices) return [];

  const map = new Map<
    string,
    { className: string; billed: number; collected: number }
  >();

  for (const inv of invoices) {
    const className = inv.students?.classes?.name ?? "Unassigned";

    const payments = inv.fee_payments ?? []; // ✅ FIX HERE

    const paid = payments.reduce(
      (s, p) => s + Number(p.amount),
      0
    );

    const cur = map.get(className) ?? {
      className,
      billed: 0,
      collected: 0,
    };

    cur.billed += Number(inv.amount);
    cur.collected += paid;

    map.set(className, cur);
  }

  return Array.from(map.values()).map((c) => ({
    ...c,
    outstanding: Math.max(0, c.billed - c.collected),
    rate: c.billed > 0 ? Math.round((c.collected / c.billed) * 100) : 0,
  }));
}, [invoices]);

  const totals = useMemo(() => {
    const billed = classAnalytics.reduce((s, c) => s + c.billed, 0);
    const collected = classAnalytics.reduce((s, c) => s + c.collected, 0);
    return {
      billed,
      collected,
      outstanding: Math.max(0, billed - collected),
      rate: billed > 0 ? Math.round((collected / billed) * 100) : 0,
    };
  }, [classAnalytics]);

  if (role !== "accountant" && role !== "admin")
    return <Navigate to={dashboardPathForRole(role)} />;

  const onCreateInvoice = (e: FormEvent) => {
  e.preventDefault();

  if (!studentId || totalAmount <= 0) {
    toast.error("Select a student and add invoice items");
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

  const [invoiceActionId, setInvoiceActionId] = useState<string | null>(null);
  const [cancelReasonDraft, setCancelReasonDraft] = useState<string>("");

  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const anyReceiptIssuedForInvoice = (inv: InvoiceRow) => {
    return (inv.fee_payments ?? []).some((p) => Boolean(p.receipt_no));
  };

  const deleteInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("fee_invoices")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice deleted");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelInvoice = useMutation({
    mutationFn: async (args: { invoiceId: string; reason: string }) => {
      const { error } = await supabase
        .from("fee_invoices")
        .update({
          cancelled_at: new Date().toISOString(),
          cancel_reason: args.reason,
          status: "cancelled",
        } as any)
        .eq("id", args.invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice cancelled");
      setCancelReasonDraft("");
      setInvoiceActionId(null);
      setShowCancelDialog(false);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("fee_invoices")
        .update({
          deleted_at: null,
        } as any)
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice restored");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["admission_no", "full_name", "term", "amount", "due_date", "paid_amount", "method", "receipt_no"],
      ["ADM001", "Jane Doe", "First Term", 50000, "2026-09-30", 20000, "Cash", "RCP-001"],
      ["", "John Smith", "First Term", 50000, "2026-09-30", 50000, "Bank Transfer", "RCP-002"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fees");
    XLSX.writeFile(wb, "fees-template.xlsx");
  };

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!students) {
      toast.error("Students still loading, try again");
      return;
    }
    setUploading(true);
    setUploadReport(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      // Build matching indexes
      const byAdm = new Map<string, StudentRow>();
      const byName = new Map<string, StudentRow>();
      for (const s of students) {
        if (s.admission_no) byAdm.set(norm(s.admission_no), s);
        byName.set(norm(s.full_name), s);
      }

      const unmatched: { row: number; identifier: string }[] = [];
      let matched = 0;
      let invoicesCreated = 0;
      let paymentsRecorded = 0;

      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        const adm = String(r.admission_no ?? "").trim();
        const name = String(r.full_name ?? "").trim();
        const rowTerm = String(r.term ?? "First Term").trim() || "First Term";
        const amt = Number(r.amount ?? 0);
        const due = String(r.due_date ?? "").trim() || null;
        const paid = Number(r.paid_amount ?? 0);
        const meth = String(r.method ?? "").trim() || null;
        const rcpt = String(r.receipt_no ?? "").trim() || null;

        if (!amt && !paid) continue;

        const student =
          (adm && byAdm.get(norm(adm))) ||
          (name && byName.get(norm(name))) ||
          null;

        if (!student) {
          unmatched.push({ row: idx + 2, identifier: adm || name || "—" });
          continue;
        }
        matched++;

        // Find or create invoice for this student/term
        const { data: existing } = await supabase
          .from("fee_invoices")
          .select("id, amount, fee_payments(amount)")
          .eq("student_id", student.id)
          .eq("term", rowTerm)
          .maybeSingle();

        let invoiceId = existing?.id as string | undefined;
        let invoiceAmount = Number(existing?.amount ?? amt);

       if (!invoiceId) {
  const { data: created, error: ie } = await supabase
    .from("fee_invoices")
    .insert({
      student_id: student.id,
      term: rowTerm,
      amount: amt || 0,
      due_date: due,
      notes: notes || null,
      created_by: user?.id,
    })
    .select("id, amount")
    .single();

  if (ie) throw ie;

  invoiceId = created!.id;
  invoiceAmount = Number(created!.amount);

  // ✅ Create invoice breakdown item (RIGHT HERE)
  const { error: itemError } = await supabase
    .from("invoice_items")
    .insert({
      invoice_id: invoiceId,
      item_name: notes || "School Fees",
      amount: amt || 0,
    });

  if (itemError) throw itemError;

  invoicesCreated++;
        } else if (amt && Number(existing?.amount) !== amt) {
          await supabase.from("fee_invoices").update({ amount: amt }).eq("id", invoiceId);
          invoiceAmount = amt;
        }

        if (paid > 0 && invoiceId) {
          const { error: pe } = await supabase.from("fee_payments").insert({
            invoice_id: invoiceId,
            amount: paid,
            method: meth,
            receipt_no: rcpt,
            recorded_by: user?.id,
          });
          if (pe) throw pe;
          paymentsRecorded++;

          const prevPaid = (existing?.fee_payments ?? []).reduce(
            (s: number, p: { amount: number }) => s + Number(p.amount),
            0,
          );
          const totalPaid = prevPaid + paid;
          const newStatus = totalPaid >= invoiceAmount ? "paid" : "partial";
          await supabase.from("fee_invoices").update({ status: newStatus }).eq("id", invoiceId);
        }
      }

      setUploadReport({ matched, unmatched, invoicesCreated, paymentsRecorded });
      toast.success(
        `Processed ${matched} rows. ${invoicesCreated} invoices, ${paymentsRecorded} payments.`,
      );
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--muted-foreground))"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Fees</h1>
        <p className="text-sm text-muted-foreground">
          Issue invoices, record payments, bulk-import from Excel, and review collection analytics.
        </p>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-4">
        <form
  onSubmit={onCreateInvoice}
  className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-4"
>
  {/* Student */}
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

  {/* Term */}
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

  {/* Breakdown */}
  <div className="sm:col-span-2 lg:col-span-4 space-y-2">
    <Label>Invoice Breakdown</Label>

    {items.map((item, idx) => (
      <div key={idx} className="flex gap-2">
        <Input
          placeholder="Item name"
          value={item.item_name}
          onChange={(e) => {
            const copy = [...items];
            copy[idx].item_name = e.target.value;
            setItems(copy);
          }}
        />

        <Input
          type="number"
          placeholder="Amount"
          value={item.amount}
          onChange={(e) => {
            const copy = [...items];
            copy[idx].amount = e.target.value;
            setItems(copy);
          }}
        />
      </div>
    ))}

    <Button
      type="button"
      variant="outline"
      onClick={() => setItems([...items, { item_name: "", amount: "" }])}
    >
      + Add Item
    </Button>

    <p className="text-sm font-semibold">
      Total: KSh {totalAmount.toLocaleString()}
    </p>
  </div>

  {/* Notes */}
  <div className="sm:col-span-2 lg:col-span-4 space-y-2">
    <Label>Invoice Notes</Label>
    <Input
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      placeholder="e.g. Pay before 5th..."
    />
  </div>

  {/* Due Date */}
  <div className="space-y-2">
    <Label>Due date</Label>
    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
  </div>

  {/* Submit */}
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
                  <TableHead>Class</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead className="text-right">Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices?.map((i) => {
                  const paid = i.fee_payments.reduce((s, p) => s + Number(p.amount), 0);
                  const balance = Number(i.amount) - paid;
                  const invoiceNo = `INV-${new Date().getFullYear()}-${i.id.slice(0, 6).toUpperCase()}`;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.students?.full_name}</TableCell>
                      <TableCell>{i.students?.classes?.name ?? "—"}</TableCell>
                      <TableCell>{i.term}</TableCell>
                      <TableCell>KSh{Number(i.amount).toLocaleString()}</TableCell>
                      <TableCell>KSh{paid.toLocaleString()}</TableCell>
                      <TableCell>KSh{balance.toLocaleString()}</TableCell>
                      <TableCell>{i.due_date ?? "—"}</TableCell>
                      <TableCell>
                        {i.deleted_at ? (
                          <span className="text-red-600 font-medium">Deleted</span>
                        ) : i.cancelled_at ? (
                          <span className="text-orange-600 font-medium">Cancelled</span>
                        ) : (
                          <span className="text-green-600 font-medium">Active</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              generateInvoicePdf({
                                invoiceNo,
                                issueDate: new Date().toISOString().slice(0, 10),
                                dueDate: i.due_date,
                                student: {
                                  fullName: i.students?.full_name ?? "Student",
                                  className: i.students?.classes?.name ?? null,
                                },
                                term: i.term,
                                items: i.invoice_items.map((item: any) => ({
                                  description: item.item_name,
                                  period: i.term,
                                  quantity: 1,
                                  unitPrice: Number(item.amount),
                                })),
                                paid,
                              })
                            }
                          >
                            Download
                          </Button>

                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              const hasReceipt =
                                i.fee_payments?.some(
                                  (p) =>
                                    p.receipt_no &&
                                    p.receipt_no.trim() !== "",
                                ) ?? false;

                              if (hasReceipt) {
                                toast.error("Invoice has receipts. Use Cancel instead.");
                                return;
                              }

                              deleteInvoice.mutate(i.id);
                            }}
                          >
                            Delete
                          </Button>


                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const reason = prompt("Cancellation reason");

                              if (!reason) return;

                              cancelInvoice.mutate({
                                invoiceId: i.id,
                                reason,
                              });
                            }}
                          >
                            Cancel
                          </Button>

                          {i.deleted_at && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => restoreInvoice.mutate(i.id)}
                            >
                              Restore
                            </Button>
                          )}
                        </div>
                      </TableCell>

                    </TableRow>
                  );
                })}
                {invoices?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
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
                        {i.students?.full_name} — {i.term} — KSh
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
                    <TableCell>KSh{Number(p.amount).toLocaleString()}</TableCell>
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

        <TabsContent value="upload" className="space-y-4">
          <div className="space-y-4 rounded-xl border border-border bg-card p-6">
            <div>
              <h2 className="font-serif text-lg font-semibold text-foreground">Bulk import</h2>
              <p className="text-sm text-muted-foreground">
                Upload an Excel file with columns:{" "}
                <code className="rounded bg-muted px-1 text-xs">
                  admission_no, full_name, term, amount, due_date, paid_amount, method, receipt_no
                </code>
                . Students are auto-matched by admission number, then by full name.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={downloadTemplate}>
                Download template
              </Button>
              <label className="inline-flex">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={onUpload}
                  disabled={uploading}
                />
                <span className="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                  {uploading ? "Processing..." : "Upload Excel"}
                </span>
              </label>
            </div>

            {uploadReport && (
              <div className="space-y-3 rounded-lg border border-border bg-background p-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Stat label="Matched rows" value={uploadReport.matched} />
                  <Stat label="Invoices created" value={uploadReport.invoicesCreated} />
                  <Stat label="Payments recorded" value={uploadReport.paymentsRecorded} />
                  <Stat label="Unmatched" value={uploadReport.unmatched.length} />
                </div>
                {uploadReport.unmatched.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">Unmatched rows</p>
                    <ul className="mt-1 list-inside list-disc text-muted-foreground">
                      {uploadReport.unmatched.slice(0, 10).map((u) => (
                        <li key={u.row}>
                          Row {u.row}: {u.identifier}
                        </li>
                      ))}
                      {uploadReport.unmatched.length > 10 && (
                        <li>...and {uploadReport.unmatched.length - 10} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total billed" value={`KSh${totals.billed.toLocaleString()}`} />
            <Stat label="Total collected" value={`KSh${totals.collected.toLocaleString()}`} />
            <Stat label="Outstanding" value={`KSh${totals.outstanding.toLocaleString()}`} />
            <Stat label="Collection rate" value={`${totals.rate}%`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 font-serif text-base font-semibold text-foreground">
                Overall collection
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Collected", value: totals.collected },
                        { name: "Outstanding", value: totals.outstanding },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {[0, 1].map((i) => (
                        <Cell key={i} fill={PIE_COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => `KSh${Number(v).toLocaleString()}`}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 font-serif text-base font-semibold text-foreground">
                Per class
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classAnalytics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="className" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      formatter={(v: number) => `KSh${Number(v).toLocaleString()}`}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                    <Legend />
                    <Bar dataKey="collected" fill="hsl(var(--primary))" name="Collected" />
                    <Bar
                      dataKey="outstanding"
                      fill="hsl(var(--muted-foreground))"
                      name="Outstanding"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Billed</TableHead>
                  <TableHead>Collected</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classAnalytics.map((c) => (
                  <TableRow key={c.className}>
                    <TableCell className="font-medium">{c.className}</TableCell>
                    <TableCell>KSh{c.billed.toLocaleString()}</TableCell>
                    <TableCell>KSh{c.collected.toLocaleString()}</TableCell>
                    <TableCell>KSh{c.outstanding.toLocaleString()}</TableCell>
                    <TableCell>{c.rate}%</TableCell>
                  </TableRow>
                ))}
                {classAnalytics.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No data yet
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}
