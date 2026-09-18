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

// ===== MFA / 2FA (Two-Factor Authentication) =====
export async function getMfaAssuranceLevel() {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data;
}

export async function listMfaFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    return data;
}

export async function enrollMfa(issuer = 'Nurul Fashion') {
    // Bersihkan faktor unverified sebelumnya agar tidak terjadi error duplicate factor name
    try {
        const factorsResult = await supabase.auth.mfa.listFactors();
        const unverified = (factorsResult?.data?.all || factorsResult?.data?.totp || []).filter(f => f.status === 'unverified');
        for (const uf of unverified) {
            if (uf && uf.id) {
                await supabase.auth.mfa.unenroll({ factorId: uf.id }).catch(() => {});
            }
        }
    } catch (cleanErr) {
        console.warn('Pembersihan faktor MFA lama:', cleanErr);
    }

    const uniqueId = Date.now().toString().slice(-6);
    let enrollResult = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: issuer,
        friendlyName: `Admin Authenticator ${uniqueId}`
    });

    if (enrollResult.error) {
        console.warn('Enroll MFA retry needed:', enrollResult.error);
        // Jika ada konflik friendlyName atau unverified factor lama yang tersisa
        try {
            const factorsResult = await supabase.auth.mfa.listFactors();
            const list = factorsResult?.data?.all || factorsResult?.data?.totp || [];
            for (const f of list) {
                if (f && f.id && f.status === 'unverified') {
                    await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
                }
            }
        } catch (e) {}

        const rand = Math.floor(1000 + Math.random() * 9000);
        enrollResult = await supabase.auth.mfa.enroll({
            factorType: 'totp',
            issuer: issuer,
            friendlyName: `Authenticator ${Date.now()}-${rand}`
        });
    }

    if (enrollResult.error) throw enrollResult.error;
    return enrollResult.data;
}

export async function challengeMfa(factorId) {
    const { data, error } = await supabase.auth.mfa.challenge({ factorId });
    if (error) throw error;
    return data;
}

export async function verifyMfa(factorId, challengeId, code) {
    const { data, error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: String(code).trim()
    });
    if (error) throw error;
    return data;
}

export async function challengeAndVerifyMfa(factorId, code) {
    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: String(code).trim()
    });
    if (error) throw error;
    return data;
}

export async function unenrollMfa(factorId) {
    const { data, error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    return data;
}

export default supabase;

