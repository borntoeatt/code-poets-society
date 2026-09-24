import { LIMITS } from '../config.js';
import { parseTechStack, safeHttpUrl } from './utils.js';

export const EMPTY_PROJECT_FORM = { title: '', description: '', tech_stack: '', github_url: '', demo_url: '' };

// UI project model (as mapped in ProjectsPage) -> editable form values.
export function projectToFormValues(project) {
    return {
        title: project.title || '',
        description: project.description || '',
        tech_stack: (project.tech_stack || []).join(', '),
        github_url: project.githubUrl || '',
        demo_url: project.demoUrl || '',
    };
}

// Form values -> the user-editable columns of a projects row. URLs are stored
// in the normalised form that validation checked (lower-cased scheme/host),
// so the case-sensitive DB CHECK constraints see the same string; empty
// optional URLs become NULL. Slug, author and counters are never set here.
export function formValuesToRow(values) {
    return {
        title: values.title.trim(),
        description: values.description.trim(),
        tech_stack: parseTechStack(values.tech_stack, LIMITS.techStackMax),
        github_url: safeHttpUrl(values.github_url.trim()),
        demo_url: safeHttpUrl(values.demo_url.trim()),
    };
}
