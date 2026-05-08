# Santa Ana Calm Waters Academy — School Management System

A unified platform for Admin, Teachers, Accountants, and Parents covering user management, students, fees, and results.

## Scope (Phase 1)

### Authentication & Roles
- Email/password + Google sign-in
- Self-signup creates user with status = `pending`
- Admin approves/rejects pending users and assigns role
- Roles: `admin`, `teacher`, `accountant`, `parent` (stored in `user_roles` table)
- Strict RBAC via RLS + route guards; each role lands on its own dashboard

### Student Management (Admin)
- CRUD students: name, class, parent (linked to one parent user)
- View students grouped by class / by parent

### Fees (Accountant + Parent view)
- Accountant records fee invoices per student (term, amount, due date)
- Records payments against invoices (amount, date, method, receipt #)
- Parents see their children's invoices, balance, and payment history

### Results (Teacher + Parent view)
- Teacher enters subject scores per student per term (subject, score, grade, remarks)
- Parents see their children's results per term
- Admin can view all

### Dashboards
- Admin: pending approvals, totals (students, staff, parents), quick links
- Teacher: assigned classes, enter results
- Accountant: fees overview, record payment
- Parent: children list → fees + results per child

## Database Schema

```text
profiles            (id=auth.uid, full_name, email, status: pending|approved|rejected, created_at)
user_roles          (id, user_id, role: admin|teacher|accountant|parent)  -- separate, RLS-safe
classes             (id, name)                                            -- e.g. JSS1, Primary 3
students            (id, full_name, class_id, parent_id->profiles, admission_no, created_at)
fee_invoices        (id, student_id, term, amount, due_date, status, created_by, created_at)
fee_payments        (id, invoice_id, amount, paid_on, method, receipt_no, recorded_by)
subjects            (id, name)
results             (id, student_id, subject_id, term, score, grade, remarks, teacher_id, created_at)
```

Security:
- `has_role(uid, role)` SECURITY DEFINER function
- Trigger on `auth.users` insert → create `profiles` row with status `pending`
- First registered user auto-promoted to `admin` + `approved` (bootstrap)
- RLS on every table; parents only see their own children's data; teachers only enter results; accountants only manage fees; admin full access

## Routes

```text
/                       Landing (school name + login/register)
/login, /register
/pending                Shown to approved=false users
/_authenticated/
  dashboard             Role-aware redirect
  admin/users           Approve users, assign roles
  admin/students        Manage students + classes
  teacher/results       Enter / view results
  accountant/fees       Invoices + payments
  parent/children       Children → fees + results tabs
```

## Tech
TanStack Start routes with `_authenticated` guard, role checks via `has_role`. shadcn UI, Tailwind tokens in `src/styles.css` with a clean, calm academic palette (deep teal + warm sand accents, serif display + clean sans body). React Query for data.

## Out of scope (can add later)
Attendance, timetable, messaging, report card PDF export, bulk import, SMS/email notifications, multi-term/year config UI.

Reply **approve** to proceed, or tell me what to change.