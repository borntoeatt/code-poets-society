import { useState } from 'react';
import Modal from './Modal.jsx';
import { useTurnstile } from '../hooks/useTurnstile.js';

const TITLES = { login: 'Welcome Back', signup: 'Join the Society', reset: 'Reset Password' };

export default function AuthModal({ auth, onClose }) {
    const [mode, setMode] = useState('login');
    const [form, setForm] = useState({ name: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [loading, setLoading] = useState(false);
    // Supabase "Captcha protection" (Turnstile) is project-wide and gates
    // sign-up, login and password reset, so the widget is shown in every mode
    // and the token sent with every request. Tokens are single-use, so the
    // widget is reset after each submit.
    // Destructured: reading fields off an object that also holds a ref counts
    // as a ref read during render for the React Compiler lint rules.
    const { containerRef: turnstileRef, token: turnstileToken, reset: resetTurnstile, error: turnstileError } = useTurnstile(true);

    const switchMode = (next) => {
        setMode(next);
        setError('');
        setSuccessMsg('');
    };

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        if (!turnstileToken) {
            setError('Please complete the CAPTCHA verification');
            return;
        }

        setLoading(true);
        const captchaToken = turnstileToken;
        let result;
        if (mode === 'reset') {
            result = await auth.resetPassword({ email: form.email, captchaToken });
        } else if (mode === 'login') {
            result = await auth.login({ email: form.email, password: form.password, captchaToken });
        } else {
            result = await auth.signup({ ...form, captchaToken });
        }
        setLoading(false);
        resetTurnstile();

        if (!result.success) {
            setError(result.error);
            return;
        }
        if (mode === 'reset') {
            setSuccessMsg('Password reset link sent! Check your email.');
        } else if (mode === 'signup') {
            setSuccessMsg('Check your email to confirm your account!');
        } else {
            onClose();
        }
    };

    return (
        <Modal title={TITLES[mode]} titleId="auth-modal-title" onClose={onClose}>
            <form onSubmit={handleSubmit}>
                {mode === 'signup' && (
                    <div className="form-group">
                        <label className="form-label" htmlFor="auth-name">Name</label>
                        <input
                            id="auth-name"
                            type="text"
                            className="form-input"
                            value={form.name}
                            onChange={update('name')}
                            autoComplete="name"
                            maxLength={50}
                            required
                        />
                    </div>
                )}

                <div className="form-group">
                    <label className="form-label" htmlFor="auth-email">Email</label>
                    <input
                        id="auth-email"
                        type="email"
                        className="form-input"
                        value={form.email}
                        onChange={update('email')}
                        autoComplete="email"
                        required
                    />
                </div>

                {mode !== 'reset' && (
                    <div className="form-group">
                        <label className="form-label" htmlFor="auth-password">Password</label>
                        <input
                            id="auth-password"
                            type="password"
                            className="form-input"
                            value={form.password}
                            onChange={update('password')}
                            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                            minLength={8}
                            required
                        />
                        {mode === 'signup' && <div className="form-hint">At least 8 characters.</div>}
                    </div>
                )}

                {mode === 'login' && (
                    <button type="button" className="link-button muted" onClick={() => switchMode('reset')}>
                        Forgot password?
                    </button>
                )}

                <div ref={turnstileRef} style={{ margin: '0.5rem 0' }} />
                {turnstileError && <div className="form-error" role="alert">{turnstileError}</div>}

                {error && <div className="form-error" role="alert">{error}</div>}
                {successMsg && <div className="form-success-msg" role="status">{successMsg}</div>}

                <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '1rem' }}
                    disabled={loading || !turnstileToken}
                >
                    {loading
                        ? 'Processing...'
                        : mode === 'login' ? 'Login' : mode === 'signup' ? 'Sign Up' : 'Send Reset Link'}
                </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem' }}>
                {mode === 'login' ? "Don't have an account? " : mode === 'signup' ? 'Already have an account? ' : 'Remember your password? '}
                <button className="link-button" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
                    {mode === 'login' ? 'Sign up' : 'Login'}
                </button>
            </p>
        </Modal>
    );
}
