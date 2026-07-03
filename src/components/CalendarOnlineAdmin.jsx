import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const STORAGE_KEY = "admin_journees";

function parseJournees(raw) {
  try {
    if (!raw) return [];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.journees)) return parsed.journees;
    return [];
  } catch {
    return [];
  }
}

function countMatches(journees) {
  return journees.reduce((total, journee) => {
    const matchs = journee.matchs || journee.matches || [];
    return total + matchs.length;
  }, 0);
}

export default function CalendarOnlineAdmin() {
  const [localCount, setLocalCount] = useState({ days: 0, matches: 0 });
  const [onlineCount, setOnlineCount] = useState({ days: 0, matches: 0 });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function refreshLocalCount() {
    const localRaw = localStorage.getItem(STORAGE_KEY);
    const journees = parseJournees(localRaw);

    setLocalCount({
      days: journees.length,
      matches: countMatches(journees),
    });
  }

  async function refreshOnlineCount() {
    try {
      if (!supabase) return;

      const { data } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", STORAGE_KEY)
        .maybeSingle();

      const journees = parseJournees(data?.setting_value);

      setOnlineCount({
        days: journees.length,
        matches: countMatches(journees),
      });
    } catch {
      // ignore
    }
  }

  async function saveOnline() {
    setLoading(true);
    setMessage("");

    try {
      const localRaw = localStorage.getItem(STORAGE_KEY);
      const journees = parseJournees(localRaw);

      if (journees.length === 0) {
        setMessage("Aucun calendrier local trouve. Importe d'abord ton Excel.");
        return;
      }

      const { error } = await supabase
        .from("app_settings")
        .upsert(
          {
            setting_key: STORAGE_KEY,
            setting_value: journees,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "setting_key" }
        );

      if (error) throw error;

      setMessage("Calendrier sauvegarde en ligne avec succes.");
      refreshLocalCount();
      refreshOnlineCount();
    } catch (err) {
      setMessage(err.message || "Erreur pendant la sauvegarde en ligne.");
    } finally {
      setLoading(false);
    }
  }

  async function loadOnline() {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", STORAGE_KEY)
        .maybeSingle();

      if (error) throw error;

      const journees = parseJournees(data?.setting_value);

      if (journees.length === 0) {
        setMessage("Aucun calendrier en ligne trouve.");
        return;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(journees));
      setMessage("Calendrier charge depuis Supabase. Rechargement...");
      refreshLocalCount();

      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (err) {
      setMessage(err.message || "Erreur pendant le chargement en ligne.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshLocalCount();
    refreshOnlineCount();
  }, []);

  return (
    <section style={{
      marginBottom: "18px",
      padding: "16px",
      borderRadius: "20px",
      background: "rgba(15,23,42,0.95)",
      border: "2px solid #38bdf8",
      color: "white"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        alignItems: "center",
        flexWrap: "wrap"
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px" }}>Calendrier en ligne</h2>
          <p style={{ margin: "6px 0 0", color: "#cbd5e1", fontSize: "13px" }}>
            Local : {localCount.days} journees / {localCount.matches} matchs
            {" | "}
            En ligne : {onlineCount.days} journees / {onlineCount.matches} matchs
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={saveOnline}
            disabled={loading}
            style={{
              border: 0,
              borderRadius: "999px",
              padding: "10px 14px",
              background: "#38bdf8",
              color: "#082f49",
              fontWeight: 900,
              cursor: "pointer"
            }}
          >
            Sauvegarder en ligne
          </button>

          <button
            type="button"
            onClick={loadOnline}
            disabled={loading}
            style={{
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: "999px",
              padding: "10px 14px",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer"
            }}
          >
            Charger depuis Supabase
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          marginTop: "12px",
          padding: "10px",
          borderRadius: "12px",
          background: "rgba(56,189,248,0.12)",
          color: "#bae6fd"
        }}>
          {message}
        </div>
      )}
    </section>
  );
}

