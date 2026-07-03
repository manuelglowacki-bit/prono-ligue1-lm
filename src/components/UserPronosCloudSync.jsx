import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PRONO_WORDS = [
  "prono",
  "pronos",
  "pronostic",
  "pronostics",
  "prediction",
  "predictions"
];

function isPronoKey(key) {
  const lower = String(key || "").toLowerCase();

  if (!PRONO_WORDS.some((word) => lower.includes(word))) {
    return false;
  }

  if (
    lower.includes("admin_journees") ||
    lower.includes("journees") ||
    lower.includes("calendar") ||
    lower.includes("supabase") ||
    lower.includes("auth")
  ) {
    return false;
  }

  return true;
}

function getLocalPronoSnapshot() {
  const snapshot = {};

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (isPronoKey(key)) {
        snapshot[key] = localStorage.getItem(key) || "";
      }
    }
  } catch {
    // ignore
  }

  return snapshot;
}

function sameSnapshot(a, b) {
  const aKeys = Object.keys(a || {}).sort();
  const bKeys = Object.keys(b || {}).sort();

  if (aKeys.length !== bKeys.length) return false;

  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i];

    if (key !== bKeys[i]) return false;
    if (a[key] !== b[key]) return false;
  }

  return true;
}

function clearLocalPronos() {
  try {
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (isPronoKey(key)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

export default function UserPronosCloudSync({ session }) {
  const [status, setStatus] = useState("idle");
  const lastSnapshotRef = useRef({});
  const loadingRef = useRef(false);
  const userId = session?.user?.id || "";

  useEffect(() => {
    if (!userId || !supabase) return;

    let cancelled = false;

    async function loadUserPronos() {
      loadingRef.current = true;
      setStatus("loading");

      try {
        const { data, error } = await supabase
          .from("user_prono_storage")
          .select("storage_key,storage_value")
          .eq("user_id", userId);

        if (error) throw error;

        if (cancelled) return;

        clearLocalPronos();

        (data || []).forEach((row) => {
          if (row.storage_key && row.storage_value !== null) {
            localStorage.setItem(row.storage_key, row.storage_value);
          }
        });

        const snapshot = getLocalPronoSnapshot();
        lastSnapshotRef.current = snapshot;

        window.dispatchEvent(new Event("lm_pronos_loaded"));

        setStatus("ready");
      } catch {
        setStatus("error");
      } finally {
        loadingRef.current = false;
      }
    }

    loadUserPronos();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !supabase) return;

    async function saveSnapshotIfChanged() {
      if (loadingRef.current) return;

      const current = getLocalPronoSnapshot();
      const previous = lastSnapshotRef.current || {};

      if (sameSnapshot(current, previous)) return;

      const currentKeys = Object.keys(current);
      const previousKeys = Object.keys(previous);

      const deletedKeys = previousKeys.filter((key) => !(key in current));

      try {
        if (currentKeys.length > 0) {
          const rows = currentKeys.map((key) => ({
            user_id: userId,
            storage_key: key,
            storage_value: current[key],
            updated_at: new Date().toISOString(),
          }));

          const { error } = await supabase
            .from("user_prono_storage")
            .upsert(rows, { onConflict: "user_id,storage_key" });

          if (error) throw error;
        }

        for (const key of deletedKeys) {
          await supabase
            .from("user_prono_storage")
            .delete()
            .eq("user_id", userId)
            .eq("storage_key", key);
        }

        lastSnapshotRef.current = current;
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }

    const interval = setInterval(saveSnapshotIfChanged, 1500);

    return () => clearInterval(interval);
  }, [userId]);

  if (!userId) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: 9999,
        padding: "8px 12px",
        borderRadius: "999px",
        background: "rgba(15,23,42,0.88)",
        border: "1px solid rgba(255,255,255,0.14)",
        color: status === "error" ? "#fecaca" : "#cbd5e1",
        fontSize: "12px",
        fontWeight: 800,
        pointerEvents: "none"
      }}
    >
      {status === "loading" && "Pronos : chargement..."}
      {status === "ready" && "Pronos : connectes"}
      {status === "saved" && "Pronos : sauvegardes"}
      {status === "error" && "Pronos : erreur sync"}
      {status === "idle" && "Pronos : attente"}
    </div>
  );
}
