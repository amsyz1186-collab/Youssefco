CREATE TABLE IF NOT EXISTS public.free_trial_uses (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  studio_id text NOT NULL CHECK (
    studio_id IN (
      'auto_video',
      'animation',
      'voice',
      'dubbing',
      'app_engine',
      'image',
      'templates'
    )
  ),
  used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, studio_id)
);

ALTER TABLE public.free_trial_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_trial_uses FROM anon, authenticated;
GRANT SELECT ON public.free_trial_uses TO authenticated;

DROP POLICY IF EXISTS "users read own free trial usage" ON public.free_trial_uses;
CREATE POLICY "users read own free trial usage" ON public.free_trial_uses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

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
      AND (account.email_confirmed_at IS NOT NULL OR account.phone_confirmed_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'free trials require a verified free account without credits';
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

CREATE OR REPLACE FUNCTION public.complete_elevenlabs_dubbing(
  _user_id uuid,
  _job_id uuid,
  _output_path text,
  _file_size integer,
  _content_type text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.provider_jobs;
  account_plan text;
BEGIN
  IF auth.role() <> 'service_role'
     OR _user_id IS NULL
     OR _output_path !~ ('^' || _user_id::text || '/[^/].*$')
     OR _file_size < 0
     OR _file_size > 52428800
     OR _content_type NOT IN ('video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp3') THEN
    RAISE EXCEPTION 'invalid dubbing output';
  END IF;

  SELECT * INTO job
  FROM public.provider_jobs
  WHERE id = _job_id
    AND user_id = _user_id
    AND provider = 'elevenlabs'
    AND status = 'processing'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF job.credit_reserved THEN
    UPDATE public.profiles
    SET total_spent = total_spent + 1
    WHERE id = _user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'could not finalize reserved credit';
    END IF;
  ELSE
    SELECT lower(replace(replace(trim(coalesce(plan_name, 'free')), 'youssefco-', ''), 'youssefco_', ''))
    INTO account_plan
    FROM public.profiles
    WHERE id = _user_id;

    IF account_plan <> 'free' OR NOT EXISTS (
      SELECT 1
      FROM public.free_trial_uses
      WHERE user_id = _user_id
        AND studio_id = 'dubbing'
    ) THEN
      UPDATE public.provider_jobs SET status = 'failed' WHERE id = _job_id;
      RETURN false;
    END IF;
  END IF;

  INSERT INTO public.media_vault (
    user_id, file_name, file_type, file_url, file_size, notes
  )
  VALUES (
    _user_id,
    'Dubbed video',
    _content_type,
    _output_path,
    _file_size,
    'ElevenLabs dubbing · ' || job.target_lang
  );

  UPDATE public.provider_jobs
  SET status = 'completed',
      output_path = _output_path,
      completed_at = now(),
      credit_reserved = false
  WHERE id = _job_id;

  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION public.complete_elevenlabs_dubbing(uuid, uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_elevenlabs_dubbing(uuid, uuid, text, integer, text) TO service_role;
