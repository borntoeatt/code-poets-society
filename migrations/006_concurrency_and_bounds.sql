-- 006: Concurrency-safe triggers and bounded project columns
-- Run this in the Supabase SQL Editor after 005. Safe to re-run.
--
-- 1. Rate-limit triggers were count-then-insert with no lock, so N parallel
--    requests all saw the same pre-insert count and all passed. Each check
--    now takes a per-author transaction-scoped advisory lock first, so
--    concurrent inserts queue and later ones see the earlier commits.
-- 2. handle_new_user chose a username with a non-locking EXISTS loop; two
--    simultaneous sign-ups with the same name raced the UNIQUE constraint and
--    one failed with "Database error saving new user".
-- 3. sync_project_stars_count recomputed count(*) from its statement snapshot,
--    so two concurrent stars could leave stars_count off by one.
-- 4. Several client-writable project columns had no size limit while the list
--    page loads every row, so one user could make the Projects page
--    unloadable for everyone.

BEGIN;

-- =============================================
-- 1. RATE LIMITS: serialise per author
-- =============================================
CREATE OR REPLACE FUNCTION public.check_comment_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('comment_rate:' || NEW.author_id::text));
    IF (
        SELECT count(*) FROM public.comments
        WHERE author_id = NEW.author_id
          AND created_at > now() - interval '1 minute'
    ) >= 5 THEN
        RAISE EXCEPTION 'Rate limit exceeded: max 5 comments per minute';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_project_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('project_rate:' || NEW.author_id::text));
    IF (
        SELECT count(*) FROM public.projects
        WHERE author_id = NEW.author_id
          AND created_at > now() - interval '1 hour'
    ) >= 3 THEN
        RAISE EXCEPTION 'Rate limit exceeded: max 3 projects per hour';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_star_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('star_rate:' || NEW.user_id::text));
    IF (
        SELECT count(*) FROM public.project_stars
        WHERE user_id = NEW.user_id
          AND starred_at > now() - interval '1 minute'
    ) >= 5 THEN
        RAISE EXCEPTION 'Rate limit exceeded: max 5 stars per minute';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_newsletter_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('newsletter_rate'));
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
-- 2. SIGN-UP: serialise same-name sign-ups
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

    -- Serialise ALL username picks (one global key): a per-base key still lets
    -- base "ada" and base "ada-1" race to the same generated "ada-1".
    -- Sign-ups are rare, so the cost is nil.
    PERFORM pg_advisory_xact_lock(hashtext('profiles.username'));

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
-- 3. STARS: incremental, concurrency-safe count
-- =============================================
CREATE OR REPLACE FUNCTION public.sync_project_stars_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Relative updates are applied to the latest row version even when two
    -- transactions race, unlike a count(*) taken from the statement snapshot.
    IF TG_OP = 'INSERT' THEN
        UPDATE public.projects SET stars_count = stars_count + 1 WHERE id = NEW.project_id;
    ELSE
        UPDATE public.projects SET stars_count = GREATEST(stars_count - 1, 0) WHERE id = OLD.project_id;
    END IF;
    RETURN NULL;
END;
$$;

-- Repair any counts that already drifted.
UPDATE public.projects p
SET stars_count = (SELECT count(*) FROM public.project_stars s WHERE s.project_id = p.id);

-- The trigger now does stars_count + 1, and NULL + 1 stays NULL forever, so
-- the column must never be NULL (the repair above just filled every row).
ALTER TABLE public.projects ALTER COLUMN stars_count SET NOT NULL;

-- =============================================
-- 4. BOUNDED PROJECT COLUMNS
-- =============================================
-- Normalise existing rows first so the constraints can be added.
UPDATE public.projects SET image_url = NULL WHERE image_url = '';
UPDATE public.projects SET image_url = NULL
    WHERE image_url IS NOT NULL AND (image_url !~ '^https?://' OR length(image_url) > 2048);
UPDATE public.projects SET long_description = left(long_description, 10000)
    WHERE length(long_description) > 10000;
UPDATE public.projects SET tech_stack = ARRAY['Other']
    WHERE tech_stack IS NULL OR cardinality(tech_stack) = 0;
UPDATE public.projects SET tech_stack = tech_stack[1:20] WHERE cardinality(tech_stack) > 20;
UPDATE public.projects SET looking_for = looking_for[1:20]
    WHERE looking_for IS NOT NULL AND cardinality(looking_for) > 20;
UPDATE public.projects SET tech_stack = ARRAY['Other']
    WHERE length(array_to_string(tech_stack, '')) > 1000;
UPDATE public.projects SET looking_for = NULL
    WHERE looking_for IS NOT NULL AND length(array_to_string(looking_for, '')) > 1000;
-- The pre-rewrite app built slugs from the full title (up to 150 chars).
-- Shorten to 80, keep the 002 format check (no trailing '-') and uniqueness.
UPDATE public.projects SET slug = rtrim(left(slug, 73), '-') || '-' || substr(md5(id::text), 1, 6)
    WHERE length(slug) > 80;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_long_description_length;
ALTER TABLE public.projects
    ADD CONSTRAINT projects_long_description_length
    CHECK (long_description IS NULL OR length(long_description) <= 10000);

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_slug_length;
ALTER TABLE public.projects
    ADD CONSTRAINT projects_slug_length CHECK (length(slug) <= 80);

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_image_url_format;
ALTER TABLE public.projects
    ADD CONSTRAINT projects_image_url_format
    CHECK (image_url IS NULL OR (image_url ~ '^https?://' AND length(image_url) <= 2048));

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_tech_stack_bounds;
ALTER TABLE public.projects
    ADD CONSTRAINT projects_tech_stack_bounds
    CHECK (cardinality(tech_stack) BETWEEN 1 AND 20 AND length(array_to_string(tech_stack, '')) <= 1000);

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_looking_for_bounds;
ALTER TABLE public.projects
    ADD CONSTRAINT projects_looking_for_bounds
    CHECK (looking_for IS NULL OR (cardinality(looking_for) <= 20 AND length(array_to_string(looking_for, '')) <= 1000));

COMMIT;
