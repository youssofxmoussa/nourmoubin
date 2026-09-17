DROP POLICY IF EXISTS "App can view student photos" ON public.student_photos;
DROP POLICY IF EXISTS "App can add student photos" ON public.student_photos;
DROP POLICY IF EXISTS "App can update student photos" ON public.student_photos;
DROP POLICY IF EXISTS "App can delete student photos" ON public.student_photos;
REVOKE ALL ON public.student_photos FROM anon, authenticated;

DROP POLICY IF EXISTS "App can view student photo files" ON storage.objects;
DROP POLICY IF EXISTS "App can add student photo files" ON storage.objects;
DROP POLICY IF EXISTS "App can update student photo files" ON storage.objects;
DROP POLICY IF EXISTS "App can delete student photo files" ON storage.objects;