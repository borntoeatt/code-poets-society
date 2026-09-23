// Public configuration. The anon key and site key are meant to ship to the
// browser; all access control lives in Supabase RLS policies.
export const SUPABASE_URL =
    import.meta.env.VITE_SUPABASE_URL || 'https://lzczpyfutpyqodfwwenp.supabase.co';

export const SUPABASE_ANON_KEY =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6Y3pweWZ1dHB5cW9kZnd3ZW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1MDQzODAsImV4cCI6MjA4NDA4MDM4MH0.3Gvsj0boPhBV4rGTu0VjfYxaII9QPTjH2PH79U-qlXA';

export const TURNSTILE_SITE_KEY =
    import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAACypsY1Mva9_Ucx3';

// Mirrors the CHECK constraints in migrations/004_lock_down_rls.sql so users
// get an inline message instead of a rejected insert.
export const LIMITS = {
    titleMin: 3,
    titleMax: 150,
    descriptionMax: 2000,
    commentMax: 1000,
    techStackMax: 20,
    techStackTotalMax: 1000,
};
