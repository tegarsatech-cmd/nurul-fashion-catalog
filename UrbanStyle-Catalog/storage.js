import supabase from './auth.js';

export function ref(path) {
    if (!path || typeof path !== 'string') throw new Error('Storage path is required');
    const parts = path.split('/');
    const bucket = parts.shift();
    return { bucket, path: parts.join('/') };
}

export async function uploadBytes(storageRef, file) {
    if (!storageRef || !storageRef.bucket || !storageRef.path) throw new Error('Invalid storage reference');
    if (!file) throw new Error('File is required for upload');

    const { error } = await supabase.storage.from(storageRef.bucket).upload(storageRef.path, file, {
        cacheControl: '3600',
        upsert: true
    });
    if (error) throw error;
}

export async function getDownloadURL(storageRef) {
    if (!storageRef || !storageRef.bucket || !storageRef.path) throw new Error('Invalid storage reference');
    const { data, error } = await supabase.storage.from(storageRef.bucket).getPublicUrl(storageRef.path);
    if (error) throw error;
    if (!data || !data.publicUrl) throw new Error('Failed to get public URL');
    return data.publicUrl;
}

export default supabase;
