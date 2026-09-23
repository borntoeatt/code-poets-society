import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

function toUser(session) {
    if (!session?.user) return null;
    const { id, email, user_metadata } = session.user;
    return {
        id,
        email,
        name: user_metadata?.name || user_metadata?.username || email.split('@')[0],
    };
}

// Supabase redirects failed email links (expired recovery / confirmation) to
// the site with the error in the URL fragment. auth-js does not emit an event
// for these, so read them here and clear the fragment.
function readAuthErrorFromUrl() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (!params.get('error') && !params.get('error_description')) return null;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (params.get('error_code') === 'otp_expired') {
        return 'That link is invalid or has expired. Please request a new one.';
    }
    return params.get('error_description') || 'That sign-in link could not be used.';
}

// Reading clears the fragment, so a second read would return null. Memoise
// per page load: React 18 StrictMode renders twice on mount and keeps the
// second render's state, and both must see the same message.
let urlAuthError;
function takeAuthErrorFromUrl() {
    if (urlAuthError === undefined) urlAuthError = readAuthErrorFromUrl();
    return urlAuthError;
}

// Single source of truth for auth state. Call this once in <App>; pass the
// result down rather than calling it again in child components.
export function useAuth() {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    // Set when the user lands here from a password-reset email.
    const [recovering, setRecovering] = useState(false);
    const [authError, setAuthError] = useState(takeAuthErrorFromUrl);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setCurrentUser(toUser(session));
            setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setCurrentUser(toUser(session));
            if (event === 'PASSWORD_RECOVERY') setRecovering(true);
        });

        return () => subscription.unsubscribe();
    }, []);

    const clearAuthError = useCallback(() => setAuthError(null), []);

    // Supabase "Captcha protection" is project-wide: once enabled it gates
    // sign-up, password login and password reset alike, so every call sends
    // the Turnstile token. When protection is off the token is simply ignored.
    const signup = async ({ name, email, password, captchaToken }) => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { name }, captchaToken },
        });
        return error ? { success: false, error: error.message } : { success: true };
    };

    const login = async ({ email, password, captchaToken }) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
            options: { captchaToken },
        });
        return error ? { success: false, error: error.message } : { success: true };
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setCurrentUser(null);
    };

    const resetPassword = async ({ email, captchaToken }) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
            captchaToken,
        });
        return error ? { success: false, error: error.message } : { success: true };
    };

    const updatePassword = async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (!error) setRecovering(false);
        return error ? { success: false, error: error.message } : { success: true };
    };

    return {
        currentUser, loading, recovering, authError, clearAuthError,
        signup, login, logout, resetPassword, updatePassword,
    };
}
