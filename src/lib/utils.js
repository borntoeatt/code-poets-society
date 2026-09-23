// Only http(s) links are rendered as clickable; anything else (javascript:,
// data:, etc.) is dropped. The DB enforces the same rule via CHECK constraints.
export function safeHttpUrl(url) {
    if (!url) return null;
    try {
        const u = new URL(url);
        return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
    } catch {
        return null;
    }
}

export function isGithubRepoUrl(url) {
    const safe = safeHttpUrl(url);
    return !!safe && /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(safe);
}

// Lowercase, hyphenated, ASCII-only; a short random suffix keeps duplicate
// titles (and titles that slugify to nothing) from colliding on the UNIQUE slug.
export function makeSlug(title) {
    const base = title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/, '');
    const suffix = Math.random().toString(36).slice(2, 8);
    return base ? `${base}-${suffix}` : `project-${suffix}`;
}

export function formatRelativeDate(dateString) {
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

export function parseTechStack(input, max = 20) {
    return [...new Set(input.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, max);
}
