-- Create consultant-docs bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('consultant-docs', 'consultant-docs', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for consultant-docs
-- Allow public read access
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'consultant-docs');

-- Allow authenticated users to upload their own documents
CREATE POLICY "Users can upload their own docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'consultant-docs' AND
  (storage.foldername(name))[1] = (SELECT id::text FROM public.consultants WHERE user_id = auth.uid())
);

-- Allow authenticated users to update their own documents
CREATE POLICY "Users can update their own docs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'consultant-docs' AND
  (storage.foldername(name))[1] = (SELECT id::text FROM public.consultants WHERE user_id = auth.uid())
);

-- Allow authenticated users to delete their own documents
CREATE POLICY "Users can delete their own docs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'consultant-docs' AND
  (storage.foldername(name))[1] = (SELECT id::text FROM public.consultants WHERE user_id = auth.uid())
);
