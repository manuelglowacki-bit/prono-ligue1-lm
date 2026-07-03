import React, { useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";

async function savePlayerProfile(user, playerNameFromForm = "") {
  if (!user?.id || !supabase) return;

  const email = user.email || "";
  const metaName = user.user_metadata?.player_name || "";
  const fallbackName = email ? email.split("@")[0] : "Joueur";

  const playerName = playerNameFromForm || metaName || fallbackName;

  await supabase.from("profiles").upsert({
    id: user.id,
    email,
    player_name: playerName,
  });
}

export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (!isSupabaseConfigured || !supabase) {
        setMessage("Supabase n'est pas encore configure.");
        return;
      }

      if (!email || !password) {
        setMessage("Mets ton adresse mail et ton mot de passe.");
        return;
      }

      if (mode === "register" && !playerName.trim()) {
        setMessage("Mets ton nom de joueur.");
        return;
      }

      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              player_name: playerName.trim(),
            },
          },
        });

        if (error) throw error;

        if (data?.user) {
          await savePlayerProfile(data.user, playerName.trim());
        }

        setMessage("Compte cree, tu peux te connecter.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (data?.user) {
          await savePlayerProfile(data.user);
        }

        setMessage("Connexion reussie.");
      }
    } catch (err) {
      setMessage(err.message || "Erreur de connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🏆</div>

        <h1>Prono Ligue 1 LM</h1>

        <p className="auth-subtitle">
          {mode === "login"
            ? "Connecte-toi a ton compte joueur"
            : "Cree ton compte joueur"}
        </p>

        <form onSubmit={handleAuth} className="auth-form">
          {mode === "register" && (
            <input
              type="text"
              placeholder="Nom du joueur"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />
          )}

          <input
            type="email"
            placeholder="Adresse mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit" disabled={loading}>
            {loading
              ? "Chargement..."
              : mode === "login"
              ? "Se connecter"
              : "Creer mon compte"}
          </button>
        </form>

        {message && <div className="auth-message">{message}</div>}

        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setMessage("");
          }}
        >
          {mode === "login"
            ? "Pas encore de compte ? Creer un compte"
            : "Deja un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}

