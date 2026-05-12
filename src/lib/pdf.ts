import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const SCHOOL = "School Management System";

function header(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(SCHOOL, 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(title, 14, 24);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(subtitle, 14, 30);
    doc.setTextColor(0);
  }
}

export type FeeStatementInput = {
  studentName: string;
  className?: string;
  admissionNo?: string;
  invoices: {
    term: string;
    amount: number;
    due_date: string | null;
    status: string;
    paid: number;
  }[];
  payments: {
    paid_on: string;
    amount: number;
    method: string | null;
    receipt_no: string | null;
    term?: string;
  }[];
};

export function generateFeeStatementPdf(input: FeeStatementInput) {
  const doc = new jsPDF();
  const meta = [input.className, input.admissionNo ? `Adm ${input.admissionNo}` : null]
    .filter(Boolean)
    .join(" • ");
  header(doc, `Fee Statement — ${input.studentName}`, meta);

  const billed = input.invoices.reduce((s, i) => s + Number(i.amount), 0);
  const paid = input.invoices.reduce((s, i) => s + Number(i.paid), 0);
  const balance = billed - paid;

  autoTable(doc, {
    startY: 38,
    head: [["Term", "Amount", "Paid", "Balance", "Due", "Status"]],
    body: input.invoices.map((i) => [
      i.term,
      `NGN ${Number(i.amount).toLocaleString()}`,
      `NGN ${Number(i.paid).toLocaleString()}`,
      `NGN ${(Number(i.amount) - Number(i.paid)).toLocaleString()}`,
      i.due_date ?? "—",
      i.status,
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Billed: NGN ${billed.toLocaleString()}    Paid: NGN ${paid.toLocaleString()}    Balance: NGN ${balance.toLocaleString()}`,
    14,
    y,
  );

  if (input.payments.length > 0) {
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("Payment History", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Date", "Term", "Amount", "Method", "Receipt #"]],
      body: input.payments.map((p) => [
        p.paid_on,
        p.term ?? "—",
        `NGN ${Number(p.amount).toLocaleString()}`,
        p.method ?? "—",
        p.receipt_no ?? "—",
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, doc.internal.pageSize.getHeight() - 8);

  doc.save(`fee-statement-${input.studentName.replace(/\s+/g, "_")}.pdf`);
}

export type ResultReportInput = {
  studentName: string;
  className?: string;
  admissionNo?: string;
  results: { term: string; subject: string; score: number; grade: string | null; remarks: string | null }[];
};

export function generateResultReportPdf(input: ResultReportInput) {
  const doc = new jsPDF();
  const meta = [input.className, input.admissionNo ? `Adm ${input.admissionNo}` : null]
    .filter(Boolean)
    .join(" • ");
  header(doc, `Academic Report — ${input.studentName}`, meta);

  // Group by term
  const byTerm = new Map<string, typeof input.results>();
  for (const r of input.results) {
    const list = byTerm.get(r.term) ?? [];
    list.push(r);
    byTerm.set(r.term, list);
  }

  let startY = 38;
  for (const [term, rows] of byTerm) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(term, 14, startY);
    autoTable(doc, {
      startY: startY + 3,
      head: [["Subject", "Score", "Grade", "Remarks"]],
      body: rows.map((r) => [r.subject, r.score, r.grade ?? "—", r.remarks ?? "—"]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    const avg = rows.reduce((s, r) => s + Number(r.score), 0) / rows.length;
    startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Average: ${avg.toFixed(1)}`, 14, startY);
    startY += 8;
  }

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, doc.internal.pageSize.getHeight() - 8);

  doc.save(`result-${input.studentName.replace(/\s+/g, "_")}.pdf`);
}

export type ReceiptInput = {
  receiptNo: string;
  studentName: string;
  term: string;
  amount: number;
  paidOn: string;
  method: string | null;
};

export function generateReceiptPdf(input: ReceiptInput) {
  const doc = new jsPDF();
  header(doc, `Payment Receipt #${input.receiptNo}`);
  autoTable(doc, {
    startY: 38,
    body: [
      ["Student", input.studentName],
      ["Term", input.term],
      ["Amount", `NGN ${Number(input.amount).toLocaleString()}`],
      ["Paid on", input.paidOn],
      ["Method", input.method ?? "—"],
      ["Receipt #", input.receiptNo],
    ],
    styles: { fontSize: 10 },
  });
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, doc.internal.pageSize.getHeight() - 8);
  doc.save(`receipt-${input.receiptNo}.pdf`);
}
