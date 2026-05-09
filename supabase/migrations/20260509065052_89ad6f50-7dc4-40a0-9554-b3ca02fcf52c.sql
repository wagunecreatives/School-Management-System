CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_first BOOLEAN;
  _invited_role TEXT;
  _status public.user_status;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO _is_first;
  _invited_role := NEW.raw_user_meta_data->>'invited_role';

  IF _is_first OR _invited_role IS NOT NULL THEN
    _status := 'approved';
  ELSE
    _status := 'pending';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    _status
  );

  IF _is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSIF _invited_role IN ('teacher','accountant','parent') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _invited_role::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();