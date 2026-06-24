-- Assignment submissions: student/parent uploads answered papers; teacher marks done

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,

  -- uploaded answered paper for this assignment
  attachment_url text,

  -- lifecycle
  status text not null default 'pending' check (status in ('pending','done')),

  -- teacher marking
  teacher_id uuid,
  teacher_marked boolean not null default false,
  teacher_marked_at timestamp with time zone,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),

  -- each student submits once per assignment
  constraint assignment_submissions_assignment_student_key unique (assignment_id, student_id)
);

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assignment_submissions_updated_at on public.assignment_submissions;
create trigger trg_assignment_submissions_updated_at
before update on public.assignment_submissions
for each row execute function public.set_updated_at();

create index if not exists idx_assignment_submissions_student_id on public.assignment_submissions (student_id);
create index if not exists idx_assignment_submissions_assignment_id on public.assignment_submissions (assignment_id);
create index if not exists idx_assignment_submissions_teacher_marked on public.assignment_submissions (teacher_marked);

-- RLS
alter table public.assignment_submissions enable row level security;

-- SELECT: parent can view submissions for their linked students
create policy "parent can view assignment submissions for own students"
on public.assignment_submissions
for select
using (
  exists (
    select 1
    from public.students s
    where s.id = assignment_submissions.student_id
      and s.parent_id = auth.uid()
  )
);

-- INSERT/UPDATE: parent can upload submission for their linked students
create policy "parent can upsert assignment submissions for own students"
on public.assignment_submissions
for insert
with check (
  exists (
    select 1
    from public.students s
    where s.id = assignment_submissions.student_id
      and s.parent_id = auth.uid()
  )
);

create policy "parent can update own assignment submissions"
on public.assignment_submissions
for update
using (
  exists (
    select 1
    from public.students s
    where s.id = assignment_submissions.student_id
      and s.parent_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.students s
    where s.id = assignment_submissions.student_id
      and s.parent_id = auth.uid()
  )
);

-- TEACHER: allow mark done for submissions where the teacher owns the assignment
create policy "teacher can update submission when marking done"
on public.assignment_submissions
for update
using (
  exists (
    select 1
    from public.assignments a
    where a.id = assignment_submissions.assignment_id
      and a.teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.assignments a
    where a.id = assignment_submissions.assignment_id
      and a.teacher_id = auth.uid()
  )
);

