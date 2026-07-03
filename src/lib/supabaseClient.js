import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://gxzwqumkvocuyewstfps.supabase.co";
const supabaseKey = "sb_publishable_EHMmBbDI0eyDjPRllQOfXg_CoyAIHFk";

export const isSupabaseConfigured = true;

export const supabase = createClient(supabaseUrl, supabaseKey);

