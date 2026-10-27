ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS provider_number text,
  ADD COLUMN IF NOT EXISTS instructions text;

GRANT SELECT (id, name, is_active, provider_number, account_holder, instructions)
  ON public.payment_methods TO authenticated;

UPDATE public.payment_methods
SET provider_number = '01125896121',
    instructions = 'Transfer the selected plan amount through InstaPay, then submit the transfer receipt for manual verification.',
    is_active = true
WHERE name ILIKE '%instapay%'
   OR name ILIKE '%انستاباي%'
   OR name ILIKE '%إنستاباي%';

INSERT INTO public.payment_methods (name, provider_number, instructions, is_active)
SELECT
  'InstaPay',
  '01125896121',
  'Transfer the selected plan amount through InstaPay, then submit the transfer receipt for manual verification.',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.payment_methods
  WHERE name ILIKE '%instapay%'
     OR name ILIKE '%انستاباي%'
     OR name ILIKE '%إنستاباي%'
);

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
