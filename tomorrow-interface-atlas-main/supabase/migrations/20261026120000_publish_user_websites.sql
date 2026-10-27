INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'published-sites',
  'published-sites',
  true,
  1048576,
  ARRAY['text/html']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 1048576,
    allowed_mime_types = ARRAY['text/html'];

DROP POLICY IF EXISTS "users publish own website files" ON storage.objects;
CREATE POLICY "users publish own website files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'published-sites'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "users delete own published websites" ON storage.objects;
CREATE POLICY "users delete own published websites" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'published-sites'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
