CREATE OR REPLACE FUNCTION public.claim_free_trial(_studio_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication is required for free trials';
  END IF;

  IF _studio_id NOT IN (
    'auto_video',
    'animation',
    'voice',
    'dubbing',
    'app_engine',
    'image',
    'templates'
  ) THEN
    RAISE EXCEPTION 'unsupported free trial studio';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN auth.users AS account ON account.id = profile.id
    WHERE profile.id = auth.uid()
      AND lower(replace(replace(trim(coalesce(profile.plan_name, 'free')), 'youssefco-', ''), 'youssefco_', '')) = 'free'
      AND coalesce(profile.balance, 0) = 0
      AND account.email IS NOT NULL
      AND account.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'free trials require a verified email and a free account without credits';
  END IF;

  INSERT INTO public.free_trial_uses (user_id, studio_id)
  VALUES (auth.uid(), _studio_id)
  ON CONFLICT (user_id, studio_id) DO NOTHING;

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  RETURN inserted_rows = 1;
END
$$;

REVOKE ALL ON FUNCTION public.claim_free_trial(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_free_trial(text) TO authenticated;
