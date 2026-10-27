CREATE TABLE IF NOT EXISTS public.provider_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider = 'elevenlabs'),
  external_id text NOT NULL,
  source_path text NOT NULL,
  target_lang text NOT NULL,
  credit_reserved boolean NOT NULL DEFAULT false,
  free_trial boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  output_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS provider_jobs_user_created_idx
  ON public.provider_jobs (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS provider_jobs_free_dubbing_once_idx
  ON public.provider_jobs (user_id, provider)
  WHERE free_trial;

ALTER TABLE public.provider_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_jobs FROM anon;
GRANT SELECT ON public.provider_jobs TO authenticated;

DROP POLICY IF EXISTS "users manage own provider jobs" ON public.provider_jobs;
DROP POLICY IF EXISTS "users read own provider jobs" ON public.provider_jobs;
CREATE POLICY "users read own provider jobs" ON public.provider_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_elevenlabs_dubbing_job(
  _user_id uuid,
  _job_id uuid,
  _source_path text,
  _target_lang text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' OR _user_id IS NULL OR _job_id IS NULL THEN
    RAISE EXCEPTION 'trusted server role, user, and job identifier are required';
  END IF;

  IF _source_path !~ ('^' || _user_id::text || '/[^/].*$')
     OR _target_lang !~ '^[a-z]{2,3}$' THEN
    RAISE EXCEPTION 'invalid dubbing source or target language';
  END IF;

  INSERT INTO public.provider_jobs (
    id, user_id, provider, external_id, source_path, target_lang, credit_reserved, free_trial
  )
  SELECT
    _job_id,
    _user_id,
    'elevenlabs',
    _job_id::text,
    _source_path,
    _target_lang,
    account.balance > 0,
    account.balance = 0
  FROM public.profiles AS account
  WHERE account.id = _user_id
    AND (
      account.balance > 0
      OR (
        lower(replace(replace(trim(coalesce(account.plan_name, 'free')), 'youssefco-', ''), 'youssefco_', '')) = 'free'
        AND EXISTS (
          SELECT 1
          FROM public.free_trial_uses AS trial
          WHERE trial.user_id = _user_id
            AND trial.studio_id = 'dubbing'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.provider_jobs AS existing_job
          WHERE existing_job.user_id = _user_id
            AND existing_job.provider = 'elevenlabs'
            AND existing_job.free_trial
        )
      )
    )
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no available credit or dubbing trial';
  END IF;

  UPDATE public.profiles
  SET balance = balance - 1
  WHERE id = _user_id
    AND balance > 0;

  IF NOT FOUND AND NOT EXISTS (
    SELECT 1
    FROM public.provider_jobs
    WHERE id = _job_id
      AND user_id = _user_id
      AND free_trial
  ) THEN
    RAISE EXCEPTION 'no available credit or dubbing trial';
  END IF;
  RETURN _job_id;
END
$$;

CREATE OR REPLACE FUNCTION public.set_elevenlabs_dubbing_external_id(
  _user_id uuid,
  _job_id uuid,
  _external_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' OR _user_id IS NULL THEN
    RAISE EXCEPTION 'trusted server role and user are required';
  END IF;
  IF _external_id IS NULL OR length(_external_id) > 128 THEN
    RAISE EXCEPTION 'invalid dubbing provider identifier';
  END IF;

  UPDATE public.provider_jobs
  SET external_id = _external_id
  WHERE id = _job_id
    AND user_id = _user_id
    AND provider = 'elevenlabs'
    AND status = 'processing'
    AND external_id = _job_id::text;
  RETURN FOUND;
END
$$;

REVOKE ALL ON FUNCTION public.create_elevenlabs_dubbing_job(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_elevenlabs_dubbing_job(uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.set_elevenlabs_dubbing_external_id(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_elevenlabs_dubbing_external_id(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_elevenlabs_dubbing_job(_user_id uuid, _job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.provider_jobs;
BEGIN
  IF auth.role() <> 'service_role' OR _user_id IS NULL THEN
    RAISE EXCEPTION 'trusted server role and user are required';
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
    SET balance = balance + 1
    WHERE id = _user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'could not restore reserved credit';
    END IF;
  END IF;

  UPDATE public.provider_jobs
  SET status = 'failed', credit_reserved = false
  WHERE id = _job_id;
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION public.fail_elevenlabs_dubbing_job(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_elevenlabs_dubbing_job(uuid, uuid) TO service_role;
