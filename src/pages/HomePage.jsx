import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { navigate } from '../hooks/useHashRoute.js';
import NewsletterSection from '../components/NewsletterSection.jsx';

async function count(table) {
    const { count: n, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) throw error;
    return n || 0;
}

export default function HomePage({ currentUser, onLogin, onBackendError }) {
    const [stats, setStats] = useState({});

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [projects, members, subscribers] = await Promise.allSettled([
                count('projects'),
                count('profiles'),
                // Subscriber emails are private; only the count is exposed via RPC
                // (created by migrations/004_lock_down_rls.sql).
                supabase.rpc('newsletter_subscriber_count').then(({ data, error }) => {
                    if (error) throw error;
                    return data || 0;
                }),
            ]);
            if (cancelled) return;

            const value = (r) => (r.status === 'fulfilled' ? r.value : null);
            setStats({ projects: value(projects), members: value(members), subscribers: value(subscribers) });

            [projects, members, subscribers]
                .filter((r) => r.status === 'rejected')
                .forEach((r) => console.error('Failed to load stat:', r.reason));
            // Core tables failing means the backend itself is unreachable.
            if (projects.status === 'rejected' && members.status === 'rejected') onBackendError?.();
        })();
        return () => { cancelled = true; };
    }, [onBackendError]);

    const stat = (n) => (n == null ? '—' : `${n}+`);

    return (
        <div className="container">
            <div className="hero">
                <h1 className="hero-title">Where Code Meets Poetry</h1>
                <p className="hero-subtitle">&gt; A creative collective for coding enthusiasts_</p>
                <p className="hero-description">
                    Join a community where developers craft elegant solutions, share
                    innovative projects, and collaborate on code that reads like verse.
                    Every function tells a story. Every algorithm is art.
                </p>
                <div className="hero-buttons">
                    {!currentUser && (
                        <button className="btn btn-primary" onClick={onLogin}>Join the Society</button>
                    )}
                    <button className="btn btn-secondary" onClick={() => navigate('/projects')}>Explore Projects</button>
                    <button className="btn btn-secondary" onClick={() => navigate('/playground')}>Try Playground</button>
                </div>
            </div>

            <div className="stats">
                <div className="stat-card">
                    <span className="stat-number">{stat(stats.projects)}</span>
                    <span className="stat-label">Active Projects</span>
                </div>
                <div className="stat-card">
                    <span className="stat-number">{stat(stats.members)}</span>
                    <span className="stat-label">Community Members</span>
                </div>
                <div className="stat-card">
                    <span className="stat-number">{stat(stats.subscribers)}</span>
                    <span className="stat-label">Newsletter Subscribers</span>
                </div>
            </div>

            <NewsletterSection />
        </div>
    );
}
