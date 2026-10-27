CREATE TABLE public.kling_video_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  provider_task_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

ALTER TABLE public.kling_video_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kling_video_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_kling_video_quota()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  account public.profiles;
  tier text;
  quota_limit integer;
  used_count integer;
  resets_at timestamptz;
  window_start timestamptz;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO account
  FROM public.profiles
  WHERE id = current_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  tier := lower(regexp_replace(COALESCE(account.plan_name, 'free'), '^youssefco[-_ ]', ''));
  IF tier NOT IN ('free', 'pro', 'plus', 'vip') THEN
    RAISE EXCEPTION 'unknown plan tier';
  END IF;

  IF tier = 'free' THEN
    quota_limit := 3;
    window_start := now() - interval '30 days';
    SELECT count(*)::integer, min(created_at) + interval '30 days'
      INTO used_count, resets_at
    FROM public.kling_video_requests
    WHERE user_id = current_user_id AND created_at >= window_start;
  ELSE
    quota_limit := CASE tier WHEN 'pro' THEN 5 WHEN 'plus' THEN 10 ELSE 20 END;
    window_start := date_trunc('month', now());
    resets_at := date_trunc('month', now()) + interval '1 month';
    SELECT count(*)::integer
      INTO used_count
    FROM public.kling_video_requests
    WHERE user_id = current_user_id AND created_at >= window_start;
  END IF;

  RETURN jsonb_build_object(
    'tier', tier,
    'limit', quota_limit,
    'used', COALESCE(used_count, 0),
    'remaining', GREATEST(quota_limit - COALESCE(used_count, 0), 0),
    'resetsAt', resets_at
  );
END
$$;

CREATE OR REPLACE FUNCTION public.reserve_kling_video_request(_idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  account public.profiles;
  tier text;
  quota_limit integer;
  used_count integer;
  resets_at timestamptz;
  window_start timestamptz;
  request_id uuid;
  balance_after integer;
  existing_request public.kling_video_requests;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency key required';
  END IF;

  SELECT * INTO account
  FROM public.profiles
  WHERE id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  SELECT * INTO existing_request
  FROM public.kling_video_requests
  WHERE user_id = current_user_id AND idempotency_key = _idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'requestId', existing_request.id,
      'duplicate', true,
      'providerTaskId', existing_request.provider_task_id
    );
  END IF;

  tier := lower(regexp_replace(COALESCE(account.plan_name, 'free'), '^youssefco[-_ ]', ''));
  IF tier NOT IN ('free', 'pro', 'plus', 'vip') THEN
    RAISE EXCEPTION 'unknown plan tier';
  END IF;

  IF tier = 'free' THEN
    quota_limit := 3;
    window_start := now() - interval '30 days';
    SELECT count(*)::integer, min(created_at) + interval '30 days'
      INTO used_count, resets_at
    FROM public.kling_video_requests
    WHERE user_id = current_user_id AND created_at >= window_start;
  ELSE
    quota_limit := CASE tier WHEN 'pro' THEN 5 WHEN 'plus' THEN 10 ELSE 20 END;
    window_start := date_trunc('month', now());
    resets_at := date_trunc('month', now()) + interval '1 month';
    SELECT count(*)::integer
      INTO used_count
    FROM public.kling_video_requests
    WHERE user_id = current_user_id AND created_at >= window_start;

    IF COALESCE(account.balance, 0) < 2 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'insufficient_credits',
        'tier', tier,
        'limit', quota_limit,
        'used', COALESCE(used_count, 0),
        'remaining', GREATEST(quota_limit - COALESCE(used_count, 0), 0),
        'resetsAt', resets_at
      );
    END IF;
  END IF;

  IF COALESCE(used_count, 0) >= quota_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'quota_exceeded',
      'tier', tier,
      'limit', quota_limit,
      'used', COALESCE(used_count, 0),
      'remaining', 0,
      'resetsAt', resets_at
    );
  END IF;

  INSERT INTO public.kling_video_requests (user_id, idempotency_key)
  VALUES (current_user_id, _idempotency_key)
  RETURNING id INTO request_id;

  IF tier <> 'free' THEN
    UPDATE public.profiles
    SET balance = balance - 2,
        total_spent = COALESCE(total_spent, 0) + 2
    WHERE id = current_user_id
    RETURNING balance INTO balance_after;
  ELSE
    balance_after := account.balance;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'requestId', request_id,
    'duplicate', false,
    'tier', tier,
    'limit', quota_limit,
    'used', COALESCE(used_count, 0) + 1,
    'remaining', GREATEST(quota_limit - COALESCE(used_count, 0) - 1, 0),
    'resetsAt', resets_at,
    'balance', balance_after
  );
END
$$;

CREATE OR REPLACE FUNCTION public.attach_kling_video_task(_request_id uuid, _provider_task_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _provider_task_id IS NULL OR length(_provider_task_id) > 200 THEN
    RAISE EXCEPTION 'invalid provider task id';
  END IF;

  UPDATE public.kling_video_requests
  SET provider_task_id = _provider_task_id
  WHERE id = _request_id
    AND user_id = auth.uid()
    AND provider_task_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kling request not found or already attached';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_kling_video_task(_request_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  provider_task text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT provider_task_id INTO provider_task
  FROM public.kling_video_requests
  WHERE id = _request_id AND user_id = auth.uid();

  IF NOT FOUND OR provider_task IS NULL THEN
    RAISE EXCEPTION 'Kling request is not ready';
  END IF;
  RETURN provider_task;
END
$$;

REVOKE ALL ON FUNCTION public.get_kling_video_quota() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reserve_kling_video_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attach_kling_video_task(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_kling_video_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kling_video_quota() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_kling_video_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_kling_video_task(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kling_video_task(uuid) TO authenticated;
