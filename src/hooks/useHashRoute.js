import { useEffect, useState } from 'react';

// Minimal hash router: #/ , #/projects , #/projects/<id> , #/playground
// Hash routing keeps nginx's static config unchanged and makes project links shareable.
export function parseHash(rawHash) {
    const hash = rawHash.replace(/^#/, '') || '/';
    const parts = hash.split('/').filter(Boolean);
    if (parts[0] === 'projects') return { page: 'projects', projectId: parts[1] || null };
    if (parts[0] === 'playground') return { page: 'playground', projectId: null };
    return { page: 'home', projectId: null };
}

const parse = () => parseHash(window.location.hash);

export function navigate(path) {
    window.location.hash = path;
}

export function useHashRoute() {
    const [route, setRoute] = useState(parse);

    useEffect(() => {
        const onChange = () => setRoute(parse());
        window.addEventListener('hashchange', onChange);
        return () => window.removeEventListener('hashchange', onChange);
    }, []);

    return route;
}
