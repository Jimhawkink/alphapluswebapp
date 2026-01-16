-- Fix RLS for users table - Allow authenticated users to insert
-- Run this SQL in Supabase SQL Editor

-- Enable RLS on users table (if not already enabled)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow authenticated users to insert users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to read users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to update users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to delete users" ON public.users;

-- Create new policies for users table
-- Allow INSERT for authenticated users
CREATE POLICY "Allow authenticated users to insert users"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow SELECT for authenticated users
CREATE POLICY "Allow authenticated users to read users"
ON public.users
FOR SELECT
TO authenticated
USING (true);

-- Allow UPDATE for authenticated users
CREATE POLICY "Allow authenticated users to update users"
ON public.users
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow DELETE for authenticated users (for admins)
CREATE POLICY "Allow authenticated users to delete users"
ON public.users
FOR DELETE
TO authenticated
USING (true);

-- Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'users';
