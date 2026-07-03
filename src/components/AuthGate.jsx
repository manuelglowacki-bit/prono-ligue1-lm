import React, { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
import AuthPage from "./AuthPage";
import UserPronosCloudSync from "./UserPronosCloudSync.jsx";

const ADMIN_EMAIL = "manuelglowacki@gmail.com";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [blockedStatus, setBlockedStatus] = useState(null);

  async function checkAccountStatus(currentSession) {
    const user = currentSession?.user;

    if (!user?.id) {
      setBlockedStatus(null);
      return;
    }

    const email = user.email?.toLowerCase().trim();

    if (email === ADMIN_EMAIL) {
      setBlockedStatus(null);
      return;
    }

    try {
      const { data } = await supabase
        .from("profiles")
        .select("account_status")
        .eq("id", user.id)
        .maybeSingle();

      const status = data?.account_status || "active";

      if (status === "blocked" || status === "deleted") {
        setBlockedStatus(status);
      } else {
        setBlockedStatus(null);
      }
    } catch {
      setBlockedStatus(null);
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthLoading(false);
      return;
    }

    async function initAuth() {
      const { data } = await supabase.auth.getSession();
      const currentSession = data.session;

      setSession(currentSession);
      await checkAccountStatus(currentSession);
      setAuthLoading(false);
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      setSession(currentSession);
      await checkAccountStatus(currentSession);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return <div className="loading-screen">Chargement...</div>;
  }

  if (!session) {
    return <AuthPage />;
  }

  if (blockedStatus) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">🔒</div>
          <h1>
            {blockedStatus === "deleted" ? "Compte supprime" : "Compte bloque"}
          </h1>
          <p className="auth-subtitle">
            Ton compte n'a plus acces au concours.
          </p>

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
            }}
            style={{
              border: 0,
              borderRadius: "999px",
              padding: "12px 16px",
              background: "#facc15",
              color: "#111827",
              fontWeight: 900,
              cursor: "pointer"
            }}
          >
            Deconnexion
          </button>
        </div>
      </div>
    );
  }

  const playerName =
    session?.user?.user_metadata?.player_name ||
    session?.user?.email ||
    "Joueur";

  return (
    <>
      <UserPronosCloudSync session={session} />
      <div className="auth-userbar">
        <span>{playerName}</span>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
          }}
        >
          Deconnexion
        </button>
      </div>

      {children}
    </>
  );
}



