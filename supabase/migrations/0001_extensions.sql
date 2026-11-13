-- Signal: extensions
-- Supabase keeps extensions in the `extensions` schema; we reference them fully qualified
-- so migrations behave the same on Supabase, plain Postgres and PGlite (tests).
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
