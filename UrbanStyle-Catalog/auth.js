// CDN import keeps the app compatible with VS Code Live Server as well as Vite.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Gunakan environment variable Vite bila tersedia, fallback ke nilai default.
const env = import.meta.env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://ejgqjxktwlpodhbymidj.supabase.co';
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GwrUMlhubSxZ1VIcNKSFsA_-AKrjOG0';

// Satu-satunya Supabase client untuk seluruh aplikasi
// (jangan buat client baru di file lain)
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    },
    global: {
        headers: { 'x-application-name': 'nurul-fashion' }
    }
});

export async function signInWithEmailAndPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function updatePassword(password) {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return data;
}

export function onAuthStateChanged(callback) {
    if (typeof callback !== 'function') return;
    supabase.auth.onAuthStateChange((event, session) => {
        callback(session?.user ?? null);
    });
    supabase.auth.getUser().then(({ data }) => {
        callback(data?.user ?? null);
    }).catch((error) => {
        console.error('Auth getUser error:', error);
        callback(null);
    });
}

export default supabase;
