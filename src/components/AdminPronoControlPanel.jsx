import React, { useState } from "react";

const DEFAULT_PLAYERS = [
  "Laurent",
  "Quentin",
  "Jo B",
  "Jonathan",
  "Eric L",
  "Yannis",
  "Giovani",
  "Manu",
  "David J",
  "Samuel",
];

function safeJson(key, fallback = []) {
  try {
    const value = localStorage.getItem(key);
    if (!value) return fallback;
    const parsed = JSON.parse(value);
    return parsed || fallback;
  } catch {
    return fallback;
  }
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  if (typeof value === "object") {
    return Object.values(value).flatMap((item) => {
      if (Array.isArray(item)) return item;
      if (item && typeof item === "object") {
        return Object.values(item).flatMap((sub) =>
          Array.isArray(sub) ? sub : [sub]
        );
      }
      return [];
    });
  }

  return [];
}

function getPlayerName(player) {
  if (typeof player === "string") return player;
  return (
    player?.nom ||
    player?.name ||
    player?.pseudo ||
    player?.player ||
    player?.joueur ||
    ""
  );
}

function parseMatchDate(match) {
  if (!match?.date || !match?.heure) return null;

  let date = String(match.date).trim();
  const heure = String(match.heure).trim();

  // Format déjà bon : 2026-08-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Date(`${date}T${heure}`);
  }

  // Format français : 15/08/2026
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    const [day, month, year] = date.split("/");
    return new Date(`${year}-${month}-${day}T${heure}`);
  }

  return new Date(`${date}T${heure}`);
}

function getAllPlayers() {
  const players =
    asArray(safeJson("players")) ||
    asArray(safeJson("joueurs")) ||
    asArray(safeJson("users"));

  const cleanPlayers = players.map(getPlayerName).filter(Boolean);

  return cleanPlayers.length > 0 ? cleanPlayers : DEFAULT_PLAYERS;
}

function getAllMatches() {
  const keys = [
    "matches",
    "allMatches",
    "ligue1Matches",
    "bonusMatches",
    "adminBonusMatches",
    "journees",
    "calendar",
    "fixtures",
  ];

  const all = keys.flatMap((key) => asArray(safeJson(key)));

  const clean = all.filter((match) => {
    return (
      match &&
      (match.id || match.matchId) &&
      (match.domicile || match.home || match.equipeDomicile) &&
      (match.exterieur || match.away || match.equipeExterieur)
    );
  });

  const unique = [];
  const seen = new Set();

  clean.forEach((match) => {
    const id = match.id || match.matchId;
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(match);
    }
  });

  return unique;
}

function getAllPronos() {
  const keys = [
    "pronos",
    "pronostics",
    "predictions",
    "userPronos",
    "userPredictions",
    "allPronos",
  ];

  return keys.flatMap((key) => asArray(safeJson(key)));
}

function hasPlayerPronoForMatch(pronos, playerName, match) {
  const matchId = match.id || match.matchId;

  return pronos.some((prono) => {
    const pronoPlayer =
      prono?.joueur ||
      prono?.player ||
      prono?.nom ||
      prono?.pseudo ||
      prono?.user ||
      prono?.userName;

    const pronoMatchId =
      prono?.matchId ||
      prono?.idMatch ||
      prono?.match_id ||
      prono?.match?.id ||
      prono?.id;

    const hasScore =
      prono?.scoreDom !== undefined ||
      prono?.scoreExt !== undefined ||
      prono?.homeScore !== undefined ||
      prono?.awayScore !== undefined ||
      prono?.domicileScore !== undefined ||
      prono?.exterieurScore !== undefined ||
      prono?.prono !== undefined ||
      prono?.resultat !== undefined ||
      prono?.prediction !== undefined;

    return (
      String(pronoPlayer).trim() === String(playerName).trim() &&
      String(pronoMatchId).trim() === String(matchId).trim() &&
      hasScore
    );
  });
}

export default function AdminPronoControlPanel() {
  const [result, setResult] = useState(null);

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function handleControl() {
    const now = new Date();
    const limit = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const players = getAllPlayers();
    const matches = getAllMatches();
    const pronos = getAllPronos();

    const matchsDans2h = matches.filter((match) => {
      const dateMatch = parseMatchDate(match);
      if (!dateMatch || Number.isNaN(dateMatch.getTime())) return false;
      return dateMatch > now && dateMatch <= limit;
    });

    if (matchsDans2h.length === 0) {
      setResult({
        type: "ok",
        title: "Aucun match à contrôler",
        message: "Aucun match ne commence dans les 2 prochaines heures.",
        missing: [],
      });

      alert("Aucun match ne commence dans les 2 prochaines heures.");
      return;
    }

    const missing = [];

    matchsDans2h.forEach((match) => {
      const domicile =
        match.domicile || match.home || match.equipeDomicile || "Domicile";
      const exterieur =
        match.exterieur || match.away || match.equipeExterieur || "Extérieur";

      players.forEach((playerName) => {
        const hasProno = hasPlayerPronoForMatch(pronos, playerName, match);

        if (!hasProno) {
          missing.push({
            joueur: playerName,
            match: `${domicile} - ${exterieur}`,
            heure: match.heure || "",
            date: match.date || "",
            championnat: match.championnat || match.competition || "Ligue 1",
          });
        }
      });
    });

    if (missing.length === 0) {
      setResult({
        type: "success",
        title: "Tout est bon",
        message:
          "Tous les joueurs ont pronostiqué les matchs qui commencent dans moins de 2h.",
        missing: [],
      });

      alert("Tout le monde a pronostiqué ✅");
      return;
    }

    const rappel =
      `⚠️ RAPPEL PRONOS\n\n` +
      `Des matchs commencent dans moins de 2h.\n\n` +
      missing
        .map(
          (item) =>
            `• ${item.joueur} n'a pas pronostiqué : ${item.match} (${item.heure})`
        )
        .join("\n");

    const copied = await copyText(rappel);

    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification("Contrôle pronos", {
          body: `${missing.length} prono(s) manquant(s) à moins de 2h du début.`,
        });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    }

    setResult({
      type: "warning",
      title: `${missing.length} prono(s) manquant(s)`,
      message: copied
        ? "Message de rappel copié. Tu peux le coller dans WhatsApp/Messenger."
        : "Message généré. Copie-le depuis le bloc ci-dessous.",
      missing,
      rappel,
    });

    alert(
      `${missing.length} prono(s) manquant(s).\n\n` +
        (copied
          ? "Le message de rappel a été copié."
          : "Le message est affiché dans le panneau.")
    );
  }

  return (
    <div className="admin-control-card">
      <div className="admin-control-head">
        <div>
          <h3>🔔 Contrôle pronos / notifications</h3>
          <p>
            Vérifie les matchs qui commencent dans moins de 2h et prépare le
            rappel pour les joueurs qui n’ont pas pronostiqué.
          </p>
        </div>

        <button className="btn-admin-warning" onClick={handleControl}>
          Contrôler maintenant
        </button>
      </div>

      {result && (
        <div className={`admin-control-result ${result.type}`}>
          <strong>{result.title}</strong>
          <p>{result.message}</p>

          {result.missing?.length > 0 && (
            <div className="missing-pronos-list">
              {result.missing.map((item, index) => (
                <div className="missing-prono-row" key={`${item.joueur}-${index}`}>
                  <span className="missing-player">{item.joueur}</span>
                  <span>
                    {item.match} — {item.heure}
                  </span>
                </div>
              ))}
            </div>
          )}

          {result.rappel && (
            <textarea
              className="rappel-textarea"
              value={result.rappel}
              readOnly
              onFocus={(event) => event.target.select()}
            />
          )}
        </div>
      )}
    </div>
  );
}
