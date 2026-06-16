# Next TODO (Term + Assessment Category)

- [ ] Create Supabase migration:
  - assessment_categories table (name, sort_order, is_active)
  - add assessment_category_id to results
  - update results unique constraint: student_id + subject_id + term + assessment_category_id
  - add RLS/select/insert policies for teacher
- [ ] Update teacher results UI:
  - fetch assessment_categories
  - add Assessment Category dropdown
  - update upsert payload + onConflict
  - update recent results table
  - update Excel template + parsing
- [ ] Update parent student profile results table
- [ ] Update PDF report generation and call site
- [ ] Re-run `npm run build` after changes

