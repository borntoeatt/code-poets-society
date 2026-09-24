// Contract tests: the client-side limits and URL/slug rules must match the
// CHECK constraints in the migrations. The numbers and regexes are read from
// the SQL files themselves, so changing a constraint without updating the
// client (or vice versa) fails here instead of as a generic 23514 for users.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIMITS } from '../config.js';
import { isGithubRepoUrl, makeSlug, parseTechStack, safeHttpUrl } from './utils.js';
import { validateProjectForm } from './validation.js';

// The whole schema history in apply order: base schema, then every migration
// sorted by filename. A later migration that redefines a constraint wins.
const migrationsDir = new URL('../../migrations/', import.meta.url);
const allSql = [
    readFileSync(new URL('../../supabase-schema.sql', import.meta.url), 'utf8'),
    ...readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8')),
].join('\n');

// Body of the LAST `ADD CONSTRAINT <name> CHECK (...)` in history, failing if
// it is missing or was dropped afterwards without being re-added.
function latestCheck(name) {
    const adds = [...allSql.matchAll(new RegExp(`ADD CONSTRAINT ${name}\\s+CHECK\\s*\\(([\\s\\S]*?)\\);`, 'g'))];
    if (adds.length === 0) throw new Error(`No CHECK constraint named ${name} in the migrations; update this test.`);
    const last = adds[adds.length - 1];
    const after = allSql.slice(last.index + last[0].length);
    if (new RegExp(`DROP CONSTRAINT (IF EXISTS )?${name}\\b`).test(after)) {
        throw new Error(`${name} is dropped after its last definition; update this test.`);
    }
    return last[1];
}

function parse(name, re) {
    const m = latestCheck(name).match(re);
    if (!m) throw new Error(`${name} no longer has the expected shape; update this test.`);
    return m;
}

const title = parse('projects_title_length', /length\(title\) >= (\d+) AND length\(title\) <= (\d+)/);
const description = parse('projects_description_length', /length\(description\) <= (\d+)/);
const comment = parse('comments_content_length', /length\(content\) >= 1 AND length\(content\) <= (\d+)/);
const slugFormat = new RegExp(parse('projects_slug_format', /slug ~ '([^']+)'/)[1]);
const slugMax = Number(parse('projects_slug_length', /length\(slug\) <= (\d+)/)[1]);
const tech = parse(
    'projects_tech_stack_bounds',
    /cardinality\(tech_stack\) BETWEEN 1 AND (\d+) AND length\(array_to_string\(tech_stack, ''\)\) <= (\d+)/,
);
const githubRe = new RegExp(parse('projects_github_url_format', /github_url ~ '([^']+)'/)[1]);
const demoRe = new RegExp(parse('projects_demo_url_format', /demo_url ~ '([^']+)'/)[1]);

describe('LIMITS mirror the database CHECK constraints', () => {
    it('title length', () => {
        expect(LIMITS.titleMin).toBe(Number(title[1]));
        expect(LIMITS.titleMax).toBe(Number(title[2]));
    });
    it('description length', () => expect(LIMITS.descriptionMax).toBe(Number(description[1])));
    it('comment length', () => expect(LIMITS.commentMax).toBe(Number(comment[1])));
    it('tech stack bounds', () => {
        expect(LIMITS.techStackMax).toBe(Number(tech[1]));
        expect(LIMITS.techStackTotalMax).toBe(Number(tech[2]));
    });
});

describe('makeSlug always satisfies the slug CHECKs', () => {
    const titles = [
        'Code Poets Society',
        'C++',
        'Café Déjà Vu',
        '日本語のプロジェクト',
        '🎉🎉🎉',
        '---weird---title---',
        'a',
        'x'.repeat(150),
        `${'word '.repeat(40)}end`,
        'Ends with symbols!!!',
        '  leading and trailing spaces  ',
    ];
    it.each(titles)('%s', (t) => {
        const slug = makeSlug(t);
        expect(slug).toMatch(slugFormat);
        expect(slug.length).toBeLessThanOrEqual(slugMax);
    });
});

describe('URLs the form accepts are the URLs the database accepts', () => {
    // ProjectsPage stores safeHttpUrl(input), so that is what the CHECK sees.
    const githubInputs = [
        'https://github.com/user/repo',
        'HTTPS://GitHub.com/User/Repo',
        'https://github.com:443/user/repo',
        'https://github.com/user/repo/tree/main',
        'https://github.com/user/repo?tab=readme',
    ];
    it.each(githubInputs)('github: %s', (input) => {
        expect(isGithubRepoUrl(input)).toBe(true);
        expect(safeHttpUrl(input)).toMatch(githubRe);
    });

    const demoInputs = ['https://example.com', 'http://example.com/app', 'HTTP://Example.com', 'https://example.com:8443/x'];
    it.each(demoInputs)('demo: %s', (input) => {
        expect(safeHttpUrl(input)).not.toBeNull();
        expect(safeHttpUrl(input)).toMatch(demoRe);
    });

    const rejected = ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'example.com', 'http://github.com/user/repo'];
    it.each(rejected)('rejected as a GitHub URL: %s', (input) => {
        expect(isGithubRepoUrl(input)).toBe(false);
    });
});

describe('validateProjectForm agrees with the CHECKs at the boundaries', () => {
    const base = { title: 'Valid title', description: 'Something', tech_stack: 'JS', github_url: '', demo_url: '' };

    it('accepts exactly the minimum and maximum title length in code points', () => {
        expect(validateProjectForm({ ...base, title: 'x'.repeat(LIMITS.titleMin) })).toBe('');
        expect(validateProjectForm({ ...base, title: 'x'.repeat(LIMITS.titleMax) })).toBe('');
        // 3 emoji = 3 code points (6 UTF-16 units): valid for Postgres length()
        expect(validateProjectForm({ ...base, title: '🎉🎉🎉' })).toBe('');
    });

    it('rejects one past each title bound', () => {
        expect(validateProjectForm({ ...base, title: 'x'.repeat(LIMITS.titleMin - 1) })).not.toBe('');
        expect(validateProjectForm({ ...base, title: 'x'.repeat(LIMITS.titleMax + 1) })).not.toBe('');
        // 2 code points but JS .length 3: must be rejected like Postgres would
        expect(validateProjectForm({ ...base, title: '🎉!' })).not.toBe('');
    });

    it('tech stack total length is measured on what gets stored', () => {
        const entries = Array.from({ length: LIMITS.techStackMax }, (_, i) => `t${i}`.padEnd(50, 'x'));
        const stored = parseTechStack(entries.join(','), LIMITS.techStackMax);
        expect(stored.join('').length).toBe(1000);
        expect(validateProjectForm({ ...base, tech_stack: entries.join(',') })).toBe('');
        const tooLong = [...entries.slice(0, -1), 'y'.repeat(51)];
        expect(validateProjectForm({ ...base, tech_stack: tooLong.join(',') })).not.toBe('');
    });
});
