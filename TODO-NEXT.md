# TODO-NEXT

- [ ] Implement parent assignment details page (`src/routes/_authenticated/parent/students.$studentId.assignments.tsx`) to list assignments by student.class_id and show:
  - title, due date, instructions
  - direct attachment download using `assignments.attachment_url`
  - submission/upload status using `assignment_submissions` table
- [ ] Improve parent assignments landing page (`src/routes/_authenticated/parent/assignments.tsx`) to:
  - remove debug logs
  - ensure "View details" passes the correct child for the assignment’s class_id
  - avoid referencing `a.classes.name` unless fetched
- [ ] Quick manual test in UI:
  - parent sees assignments for their children’s classes
  - download works
  - submission status displays correctly

