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

  IF NOT FOUND OR (
    method_name NOT ILIKE '%vodafone%'
    AND method_name NOT LIKE '%فودافون%'
    AND method_name NOT ILIKE '%instapay%'
    AND method_name NOT ILIKE '%انستاباي%'
    AND method_name NOT ILIKE '%إنستاباي%'
  ) THEN
    RAISE EXCEPTION 'manual top-ups are only enabled for active Vodafone Cash and InstaPay';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS validate_customer_topup ON public.transactions;
CREATE TRIGGER validate_customer_topup
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_topup();
REVOKE ALL ON FUNCTION public.validate_customer_topup() FROM PUBLIC, anon, authenticated;

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

REVOKE ALL ON FUNCTION public.approve_transaction(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_transaction(uuid, boolean) TO authenticated;

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

REVOKE ALL ON FUNCTION public.consume_credit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_credit() TO authenticated;
