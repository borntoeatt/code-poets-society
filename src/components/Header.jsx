import { useEffect, useState } from 'react';

const NAV = [
    { page: 'home', label: 'Home', path: '/' },
    { page: 'projects', label: 'Projects', path: '/projects' },
    { page: 'playground', label: 'Playground', path: '/playground' },
];

export default function Header({ currentPage, currentUser, logout, onLogin }) {
    // index.html already applied the saved/preferred theme before first paint;
    // read it back here so the toggle reflects it.
    const [theme, setTheme] = useState(
        () => document.documentElement.getAttribute('data-theme') || 'light',
    );

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    // Persist only on an explicit toggle. Writing the OS-derived default on
    // mount would freeze the visitor's system preference at first visit.
    const toggleTheme = () => {
        const next = theme === 'light' ? 'dark' : 'light';
        setTheme(next);
        try {
            localStorage.setItem('theme', next);
        } catch {
            /* storage unavailable */
        }
    };
    const nextTheme = theme === 'light' ? 'dark' : 'light';

    return (
        <header className="header">
            <div className="header-content">
                {/* Real links: middle-click / copy-link work and aria-current is valid. */}
                <a className="logo" href="#/" aria-label="Code Poets Society home">
                    <span className="code">&lt;code&gt;</span> Poets Society <span className="code">&lt;/code&gt;</span>
                </a>
                <nav className="nav" aria-label="Main">
                    {NAV.map(({ page, label, path }) => (
                        <a
                            key={page}
                            href={`#${path}`}
                            className={`nav-link ${currentPage === page ? 'active' : ''}`}
                            aria-current={currentPage === page ? 'page' : undefined}
                        >
                            {label}
                        </a>
                    ))}

                    <label className="theme-switch" title={`Switch to ${nextTheme} mode`}>
                        <input
                            type="checkbox"
                            checked={theme === 'dark'}
                            onChange={toggleTheme}
                            aria-label={`Switch to ${nextTheme} mode`}
                        />
                        <span className="slider"></span>
                    </label>

                    {currentUser ? (
                        <div className="user-menu">
                            <div className="user-avatar" title={currentUser.name} aria-hidden="true">
                                {currentUser.name.charAt(0).toUpperCase()}
                            </div>
                            <button className="nav-link" onClick={logout}>Logout</button>
                        </div>
                    ) : (
                        <button className="btn btn-primary btn-small" onClick={onLogin}>
                            Login / Sign Up
                        </button>
                    )}
                </nav>
            </div>
        </header>
    );
}
