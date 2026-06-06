import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const GTM_SUPABASE_URL =
  import.meta.env.VITE_GTM_SUPABASE_URL ?? "https://ljdpqsoiktoluwtgodmc.supabase.co";

const GTM_SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_GTM_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqZHBxc29pa3RvbHV3dGdvZG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjA5NzMsImV4cCI6MjA5NjMzNjk3M30.ZtSAQH5UX3zZQSJZ8boOzXaKCFf63PuCthycOM_HDv0";

export const gtmSupabaseInfo = {
  url: GTM_SUPABASE_URL,
  projectRef: new URL(GTM_SUPABASE_URL).hostname.split(".")[0],
};

export const gtmSupabase = createClient<Database>(
  GTM_SUPABASE_URL,
  GTM_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);