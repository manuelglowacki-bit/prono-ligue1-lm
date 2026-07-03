import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

const LAST_USER_KEY = "prono_lm_last_connected_user_id";
const RELOAD_FLAG = "prono_lm_account_switch_reloaded";

const SYNC_KEYS = [
  "prono_lm_clean_pronos",
  "prono_lm_bonus_selected_by_journee",
  "prono_lm_bonus_selected",
  "favoriteTeam",
  "favoriteTeamValidated",
  "clubFavori",
  "selectedClub",
  "favoriteClub"
];

function hasLocalPlayerData() {
  return SYNC_KEYS.some((key) => localStorage.getItem(key) !== null);
}

function clearLocalPlayerData() {
  SYNC_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });
}

function mirrorFavoriteTeam() {
  const favorite =
    localStorage.getItem("favoriteTeam") ||
    localStorage.getItem("clubFavori") ||
    localStorage.getItem("selectedClub") ||
    localStorage.getItem("favoriteClub");

  if (!favorite) return;

  localStorage.setItem("favoriteTeam", favorite);
  localStorage.setItem("clubFavori", favorite);
  localStorage.setItem("selectedClub", favorite);
  localStorage.setItem("favoriteClub", favorite);
}

function mirrorValidated() {
  const validated = localStorage.getItem("favoriteTeamValidated");

  if (validated) {
    localStorage.setItem("favoriteTeamValidated", validated);
  }
}

export default function UserPronosCloudSync() {
  const userIdRef = useRef(null);
  const hydratedRef = useRef(false);
  const savingRef = useRef(false);

  async function hydrateUser(user) {
    if (!user?.id) return;

    hydratedRef.current = false;

    const lastUserId = localStorage.getItem(LAST_USER_KEY);
    const localHadData = hasLocalPlayerData();

    const isDifferentUser = lastUserId && lastUserId !== user.id;
    const isFirstUserAfterOldData = !lastUserId && localHadData;

    if (isDifferentUser || isFirstUserAfterOldData) {
      clearLocalPlayerData();
    }

    const { data, error } = await supabase
      .from("user_prono_storage")
      .select("storage_key,storage_value")
      .eq("user_id", user.id);

    if (error) {
      console.error("Erreur chargement pronos cloud", error);
      hydratedRef.current = true;
      return;
    }

    clearLocalPlayerData();

    (data || []).forEach((row) => {
      if (SYNC_KEYS.includes(row.storage_key)) {
        localStorage.setItem(row.storage_key, row.storage_value);
      }
    });

    mirrorFavoriteTeam();
    mirrorValidated();

    localStorage.setItem(LAST_USER_KEY, user.id);

    userIdRef.current = user.id;
    hydratedRef.current = true;

    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("pronos-updated"));
    window.dispatchEvent(new CustomEvent("favorite-team-updated"));
    window.dispatchEvent(new CustomEvent("bonus-choice-updated"));

    if ((isDifferentUser || isFirstUserAfterOldData) && sessionStorage.getItem(RELOAD_FLAG) !== user.id) {
      sessionStorage.setItem(RELOAD_FLAG, user.id);

      setTimeout(() => {
        window.location.reload();
      }, 80);
    }
  }

  async function saveUserData() {
    const userId = userIdRef.current;

    if (!userId || !hydratedRef.current || savingRef.current) return;

    savingRef.current = true;

    try {
      mirrorFavoriteTeam();
      mirrorValidated();

      const rows = SYNC_KEYS
        .map((key) => {
          const value = localStorage.getItem(key);

          if (value === null || value === undefined) return null;

          return {
            user_id: userId,
            storage_key: key,
            storage_value: value,
            updated_at: new Date().toISOString()
          };
        })
        .filter(Boolean);

      if (!rows.length) return;

      const { error } = await supabase
        .from("user_prono_storage")
        .upsert(rows, { onConflict: "user_id,storage_key" });

      if (error) {
        console.error("Erreur sauvegarde pronos cloud", error);
      }
    } finally {
      savingRef.current = false;
    }
  }

  useEffect(() => {
    let mounted = true;

    async function start() {
      const { data } = await supabase.auth.getUser();
      const user = data?.user || null;

      if (!mounted) return;

      if (!user?.id) {
        hydratedRef.current = false;
        userIdRef.current = null;
        clearLocalPlayerData();
        localStorage.removeItem(LAST_USER_KEY);
        return;
      }

      await hydrateUser(user);
    }

    start();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user || null;

      if (!user?.id) {
        hydratedRef.current = false;
        userIdRef.current = null;
        clearLocalPlayerData();
        localStorage.removeItem(LAST_USER_KEY);
        window.dispatchEvent(new Event("storage"));
        return;
      }

      await hydrateUser(user);
    });

    const interval = setInterval(() => {
      saveUserData();
    }, 1500);

    function handleUpdate() {
      saveUserData();
    }

    window.addEventListener("storage", handleUpdate);
    window.addEventListener("pronos-updated", handleUpdate);
    window.addEventListener("favorite-team-updated", handleUpdate);
    window.addEventListener("bonus-choice-updated", handleUpdate);

    return () => {
      mounted = false;
      clearInterval(interval);
      listener?.subscription?.unsubscribe?.();

      window.removeEventListener("storage", handleUpdate);
      window.removeEventListener("pronos-updated", handleUpdate);
      window.removeEventListener("favorite-team-updated", handleUpdate);
      window.removeEventListener("bonus-choice-updated", handleUpdate);
    };
  }, []);

  return null;
}
