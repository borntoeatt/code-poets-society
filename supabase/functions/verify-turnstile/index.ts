// Newsletter sign-up: verifies the Cloudflare Turnstile token, then inserts
// the subscriber using the service role (the browser has no insert access).
//
// Deploy:  supabase functions deploy verify-turnstile --no-verify-jwt
// Secrets: supabase secrets set TURNSTILE_SECRET_KEY=...
//          (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically)

import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set([
    'https://codepoetssociety.info',
    'https://www.codepoetssociety.info',
    'http://localhost:5173',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsHeaders(origin: string | null) {
    const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://codepoetssociety.info';
    return {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin',
    };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' },
    });
}

Deno.serve(async (req) => {
    const headers = corsHeaders(req.headers.get('origin'));

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);

    const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
    if (!secret) return json({ error: 'Server misconfigured' }, 500, headers);

    let payload: { token?: string; email?: string };
    try {
        payload = await req.json();
    } catch {
        return json({ error: 'Invalid request' }, 400, headers);
    }

    const token = typeof payload.token === 'string' ? payload.token : '';
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';

    if (!token) return json({ error: 'CAPTCHA token missing' }, 400, headers);
    if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: 'Invalid email address' }, 400, headers);

    // Verify with Cloudflare
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0];
    if (ip) form.append('remoteip', ip.trim());

    const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
    });
    const result = await verify.json().catch(() => ({ success: false }));
    if (!result.success) return json({ error: 'CAPTCHA verification failed' }, 403, headers);

    // Insert with the service role (bypasses RLS)
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } },
    );

    const { error } = await supabase.from('newsletter_subscribers').insert({ email });

    if (error) {
        // Duplicate: respond as success so the endpoint can't be used to check
        // whether an address is already subscribed.
        if (error.code === '23505') return json({ ok: true }, 200, headers);
        if (error.message?.startsWith('Rate limit exceeded')) {
            return json({ error: 'Too many sign-ups right now. Please try again in a minute.' }, 429, headers);
        }
        console.error('Insert failed:', error);
        return json({ error: 'Subscription failed' }, 500, headers);
    }

    return json({ ok: true }, 200, headers);
});
