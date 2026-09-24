// Turns a Supabase/PostgREST error into something a person can read.
// Kept free of imports so it can be unit-tested without creating a client.
export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
    if (!error) return fallback;
    const msg = error.message || '';
    if (error.code === '23505') return 'That already exists. Try a different value.';
    if (error.code === '23514') return 'One of the fields is too short, too long, or has an invalid format.';
    if (msg.startsWith('Rate limit exceeded')) return msg;
    if (msg.includes('Failed to fetch')) return 'Cannot reach the server. Please try again in a moment.';
    return fallback;
}
