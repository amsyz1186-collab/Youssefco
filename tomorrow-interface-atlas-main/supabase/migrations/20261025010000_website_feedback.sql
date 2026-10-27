CREATE TABLE IF NOT EXISTS public.website_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 60),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL CHECK (length(btrim(comment)) BETWEEN 5 AND 500),
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS website_reviews_public_created_idx
  ON public.website_reviews (created_at DESC)
  WHERE is_public = true;

ALTER TABLE public.website_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_reviews FROM anon, authenticated;
GRANT SELECT ON public.website_reviews TO anon, authenticated;
GRANT INSERT, UPDATE ON public.website_reviews TO authenticated;

CREATE POLICY "anyone can read public website reviews" ON public.website_reviews
  FOR SELECT TO anon
  USING (is_public = true);

CREATE POLICY "customers and admins read website reviews" ON public.website_reviews
  FOR SELECT TO authenticated
  USING (is_public = true OR user_id = auth.uid() OR public.is_app_admin());

CREATE POLICY "customers submit their own website review" ON public.website_reviews
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_public = true);

CREATE POLICY "customers update their own website review" ON public.website_reviews
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND is_public = true);

CREATE POLICY "admins moderate website reviews" ON public.website_reviews
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

CREATE TABLE IF NOT EXISTS public.website_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('suggestion', 'bug', 'other')),
  message text NOT NULL CHECK (length(btrim(message)) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS website_feedback_created_idx
  ON public.website_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS website_feedback_user_created_idx
  ON public.website_feedback (user_id, created_at DESC);

ALTER TABLE public.website_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_feedback FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.website_feedback TO authenticated;

CREATE POLICY "customers and admins read website feedback" ON public.website_feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_app_admin());

CREATE POLICY "customers submit their own website feedback" ON public.website_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'open');

CREATE POLICY "admins manage website feedback" ON public.website_feedback
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

CREATE OR REPLACE FUNCTION public.website_review_summary()
RETURNS TABLE (review_count bigint, average_rating numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint,
    coalesce(round(avg(rating)::numeric, 1), 0)
  FROM public.website_reviews
  WHERE is_public = true
$$;

REVOKE ALL ON FUNCTION public.website_review_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.website_review_summary() TO anon, authenticated;
