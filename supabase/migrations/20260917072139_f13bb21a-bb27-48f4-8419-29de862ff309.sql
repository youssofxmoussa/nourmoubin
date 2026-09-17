CREATE TABLE public.student_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_name text NOT NULL CHECK (char_length(sheet_name) BETWEEN 1 AND 100),
  sheet_row integer NOT NULL CHECK (sheet_row >= 3),
  student_name text NOT NULL CHECK (char_length(student_name) BETWEEN 1 AND 500),
  storage_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sheet_name, sheet_row)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_photos TO anon, authenticated;
GRANT ALL ON public.student_photos TO service_role;

ALTER TABLE public.student_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App can view student photos"
ON public.student_photos FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "App can add student photos"
ON public.student_photos FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "App can update student photos"
ON public.student_photos FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "App can delete student photos"
ON public.student_photos FOR DELETE
TO anon, authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.set_student_photos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_student_photos_updated_at
BEFORE UPDATE ON public.student_photos
FOR EACH ROW
EXECUTE FUNCTION public.set_student_photos_updated_at();

CREATE POLICY "App can view student photo files"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'student-photos');

CREATE POLICY "App can add student photo files"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'student-photos');

CREATE POLICY "App can update student photo files"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'student-photos')
WITH CHECK (bucket_id = 'student-photos');

CREATE POLICY "App can delete student photo files"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'student-photos');