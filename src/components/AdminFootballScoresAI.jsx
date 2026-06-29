import React, { useState } from "react";

const STORAGE_KEYS = [
  "matches",
  "allMatches",
  "ligue1Matches",
  "matchs",
  "journees",
  "calendar",
  "fixtures",
];

function normalizeTeam(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace("paris sg", "psg")
    .replace("paris saint germain", "psg")
    .replace("paris saint-germain", "psg")
    .replace("olympique de marseille", "marseille")
    .replace("om", "marseille")
    .replace("olympique lyonnais", "lyon")
    .replace("ol", "lyon")
    .replace("rc lens", "lens")
    .replace("losc lille", "lille")
    .replace("lille osc", "lille")
    .replace("stade rennais", "rennes")
    .replace("stade rennais fc", "rennes")
    .replace("stade brestois", "brest")
    .replace("stade brestois 29", "brest")
    .replace("le havre ac", "le havre")
    .replace("havre ac", "le havre")
    .replace("ogc nice", "nice")
    .replace("toulouse fc", "toulouse")
    .replace("fc nantes", "nantes")
    .replace("fc metz", "metz")
    .replace("aj auxerre", "auxerre")
    .replace("fc lorient", "lorient")
    .replace("rc strasbourg alsace", "strasbourg")
    .replace("rc strasbourg", "strasbourg")
    .replace("angers sco", "angers")
    .replace(/\s+/g, " ")
    .trim();
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getHome(match) {
  return (
    match?.domicile ||
    match?.home ||
    match?.equipeDomicile ||
    match?.teamHome ||
    match?.homeTeam ||
    ""
  );
}

function getAway(match) {
  return (
    match?.exterieur ||
    match?.away ||
    match?.equipeExterieur ||
    match?.teamAway ||
    match?.awayTeam ||
    ""
  );
}

function findOfficialResult(localMatch, officialMatches) {
  const localHome = normalizeTeam(getHome(localMatch));
  const localAway = normalizeTeam(getAway(localMatch));

  return officialMatches.find((official) => {
    const officialHome = normalizeTeam(official.domicile);
    const officialAway = normalizeTeam(official.exterieur);
    return officialHome === localHome && officialAway === localAway;
  });
}

function patchDeep(value, officialMatches) {
  let changed = 0;

  if (Array.isArray(value)) {
    const next = value.map((item) => {
      const patched = patchDeep(item, officialMatches);
      changed += patched.changed;
      return patched.value;
    });

    return { value: next, changed };
  }

  if (value && typeof value === "object") {
    const hasTeams = getHome(value) && getAway(value);
    const result = hasTeams ? findOfficialResult(value, officialMatches) : null;

    if (
      result &&
      result.scoreDom !== null &&
      result.scoreDom !== undefined &&
      result.scoreExt !== null &&
      result.scoreExt !== undefined
    ) {
      return {
        changed: 1,
        value: {
          ...value,

          scoreDom: result.scoreDom,
          scoreExt: result.scoreExt,

          homeScore: result.scoreDom,
          awayScore: result.scoreExt,

          butsDomicile: result.scoreDom,
          butsExterieur: result.scoreExt,

          scoreDomicile: result.scoreDom,
          scoreExterieur: result.scoreExt,

          resultatFinal: `${result.scoreDom}-${result.scoreExt}`,
          scoreFinal: `${result.scoreDom}-${result.scoreExt}`,

          officialId: result.officialId,
          sourceScore: "football-data.org",

          statut: "TERMINE",
          status: "FINISHED",
          played: true,
          termine: true,
          valide: true,
          validated: true,
        },
      };
    }

    const next = {};

    Object.entries(value).forEach(([key, item]) => {
      const patched = patchDeep(item, officialMatches);
      changed += patched.changed;
      next[key] = patched.value;
    });

    return { value: next, changed };
  }

  return { value, changed: 0 };
}

export default function AdminFootballScoresAI() {
  const [season, setSeason] = useState("2025");
  const [matchday, setMatchday] = useState("1");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function syncPastScores() {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(
        `/api/football/results?season=${season}&matchday=${matchday}`
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Erreur synchronisation scores football");
      }

      const officialMatches = data.matches || [];

      let totalChanged = 0;
      const touchedKeys = [];

      STORAGE_KEYS.forEach((key) => {
        const current = readJson(key);
        if (!current) return;

        const patched = patchDeep(current, officialMatches);

        if (patched.changed > 0) {
          localStorage.setItem(key, JSON.stringify(patched.value));
          totalChanged += patched.changed;
          touchedKeys.push(key);
        }
      });

      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("matches-updated"));
      window.dispatchEvent(new CustomEvent("scores-updated"));

      if (totalChanged === 0) {
        setMessage(
          `API OK : ${data.total} match(s), ${data.finished} terminé(s), mais aucun match local reconnu.`
        );

        alert(
          `API football OK, mais aucun match local n'a été reconnu.\n\nMatchs API : ${data.total}\nTerminés : ${data.finished}`
        );
        return;
      }

      setMessage(
        `${totalChanged} score(s) officiel(s) injecté(s). Clés modifiées : ${touchedKeys.join(", ")}`
      );

      alert(
        `${totalChanged} score(s) officiel(s) injecté(s).\n\nRecharge la page si le classement ne change pas directement.`
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-football-ai-card">
      <div>
        <h3>🤖 IA Football — scores officiels</h3>
        <p>
          Récupère les scores officiels des matchs déjà joués et met à jour le
          classement automatiquement.
        </p>
      </div>

      <div className="football-ai-controls">
        <label>
          Saison
          <input
            value={season}
            onChange={(event) => setSeason(event.target.value)}
            placeholder="2025"
          />
        </label>

        <label>
          Journée
          <input
            value={matchday}
            onChange={(event) => setMatchday(event.target.value)}
            placeholder="1"
          />
        </label>

        <button onClick={syncPastScores} disabled={loading}>
          {loading ? "Synchronisation..." : "Synchroniser les scores passés"}
        </button>
      </div>

      {message && <p className="football-ai-message">{message}</p>}
    </div>
  );
}
