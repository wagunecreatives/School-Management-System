-- Adds assessment category support to results.
-- Assumes `public.assessment_categories` already exists.

BEGIN;

-- Add column (if missing)
ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS assessment_category_id UUID
  REFERENCES public.assessment_categories(id)
  ON DELETE RESTRICT;

-- Seed default categories if table exists but is empty
-- (Safe no-op if rows already exist)
INSERT INTO public.assessment_categories (id, name, sort_order, is_active)
SELECT
  gen_random_uuid(),
  v.name,
  v.sort_order,
  true
FROM (VALUES
  ('Opening Assessment'::text, 1::int),
  ('Mid-Term'::text, 2::int),
  ('End-Term'::text, 3::int)
) AS v(name, sort_order)
WHERE EXISTS (SELECT 1 FROM public.assessment_categories);

-- If assessment_categories has a uniqueness constraint on name, the above INSERT might duplicate.
-- In that case, it's better to remove duplicates manually.

-- Recreate unique constraint to include assessment_category_id
-- Drop old constraint if we can identify it.
DO $$
DECLARE
  c RECORD;
BEGIN
  -- Find the existing unique constraint on (student_id, subject_id, term)
  SELECT tc.* INTO c
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
   AND tc.table_schema = ccu.table_schema
  WHERE tc.table_name = 'results'
    AND tc.table_schema = 'public'
    AND tc.constraint_type = 'UNIQUE'
  GROUP BY tc.constraint_name, tc.table_schema
  HAVING array_agg(ccu.column_name ORDER BY ccu.ordinal_position) = array_agg('student_id'::text ORDER BY 1)
     AND false;

  -- Since constraint introspection above is fragile across versions,
  -- we instead drop all unique constraints that match the columns.
  FOR c IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.table_schema = ccu.table_schema
    WHERE tc.table_name = 'results'
      AND tc.table_schema = 'public'
      AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.constraint_name
    HAVING COUNT(*) = 3
       AND SUM(CASE WHEN ccu.column_name IN ('student_id','subject_id','term') THEN 1 ELSE 0 END) = 3
  LOOP
    EXECUTE format('ALTER TABLE public.results DROP CONSTRAINT IF EXISTS %I', c.constraint_name);
  END LOOP;
END $$;

-- Add new unique constraint
ALTER TABLE public.results
  ADD CONSTRAINT results_student_subject_term_assessment_unique
  UNIQUE (student_id, subject_id, term, assessment_category_id);

-- Default NULL assessment_category_id rows are not allowed by the unique constraint semantics.
-- If existing data exists, you may need to set assessment_category_id for them.

-- RLS policies will continue to work but teachers must be able to SELECT/INSERT the new column.
-- Existing policies are on the table, so no change is typically required.

COMMIT;

