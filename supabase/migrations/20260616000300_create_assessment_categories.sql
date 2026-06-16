-- Assessment categories (configurable per school system)
-- If you need per-school configuration later, extend with school_id.

BEGIN;

-- Table
CREATE TABLE IF NOT EXISTS public.assessment_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT assessment_categories_name_unique UNIQUE (name)
);

ALTER TABLE public.assessment_categories ENABLE ROW LEVEL SECURITY;

-- updated_at trigger (reuse existing function)
CREATE TRIGGER trg_assessment_categories_updated_at
BEFORE UPDATE ON public.assessment_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Policies
-- Teachers: can view categories (for selecting)
CREATE POLICY "Teachers view assessment categories"
ON public.assessment_categories
FOR SELECT
USING (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

-- Admin: manage categories
CREATE POLICY "Admins manage assessment categories"
ON public.assessment_categories
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed defaults if table empty
INSERT INTO public.assessment_categories (name, sort_order, is_active)
SELECT v.name, v.sort_order, true
FROM (VALUES
  ('CAT 1'::text, 1::int),
  ('CAT 2'::text, 2::int),
  ('Mid-Term'::text, 3::int),
  ('End-Term'::text, 4::int),
  ('Project'::text, 5::int)
) v(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.assessment_categories);

COMMIT;

