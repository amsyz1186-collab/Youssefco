CREATE TABLE IF NOT EXISTS public.free_trial_device_claims (
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
  device_hash text NOT NULL CHECK (device_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (studio_id, device_hash),
  UNIQUE (studio_id, ip_hash)
);

CREATE INDEX IF NOT EXISTS free_trial_device_claims_expiry_idx
  ON public.free_trial_device_claims (expires_at);

ALTER TABLE public.free_trial_device_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_trial_device_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.free_trial_device_claims TO service_role;

CREATE OR REPLACE FUNCTION public.claim_free_trial(
  _user_id uuid,
  _studio_id text,
  _device_hash text,
  _ip_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_rows integer;
BEGIN
  IF auth.role() <> 'service_role' OR _user_id IS NULL THEN
    RAISE EXCEPTION 'trusted server role and user are required for free trials';
  END IF;

  IF _studio_id NOT IN (
    'auto_video',
    'animation',
    'voice',
    'dubbing',
    'app_engine',
    'image',
    'templates'
  ) OR _device_hash !~ '^[0-9a-f]{64}$'
     OR (_ip_hash IS NOT NULL AND _ip_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'invalid free-trial device identifiers';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN auth.users AS account ON account.id = profile.id
    WHERE profile.id = _user_id
      AND lower(replace(replace(trim(coalesce(profile.plan_name, 'free')), 'youssefco-', ''), 'youssefco_', '')) = 'free'
      AND coalesce(profile.balance, 0) = 0
      AND account.email IS NOT NULL
      AND account.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'free trials require a verified email and a free account without credits';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _studio_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(_studio_id || ':' || _device_hash, 0));
  IF _ip_hash IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(_studio_id || ':' || _ip_hash, 0));
  END IF;

  DELETE FROM public.free_trial_device_claims
  WHERE expires_at <= now();

  IF EXISTS (
    SELECT 1
    FROM public.free_trial_uses
    WHERE user_id = _user_id
      AND studio_id = _studio_id
  ) OR EXISTS (
    SELECT 1
    FROM public.free_trial_device_claims
    WHERE studio_id = _studio_id
      AND expires_at > now()
      AND (
        device_hash = _device_hash
        OR (_ip_hash IS NOT NULL AND ip_hash = _ip_hash)
      )
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.free_trial_device_claims (studio_id, device_hash, ip_hash, expires_at)
  VALUES (_studio_id, _device_hash, _ip_hash, now() + interval '30 days')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  IF inserted_rows <> 1 THEN
    RETURN false;
  END IF;

  INSERT INTO public.free_trial_uses (user_id, studio_id)
  VALUES (_user_id, _studio_id)
  ON CONFLICT (user_id, studio_id) DO NOTHING;
  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  IF inserted_rows <> 1 THEN
    DELETE FROM public.free_trial_device_claims
    WHERE studio_id = _studio_id
      AND device_hash = _device_hash;
    RETURN false;
  END IF;

  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION public.claim_free_trial(text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.claim_free_trial(text);
REVOKE ALL ON FUNCTION public.claim_free_trial(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_free_trial(uuid, text, text, text) TO service_role;
