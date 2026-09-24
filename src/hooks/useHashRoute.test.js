import { describe, expect, it } from 'vitest';
import { parseHash } from './useHashRoute.js';

describe('parseHash', () => {
    it.each([
        ['', { page: 'home', projectId: null }],
        ['#', { page: 'home', projectId: null }],
        ['#/', { page: 'home', projectId: null }],
        ['#/projects', { page: 'projects', projectId: null }],
        ['#/projects/', { page: 'projects', projectId: null }],
        ['#/projects/9445a40c-9f5a-480b-b1ad-dec929a14967', { page: 'projects', projectId: '9445a40c-9f5a-480b-b1ad-dec929a14967' }],
        ['#/projects/gh-123', { page: 'projects', projectId: 'gh-123' }],
        ['#/playground', { page: 'playground', projectId: null }],
        ['#/nope', { page: 'home', projectId: null }],
    ])('%j', (hash, expected) => {
        expect(parseHash(hash)).toEqual(expected);
    });

    it('treats Supabase auth fragments as the home page', () => {
        // Expired link and recovery redirects land on the site root with
        // params in the fragment; they must not route anywhere odd.
        expect(parseHash('#error=access_denied&error_code=otp_expired').page).toBe('home');
        expect(parseHash('#access_token=abc&type=recovery').page).toBe('home');
    });
});
