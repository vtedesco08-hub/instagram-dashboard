import { getSupabase } from './supabase-client.js';

export async function signIn(email, password) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data.session;
}

export async function signOut() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
  window.location.href = '/login.html';
}

export async function getSession() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function getMyProfile() {
  const sb = getSupabase();
  const session = await getSession();
  if (!session || !sb) return null;
  const { data } = await sb.from('user_profiles').select('*').eq('id', session.user.id).single();
  return data;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = '/login.html';
    return null;
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if (!session) return null;
  const profile = await getMyProfile();
  if (profile?.role !== 'admin') {
    window.location.href = '/dashboard.html';
    return null;
  }
  return { session, profile };
}
