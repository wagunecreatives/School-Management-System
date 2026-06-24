-- RLS + policies for assignments so teacher list and parent assignments work

alter table public.assignments enable row level security;

-- TEACHERS: manage their own assignments
create policy "teachers select own assignments" on public.assignments
for select
using (
  teacher_id = auth.uid()
);

create policy "teachers insert own assignments" on public.assignments
for insert
with check (
  teacher_id = auth.uid()
);

create policy "teachers update own assignments" on public.assignments
for update
using (
  teacher_id = auth.uid()
)
with check (
  teacher_id = auth.uid()
);

create policy "teachers delete own assignments" on public.assignments
for delete
using (
  teacher_id = auth.uid()
);

-- PARENTS: can see assignments for their children's classes
create policy "parents select assignments for own children classes" on public.assignments
for select
using (
  exists (
    select 1
    from public.students s
    where s.class_id = public.assignments.class_id
      and s.parent_id = auth.uid()
  )
);

-- ADMINS: allow full access
create policy "admins manage all assignments" on public.assignments
for all
using (
  public.has_role(auth.uid(), 'admin')
)
with check (
  public.has_role(auth.uid(), 'admin')
);

