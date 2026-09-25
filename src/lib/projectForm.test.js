import { describe, expect, it } from 'vitest';
import { LIMITS } from '../config.js';
import { EMPTY_PROJECT_FORM, formValuesToRow, projectToFormValues } from './projectForm.js';
import { validateProjectForm } from './validation.js';

// Shape produced by ProjectsPage's allProjects mapping.
const uiProject = {
    id: '9445a40c-9f5a-480b-b1ad-dec929a14967',
    title: 'Code Poets Society',
    description: 'Blog like for coders',
    tech_stack: ['React', 'Supabase'],
    githubUrl: 'https://github.com/borntoeatt/code-poets-society',
    demoUrl: null,
    author: 'kasabira',
    authorId: '696e7679-4e9c-4c03-85b5-5e48b3d3a871',
    stars: 0,
    isSupabase: true,
};

describe('projectToFormValues', () => {
    it('pre-fills the edit form from a project', () => {
        expect(projectToFormValues(uiProject)).toEqual({
            title: 'Code Poets Society',
            description: 'Blog like for coders',
            tech_stack: 'React, Supabase',
            github_url: 'https://github.com/borntoeatt/code-poets-society',
            demo_url: '',
        });
    });

    it('produces a form that passes validation unchanged (edit + save without changes)', () => {
        expect(validateProjectForm(projectToFormValues(uiProject))).toBe('');
    });

    it('tolerates missing optional fields', () => {
        expect(projectToFormValues({ title: 'x', tech_stack: undefined })).toEqual({
            ...EMPTY_PROJECT_FORM,
            title: 'x',
        });
    });
});

describe('formValuesToRow', () => {
    it('round-trips a project without changing it', () => {
        const row = formValuesToRow(projectToFormValues(uiProject));
        expect(row).toEqual({
            title: uiProject.title,
            description: uiProject.description,
            tech_stack: uiProject.tech_stack,
            github_url: uiProject.githubUrl,
            demo_url: null,
        });
    });

    it('trims, normalises URLs and turns empty URLs into NULL', () => {
        expect(formValuesToRow({
            title: '  Title  ',
            description: ' Desc ',
            tech_stack: ' Go , Rust, Go ',
            github_url: ' HTTPS://GitHub.com/Me/Repo ',
            demo_url: '   ',
        })).toEqual({
            title: 'Title',
            description: 'Desc',
            tech_stack: ['Go', 'Rust'],
            github_url: 'https://github.com/Me/Repo',
            demo_url: null,
        });
    });

    it('caps the tech stack at the DB limit', () => {
        const many = Array.from({ length: 30 }, (_, i) => `t${i}`).join(',');
        expect(formValuesToRow({ ...EMPTY_PROJECT_FORM, title: 'abc', description: 'd', tech_stack: many }).tech_stack)
            .toHaveLength(LIMITS.techStackMax);
    });

    it('only ever writes user-editable columns', () => {
        // The UPDATE goes straight to PostgREST; ownership, slug and counters
        // must never be part of it (the DB trigger also pins them).
        const row = formValuesToRow({ ...projectToFormValues(uiProject), author_id: 'someone-else', stars_count: 999 });
        expect(Object.keys(row).sort()).toEqual(['demo_url', 'description', 'github_url', 'tech_stack', 'title']);
    });
});
