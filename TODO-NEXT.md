# TODO-NEXT

## Completed
- N/A

## Next
1. Implement real Parent student assignments route at: src/routes/_authenticated/parent/students.$studentId.assignments.tsx
2. Filter assignments by the studentId’s class_id(s) (using parent-owned student relationship) and show in a table like the existing parent/assignments page.
3. Fix the TypeScript error `Argument of type 'string | null' is not assignable to parameter of type 'string'` by ensuring `studentId` and any URL/params passed to `Link` are always `string` (no null).
4. Validate build/typecheck for no remaining TS errors.

