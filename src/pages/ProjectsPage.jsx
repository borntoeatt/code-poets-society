import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, friendlyError } from '../lib/supabase.js';
import { navigate } from '../hooks/useHashRoute.js';
import { makeSlug } from '../lib/utils.js';
import { EMPTY_PROJECT_FORM, formValuesToRow } from '../lib/projectForm.js';
import ProjectDetailModal from '../components/ProjectDetailModal.jsx';
import ProjectForm from '../components/ProjectForm.jsx';

const GITHUB_CACHE_KEY = 'github_projects_cache';
const GITHUB_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const GITHUB_TOPICS = ['javascript', 'python', 'rust', 'web-development'];
const PAGE = 12;

async function fetchGithubProjects() {
    try {
        const cached = JSON.parse(localStorage.getItem(GITHUB_CACHE_KEY) || 'null');
        if (cached && Date.now() - cached.timestamp < GITHUB_CACHE_TTL) return cached.data;
    } catch {
        /* ignore bad cache */
    }
    const topic = GITHUB_TOPICS[Math.floor(Math.random() * GITHUB_TOPICS.length)];
    const res = await fetch(
        `https://api.github.com/search/repositories?q=topic:${topic}+stars:>100&sort=stars&order=desc&per_page=6`,
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    const items = data.items || [];
    try {
        localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify({ data: items, timestamp: Date.now() }));
    } catch {
        /* storage unavailable */
    }
    return items;
}

export default function ProjectsPage({ currentUser, onLogin, selectedId, onBackendError }) {
    const [projects, setProjects] = useState([]);
    const [githubProjects, setGithubProjects] = useState([]);
    const [githubSettled, setGithubSettled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [showSubmitForm, setShowSubmitForm] = useState(false);
    const [mineOnly, setMineOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filterLanguage, setFilterLanguage] = useState('all');
    const [sortBy, setSortBy] = useState('newest');
    const [visible, setVisible] = useState(PAGE);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // `quiet` refreshes in place (after an edit/delete) instead of swapping
    // the grid for the loading placeholder.
    const loadProjects = async ({ quiet = false } = {}) => {
        if (!quiet) setLoading(true);
        setLoadError('');
        // Explicit columns: the list never depends on large optional fields
        // (long_description etc.), so one oversized row can't slow everyone.
        const { data, error } = await supabase
            .from('projects')
            .select('id, title, description, tech_stack, github_url, demo_url, stars_count, status, created_at, author_id, profiles!projects_author_id_fkey(username)')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('Failed to load projects:', error);
            setLoadError(friendlyError(error, 'Could not load community projects.'));
            onBackendError?.();
        } else {
            setProjects(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadProjects();
        // GitHub picks are decorative; a failure there shouldn't block the page.
        fetchGithubProjects()
            .then(setGithubProjects)
            .catch((err) => console.error('GitHub fetch failed:', err))
            .finally(() => setGithubSettled(true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const submitProject = async (values) => {
        if (!currentUser) {
            onLogin();
            return 'Please log in to submit a project.';
        }
        const { error } = await supabase.from('projects').insert([{
            ...formValuesToRow(values),
            author_id: currentUser.id,
            slug: makeSlug(values.title),
            status: 'active',
        }]);
        if (error) {
            console.error('Failed to save project:', error);
            return friendlyError(error, 'Failed to submit project. Please try again.');
        }
        setShowSubmitForm(false);
        await loadProjects();
        return '';
    };

    const refreshProjects = useCallback(() => loadProjects({ quiet: true }), []); // eslint-disable-line react-hooks/exhaustive-deps
    const handleProjectDeleted = useCallback(() => {
        navigate('/projects');
        loadProjects({ quiet: true });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const allProjects = useMemo(() => [
        ...projects.map((p) => ({
            id: String(p.id),
            title: p.title,
            description: p.description,
            language: p.tech_stack?.[0] || 'N/A',
            tech_stack: p.tech_stack || [],
            githubUrl: p.github_url,
            demoUrl: p.demo_url,
            author: p.profiles?.username || 'Unknown',
            authorId: p.author_id,
            stars: p.stars_count || 0,
            isSupabase: true,
        })),
        ...githubProjects.map((p) => ({
            id: `gh-${p.id}`,
            title: p.name,
            description: p.description,
            language: p.language,
            tech_stack: [p.language].filter(Boolean),
            githubUrl: p.html_url,
            author: p.owner.login,
            stars: p.stargazers_count,
            isGithub: true,
        })),
    ], [projects, githubProjects]);

    // "My projects" only applies while logged in (logging out shows everything).
    const showMine = mineOnly && Boolean(currentUser);

    const filteredProjects = useMemo(() => {
        const q = debouncedSearch.toLowerCase();
        return allProjects
            .filter((p) => !showMine || p.authorId === currentUser.id)
            .filter((p) => {
                const matchesSearch = p.title.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
                const matchesLanguage = filterLanguage === 'all' || p.language?.toLowerCase() === filterLanguage.toLowerCase();
                return matchesSearch && matchesLanguage;
            })
            .sort((a, b) => {
                if (sortBy === 'stars') return (b.stars || 0) - (a.stars || 0);
                if (sortBy === 'az') return a.title.localeCompare(b.title);
                return 0; // 'newest': keep created_at desc order from the query
            });
    }, [allProjects, debouncedSearch, filterLanguage, sortBy, showMine, currentUser]);

    const languages = useMemo(
        () => ['all', ...new Set(allProjects.map((p) => p.language).filter(Boolean))],
        [allProjects],
    );

    const selectedProject = selectedId ? allProjects.find((p) => p.id === selectedId) : null;
    // A shared link to a deleted project, or to a GitHub pick this browser
    // didn't fetch (the picks are a random topic per visitor), resolves to nothing.
    // Only when the list actually loaded: if it failed, the load error says so.
    const notFound = Boolean(selectedId) && !loading && !loadError && githubSettled && !selectedProject;

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h1 className="card-title" style={{ margin: 0 }}>Community Projects</h1>
                {currentUser && (
                    <button className="btn btn-primary" onClick={() => setShowSubmitForm((s) => !s)}>
                        {showSubmitForm ? 'Cancel' : '+ Submit Project'}
                    </button>
                )}
            </div>

            {showSubmitForm && (
                <div className="card">
                    <h2 className="card-title">Submit Your Project</h2>
                    <ProjectForm
                        initialValues={EMPTY_PROJECT_FORM}
                        idPrefix="project"
                        submitLabel="Submit Project"
                        submittingLabel="Submitting..."
                        onSubmit={submitProject}
                    />
                </div>
            )}

            <div className="filter-bar">
                <div className="search-box">
                    <input type="text" className="form-input" placeholder="Search projects..." value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search projects" />
                </div>
                <select className="form-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                    style={{ minWidth: '130px' }} aria-label="Sort projects">
                    <option value="newest">Newest</option>
                    <option value="stars">Most Stars</option>
                    <option value="az">A — Z</option>
                </select>
                <select className="form-select" value={filterLanguage} onChange={(e) => setFilterLanguage(e.target.value)}
                    style={{ minWidth: '150px' }} aria-label="Filter by language">
                    {languages.map((lang) => (
                        <option key={lang} value={lang}>{lang === 'all' ? 'All Languages' : lang}</option>
                    ))}
                </select>
                {currentUser && (
                    <button
                        type="button"
                        className="btn btn-secondary btn-small toggle-button"
                        aria-pressed={showMine}
                        onClick={() => setMineOnly((m) => !m)}
                    >
                        My projects
                    </button>
                )}
            </div>

            {loadError && <div className="form-error" role="alert" style={{ marginBottom: '1rem' }}>{loadError}</div>}
            {notFound && (
                <div className="form-error" role="alert" style={{ marginBottom: '1rem' }}>
                    That project could not be found. It may have been removed, or it was a featured GitHub pick
                    that is no longer shown. <a href="#/projects">Back to all projects</a>
                </div>
            )}

            {loading ? (
                <div className="loading">Loading projects...</div>
            ) : filteredProjects.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📦</div>
                    <p>
                        {showMine && !debouncedSearch && filterLanguage === 'all'
                            ? "You haven't submitted any projects yet."
                            : 'No projects found. Be the first to submit one!'}
                    </p>
                </div>
            ) : (
                <div className="projects-grid">
                    {filteredProjects.slice(0, visible).map((project) => (
                        // The title is the real link (keyboard + screen readers keep the
                        // heading, author and description); the card stays clickable for
                        // pointer users. A role=button card would hide all of its content.
                        <div
                            key={project.id}
                            className="project-card"
                            onClick={() => navigate(`/projects/${project.id}`)}
                        >
                            <div className="project-header">
                                <h3 className="project-title">
                                    <a href={`#/projects/${project.id}`} onClick={(e) => e.stopPropagation()}>
                                        {project.title}
                                    </a>
                                </h3>
                                {project.language && <span className="project-tag">{project.language}</span>}
                            </div>
                            <div className="project-author">
                                by {project.author}
                                {project.isGithub && <span> • GitHub</span>}
                                {project.isSupabase && <span> • Community</span>}
                            </div>
                            <p className="project-desc">{project.description}</p>
                            <div className="project-meta">
                                <span>⭐ {project.stars} stars</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {filteredProjects.length > visible && (
                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <button className="btn btn-secondary" onClick={() => setVisible((v) => v + PAGE)}>
                        Load More ({filteredProjects.length - visible} remaining)
                    </button>
                </div>
            )}

            {selectedProject && (
                <ProjectDetailModal
                    key={selectedProject.id}
                    project={selectedProject}
                    onClose={() => navigate('/projects')}
                    currentUser={currentUser}
                    onLogin={onLogin}
                    onUpdated={refreshProjects}
                    onDeleted={handleProjectDeleted}
                />
            )}
        </div>
    );
}
