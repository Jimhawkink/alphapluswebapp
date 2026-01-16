-- SIMPLE FIX: Disable RLS on users table
-- Run this in Supabase SQL Editor

-- Disable Row Level Security on users table
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'users';

-- Expected result: rowsecurity = false
