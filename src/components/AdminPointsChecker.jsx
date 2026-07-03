import React, { useMemo, useState } from "react";

function getWinner(home, away) {
  const h = Number(home);
  const a = Number(away);

  if (Number.isNaN(h) || Number.isNaN(a)) return null;
  if (h > a) return "1";
  if (h < a) return "2";
  return "N";
}

function getScoreValue(match, names) {
  for (const name of names) {
    if (match?.[name] !== undefined && match?.[name] !== null && match?.[name] !== "") {
      return match[name];
    }
  }
  return "";
}

function getMatchLabel(match) {
  const home =
    match.domicile ||
    match.home ||
    match.equipe1 ||
    match.teamHome ||
    match.local ||
    "Domicile";

  const away =
    match.exterieur ||
    match.away ||
    match.equipe2 ||
    match.teamAway ||
    match.visiteur ||
    "Extérieur";

  return `${home} - ${away}`;
}

function getMatchKey(match, journeeNumero = "") {
  const home =
    match.domicile ||
    match.home ||
    match.equipe1 ||
    match.teamHome ||
    match.local ||
    "";

  const away =
    match.exterieur ||
    match.away ||
    match.equipe2 ||
    match.teamAway ||
    match.visiteur ||
    "";

  return `${journeeNumero}|${home}|${away}`.toLowerCase().trim();
}

function normalizeJournees(raw) {
  if (!raw) return [];

  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

    if (Array.isArray(parsed)) return parsed;

    if (Array.isArray(parsed.journees)) return parsed.journees;
    if (Array.isArray(parsed.days)) return parsed.days;

    return [];
  } catch {
    return [];
  }
}

function findAdminJournees() {
  const possibleKeys = [
    "admin_journees",
    "journees",
    "lm_journees",
    "calendar_journees",
  ];

  for (const key of possibleKeys) {
    const value = localStorage.getItem(key);
    const journees = normalizeJournees(value);

    if (journees.length > 0) {
      return { key, journees };
    }
  }

  return { key: "", journees: [] };
}

function flattenMatches(journees) {
  const matches = [];

  journees.forEach((journee, index) => {
    const numero =
      journee.numero ||
      journee.journee ||
      journee.id ||
      index + 1;

    const list =
      journee.matchs ||
      journee.matches ||
      journee.games ||
      [];

    list.forEach((match, matchIndex) => {
      const homeScore = getScoreValue(match, [
        "scoreHome",
        "homeScore",
        "scoreDomicile",
        "score1",
        "butDomicile",
        "butsDomicile",
        "resultHome",
        "resultatDomicile",
      ]);

      const awayScore = getScoreValue(match, [
        "scoreAway",
        "awayScore",
        "scoreExterieur",
        "score2",
        "butExterieur",
        "butsExterieur",
        "resultAway",
        "resultatExterieur",
      ]);

      const hasResult = homeScore !== "" && awayScore !== "";

      matches.push({
        id: match.id || `${numero}-${matchIndex}`,
        numero,
        matchIndex,
        match,
        label: getMatchLabel(match),
        key: getMatchKey(match, numero),
        homeScore,
        awayScore,
        hasResult,
        winner: hasResult ? getWinner(homeScore, awayScore) : null,
      });
    });
  });

  return matches;
}

function scanPronos() {
  const found = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const lower = key.toLowerCase();

    if (
      lower.includes("prono") ||
      lower.includes("prediction") ||
      lower.includes("pronostic")
    ) {
      try {
        const value = localStorage.getItem(key);
        const parsed = JSON.parse(value);

        found.push({
          key,
          value: parsed,
        });
      } catch {
        found.push({
          key,
          value: localStorage.getItem(key),
        });
      }
    }
  }

  return found;
}

function extractPredictionRows(pronoBlocks) {
  const rows = [];

  function walk(value, sourceKey, playerName = "") {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, sourceKey, playerName));
      return;
    }

    if (typeof value === "object") {
      const possiblePlayer =
        value.playerName ||
        value.player ||
        value.joueur ||
        value.name ||
        value.email ||
        playerName;

      const homeProno = getScoreValue(value, [
        "home",
        "domicile",
        "scoreHome",
        "homeScore",
        "pronoHome",
        "pronoDomicile",
        "score1",
      ]);

      const awayProno = getScoreValue(value, [
        "away",
        "exterieur",
        "scoreAway",
        "awayScore",
        "pronoAway",
        "pronoExterieur",
        "score2",
      ]);

      const hasProno = homeProno !== "" && awayProno !== "";

      const matchKey =
        value.matchKey ||
        value.key ||
        value.matchId ||
        value.idMatch ||
        "";

      const homeTeam =
        value.domicile ||
        value.homeTeam ||
        value.home ||
        value.equipe1 ||
        "";

      const awayTeam =
        value.exterieur ||
        value.awayTeam ||
        value.away ||
        value.equipe2 ||
        "";

      if (hasProno) {
        rows.push({
          sourceKey,
          playerName: possiblePlayer || sourceKey,
          matchKey: String(matchKey).toLowerCase().trim(),
          homeTeam,
          awayTeam,
          homeProno,
          awayProno,
          winner: getWinner(homeProno, awayProno),
          raw: value,
        });
      }

      Object.values(value).forEach((child) => {
        if (child && typeof child === "object") {
          walk(child, sourceKey, possiblePlayer);
        }
      });
    }
  }

  pronoBlocks.forEach((block) => walk(block.value, block.key));

  return rows;
}

function computePoints(realMatch, prono) {
  const realHome = Number(realMatch.homeScore);
  const realAway = Number(realMatch.awayScore);
  const pronoHome = Number(prono.homeProno);
  const pronoAway = Number(prono.awayProno);

  if (
    Number.isNaN(realHome) ||
    Number.isNaN(realAway) ||
    Number.isNaN(pronoHome) ||
    Number.isNaN(pronoAway)
  ) {
    return 0;
  }

  if (realHome === pronoHome && realAway === pronoAway) {
    return 3;
  }

  if (realMatch.winner === prono.winner) {
    return 2;
  }

  return 0;
}

export default function AdminPointsChecker() {
  const [refreshKey, setRefreshKey] = useState(0);

  const data = useMemo(() => {
    const { key, journees } = findAdminJournees();
    const matches = flattenMatches(journees);
    const matchesWithResults = matches.filter((m) => m.hasResult);

    const pronoBlocks = scanPronos();
    const pronos = extractPredictionRows(pronoBlocks);

    const pointRows = [];

    matchesWithResults.forEach((match) => {
      pronos.forEach((prono) => {
        const byMatchKey =
          prono.matchKey &&
          String(match.id).toLowerCase().trim() === prono.matchKey;

        const byTeams =
          prono.homeTeam &&
          prono.awayTeam &&
          getMatchKey(
            {
              domicile: prono.homeTeam,
              exterieur: prono.awayTeam,
            },
            match.numero
          ) === match.key;

        if (byMatchKey || byTeams) {
          pointRows.push({
            playerName: prono.playerName,
            matchLabel: match.label,
            result: `${match.homeScore}-${match.awayScore}`,
            prono: `${prono.homeProno}-${prono.awayProno}`,
            points: computePoints(match, prono),
          });
        }
      });
    });

    const ranking = {};

    pointRows.forEach((row) => {
      if (!ranking[row.playerName]) {
        ranking[row.playerName] = {
          playerName: row.playerName,
          points: 0,
          exacts: 0,
          goodResults: 0,
        };
      }

      ranking[row.playerName].points += row.points;

      if (row.points === 3) ranking[row.playerName].exacts += 1;
      if (row.points === 2) ranking[row.playerName].goodResults += 1;
    });

    const rankingRows = Object.values(ranking).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.exacts - a.exacts;
    });

    return {
      storageKey: key,
      journees,
      matches,
      matchesWithResults,
      pronoBlocks,
      pronos,
      pointRows,
      rankingRows,
    };
  }, [refreshKey]);

  return (
    <section style={{
      marginBottom: "20px",
      padding: "16px",
      borderRadius: "20px",
      background: "rgba(15,23,42,0.95)",
      border: "2px solid #22c55e",
      color: "white"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
        alignItems: "center"
      }}>
        <div>
          <h2 style={{ margin: 0 }}>Vérification points</h2>
          <p style={{ margin: "6px 0 0", color: "#cbd5e1" }}>
            Contrôle avant mise à jour du classement
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRefreshKey((v) => v + 1)}
          style={{
            border: 0,
            borderRadius: "999px",
            padding: "10px 14px",
            background: "#22c55e",
            color: "#052e16",
            fontWeight: 900,
            cursor: "pointer"
          }}
        >
          Recalculer
        </button>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "10px",
        marginTop: "14px"
      }}>
        <div style={boxStyle}>
          <strong>{data.matches.length}</strong>
          <span>Matchs chargés</span>
        </div>

        <div style={boxStyle}>
          <strong>{data.matchesWithResults.length}</strong>
          <span>Résultats saisis</span>
        </div>

        <div style={boxStyle}>
          <strong>{data.pronoBlocks.length}</strong>
          <span>Blocs pronos trouvés</span>
        </div>

        <div style={boxStyle}>
          <strong>{data.pronos.length}</strong>
          <span>Pronos détectés</span>
        </div>
      </div>

      {!data.storageKey && (
        <div style={warningStyle}>
          Aucun calendrier trouvé. Importe ou synchronise les matchs dans Admin.
        </div>
      )}

      {data.matches.length > 0 && data.matchesWithResults.length === 0 && (
        <div style={warningStyle}>
          Les matchs sont chargés, mais aucun score réel n’est encore saisi.
        </div>
      )}

      {data.pronoBlocks.length === 0 && (
        <div style={warningStyle}>
          Aucun prono trouvé dans le navigateur. Les pronos ne sont peut-être pas encore liés aux comptes.
        </div>
      )}

      {data.pointRows.length > 0 && (
        <>
          <h3 style={{ marginTop: "18px" }}>Simulation classement</h3>

          <div style={{ maxHeight: "220px", overflow: "auto", borderRadius: "14px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead style={{ background: "#0f172a", position: "sticky", top: 0 }}>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Joueur</th>
                  <th style={thStyle}>Points</th>
                  <th style={thStyle}>Scores exacts</th>
                  <th style={thStyle}>Bons résultats</th>
                </tr>
              </thead>

              <tbody>
                {data.rankingRows.map((row, index) => (
                  <tr key={row.playerName}>
                    <td style={tdStyle}>{index + 1}</td>
                    <td style={tdStyle}>{row.playerName}</td>
                    <td style={tdStyle}><strong>{row.points}</strong></td>
                    <td style={tdStyle}>{row.exacts}</td>
                    <td style={tdStyle}>{row.goodResults}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ marginTop: "18px" }}>Détail des points</h3>

          <div style={{ maxHeight: "240px", overflow: "auto", borderRadius: "14px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead style={{ background: "#0f172a", position: "sticky", top: 0 }}>
                <tr>
                  <th style={thStyle}>Joueur</th>
                  <th style={thStyle}>Match</th>
                  <th style={thStyle}>Résultat</th>
                  <th style={thStyle}>Prono</th>
                  <th style={thStyle}>Pts</th>
                </tr>
              </thead>

              <tbody>
                {data.pointRows.map((row, index) => (
                  <tr key={`${row.playerName}-${row.matchLabel}-${index}`}>
                    <td style={tdStyle}>{row.playerName}</td>
                    <td style={tdStyle}>{row.matchLabel}</td>
                    <td style={tdStyle}>{row.result}</td>
                    <td style={tdStyle}>{row.prono}</td>
                    <td style={tdStyle}><strong>{row.points}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

const boxStyle = {
  padding: "12px",
  borderRadius: "14px",
  background: "rgba(2,6,23,0.55)",
  border: "1px solid rgba(255,255,255,0.12)",
  display: "grid",
  gap: "4px",
};

const warningStyle = {
  marginTop: "12px",
  padding: "12px",
  borderRadius: "14px",
  background: "rgba(250,204,21,0.12)",
  border: "1px solid rgba(250,204,21,0.35)",
  color: "#fde68a",
};

const thStyle = {
  textAlign: "left",
  padding: "9px",
  color: "#22c55e",
  borderBottom: "1px solid rgba(255,255,255,0.12)",
};

const tdStyle = {
  padding: "9px",
  borderTop: "1px solid rgba(255,255,255,0.10)",
};

