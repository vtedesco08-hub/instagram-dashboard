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
    const cleanUrl = config.supabaseUrl.replace(/[\s﻿​]/g, '');
    const cleanKey = config.supabaseAnonKey.replace(/[\s﻿​]/g, '');
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
