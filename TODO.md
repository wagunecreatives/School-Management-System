- [ ] Add accountant line items UI ("Line Items [+ Add Item]") to fees.tsx
- [ ] Create new DB table `fee_invoice_items` (or adapt existing schema) to persist line items
- [ ] Add mutations in accountant fees.tsx to insert/update invoice line items
- [ ] Update invoice list to allow editing line items before downloading PDF
- [ ] Update `download` to use persisted line items in `generateInvoicePdf`

