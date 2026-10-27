CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_session_id uuid,
  event_type text NOT NULL,
  event_name text NOT NULL,
  route text,
  target text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_events_identity_check CHECK (user_id IS NOT NULL OR anonymous_session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS activity_events_user_created_idx
  ON public.activity_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_type_created_idx
  ON public.activity_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_anonymous_created_idx
  ON public.activity_events (anonymous_session_id, created_at DESC)
  WHERE anonymous_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  )
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.activity_events FROM anon, authenticated;
GRANT SELECT ON public.activity_events TO authenticated;

DROP POLICY IF EXISTS "users read own activity" ON public.activity_events;
CREATE POLICY "users read own activity" ON public.activity_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_app_admin());

CREATE OR REPLACE FUNCTION public.log_ui_event(
  _event_name text,
  _route text,
  _target text,
  _details jsonb DEFAULT '{}'::jsonb,
  _anonymous_session_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL AND _anonymous_session_id IS NULL THEN
    RAISE EXCEPTION 'anonymous activity session is required';
  END IF;

  IF _event_name NOT IN ('ui.page_view', 'ui.click', 'ui.change', 'ui.submit', 'auth.sign_in', 'auth.sign_up', 'auth.sign_out') THEN
    RAISE EXCEPTION 'unsupported activity event';
  END IF;
  IF _route IS NOT NULL AND (
    length(_route) > 256 OR _route !~ '^/[A-Za-z0-9_./$%~-]*$' OR _route LIKE '%..%'
  ) THEN
    RAISE EXCEPTION 'invalid activity route';
  END IF;
  IF _target IS NOT NULL AND length(_target) > 40 THEN
    RAISE EXCEPTION 'invalid activity target';
  END IF;
  IF _details IS NULL OR jsonb_typeof(_details) <> 'object'
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(_details) AS detail_key
       WHERE detail_key NOT IN ('tag', 'role', 'input_type')
     ) THEN
    RAISE EXCEPTION 'invalid activity details';
  END IF;

  IF current_user_id IS NULL AND (
    SELECT count(*)
    FROM public.activity_events
    WHERE anonymous_session_id = _anonymous_session_id
      AND created_at > now() - interval '1 minute'
  ) >= 120 THEN
    RAISE EXCEPTION 'activity event rate limit exceeded';
  END IF;

  INSERT INTO public.activity_events (
    user_id, actor_id, anonymous_session_id, event_type, event_name, route, target, details
  )
  VALUES (
    current_user_id,
    current_user_id,
    CASE WHEN current_user_id IS NULL THEN _anonymous_session_id ELSE NULL END,
    CASE
      WHEN _event_name LIKE 'auth.%' THEN 'authentication'
      WHEN _event_name = 'ui.page_view' THEN 'navigation'
      ELSE 'interaction'
    END,
    _event_name,
    _route,
    _target,
    _details
  );
END
$$;

REVOKE ALL ON FUNCTION public.log_ui_event(text, text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_ui_event(text, text, text, jsonb, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_transaction_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_name := 'payment.requested';
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('approved', 'rejected') THEN
    action_name := 'payment.' || NEW.status;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.activity_events (
    user_id, actor_id, event_type, event_name, target, details
  )
  VALUES (
    NEW.user_id,
    auth.uid(),
    'payment',
    action_name,
    NEW.payment_method_id::text,
    jsonb_build_object(
      'transaction_id', NEW.id,
      'amount', NEW.amount,
      'credits_added', NEW.credits_added,
      'status', NEW.status
    )
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS audit_transaction_activity ON public.transactions;
CREATE TRIGGER audit_transaction_activity
  AFTER INSERT OR UPDATE OF status ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_transaction_activity();

CREATE OR REPLACE FUNCTION public.audit_balance_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.balance IS DISTINCT FROM NEW.balance THEN
    INSERT INTO public.activity_events (
      user_id, actor_id, event_type, event_name, target, details
    )
    VALUES (
      NEW.id,
      auth.uid(),
      'balance',
      'balance.changed',
      'profiles.balance',
      jsonb_build_object(
        'before', OLD.balance,
        'after', NEW.balance,
        'delta', NEW.balance - OLD.balance
      )
    );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS audit_balance_activity ON public.profiles;
CREATE TRIGGER audit_balance_activity
  AFTER UPDATE OF balance ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_balance_activity();

GRANT SELECT ON public.activity_events TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'activity_events'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events;
  END IF;
END
$$;
