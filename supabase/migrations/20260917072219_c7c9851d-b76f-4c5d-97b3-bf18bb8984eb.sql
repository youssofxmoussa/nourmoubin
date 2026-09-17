CREATE POLICY "Trusted app functions can view student photos"
ON public.student_photos FOR SELECT
TO service_role
USING (true);

CREATE POLICY "Trusted app functions can add student photos"
ON public.student_photos FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Trusted app functions can update student photos"
ON public.student_photos FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Trusted app functions can delete student photos"
ON public.student_photos FOR DELETE
TO service_role
USING (true);