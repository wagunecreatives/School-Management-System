# TODO - Term + Assessment Category Results

- [ ] Supabase DB changes (schema + migration)
  - [x] Create/verify `assessment_categories` table (configurable per school) 

  - [x] Add `assessment_category_id` UUID FK -> assessment_categories
  - [x] Update UNIQUE constraint to include `assessment_category_id` (allow multiple assessments per student/subject/term)

  - [ ] Add/adjust RLS policies for the new column (teacher insert/update/select)



- [ ] Frontend: Teacher Results module (`src/routes/_authenticated/teacher/results.tsx`)
  - [ ] Fetch assessment categories from DB
  - [ ] Replace single Term select with:
    - [ ] Term select (Term 1/2/3)
    - [ ] Assessment Category select (from DB)
  - [ ] Save/Upsert result including `assessment_category_id`
  - [ ] Update onConflict to: `student_id,subject_id,term,assessment_category_id`
  - [ ] Recent Results table: display Term + Assessment Category
  - [ ] Excel bulk upload:
    - [ ] Template headers: admission_no, full_name, subject, term, assessment_category, score, remarks
    - [ ] Parse these columns
    - [ ] Upsert using `assessment_category_id`
    - [ ] Auto-create new subjects (keep existing behavior)

- [ ] Frontend: Parent report cards
  - [ ] Update `src/routes/_authenticated/parent/students.$studentId.tsx` results table to show Term + Assessment Category

- [ ] Frontend: PDF reports
  - [ ] Update `src/lib/pdf.ts` Result report generator to include Assessment Category
  - [ ] Update call site in `src/routes/_authenticated/parent/students.$studentId.tsx`

- [ ] Testing
  - [ ] TypeScript build passes
  - [ ] Insert single results for different assessment categories in same term succeeds
  - [ ] Bulk upload with multiple assessments per term succeeds

