-- Comment Reports table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.comment_reports (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE NOT NULL,
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    reason TEXT NOT NULL CHECK (length(reason) <= 500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(comment_id, reporter_id)  -- one report per user per comment
);

ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated users can report comments
CREATE POLICY "Authenticated users can report comments" ON public.comment_reports
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = reporter_id);

-- Users can see their own reports
CREATE POLICY "Users can see own reports" ON public.comment_reports
    FOR SELECT USING (auth.uid() = reporter_id);

CREATE INDEX idx_comment_reports_comment ON public.comment_reports(comment_id);
