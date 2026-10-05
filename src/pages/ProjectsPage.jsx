import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, friendlyError } from '../lib/supabase.js';
import { navigate } from '../hooks/useHashRoute.js';
import { makeSlug } from '../lib/utils.js';
import { EMPTY_PROJECT_FORM, PROJECT_LIST_COLUMNS, formValuesToRow } from '../lib/projectForm.js';
import { filterAndSortProjects, isGithubId, languagesOf } from '../lib/projectList.js';
import ProjectDetailModal from '../components/ProjectDetailModal.jsx';
import ProjectForm from '../components/ProjectForm.jsx';

const GITHUB_CACHE_KEY = 'github_projects_cache_v2';
const GITHUB_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const GITHUB_TOPICS = ['javascript', 'python', 'rust', 'web-development'];
const PAGE = 12;

const TABS = [
    { key: 'community', label: 'Community' },
    { key: 'github', label: 'From GitHub' },
];

async function fetchGithubProjects() {
    try {
        const cached = JSON.parse(localStorage.getItem(GITHUB_CACHE_KEY) || 'null');
        if (cached && Date.now() - cached.timestamp < GITHUB_CACHE_TTL) return cached;
    } catch {
        /* ignore bad cache */
    }
    const topic = GITHUB_TOPICS[Math.floor(Math.random() * GITHUB_TOPICS.length)];
    const res = await fetch(
        `https://api.github.com/search/repositories?q=topic:${topic}+stars:>100&sort=stars&order=desc&per_page=6`,
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    const result = { topic, items: data.items || [], timestamp: Date.now() };
    try {
        localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify(result));
    } catch {
        /* storage unavailable */
    }
    return result;
}

// One request per page load, shared by every mount (and StrictMode's double
// effects). A failure clears it so a later visit can retry. Only requested
// when the GitHub tab is opened or a shared link points at a GitHub pick:
// GitHub allows 60 anonymous searches per hour per IP.
let githubRequest = null;
function loadGithubOnce() {
    githubRequest ??= fetchGithubProjects().catch((err) => {
        githubRequest = null;
        throw err;
    });
    return githubRequest;
}

export default function ProjectsPage({ currentUser, onLogin, selectedId, onBackendError }) {
    const [projects, setProjects] = useState([]);
    const [github, setGithub] = useState({ topic: '', items: [] });
    const [githubSettled, setGithubSettled] = useState(false);
    const [githubError, setGithubError] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [showSubmitForm, setShowSubmitForm] = useState(false);
    const [mineOnly, setMineOnly] = useState(false);
    // A shared link to a GitHub pick opens on that tab.
    const [tab, setTab] = useState(() => (isGithubId(selectedId) ? 'github' : 'community'));
    // Status line after an owner action ("X was deleted."), and the id just
    // deleted so its still-in-the-URL id doesn't flash "not found".
    const [notice, setNotice] = useState('');
    const [lastDeletedId, setLastDeletedId] = useState(null);
    const headingRef = useRef(null);
    const tabRefs = useRef({});
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filterLanguage, setFilterLanguage] = useState('all');
    const [sortBy, setSortBy] = useState('newest');
    const [visible, setVisible] = useState(PAGE);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Explicit columns: the list never depends on large optional fields
    // (long_description etc.), so one oversized row can't slow everyone.
    const fetchProjects = () => supabase
        .from('projects')
        .select(PROJECT_LIST_COLUMNS)
        .order('created_at', { ascending: false });

    const applyProjects = ({ data, error }) => {
        if (error) {
            console.error('Failed to load projects:', error);
            setLoadError(friendlyError(error, 'Could not load community projects.'));
            onBackendError?.();
        } else {
            setLoadError('');
            setProjects(data || []);
        }
        setLoading(false);
    };

    // Initial load: `loading` starts true, and state is only set when the
    // request resolves (never synchronously in the effect body).
    useEffect(() => {
        let cancelled = false;
        fetchProjects().then((result) => { if (!cancelled) applyProjects(result); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const wantGithub = tab === 'github' || isGithubId(selectedId);
    useEffect(() => {
        if (!wantGithub) return undefined;
        let cancelled = false;
        loadGithubOnce()
            .then((result) => { if (!cancelled) { setGithub(result); setGithubError(false); } })
            .catch((err) => {
                console.error('GitHub fetch failed:', err);
                if (!cancelled) setGithubError(true);
            })
            .finally(() => { if (!cancelled) setGithubSettled(true); });
        return () => { cancelled = true; };
    }, [wantGithub]);

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
        setTab('community'); // show the new project where it lives
        setLoading(true);
        applyProjects(await fetchProjects());
        return '';
    };

    // Patch the list from the UPDATE's returned row, so the modal shows the
    // saved values immediately (no window where it shows, or re-edits, the
    // old ones) and doesn't depend on a follow-up reload succeeding.
    const handleProjectUpdated = useCallback((row) => {
        setProjects((prev) => prev.map((p) => (p.id === row.id ? { ...p, ...row } : p)));
    }, []);

    const handleProjectDeleted = useCallback(({ id, title }) => {
        setLastDeletedId(String(id));
        setProjects((prev) => prev.filter((p) => String(p.id) !== String(id)));
        setNotice(`"${title}" was deleted.`);
        navigate('/projects');
    }, []);

    // The deleted card (the modal's opener) is gone, so focus would fall to
    // <body>; put it on the page heading, next to the status message.
    useEffect(() => {
        if (notice) headingRef.current?.focus();
    }, [notice]);

    // Opening another project clears the status line. Adjusted during render
    // (React's pattern for resetting state when a prop changes), not in an
    // effect, so there's no extra render with the stale message.
    const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
    if (selectedId !== prevSelectedId) {
        setPrevSelectedId(selectedId);
        if (selectedId && selectedId !== lastDeletedId) setNotice('');
    }

    const communityProjects = useMemo(() => projects.map((p) => ({
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
    })), [projects]);

    const githubProjects = useMemo(() => github.items.map((p) => ({
        id: `gh-${p.id}`,
        title: p.name,
        description: p.description,
        language: p.language,
        tech_stack: [p.language].filter(Boolean),
        githubUrl: p.html_url,
        author: p.owner.login,
        stars: p.stargazers_count,
        isGithub: true,
    })), [github]);

    const tabProjects = tab === 'community' ? communityProjects : githubProjects;
    // "My projects" only applies to member projects, while logged in.
    const showMine = tab === 'community' && mineOnly && Boolean(currentUser);

    const languages = useMemo(() => languagesOf(tabProjects), [tabProjects]);
    // If an edit/delete, the other tab or a new GitHub pick set removes the
    // selected language, fall back to "all" instead of filtering on a ghost value.
    const activeLanguage = languages.includes(filterLanguage) ? filterLanguage : 'all';

    const filteredProjects = useMemo(() => filterAndSortProjects(tabProjects, {
        query: debouncedSearch,
        language: activeLanguage,
        mineUserId: showMine ? currentUser.id : null,
        sortBy,
    }), [tabProjects, debouncedSearch, activeLanguage, showMine, currentUser, sortBy]);

    // The modal can show a project from either source, whichever tab is open.
    const selectedProject = selectedId
        ? (isGithubId(selectedId) ? githubProjects : communityProjects).find((p) => p.id === selectedId)
        : null;
    // "Not found" only once the source that id belongs to has loaded
    // successfully: a community link needs the projects query, a GitHub
    // pick needs the (random-topic, per-visitor) GitHub list.
    const sourceSettled = isGithubId(selectedId) ? githubSettled && !githubError : !loading && !loadError;
    const notFound = Boolean(selectedId) && selectedId !== lastDeletedId && sourceSettled && !selectedProject;

    const selectTab = (key, { focus = false } = {}) => {
        setTab(key);
        setVisible(PAGE);
        if (focus) tabRefs.current[key]?.focus();
    };

    // WAI-ARIA tabs: arrows move between tabs (and select them), Home/End jump.
    const onTabKeyDown = (e) => {
        const index = TABS.findIndex((t) => t.key === tab);
        const next = {
            ArrowRight: (index + 1) % TABS.length,
            ArrowLeft: (index - 1 + TABS.length) % TABS.length,
            Home: 0,
            End: TABS.length - 1,
        }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        selectTab(TABS[next].key, { focus: true });
    };

    const tabCount = (key) => {
        if (key === 'community') return loading ? null : communityProjects.length;
        return githubSettled && !githubError ? githubProjects.length : null;
    };

    const listLoading = tab === 'community' ? loading : !githubSettled;

    let emptyMessage = 'No projects match your filters.';
    if (tab === 'community' && communityProjects.length === 0) {
        emptyMessage = 'No community projects yet. Be the first to submit one!';
    } else if (showMine && !debouncedSearch && activeLanguage === 'all') {
        emptyMessage = "You haven't submitted any projects yet.";
    }

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h1 ref={headingRef} tabIndex={-1} className="card-title page-heading" style={{ margin: 0 }}>Projects</h1>
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

            <div className="tabs" role="tablist" aria-label="Project source" onKeyDown={onTabKeyDown}>
                {TABS.map(({ key, label }) => {
                    const count = tabCount(key);
                    return (
                        <button
                            key={key}
                            ref={(el) => { tabRefs.current[key] = el; }}
                            type="button"
                            role="tab"
                            id={`tab-${key}`}
                            aria-selected={tab === key}
                            aria-controls="projects-panel"
                            tabIndex={tab === key ? 0 : -1}
                            className="tab"
                            onClick={() => selectTab(key)}
                        >
                            {label}
                            {count !== null && <span className="tab-count">{count}</span>}
                        </button>
                    );
                })}
            </div>

            <div role="tabpanel" id="projects-panel" aria-labelledby={`tab-${tab}`}>
                {tab === 'github' && (
                    <p className="tab-intro">
                        Popular open-source repositories
                        {github.topic && <> tagged <strong>{github.topic}</strong></>}, refreshed hourly.
                        These aren&apos;t Society projects. They&apos;re here for inspiration.
                    </p>
                )}

                <div className="filter-bar">
                    <div className="search-box">
                        <input type="text" className="form-input" placeholder="Search projects..." value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search projects" />
                    </div>
                    <select className="form-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                        style={{ minWidth: '130px' }} aria-label="Sort projects">
                        <option value="newest">{tab === 'community' ? 'Newest' : 'Most popular'}</option>
                        <option value="stars">Most Stars</option>
                        <option value="az">A — Z</option>
                    </select>
                    <select className="form-select" value={activeLanguage} onChange={(e) => setFilterLanguage(e.target.value)}
                        style={{ minWidth: '150px' }} aria-label="Filter by language">
                        {languages.map((lang) => (
                            <option key={lang} value={lang}>{lang === 'all' ? 'All Languages' : lang}</option>
                        ))}
                    </select>
                    {currentUser && tab === 'community' && (
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

                {notice && <div className="form-success-msg" role="status" style={{ marginBottom: '1rem' }}>{notice}</div>}
                {/* Each source's error shows on its tab, and also when the open link
                    points at that source (e.g. a GitHub-pick link followed from the
                    Community tab), so a failed link is never silent. */}
                {(tab === 'community' || (selectedId && !isGithubId(selectedId))) && loadError && (
                    <div className="form-error" role="alert" style={{ marginBottom: '1rem' }}>{loadError}</div>
                )}
                {(tab === 'github' || isGithubId(selectedId)) && githubError && (
                    <div className="form-error" role="alert" style={{ marginBottom: '1rem' }}>
                        Couldn&apos;t load picks from GitHub right now (GitHub limits anonymous requests). Try again later.
                    </div>
                )}
                {notFound && (
                    <div className="form-error" role="alert" style={{ marginBottom: '1rem' }}>
                        That project could not be found. It may have been removed, or it was a GitHub pick
                        that is no longer shown. <a href="#/projects">Back to all projects</a>
                    </div>
                )}

                {listLoading ? (
                    <div className="loading">Loading projects...</div>
                ) : filteredProjects.length === 0 ? (
                    !(tab === 'github' && githubError) && (
                        <div className="empty-state">
                            <div className="empty-state-icon">📦</div>
                            <p>{emptyMessage}</p>
                        </div>
                    )
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
                                <div className="project-author">by {project.author}</div>
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
            </div>

            {selectedProject && (
                <ProjectDetailModal
                    key={selectedProject.id}
                    project={selectedProject}
                    onClose={() => navigate('/projects')}
                    currentUser={currentUser}
                    onLogin={onLogin}
                    onUpdated={handleProjectUpdated}
                    onDeleted={handleProjectDeleted}
                />
            )}
        </div>
    );
}
