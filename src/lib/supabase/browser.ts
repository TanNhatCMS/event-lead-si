"use client";

import { createBrowserClient as createClient } from "@supabase/ssr";

import { getSupabaseConfig } from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.key);
}
