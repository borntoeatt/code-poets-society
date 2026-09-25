import { describe, expect, it } from 'vitest';
import { friendlyError } from './errors.js';

describe('friendlyError', () => {
    it('maps unique violations', () => {
        expect(friendlyError({ code: '23505', message: 'duplicate key' })).toMatch(/already exists/);
    });
    it('maps CHECK violations, including too-short values', () => {
        expect(friendlyError({ code: '23514', message: 'violates check constraint' })).toMatch(/too short, too long/);
    });
    it('passes rate-limit messages from the triggers through verbatim', () => {
        const message = 'Rate limit exceeded: max 5 comments per minute';
        expect(friendlyError({ code: 'P0001', message })).toBe(message);
    });
    it.each([
        [{ code: 'PGRST301', message: 'JWT cryptographic operation failed' }],
        [{ code: 'PGRST303', message: 'JWT expired' }],
        [{ message: 'invalid JWT: unable to parse or verify signature' }],
    ])('asks to log in again for an invalid or expired session: %j', (error) => {
        expect(friendlyError(error, 'fallback')).toMatch(/session is no longer valid/);
    });
    it('explains network failures', () => {
        expect(friendlyError({ message: 'TypeError: Failed to fetch' })).toMatch(/Cannot reach the server/);
    });
    it('never leaks other database messages', () => {
        const error = { code: '42501', message: 'new row violates row-level security policy for table "projects"' };
        expect(friendlyError(error)).toBe('Something went wrong. Please try again.');
        expect(friendlyError(error, 'Could not save.')).toBe('Could not save.');
    });
    it('handles a missing error', () => {
        expect(friendlyError(null, 'fallback')).toBe('fallback');
    });
});
