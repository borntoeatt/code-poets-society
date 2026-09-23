import { useEffect, useRef, useState, useCallback } from 'react';
import { TURNSTILE_SITE_KEY } from '../config.js';

// How long to wait for the Turnstile script before telling the user it's
// blocked (ad blockers and corporate proxies commonly block it).
const LOAD_TIMEOUT_MS = 10000;
const LOAD_FAILED_MSG = 'The verification widget could not be loaded. Please allow challenges.cloudflare.com (disable content blockers) and reload.';

// Renders a Cloudflare Turnstile widget into the returned ref's element and
// exposes the current token. `enabled` lets callers mount it conditionally.
export function useTurnstile(enabled = true) {
    const containerRef = useRef(null);
    const widgetIdRef = useRef(null);
    const [token, setToken] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!enabled) return undefined;

        let cancelled = false;
        const render = () => {
            if (cancelled || !window.turnstile || !containerRef.current || widgetIdRef.current !== null) return;
            const theme = document.documentElement.getAttribute('data-theme') || 'light';
            widgetIdRef.current = window.turnstile.render(containerRef.current, {
                sitekey: TURNSTILE_SITE_KEY,
                theme,
                // The default widget is 300px wide, which overflows the modal
                // and newsletter card on phones.
                size: window.matchMedia('(max-width: 420px)').matches ? 'compact' : 'normal',
                callback: (t) => setToken(t),
                'expired-callback': () => setToken(''),
                'error-callback': () => setToken(''),
            });
        };

        // The Turnstile script is loaded async; poll until it's available,
        // but give up (with a message) if it never arrives.
        const started = Date.now();
        const interval = setInterval(() => {
            if (window.turnstile) {
                clearInterval(interval);
                render();
            } else if (window.__turnstileLoadFailed || Date.now() - started > LOAD_TIMEOUT_MS) {
                clearInterval(interval);
                if (!cancelled) setError(LOAD_FAILED_MSG);
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

    return { containerRef, token, reset, error };
}
