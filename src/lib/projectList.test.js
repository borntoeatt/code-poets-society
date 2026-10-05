import { describe, expect, it } from 'vitest';
import { filterAndSortProjects, isGithubId, languagesOf } from './projectList.js';

const me = 'user-me';
const list = [
    { id: 'a', title: 'Zeta tool', description: 'CLI for poets', language: 'Rust', stars: 2, authorId: me },
    { id: 'b', title: 'alpha site', description: 'A blog', language: 'JavaScript', stars: 5, authorId: 'other' },
    { id: 'c', title: 'Middle', description: null, language: 'rust', stars: 2, authorId: 'other' },
    { id: 'd', title: 'No language', description: 'misc', language: null, stars: 0, authorId: me },
];
const ids = (projects) => projects.map((p) => p.id);

describe('isGithubId', () => {
    it('recognises GitHub pick ids only', () => {
        expect(isGithubId('gh-123')).toBe(true);
        expect(isGithubId('9445a40c-9f5a-480b-b1ad-dec929a14967')).toBe(false);
        expect(isGithubId(null)).toBe(false);
        expect(isGithubId(undefined)).toBe(false);
    });
});

describe('languagesOf', () => {
    it('lists distinct languages in first-seen order after "all", skipping empty ones', () => {
        expect(languagesOf(list)).toEqual(['all', 'Rust', 'JavaScript', 'rust']);
        expect(languagesOf([])).toEqual(['all']);
    });
});

describe('filterAndSortProjects', () => {
    it('keeps incoming order for "newest" with no filters', () => {
        expect(ids(filterAndSortProjects(list))).toEqual(['a', 'b', 'c', 'd']);
    });

    it('searches title and description, case-insensitively, ignoring null descriptions', () => {
        expect(ids(filterAndSortProjects(list, { query: 'POET' }))).toEqual(['a']);
        expect(ids(filterAndSortProjects(list, { query: 'blog' }))).toEqual(['b']);
        expect(ids(filterAndSortProjects(list, { query: '  middle ' }))).toEqual(['c']);
    });

    it('filters by language case-insensitively', () => {
        expect(ids(filterAndSortProjects(list, { language: 'Rust' }))).toEqual(['a', 'c']);
    });

    it('shows only my projects when asked', () => {
        expect(ids(filterAndSortProjects(list, { mineUserId: me }))).toEqual(['a', 'd']);
    });

    it('sorts by stars with ties keeping their original order', () => {
        expect(ids(filterAndSortProjects(list, { sortBy: 'stars' }))).toEqual(['b', 'a', 'c', 'd']);
    });

    it('sorts A-Z by title', () => {
        expect(ids(filterAndSortProjects(list, { sortBy: 'az' }))).toEqual(['b', 'c', 'd', 'a']);
    });

    it('combines filters', () => {
        expect(ids(filterAndSortProjects(list, { language: 'rust', mineUserId: me, sortBy: 'az' }))).toEqual(['a']);
    });

    it('does not mutate its input', () => {
        const copy = list.map((p) => ({ ...p }));
        filterAndSortProjects(list, { sortBy: 'az' });
        expect(list).toEqual(copy);
    });
});
