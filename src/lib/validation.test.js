import { describe, expect, it } from 'vitest';
import { codePoints, validateProjectForm } from './validation.js';

const valid = {
    title: 'My project',
    description: 'What it does',
    tech_stack: 'React, Node.js',
    github_url: '',
    demo_url: '',
};

describe('codePoints', () => {
    it('counts astral characters once, like Postgres length()', () => {
        expect(codePoints('🎉!')).toBe(2);
        expect('🎉!'.length).toBe(3);
        expect(codePoints('abc')).toBe(3);
    });
});

describe('validateProjectForm', () => {
    it('accepts a valid form with and without optional URLs', () => {
        expect(validateProjectForm(valid)).toBe('');
        expect(validateProjectForm({
            ...valid,
            github_url: 'https://github.com/me/project',
            demo_url: 'https://me.example',
        })).toBe('');
    });

    it('trims before measuring', () => {
        expect(validateProjectForm({ ...valid, title: '   ab   ' })).toMatch(/^Title/);
        expect(validateProjectForm({ ...valid, description: '    ' })).toMatch(/^Description/);
    });

    it('requires at least one technology', () => {
        expect(validateProjectForm({ ...valid, tech_stack: ' , ,' })).toMatch(/technology/);
    });

    it('rejects non-repo or non-https GitHub URLs', () => {
        expect(validateProjectForm({ ...valid, github_url: 'https://github.com/me' })).toMatch(/GitHub URL/);
        expect(validateProjectForm({ ...valid, github_url: 'http://github.com/me/p' })).toMatch(/GitHub URL/);
        expect(validateProjectForm({ ...valid, github_url: 'javascript:alert(1)' })).toMatch(/GitHub URL/);
    });

    it('rejects demo URLs that are not http(s)', () => {
        expect(validateProjectForm({ ...valid, demo_url: 'javascript:alert(1)' })).toMatch(/Demo URL/);
        expect(validateProjectForm({ ...valid, demo_url: 'example.com' })).toMatch(/Demo URL/);
    });
});
