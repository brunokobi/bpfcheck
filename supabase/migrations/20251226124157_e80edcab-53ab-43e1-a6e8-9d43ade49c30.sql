-- 1. Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 2. Create user_roles table (NOT on profiles to avoid privilege escalation)
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE (user_id, role)
);

-- 3. Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Create security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 5. Create function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- 6. RLS policies for user_roles table
-- Users can view their own role
CREATE POLICY "Users can view own role" 
ON public.user_roles 
FOR SELECT 
USING (user_id = auth.uid());

-- Admins can view all roles
CREATE POLICY "Admins can view all roles" 
ON public.user_roles 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert/update/delete roles
CREATE POLICY "Admins can manage roles" 
ON public.user_roles 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. Trigger to create default 'user' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- 8. Update audit RLS to allow admins to view all audits
DROP POLICY IF EXISTS "audit_owner" ON public.audits;

CREATE POLICY "Users can manage own audits" 
ON public.audits 
FOR ALL 
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (user_id = auth.uid());

-- 9. Update audit_items RLS for admins
DROP POLICY IF EXISTS "audit_items_owner" ON public.audit_items;

CREATE POLICY "Users can manage own audit items" 
ON public.audit_items 
FOR ALL 
USING (
  audit_id IN (
    SELECT id FROM audits WHERE user_id = auth.uid()
  ) 
  OR public.has_role(auth.uid(), 'admin')
);

-- 10. Update audit_summary RLS for admins
DROP POLICY IF EXISTS "summary_owner" ON public.audit_summary;

CREATE POLICY "Users can manage own audit summaries" 
ON public.audit_summary 
FOR ALL 
USING (
  audit_id IN (
    SELECT id FROM audits WHERE user_id = auth.uid()
  ) 
  OR public.has_role(auth.uid(), 'admin')
);

-- 11. Update audit_item_images RLS for admins
DROP POLICY IF EXISTS "images_owner" ON public.audit_item_images;

CREATE POLICY "Users can manage own audit images" 
ON public.audit_item_images 
FOR ALL 
USING (
  audit_item_id IN (
    SELECT ai.id FROM audit_items ai
    JOIN audits a ON a.id = ai.audit_id
    WHERE a.user_id = auth.uid()
  ) 
  OR public.has_role(auth.uid(), 'admin')
);

-- 12. Create storage policies for audit-images bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('audit-images', 'audit-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their folder
CREATE POLICY "Users can upload audit images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audit-images' 
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Allow authenticated users to view audit images
CREATE POLICY "Users can view audit images"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'audit-images');

-- Allow users to update/delete their own images
CREATE POLICY "Users can update own audit images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'audit-images' 
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
);

CREATE POLICY "Users can delete own audit images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'audit-images' 
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
);