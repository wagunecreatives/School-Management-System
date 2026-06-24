-- Create assignments table for teacher-created homework/assignments
-- Intended to match the Teacher Assignment form fields.

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  instructions text not null,
  subject_id uuid,
  class_id uuid,
  teacher_id uuid,
  due_date timestamp,
  marks integer,
  attachment_url text,
  status text default 'active',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assignments_updated_at on public.assignments;
create trigger trg_assignments_updated_at
before update on public.assignments
for each row execute function public.set_updated_at();

-- Optional indexes for common filtering
create index if not exists idx_assignments_teacher_id on public.assignments (teacher_id);
create index if not exists idx_assignments_class_id on public.assignments (class_id);
create index if not exists idx_assignments_subject_id on public.assignments (subject_id);

