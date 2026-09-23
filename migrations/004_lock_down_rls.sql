-- 004: Lock down RLS and fix data-integrity gaps
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Fixes:
--   1. Subscriber emails were publicly readable, and anyone could insert
--      directly (bypassing Turnstile). Now only the Edge Function (service
--      role) touches the table; the home page gets a count via RPC.
--   2. Any logged-in user could insert projects / comments / stars as
--      someone else (author_id was never checked).
--   3. Project authors could set their own stars_count / views_count /
--      featured. Those columns are now trigger-protected, and stars_count is
--      derived from project_stars.
--   4. github_url / demo_url accepted any string (stored XSS via javascript:).
--   5. Sign-up used the email local-part as the public username (privacy leak
--      + UNIQUE collisions made sign-up fail for some people).
--   6. SECURITY DEFINER functions had no fixed search_path.

BEGIN;

-- =============================================
-- 1. NEWSLETTER: no browser access at all
-- =============================================
DO $$
DECLARE p record;
BEGIN
    FOR p IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'newsletter_subscribers'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.newsletter_subscribers', p.policyname);
    END LOOP;
END $$;

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
-- With RLS on and no policies, anon/authenticated cannot read or write.
-- The service role (used by the Edge Function) bypasses RLS.

CREATE OR REPLACE FUNCTION public.newsletter_subscriber_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT count(*) FROM public.newsletter_subscribers WHERE is_active;
$$;

REVOKE ALL ON FUNCTION public.newsletter_subscriber_count() FROM public;
GRANT EXECUTE ON FUNCTION public.newsletter_subscriber_count() TO anon, authenticated;

-- The old global limit (3/min) let one person block all sign-ups. Turnstile
-- is the main defence now; keep a generous backstop against bulk inserts.
CREATE OR REPLACE FUNCTION public.check_newsletter_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (
        SELECT count(*) FROM public.newsletter_subscribers
        WHERE subscribed_at > now() - interval '1 minute'
    ) >= 20 THEN
        RAISE EXCEPTION 'Rate limit exceeded: please try again in a minute';
    END IF;
    RETURN NEW;
END;
$$;

-- =============================================
-- 2. OWNERSHIP: you can only write rows as yourself
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can create projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
CREATE POLICY "Users can create their own projects" ON public.projects
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can update their projects" ON public.projects;
CREATE POLICY "Authors can update their projects" ON public.projects
    FOR UPDATE TO authenticated
    USING (auth.uid() = author_id)
    WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;
DROP POLICY IF EXISTS "Users can create their own comments" ON public.comments;
CREATE POLICY "Users can create their own comments" ON public.comments
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can update their comments" ON public.comments;
CREATE POLICY "Authors can update their comments" ON public.comments
    FOR UPDATE TO authenticated
    USING (auth.uid() = author_id)
    WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authenticated users can star projects" ON public.project_stars;
DROP POLICY IF EXISTS "Users can star projects as themselves" ON public.project_stars;
CREATE POLICY "Users can star projects as themselves" ON public.project_stars
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- =============================================
-- 3. PROTECTED COLUMNS
-- =============================================
-- Requests from the browser run as `anon` / `authenticated`. Anything else
-- (SQL editor, service role, dashboard) is trusted and skipped.
CREATE OR REPLACE FUNCTION public.is_end_user()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT current_user IN ('anon', 'authenticated');
$$;

CREATE OR REPLACE FUNCTION public.protect_project_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_end_user() THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        NEW.stars_count := 0;
        NEW.views_count := 0;
        NEW.featured := false;
    ELSE
        NEW.stars_count := OLD.stars_count;
        NEW.views_count := OLD.views_count;
        NEW.featured := OLD.featured;
        NEW.author_id := OLD.author_id;
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_project_columns ON public.projects;
CREATE TRIGGER protect_project_columns
    BEFORE INSERT OR UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.protect_project_columns();

-- Comments: the author may edit content, but not move the comment or reassign it.
CREATE OR REPLACE FUNCTION public.protect_comment_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.is_end_user() THEN
        NEW.project_id := OLD.project_id;
        NEW.author_id := OLD.author_id;
        NEW.parent_id := OLD.parent_id;
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_comment_columns ON public.comments;
CREATE TRIGGER protect_comment_columns
    BEFORE UPDATE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION public.protect_comment_columns();

-- stars_count is derived from project_stars. SECURITY DEFINER so the update
-- on projects is allowed even though the starring user is not the author.
CREATE OR REPLACE FUNCTION public.sync_project_stars_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    pid uuid := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
    UPDATE public.projects
    SET stars_count = (SELECT count(*) FROM public.project_stars WHERE project_id = pid)
    WHERE id = pid;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_project_stars_count ON public.project_stars;
CREATE TRIGGER sync_project_stars_count
    AFTER INSERT OR DELETE ON public.project_stars
    FOR EACH ROW EXECUTE FUNCTION public.sync_project_stars_count();

-- Backfill so existing counts match reality.
UPDATE public.projects p
SET stars_count = (SELECT count(*) FROM public.project_stars s WHERE s.project_id = p.id);

-- =============================================
-- 4. URL FORMAT
-- =============================================
-- Normalise existing data first so the constraints can be added.
UPDATE public.projects SET github_url = NULL
    WHERE github_url IS NOT NULL AND github_url !~ '^https://github\.com/[^/]+/[^/]+';
UPDATE public.projects SET demo_url = NULL
    WHERE demo_url IS NOT NULL AND demo_url !~ '^https?://';

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_github_url_format;
ALTER TABLE public.projects
    ADD CONSTRAINT projects_github_url_format
    CHECK (github_url IS NULL OR github_url ~ '^https://github\.com/[^/]+/[^/]+');

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_demo_url_format;
ALTER TABLE public.projects
    ADD CONSTRAINT projects_demo_url_format
    CHECK (demo_url IS NULL OR demo_url ~ '^https?://');

-- Profiles have the same two free-text URL columns.
UPDATE public.profiles SET website_url = NULL
    WHERE website_url IS NOT NULL AND website_url !~ '^https?://';
UPDATE public.profiles SET avatar_url = NULL
    WHERE avatar_url IS NOT NULL AND avatar_url <> '' AND avatar_url !~ '^https?://';
UPDATE public.profiles SET avatar_url = NULL WHERE avatar_url = '';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_website_url_format;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_website_url_format
    CHECK (website_url IS NULL OR website_url ~ '^https?://');

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_url_format;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_avatar_url_format
    CHECK (avatar_url IS NULL OR avatar_url ~ '^https?://');

-- =============================================
-- 5. SIGN-UP: usernames from the display name, never from the email
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    display_name text;
    base text;
    candidate text;
    n int := 0;
BEGIN
    display_name := COALESCE(
        NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
        NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
        NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
        'poet'
    );

    -- lowercase, ascii, hyphenated; fits the 2..50 username length check
    base := lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '-', 'g'));
    base := trim(both '-' from base);
    base := left(base, 40);
    IF length(base) < 2 THEN
        base := 'poet';
    END IF;

    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
        n := n + 1;
        candidate := base || '-' || n;
    END LOOP;

    INSERT INTO public.profiles (id, username, full_name, avatar_url)
    VALUES (
        NEW.id,
        candidate,
        NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', '')), ''),
        NULLIF(NEW.raw_user_meta_data->>'avatar_url', '')
    );
    RETURN NEW;
END;
$$;

-- =============================================
-- 6. HARDEN EXISTING FUNCTIONS
-- =============================================
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.check_comment_rate_limit() SET search_path = public;
ALTER FUNCTION public.check_project_rate_limit() SET search_path = public;
ALTER FUNCTION public.check_star_rate_limit() SET search_path = public;

-- Unused tables (collaborators, blog_posts, project_tags) keep RLS enabled
-- with no write policies, so they are inert until a feature needs them.
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

COMMIT;
