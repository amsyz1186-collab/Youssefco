CREATE OR REPLACE FUNCTION public.consume_credits(_amount integer)
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

  IF _amount IS NULL OR _amount < 1 OR _amount > 100 THEN
    RAISE EXCEPTION 'invalid credit amount';
  END IF;

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) - _amount,
      total_spent = COALESCE(total_spent, 0) + _amount
  WHERE id = auth.uid()
    AND COALESCE(balance, 0) >= _amount
  RETURNING balance INTO remaining;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN remaining;
END
$$;

REVOKE ALL ON FUNCTION public.consume_credits(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_credits(integer) TO authenticated;
