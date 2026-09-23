import { useState } from 'react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { useTurnstile } from '../hooks/useTurnstile.js';

// Sign-ups go through the verify-turnstile Edge Function, which checks the
// CAPTCHA and inserts with the service role. The browser has no direct insert
// access to newsletter_subscribers.
export default function NewsletterSection() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState({ text: '', type: '' });
    const [loading, setLoading] = useState(false);
    const turnstile = useTurnstile(true);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!turnstile.token) {
            setMessage({ text: 'Please complete the CAPTCHA', type: 'error' });
            return;
        }

        setLoading(true);
        setMessage({ text: '', type: '' });
        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-turnstile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    apikey: SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ token: turnstile.token, email }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                setMessage({ text: '🎉 Success! Welcome to Code Poets Society!', type: 'success' });
                setEmail('');
            } else {
                setMessage({ text: data.error || 'Subscription failed', type: 'error' });
            }
        } catch (error) {
            console.error('Newsletter error:', error);
            setMessage({ text: 'Network error. Please try again.', type: 'error' });
        } finally {
            turnstile.reset();
            setLoading(false);
        }
    };

    return (
        <section className="newsletter-section" aria-labelledby="newsletter-title">
            <h2 className="newsletter-title" id="newsletter-title">Join Our Community</h2>
            <p>Get updates on new projects, blog posts, and coding challenges!</p>
            <form className="newsletter-form" onSubmit={handleSubmit}>
                <label htmlFor="newsletter-email" className="visually-hidden">Email address</label>
                <input
                    id="newsletter-email"
                    type="email"
                    className="newsletter-input"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                />
                <div ref={turnstile.containerRef} style={{ margin: '0.5rem 0' }} />
                <button type="submit" className="btn btn-primary" disabled={loading || !turnstile.token}>
                    {loading ? 'Subscribing...' : 'Subscribe'}
                </button>
            </form>
            {message.text && (
                <div
                    className="newsletter-message"
                    role={message.type === 'error' ? 'alert' : 'status'}
                    style={{
                        display: 'block',
                        background: message.type === 'success' ? 'rgba(255,255,255,0.2)' : 'rgba(255,0,0,0.2)',
                    }}
                >
                    {message.text}
                </div>
            )}
        </section>
    );
}
