-- 005: Timestamps are server-set, never client-set
-- Run this in the Supabase SQL Editor after 004. Safe to re-run.
--
-- 004 pinned created_at on UPDATE but left it (and updated_at / starred_at)
-- writable on INSERT. A logged-in user could post
--   {"content": "...", "created_at": "2000-01-01"}
-- to back-date a row past every rate-limit window (the triggers count rows
-- with created_at > now() - interval), or "2099-01-01" to pin it at the top
-- of every "newest first" list. This forces all timestamps to now() on
-- insert for anon/authenticated requests; trusted roles are unaffected.

BEGIN;

-- projects: created_at / updated_at on INSERT (004 already pins them on UPDATE)
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
        NEW.created_at := now();
        NEW.updated_at := now();
    ELSE
        NEW.stars_count := OLD.stars_count;
        NEW.views_count := OLD.views_count;
        NEW.featured := OLD.featured;
        NEW.author_id := OLD.author_id;
        NEW.created_at := OLD.created_at;
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$;

-- comments: now fires on INSERT as well as UPDATE
CREATE OR REPLACE FUNCTION public.protect_comment_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_end_user() THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := now();
        NEW.updated_at := now();
    ELSE
        NEW.project_id := OLD.project_id;
        NEW.author_id := OLD.author_id;
        NEW.parent_id := OLD.parent_id;
        NEW.created_at := OLD.created_at;
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_comment_columns ON public.comments;
CREATE TRIGGER protect_comment_columns
    BEFORE INSERT OR UPDATE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION public.protect_comment_columns();

-- project_stars: starred_at drives the 5/min star rate limit
CREATE OR REPLACE FUNCTION public.protect_star_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.is_end_user() THEN
        NEW.starred_at := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_star_columns ON public.project_stars;
CREATE TRIGGER protect_star_columns
    BEFORE INSERT ON public.project_stars
    FOR EACH ROW EXECUTE FUNCTION public.protect_star_columns();

COMMIT;
