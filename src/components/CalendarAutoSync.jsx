import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

const STORAGE_KEY = "admin_journees";

export default function CalendarAutoSync() {
  useEffect(() => {
    async function loadCalendarIfMissing() {
      try {
        if (!supabase) return;

        const localCalendar = localStorage.getItem(STORAGE_KEY);
        if (localCalendar) return;

        const { data, error } = await supabase
          .from("app_settings")
          .select("setting_value")
          .eq("setting_key", STORAGE_KEY)
          .maybeSingle();

        if (error) return;

        if (data?.setting_value) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.setting_value));
          window.dispatchEvent(new Event("admin_journees_loaded"));
        }
      } catch {
        // ignore
      }
    }

    loadCalendarIfMissing();
  }, []);

  return null;
}

