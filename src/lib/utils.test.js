import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeDate, isGithubRepoUrl, makeSlug, parseTechStack, safeHttpUrl } from './utils.js';

describe('safeHttpUrl', () => {
    it('keeps http(s) URLs, normalised', () => {
        expect(safeHttpUrl('https://example.com')).toBe('https://example.com/');
        expect(safeHttpUrl('HTTP://Example.COM/Path')).toBe('http://example.com/Path');
    });

    it.each([
        ['javascript:alert(1)'],
        ['JavaScript:alert(1)'],
        ['  javascript:alert(1)'],
        ['data:text/html,<script>alert(1)</script>'],
        ['vbscript:msgbox(1)'],
        ['ftp://example.com'],
        ['//example.com'],
        ['not a url'],
        [''],
        [null],
        [undefined],
    ])('rejects %j', (input) => {
        expect(safeHttpUrl(input)).toBeNull();
    });
});

describe('isGithubRepoUrl', () => {
    it('accepts owner/repo URLs over https', () => {
        expect(isGithubRepoUrl('https://github.com/borntoeatt/code-poets-society')).toBe(true);
    });
    it.each([
        ['https://github.com/borntoeatt'],
        ['https://github.com/'],
        ['http://github.com/user/repo'],
        ['https://gitlab.com/user/repo'],
        ['https://github.com.evil.example/user/repo'],
        ['https://evil.example/github.com/user/repo'],
    ])('rejects %s', (input) => {
        expect(isGithubRepoUrl(input)).toBe(false);
    });
});

describe('makeSlug', () => {
    it('lowercases, hyphenates and adds a 6-char suffix', () => {
        expect(makeSlug('Code Poets Society')).toMatch(/^code-poets-society-[a-z0-9]{6}$/);
    });
    it('strips diacritics', () => {
        expect(makeSlug('Café Déjà Vu')).toMatch(/^cafe-deja-vu-[a-z0-9]{6}$/);
    });
    it('falls back to "project" when nothing ASCII is left', () => {
        expect(makeSlug('🎉🎉🎉')).toMatch(/^project-[a-z0-9]{6}$/);
        expect(makeSlug('日本語')).toMatch(/^project-[a-z0-9]{6}$/);
    });
    it('caps the base at 60 characters without a trailing hyphen', () => {
        const slug = makeSlug(`${'word '.repeat(40)}`);
        const base = slug.slice(0, -7);
        expect(base.length).toBeLessThanOrEqual(60);
        expect(base.endsWith('-')).toBe(false);
    });
    it('differs for identical titles (UNIQUE slug)', () => {
        const slugs = new Set(Array.from({ length: 50 }, () => makeSlug('Same title')));
        expect(slugs.size).toBe(50);
    });
});

describe('parseTechStack', () => {
    it('trims, drops empties and de-duplicates, keeping order', () => {
        expect(parseTechStack(' React, , Node.js,React ,  ')).toEqual(['React', 'Node.js']);
    });
    it('caps the number of entries', () => {
        const input = Array.from({ length: 30 }, (_, i) => `t${i}`).join(',');
        expect(parseTechStack(input)).toHaveLength(20);
        expect(parseTechStack(input, 5)).toEqual(['t0', 't1', 't2', 't3', 't4']);
    });
    it('returns [] for empty input', () => {
        expect(parseTechStack('')).toEqual([]);
        expect(parseTechStack(' , ,')).toEqual([]);
    });
});

describe('formatRelativeDate', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
    });
    afterEach(() => vi.useRealTimers());

    const ago = (ms) => new Date(now.getTime() - ms).toISOString();

    it.each([
        [10 * 1000, 'just now'],
        [5 * 60 * 1000, '5m ago'],
        [59 * 60 * 1000, '59m ago'],
        [3 * 3600 * 1000, '3h ago'],
        [2 * 86400 * 1000, '2d ago'],
        [6 * 86400 * 1000, '6d ago'],
    ])('%i ms ago -> %s', (ms, expected) => {
        expect(formatRelativeDate(ago(ms))).toBe(expected);
    });

    it('falls back to a date after a week', () => {
        const old = ago(8 * 86400 * 1000);
        expect(formatRelativeDate(old)).toBe(new Date(old).toLocaleDateString());
    });
});
