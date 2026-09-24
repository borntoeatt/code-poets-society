import { LIMITS } from '../config.js';
import { isGithubRepoUrl, parseTechStack, safeHttpUrl } from './utils.js';

// Postgres length() counts code points; JS .length counts UTF-16 units, so
// count code points here to agree with the CHECK constraints on emoji input.
export const codePoints = (s) => [...s].length;

// Client-side mirror of the projects CHECK constraints (migrations 002, 004,
// 006). Returns an error message, or '' when the form is valid.
export function validateProjectForm(form) {
    const title = form.title.trim();
    const description = form.description.trim();
    if (codePoints(title) < LIMITS.titleMin || codePoints(title) > LIMITS.titleMax) {
        return `Title must be between ${LIMITS.titleMin} and ${LIMITS.titleMax} characters.`;
    }
    if (!description || codePoints(description) > LIMITS.descriptionMax) {
        return `Description must be between 1 and ${LIMITS.descriptionMax} characters.`;
    }
    const tech = parseTechStack(form.tech_stack, LIMITS.techStackMax);
    if (tech.length === 0) return 'Add at least one technology.';
    if (codePoints(tech.join('')) > LIMITS.techStackTotalMax) {
        return `Tech stack is too long (max ${LIMITS.techStackTotalMax} characters in total).`;
    }
    if (form.github_url && !isGithubRepoUrl(form.github_url)) {
        return 'GitHub URL must look like https://github.com/user/repo.';
    }
    if (form.demo_url && !safeHttpUrl(form.demo_url)) return 'Demo URL must start with http:// or https://.';
    return '';
}
