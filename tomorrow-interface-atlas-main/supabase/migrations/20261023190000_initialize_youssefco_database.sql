DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.sub_tier AS ENUM ('free', 'pro', 'plus', 'vip');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  subscription_tier public.sub_tier NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.studio_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  studio text NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, studio)
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name public.sub_tier NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL,
  transaction_code text,
  recipient_number text NOT NULL DEFAULT '01018635526',
  receipt_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vault_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name text NOT NULL,
  studio_type text NOT NULL,
  content text,
  file_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.studio_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.vault_items TO authenticated;
GRANT ALL ON public.profiles, public.user_roles, public.studio_usage, public.payments, public.vault_items TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

DROP POLICY IF EXISTS "own or admin profile read" ON public.profiles;
CREATE POLICY "own or admin profile read" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin update profile" ON public.profiles;
CREATE POLICY "admin update profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "own roles" ON public.user_roles;
CREATE POLICY "own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own or admin usage" ON public.studio_usage;
CREATE POLICY "own or admin usage" ON public.studio_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "own or admin payments" ON public.payments;
CREATE POLICY "own or admin payments" ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "insert own payment" ON public.payments;
CREATE POLICY "insert own payment" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "admin update payment" ON public.payments;
CREATE POLICY "admin update payment" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "own vault read" ON public.vault_items;
CREATE POLICY "own vault read" ON public.vault_items
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own vault insert" ON public.vault_items;
CREATE POLICY "own vault insert" ON public.vault_items
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own vault delete" ON public.vault_items;
CREATE POLICY "own vault delete" ON public.vault_items
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, email, full_name)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')
FROM auth.users
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'user'::public.app_role FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tier_limit(t public.sub_tier)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE t
    WHEN 'free' THEN 1
    WHEN 'pro' THEN 25
    WHEN 'plus' THEN 35
    WHEN 'vip' THEN 50
  END
$$;

CREATE OR REPLACE FUNCTION public.consume_studio_use(_studio text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer;
  cur integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT public.tier_limit(subscription_tier)
  INTO lim
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.studio_usage (user_id, studio, count)
  VALUES (auth.uid(), _studio, 0)
  ON CONFLICT DO NOTHING;

  SELECT count INTO cur
  FROM public.studio_usage
  WHERE user_id = auth.uid() AND studio = _studio
  FOR UPDATE;

  IF cur >= COALESCE(lim, 1) THEN
    RETURN -1;
  END IF;

  UPDATE public.studio_usage
  SET count = count + 1, last_used_at = now()
  WHERE user_id = auth.uid() AND studio = _studio;

  RETURN COALESCE(lim, 1) - cur - 1;
END
$$;
GRANT EXECUTE ON FUNCTION public.consume_studio_use(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_payment(_payment_id uuid, _approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payment public.payments;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND OR payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment not found or already processed';
  END IF;

  UPDATE public.payments
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END
  WHERE id = _payment_id;

  IF _approve THEN
    UPDATE public.profiles
    SET subscription_tier = payment.plan_name
    WHERE id = payment.user_id;
    DELETE FROM public.studio_usage WHERE user_id = payment.user_id;
  END IF;
END
$$;
GRANT EXECUTE ON FUNCTION public.approve_payment(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_tier(_user uuid, _tier public.sub_tier)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles SET subscription_tier = _tier WHERE id = _user;
  DELETE FROM public.studio_usage WHERE user_id = _user;
END
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_tier(uuid, public.sub_tier) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760,
  ARRAY['image/*', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/*', 'application/pdf'];

DROP POLICY IF EXISTS "upload own receipts" ON storage.objects;
CREATE POLICY "upload own receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "read receipts" ON storage.objects;
CREATE POLICY "read receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );
