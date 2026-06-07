import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const SCHOOL = "Santa Ana Calm Waters Academy";
const SCHOOL_ADDRESS = "P.O. Box 1234, School Lane, Lagos, Nigeria";
const SCHOOL_CONTACT = "Tel: +234 800 000 0000 • Email: info@santaana.school";
const SCHOOL_PAYMENT = "Bank: First Bank • Account: Santa Ana Academy • Acct No: 0123456789";

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

export type InvoiceLineItem = {
  description: string;
  period: string;
  quantity: number;
  unitPrice: number;
};

export type InvoicePdfInput = {
  invoiceNo: string;
  issueDate: string;
  dueDate: string | null;
  student: {
    fullName: string;
    admissionNo?: string | null;
    className?: string | null;
  };
  term: string;
  items: InvoiceLineItem[];
  discount?: number;
  tax?: number;
  paid?: number;
  notes?: string;
};

export function generateInvoicePdf(input: InvoicePdfInput) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  // ===== Header =====
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(SCHOOL, 14, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(SCHOOL_ADDRESS, 14, 19);
  doc.text(SCHOOL_CONTACT, 14, 24);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("INVOICE", pageW - 14, 15, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`# ${input.invoiceNo}`, pageW - 14, 22, { align: "right" });

  doc.setTextColor(0, 0, 0);

  // ===== Meta (dates + bill to) =====
  let y = 38;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Bill To", 14, y);
  doc.text("Invoice Details", pageW - 80, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 6;
  doc.text(input.student.fullName, 14, y);
  doc.text(`Issue Date: ${input.issueDate}`, pageW - 80, y);
  y += 5;
  if (input.student.admissionNo) {
    doc.text(`Adm No: ${input.student.admissionNo}`, 14, y);
  }
  doc.text(`Due Date: ${input.dueDate ?? "—"}`, pageW - 80, y);
  y += 5;
  if (input.student.className) {
    doc.text(`Class: ${input.student.className}`, 14, y);
  }
  doc.text(`Term: ${input.term}`, pageW - 80, y);
  y += 8;

  // ===== Line items =====
  const body = input.items.map((it, idx) => [
    String(idx + 1),
    it.description,
    it.period,
    String(it.quantity),
    `NGN ${Number(it.unitPrice).toLocaleString()}`,
    `NGN ${(it.quantity * it.unitPrice).toLocaleString()}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "Term / Period", "Qty", "Unit Price", "Line Total"]],
    body,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 10 },
      3: { halign: "center", cellWidth: 14 },
      4: { halign: "right", cellWidth: 30 },
      5: { halign: "right", cellWidth: 32 },
    },
  });

  const subtotal = input.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const discount = input.discount ?? 0;
  const tax = input.tax ?? 0;
  const grand = subtotal - discount + tax;
  const paid = input.paid ?? 0;
  const balance = grand - paid;

  // ===== Totals =====
  let ty = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const labelX = pageW - 80;
  const valX = pageW - 14;
  doc.setFontSize(10);

  const totalsRows: [string, string, boolean?][] = [
    ["Subtotal", `NGN ${subtotal.toLocaleString()}`],
    ["Discount", `- NGN ${discount.toLocaleString()}`],
    ["Tax / VAT", `NGN ${tax.toLocaleString()}`],
    ["Grand Total", `NGN ${grand.toLocaleString()}`, true],
    ["Paid", `NGN ${paid.toLocaleString()}`],
    ["Balance Due", `NGN ${balance.toLocaleString()}`, true],
  ];

  for (const [label, val, bold] of totalsRows) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, labelX, ty);
    doc.text(val, valX, ty, { align: "right" });
    if (bold) {
      doc.setDrawColor(200);
      doc.line(labelX, ty + 1.5, valX, ty + 1.5);
    }
    ty += 6;
  }

  // ===== Footer =====
  const footY = doc.internal.pageSize.getHeight() - 30;
  doc.setDrawColor(220);
  doc.line(14, footY, pageW - 14, footY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Payment Instructions", 14, footY + 6);
  doc.setFont("helvetica", "normal");
  doc.text(SCHOOL_PAYMENT, 14, footY + 11);
  if (input.notes) {
    doc.text(input.notes, 14, footY + 16);
  }
  doc.setFont("helvetica", "italic");
  doc.setTextColor(120);
  doc.text("Thank you for your continued partnership in your child's education.", 14, footY + 22);

  doc.save(`invoice-${input.invoiceNo}.pdf`);
}

