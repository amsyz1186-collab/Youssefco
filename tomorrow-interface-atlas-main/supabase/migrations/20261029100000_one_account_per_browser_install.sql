CREATE TABLE IF NOT EXISTS public.auth_device_claims (
  device_hash text PRIMARY KEY CHECK (device_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_device_claims_user_id_idx
  ON public.auth_device_claims (user_id);

ALTER TABLE public.auth_device_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_device_claims FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_auth_device(p_device_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication is required';
  END IF;

  IF p_device_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid browser identifier';
  END IF;

  INSERT INTO public.auth_device_claims (device_hash, user_id)
  VALUES (p_device_hash, current_user_id)
  ON CONFLICT (device_hash) DO NOTHING;

  RETURN EXISTS (
    SELECT 1
    FROM public.auth_device_claims
    WHERE device_hash = p_device_hash
      AND user_id = current_user_id
  );
END
$$;

REVOKE ALL ON FUNCTION public.claim_auth_device(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_auth_device(text) TO authenticated;