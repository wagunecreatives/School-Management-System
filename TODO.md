# TODO - Results Sheet PDF Update

## Step 1: Inspect existing PDF generator and results UI
- [x] Read `src/lib/pdf.ts`
- [x] Read `src/routes/_authenticated/teacher/results.tsx`

## Step 2: Unify grading system source of truth
- [ ] Add grading rules type to `src/lib/pdf.ts` input
- [ ] Remove hardcoded RUBRIC from `src/lib/pdf.ts` and compute grades from provided rules
- [ ] Update `src/routes/_authenticated/teacher/results.tsx` to use the same grading rules when saving and generating PDFs

## Step 3: Enhance PDF content per requirements
- [ ] Ensure student table columns match exactly: Admission No, Student Name, Score, Grade, Remarks
- [ ] Ensure grade distribution is generated dynamically from grading rules
- [ ] Improve footer page number reliability on multi-page PDFs

## Step 4: Testing
- [ ] Run typecheck/build
- [ ] Generate a PDF for a class with many students and verify header repetition and footer

