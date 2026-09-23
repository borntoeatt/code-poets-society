import { useEffect, useRef, useState, useCallback } from 'react';
import { TURNSTILE_SITE_KEY } from '../config.js';

// Renders a Cloudflare Turnstile widget into the returned ref's element and
// exposes the current token. `enabled` lets callers mount it conditionally.
export function useTurnstile(enabled = true) {
    const containerRef = useRef(null);
    const widgetIdRef = useRef(null);
    const [token, setToken] = useState('');

    useEffect(() => {
        if (!enabled) return undefined;

        let cancelled = false;
        const render = () => {
            if (cancelled || !window.turnstile || !containerRef.current || widgetIdRef.current !== null) return;
            const theme = document.documentElement.getAttribute('data-theme') || 'light';
            widgetIdRef.current = window.turnstile.render(containerRef.current, {
                sitekey: TURNSTILE_SITE_KEY,
                theme,
                callback: (t) => setToken(t),
                'expired-callback': () => setToken(''),
                'error-callback': () => setToken(''),
            });
        };

        // The Turnstile script is loaded async; poll until it's available.
        const interval = setInterval(() => {
            if (window.turnstile) {
                clearInterval(interval);
                render();
            }
        }, 100);
        render();

        return () => {
            cancelled = true;
            clearInterval(interval);
            if (widgetIdRef.current !== null && window.turnstile) {
                window.turnstile.remove(widgetIdRef.current);
                widgetIdRef.current = null;
            }
            setToken('');
        };
    }, [enabled]);

    const reset = useCallback(() => {
        setToken('');
        if (widgetIdRef.current !== null && window.turnstile) {
            window.turnstile.reset(widgetIdRef.current);
        }
    }, []);

    return { containerRef, token, reset };
}
