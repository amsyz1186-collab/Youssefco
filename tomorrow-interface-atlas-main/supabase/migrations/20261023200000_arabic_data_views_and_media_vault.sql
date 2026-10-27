ALTER TABLE public.vault_items
  ADD COLUMN IF NOT EXISTS media_path text;

CREATE OR REPLACE VIEW public."المستخدمين"
WITH (security_invoker = true)
AS SELECT id, email, full_name, subscription_tier, status, created_at FROM public.profiles;

CREATE OR REPLACE VIEW public."استهلاك_الاستوديوهات"
WITH (security_invoker = true)
AS SELECT user_id, studio, count, last_used_at FROM public.studio_usage;

CREATE OR REPLACE VIEW public."عمليات_الدفع"
WITH (security_invoker = true)
AS SELECT id, user_id, plan_name, amount, payment_method, transaction_code, recipient_number, receipt_path, status, created_at
FROM public.payments;

CREATE OR REPLACE VIEW public."خزنة_المشاريع"
WITH (security_invoker = true)
AS SELECT id, user_id, project_name, studio_type, content, media_path, file_size, created_at
FROM public.vault_items;

GRANT SELECT, UPDATE ON public."المستخدمين" TO authenticated;
GRANT SELECT ON public."استهلاك_الاستوديوهات" TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public."عمليات_الدفع" TO authenticated;
GRANT SELECT, INSERT, DELETE ON public."خزنة_المشاريع" TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-vault',
  'project-vault',
  false,
  52428800,
  ARRAY['video/*']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['video/*'];

DROP POLICY IF EXISTS "project vault owner upload" ON storage.objects;
CREATE POLICY "project vault owner upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-vault' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "project vault owner read" ON storage.objects;
CREATE POLICY "project vault owner read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-vault' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "project vault owner delete" ON storage.objects;
CREATE POLICY "project vault owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-vault' AND (storage.foldername(name))[1] = auth.uid()::text);

NOTIFY pgrst, 'reload schema';
