-- RLS Policy Gaps & Schema Constraints
-- Run this in Supabase SQL Editor

-- =============================================
-- MISSING RLS POLICIES
-- =============================================

-- Collaborators: project owners can update collaborator roles
CREATE POLICY "Project owners can update collaborators" ON public.collaborators
    FOR UPDATE USING (
        project_id IN (SELECT id FROM public.projects WHERE author_id = auth.uid())
    );

-- Collaborators: project owners can remove collaborators
CREATE POLICY "Project owners can remove collaborators" ON public.collaborators
    FOR DELETE USING (
        project_id IN (SELECT id FROM public.projects WHERE author_id = auth.uid())
    );

-- Project Tags: project owners can tag their own projects
CREATE POLICY "Project owners can add tags" ON public.project_tags
    FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM public.projects WHERE author_id = auth.uid())
    );

-- Project Tags: project owners can remove tags from their projects
CREATE POLICY "Project owners can remove tags" ON public.project_tags
    FOR DELETE USING (
        project_id IN (SELECT id FROM public.projects WHERE author_id = auth.uid())
    );

-- =============================================
-- COLUMN CONSTRAINTS
-- =============================================

-- Username length constraint
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_username_length CHECK (length(username) >= 2 AND length(username) <= 50);

-- Bio length constraint
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR length(bio) <= 500);

-- Project title length constraint
ALTER TABLE public.projects
    ADD CONSTRAINT projects_title_length CHECK (length(title) >= 3 AND length(title) <= 150);

-- Project description length constraint
ALTER TABLE public.projects
    ADD CONSTRAINT projects_description_length CHECK (length(description) <= 2000);

-- Comment content length constraint
ALTER TABLE public.comments
    ADD CONSTRAINT comments_content_length CHECK (length(content) >= 1 AND length(content) <= 1000);

-- Slug format constraint (lowercase alphanumeric + hyphens)
ALTER TABLE public.projects
    ADD CONSTRAINT projects_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$');

-- =============================================
-- MISSING INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_projects_featured ON public.projects(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_projects_slug ON public.projects(slug);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_comments_author ON public.comments(author_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_active ON public.newsletter_subscribers(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_project_tags_tag ON public.project_tags(tag_id);
