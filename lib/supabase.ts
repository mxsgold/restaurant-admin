"use client";

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://cbgfeygxjcwusvsiokow.supabase.co",
  "sb_publishable_hhuk9u9Ubhuh4FlPnoYkfA_4eSkmenc",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);