let _supabase = null;
let _ready = false;

export async function initSupabase() {
  if (_ready) return _supabase;

  try {
    const res = await fetch('/env-config');
    const config = await res.json();

    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      _ready = true;
      return null;
    }

    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    // Strip BOM (﻿), zero-width spaces, and any non-printable-ASCII that would break fetch headers
    const clean = s => (s || '').replace(/[^\x20-\x7E]/g, '').trim();
    const cleanUrl = clean(config.supabaseUrl);
    const cleanKey = clean(config.supabaseAnonKey);
    _supabase = createClient(cleanUrl, cleanKey);
    _ready = true;
    return _supabase;
  } catch {
    _ready = true;
    return null;
  }
}

export function getSupabase() {
  return _supabase;
}

export function isCloudEnabled() {
  return _supabase !== null;
}
