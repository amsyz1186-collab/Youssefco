ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS plan_name text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS balance integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spent integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_name_ar text,
  ADD COLUMN IF NOT EXISTS full_name_en text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

UPDATE public.profiles
SET balance = 0
WHERE balance IS NULL;

UPDATE public.profiles
SET total_spent = 0
WHERE total_spent IS NULL;

UPDATE public.profiles
SET plan_name = 'free'
WHERE plan_name IS NULL OR plan_name = '';

ALTER TABLE public.profiles
  ALTER COLUMN balance SET DEFAULT 0,
  ALTER COLUMN balance SET NOT NULL,
  ALTER COLUMN total_spent SET DEFAULT 0,
  ALTER COLUMN total_spent SET NOT NULL,
  ALTER COLUMN plan_name SET DEFAULT 'free';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'full_name'
  ) THEN
    EXECUTE $sql$
      UPDATE public.profiles
      SET full_name_en = full_name
      WHERE (full_name_en IS NULL OR full_name_en = '')
        AND full_name IS NOT NULL
        AND full_name <> ''
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'subscription_tier'
  ) THEN
    EXECUTE $sql$
      UPDATE public.profiles
      SET plan_name = CASE lower(subscription_tier::text)
        WHEN 'pro' THEN 'youssefco-pro'
        WHEN 'plus' THEN 'youssefco-plus'
        WHEN 'vip' THEN 'youssefco-vip'
        ELSE 'free'
      END
      WHERE plan_name = 'free'
    $sql$;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.create_customer_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, plan_name, balance, total_spent, full_name_ar, full_name_en, avatar_url
  )
  VALUES (
    NEW.id,
    NEW.email,
    'free',
    0,
    0,
    NULLIF(NEW.raw_user_meta_data->>'full_name_ar', ''),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name_en', ''),
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', '')
    ),
    NULLIF(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name_ar = COALESCE(EXCLUDED.full_name_ar, profiles.full_name_ar),
      full_name_en = COALESCE(EXCLUDED.full_name_en, profiles.full_name_en),
      avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url)
  WHERE profiles.email IS DISTINCT FROM EXCLUDED.email
     OR profiles.full_name_ar IS DISTINCT FROM COALESCE(EXCLUDED.full_name_ar, profiles.full_name_ar)
     OR profiles.full_name_en IS DISTINCT FROM COALESCE(EXCLUDED.full_name_en, profiles.full_name_en)
     OR profiles.avatar_url IS DISTINCT FROM COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS on_auth_customer_created ON auth.users;
CREATE TRIGGER on_auth_customer_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_customer_profile();

DROP TRIGGER IF EXISTS on_auth_customer_updated ON auth.users;
CREATE TRIGGER on_auth_customer_updated
  AFTER UPDATE OF email, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_customer_profile();

INSERT INTO public.profiles (
  id, email, plan_name, balance, total_spent, full_name_ar, full_name_en, avatar_url
)
SELECT
  id,
  email,
  'free',
  0,
  0,
  NULLIF(raw_user_meta_data->>'full_name_ar', ''),
  COALESCE(
    NULLIF(raw_user_meta_data->>'full_name_en', ''),
    NULLIF(raw_user_meta_data->>'full_name', ''),
    NULLIF(raw_user_meta_data->>'name', '')
  ),
  NULLIF(raw_user_meta_data->>'avatar_url', '')
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name_ar = COALESCE(EXCLUDED.full_name_ar, profiles.full_name_ar),
    full_name_en = COALESCE(EXCLUDED.full_name_en, profiles.full_name_en),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url)
WHERE profiles.email IS DISTINCT FROM EXCLUDED.email
   OR profiles.full_name_ar IS DISTINCT FROM COALESCE(EXCLUDED.full_name_ar, profiles.full_name_ar)
   OR profiles.full_name_en IS DISTINCT FROM COALESCE(EXCLUDED.full_name_en, profiles.full_name_en)
   OR profiles.avatar_url IS DISTINCT FROM COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

CREATE OR REPLACE FUNCTION public.ensure_customer_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.profiles (
    id, email, plan_name, balance, total_spent, full_name_ar, full_name_en, avatar_url
  )
  SELECT
    id,
    email,
    'free',
    0,
    0,
    NULLIF(raw_user_meta_data->>'full_name_ar', ''),
    COALESCE(
      NULLIF(raw_user_meta_data->>'full_name_en', ''),
      NULLIF(raw_user_meta_data->>'full_name', ''),
      NULLIF(raw_user_meta_data->>'name', '')
    ),
    NULLIF(raw_user_meta_data->>'avatar_url', '')
  FROM auth.users
  WHERE id = current_user_id
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name_ar = COALESCE(EXCLUDED.full_name_ar, profiles.full_name_ar),
      full_name_en = COALESCE(EXCLUDED.full_name_en, profiles.full_name_en),
      avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url)
  WHERE profiles.email IS DISTINCT FROM EXCLUDED.email
     OR profiles.full_name_ar IS DISTINCT FROM COALESCE(EXCLUDED.full_name_ar, profiles.full_name_ar)
     OR profiles.full_name_en IS DISTINCT FROM COALESCE(EXCLUDED.full_name_en, profiles.full_name_en)
     OR profiles.avatar_url IS DISTINCT FROM COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = current_user_id) THEN
    RAISE EXCEPTION 'authenticated user record not found';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.ensure_customer_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_customer_profile() TO authenticated;

GRANT SELECT ON public.profiles TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'profiles'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END
$$;
