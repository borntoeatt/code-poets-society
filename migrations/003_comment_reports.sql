-- 003: Comment reports
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Backs the "Report" button on comments. Users can file one report per
-- comment and see only their own reports; nobody can read others' reports
-- from the browser (moderation happens in the dashboard for now).

BEGIN;

CREATE TABLE IF NOT EXISTS public.comment_reports (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE NOT NULL,
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    reason TEXT NOT NULL CHECK (length(reason) <= 500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(comment_id, reporter_id)  -- one report per user per comment
);

ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated users can report comments, as themselves only
DROP POLICY IF EXISTS "Authenticated users can report comments" ON public.comment_reports;
CREATE POLICY "Authenticated users can report comments" ON public.comment_reports
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = reporter_id);

-- Users can see their own reports
DROP POLICY IF EXISTS "Users can see own reports" ON public.comment_reports;
CREATE POLICY "Users can see own reports" ON public.comment_reports
    FOR SELECT TO authenticated
    USING (auth.uid() = reporter_id);

CREATE INDEX IF NOT EXISTS idx_comment_reports_comment ON public.comment_reports(comment_id);

COMMIT;
