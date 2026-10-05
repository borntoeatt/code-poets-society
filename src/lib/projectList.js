// Pure helpers behind the projects page's filter bar, kept out of the
// component so they can be unit-tested.

// GitHub picks use "gh-<repo id>" ids; community projects use UUIDs.
export const isGithubId = (id) => typeof id === 'string' && id.startsWith('gh-');

// "all" plus each distinct language in the list, in first-seen order.
export function languagesOf(projects) {
    return ['all', ...new Set(projects.map((p) => p.language).filter(Boolean))];
}

// Search (title/description), language, "only mine", then sort.
// 'newest' keeps the incoming order (the query is already newest-first).
export function filterAndSortProjects(projects, { query = '', language = 'all', mineUserId = null, sortBy = 'newest' } = {}) {
    const q = query.trim().toLowerCase();
    const lang = language.toLowerCase();
    return projects
        .filter((p) => !mineUserId || p.authorId === mineUserId)
        .filter((p) => !q || p.title.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
        .filter((p) => language === 'all' || (p.language || '').toLowerCase() === lang)
        .map((p, index) => ({ p, index }))
        .sort((a, b) => {
            if (sortBy === 'stars') return (b.p.stars || 0) - (a.p.stars || 0) || a.index - b.index;
            if (sortBy === 'az') return a.p.title.localeCompare(b.p.title);
            return a.index - b.index;
        })
        .map(({ p }) => p);
}
