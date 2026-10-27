ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

GRANT USAGE ON SCHEMA public TO authenticated;
REVOKE ALL ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.media_vault FROM anon, authenticated;
REVOKE ALL ON public.payment_methods FROM anon, authenticated;
REVOKE ALL ON public.transactions FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.media_vault TO authenticated;
GRANT SELECT (id, name, is_active) ON public.payment_methods TO authenticated;
GRANT SELECT, INSERT ON public.transactions TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('project-vault', 'project-vault', false, NULL, NULL),
  ('receipts', 'receipts', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = CASE
      WHEN EXCLUDED.id = 'receipts' THEN 5242880
      ELSE storage.buckets.file_size_limit
    END,
    allowed_mime_types = CASE
      WHEN EXCLUDED.id = 'receipts'
        THEN ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
      ELSE storage.buckets.allowed_mime_types
    END;

DROP POLICY IF EXISTS "customers read own project files" ON storage.objects;
CREATE POLICY "customers read own project files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('project-vault', 'receipts')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "customers upload own project files" ON storage.objects;
CREATE POLICY "customers upload own project files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('project-vault', 'receipts')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "customers delete own project files" ON storage.objects;
CREATE POLICY "customers delete own project files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('project-vault', 'receipts')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  )
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

DROP POLICY IF EXISTS "admins read submitted receipts" ON storage.objects;
CREATE POLICY "admins read submitted receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND public.is_app_admin());

DROP POLICY IF EXISTS "customer reads own profile" ON public.profiles;
DROP POLICY IF EXISTS "own or admin profile read" ON public.profiles;
DROP POLICY IF EXISTS "admin update profile" ON public.profiles;
CREATE POLICY "customer reads own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_app_admin());

DROP POLICY IF EXISTS "customer reads own media vault" ON public.media_vault;
CREATE POLICY "customer reads own media vault" ON public.media_vault
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "customer inserts own media vault" ON public.media_vault;
CREATE POLICY "customer inserts own media vault" ON public.media_vault
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "customer deletes own media vault" ON public.media_vault;
CREATE POLICY "customer deletes own media vault" ON public.media_vault
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "customers read active payment methods" ON public.payment_methods;
CREATE POLICY "customers read active payment methods" ON public.payment_methods
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE OR REPLACE FUNCTION public.validate_customer_topup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  method_name text;
BEGIN
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() OR NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid transaction owner or status';
  END IF;

  IF NOT COALESCE((
    (NEW.amount = 1500 AND NEW.credits_added = 13) OR
    (NEW.amount = 4000 AND NEW.credits_added = 22) OR
    (NEW.amount = 8000 AND NEW.credits_added = 30)
  ), false) THEN
    RAISE EXCEPTION 'invalid plan amount and credit combination';
  END IF;

  IF NEW.receipt_url IS NULL OR split_part(NEW.receipt_url, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'receipt must be uploaded to the customer private folder';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'receipts' AND name = NEW.receipt_url
  ) THEN
    RAISE EXCEPTION 'receipt upload not found';
  END IF;

  SELECT name INTO method_name
  FROM public.payment_methods
  WHERE id = NEW.payment_method_id AND is_active = true;

  IF NOT FOUND OR (method_name NOT ILIKE '%vodafone%' AND method_name NOT LIKE '%فودافون%') THEN
    RAISE EXCEPTION 'manual top-ups are only enabled for active Vodafone Cash';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS validate_customer_topup ON public.transactions;
CREATE TRIGGER validate_customer_topup
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_topup();

DROP POLICY IF EXISTS "customers read own transactions" ON public.transactions;
CREATE POLICY "customers read own transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_app_admin());

DROP POLICY IF EXISTS "customers submit pending transactions" ON public.transactions;
CREATE POLICY "customers submit pending transactions" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE OR REPLACE FUNCTION public.approve_transaction(_transaction_id uuid, _approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.transactions;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO item
  FROM public.transactions
  WHERE id = _transaction_id
  FOR UPDATE;

  IF NOT FOUND OR item.status <> 'pending' THEN
    RAISE EXCEPTION 'transaction not found or already processed';
  END IF;
  IF item.credits_added <= 0 THEN
    RAISE EXCEPTION 'invalid credit amount';
  END IF;
  IF NOT COALESCE((
    (item.amount = 1500 AND item.credits_added = 13) OR
    (item.amount = 4000 AND item.credits_added = 22) OR
    (item.amount = 8000 AND item.credits_added = 30)
  ), false) THEN
    RAISE EXCEPTION 'transaction amount does not match its credit package';
  END IF;

  UPDATE public.transactions
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END
  WHERE id = _transaction_id;

  IF _approve THEN
    UPDATE public.profiles
    SET balance = COALESCE(balance, 0) + item.credits_added,
        plan_name = CASE item.credits_added
          WHEN 13 THEN 'youssefco-pro'
          WHEN 22 THEN 'youssefco-plus'
          WHEN 30 THEN 'youssefco-vip'
          ELSE plan_name
        END
    WHERE id = item.user_id;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.approve_transaction(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_transaction(uuid, boolean) TO authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_customer_created ON auth.users;

CREATE OR REPLACE FUNCTION public.create_customer_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, plan_name, balance, total_spent, full_name_ar, full_name_en
  )
  VALUES (
    NEW.id,
    NEW.email,
    'free',
    0,
    0,
    NEW.raw_user_meta_data->>'full_name_ar',
    COALESCE(NEW.raw_user_meta_data->>'full_name_en', NEW.raw_user_meta_data->>'full_name')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END
$$;

CREATE TRIGGER on_auth_customer_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_customer_profile();

INSERT INTO public.profiles (
  id, email, plan_name, balance, total_spent, full_name_ar, full_name_en
)
SELECT
  id,
  email,
  'free',
  0,
  0,
  raw_user_meta_data->>'full_name_ar',
  COALESCE(raw_user_meta_data->>'full_name_en', raw_user_meta_data->>'full_name')
FROM auth.users
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.consume_credit()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) - 1,
      total_spent = COALESCE(total_spent, 0) + 1
  WHERE id = auth.uid()
    AND COALESCE(balance, 0) > 0
  RETURNING balance INTO remaining;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN remaining;
END
$$;

REVOKE ALL ON FUNCTION public.consume_credit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credit() TO authenticated;
