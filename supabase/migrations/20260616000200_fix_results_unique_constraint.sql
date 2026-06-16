-- Fix/ensure results unique constraint includes assessment_category_id
-- Safe migration: drop the old unique constraint(s) and recreate the new one.

DO $$
DECLARE
  con RECORD;
BEGIN
  -- Drop any unique constraints on results that match the old columns (student_id, subject_id, term)
  FOR con IN
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
    EXECUTE format('ALTER TABLE public.results DROP CONSTRAINT IF EXISTS %I', con.constraint_name);
  END LOOP;

  -- Create the expected constraint if missing
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'results'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'results_student_subject_term_assessment_unique'
  ) THEN
    ALTER TABLE public.results
      ADD CONSTRAINT results_student_subject_term_assessment_unique
      UNIQUE (student_id, subject_id, term, assessment_category_id);
  END IF;
END $$;

