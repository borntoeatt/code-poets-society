-- Rate Limiting Triggers for Code Poets Society
-- Run this in Supabase SQL Editor to add rate limiting to your existing database
--
-- Limits:
--   Comments:    5 per user per minute
--   Projects:    3 per user per hour
--   Newsletter:  3 signups per minute (global)
--   Stars:       5 per user per minute

-- Comment rate limit: 5 per user per minute
CREATE OR REPLACE FUNCTION check_comment_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        SELECT COUNT(*)
        FROM public.comments
        WHERE author_id = NEW.author_id
          AND created_at > NOW() - INTERVAL '1 minute'
    ) >= 5 THEN
        RAISE EXCEPTION 'Rate limit exceeded: max 5 comments per minute';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comment_rate_limit ON public.comments;
CREATE TRIGGER comment_rate_limit
    BEFORE INSERT ON public.comments
    FOR EACH ROW EXECUTE FUNCTION check_comment_rate_limit();

-- Project rate limit: 3 per user per hour
CREATE OR REPLACE FUNCTION check_project_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        SELECT COUNT(*)
        FROM public.projects
        WHERE author_id = NEW.author_id
          AND created_at > NOW() - INTERVAL '1 hour'
    ) >= 3 THEN
        RAISE EXCEPTION 'Rate limit exceeded: max 3 projects per hour';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_rate_limit ON public.projects;
CREATE TRIGGER project_rate_limit
    BEFORE INSERT ON public.projects
    FOR EACH ROW EXECUTE FUNCTION check_project_rate_limit();

-- Newsletter rate limit: 3 per minute (global, not per-user since signups are anonymous)
CREATE OR REPLACE FUNCTION check_newsletter_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        SELECT COUNT(*)
        FROM public.newsletter_subscribers
        WHERE subscribed_at > NOW() - INTERVAL '1 minute'
    ) >= 3 THEN
        RAISE EXCEPTION 'Rate limit exceeded: please try again in a minute';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS newsletter_rate_limit ON public.newsletter_subscribers;
CREATE TRIGGER newsletter_rate_limit
    BEFORE INSERT ON public.newsletter_subscribers
    FOR EACH ROW EXECUTE FUNCTION check_newsletter_rate_limit();

-- Star rate limit: 5 per user per minute
CREATE OR REPLACE FUNCTION check_star_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        SELECT COUNT(*)
        FROM public.project_stars
        WHERE user_id = NEW.user_id
          AND starred_at > NOW() - INTERVAL '1 minute'
    ) >= 5 THEN
        RAISE EXCEPTION 'Rate limit exceeded: max 5 stars per minute';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS star_rate_limit ON public.project_stars;
CREATE TRIGGER star_rate_limit
    BEFORE INSERT ON public.project_stars
    FOR EACH ROW EXECUTE FUNCTION check_star_rate_limit();
