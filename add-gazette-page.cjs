const fs = require("fs");

const appFile = "src/App.jsx";
const gazetteFile = "src/pages/GazettePage.jsx";

if (!fs.existsSync(appFile)) {
  console.error("❌ App.jsx introuvable");
  process.exit(1);
}

fs.writeFileSync(appFile + ".bak-add-gazette", fs.readFileSync(appFile, "utf8"));

const gazetteCode = `import React, { useMemo } from "react";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getName(player) {
  return (
    player?.name ||
    player?.player ||
    player?.joueur ||
    player?.pseudo ||
    player?.p ||
    player?.nom ||
    "Joueur"
  );
}

function getPoints(player) {
  return Number(
    player?.points ??
    player?.pts ??
    player?.total ??
    player?.totalPoints ??
    player?.score ??
    0
  );
}

function getExact(player) {
  return Number(
    player?.exact ??
    player?.exacts ??
    player?.scoresExact ??
    player?.scoresExacts ??
    player?.scoreExact ??
    0
  );
}

function getPreviousRank(player) {
  const value =
    player?.previousRank ??
    player?.oldRank ??
    player?.lastRank ??
    player?.rankBefore ??
    player?.previousPlace ??
    player?.oldPlace;

  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function findRankingData() {
  const preferredKeys = [
    "ranking",
    "classement",
    "players_ranking",
    "ranking_players",
    "prono_ranking",
    "admin_ranking",
    "home_ranking",
    "players",
    "prono_players"
  ];

  for (const key of preferredKeys) {
    const data = readJson(key, null);

    if (Array.isArray(data) && data.length) return data;
    if (Array.isArray(data?.players) && data.players.length) return data.players;
    if (Array.isArray(data?.ranking) && data.ranking.length) return data.ranking;
    if (Array.isArray(data?.classement) && data.classement.length) return data.classement;
  }

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const data = readJson(key, null);

    if (Array.isArray(data) && data.length) {
      const looksLikeRanking = data.some((item) =>
        item &&
        typeof item === "object" &&
        (item.points !== undefined ||
          item.pts !== undefined ||
          item.totalPoints !== undefined ||
          item.player ||
          item.name ||
          item.joueur)
      );

      if (looksLikeRanking) return data;
    }
  }

  return [];
}

function buildRanking() {
  const raw = findRankingData();

  const ranking = raw
    .map((player) => ({
      name: getName(player),
      points: getPoints(player),
      exact: getExact(player),
      previousRank: getPreviousRank(player),
      club: player?.club || player?.favoriteTeam || player?.team || ""
    }))
    .filter((player) => player.name && player.name !== "Joueur")
    .sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name))
    .map((player, index) => {
      const rank = index + 1;
      const evolution = player.previousRank ? player.previousRank - rank : 0;

      return {
        ...player,
        rank,
        evolution
      };
    });

  return ranking;
}

function evolutionLabel(value) {
  if (value > 0) return "+" + value;
  if (value < 0) return String(value);
  return "0";
}

export default function GazettePage() {
  const ranking = useMemo(() => buildRanking(), []);

  const leader = ranking[0];
  const podium = ranking.slice(0, 3);
  const rises = ranking.filter((p) => p.evolution > 0).sort((a, b) => b.evolution - a.evolution).slice(0, 3);
  const falls = ranking.filter((p) => p.evolution < 0).sort((a, b) => a.evolution - b.evolution).slice(0, 3);

  const hasRanking = ranking.length > 0;

  return (
    <div className="gazette-page">
      <style>{\`
        .gazette-page {
          color: #0f172a;
          padding: 8px;
        }

        .gazette-paper {
          border-radius: 28px;
          overflow: hidden;
          background:
            linear-gradient(180deg, rgba(255,255,245,.98), rgba(235,230,210,.98));
          border: 1px solid rgba(255,255,255,.22);
          box-shadow: 0 24px 70px rgba(0,0,0,.35);
        }

        .gazette-header {
          padding: 28px 34px;
          color: #f8fafc;
          background:
            radial-gradient(circle at top left, rgba(186,255,0,.28), transparent 34%),
            linear-gradient(135deg, #07111f, #13295a);
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-end;
        }

        .gazette-kicker {
          color: #baff00;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: .14em;
          font-size: 13px;
        }

        .gazette-header h1 {
          margin: 8px 0 0;
          font-size: 46px;
          line-height: .95;
          font-weight: 1000;
          letter-spacing: -.05em;
        }

        .gazette-date {
          text-align: right;
          font-weight: 950;
          color: #cbd5e1;
        }

        .gazette-grid {
          display: grid;
          grid-template-columns: 1.25fr .75fr;
          gap: 0;
        }

        .gazette-main {
          padding: 30px 34px;
          border-right: 1px solid rgba(15,23,42,.14);
        }

        .gazette-side {
          padding: 30px;
          background: rgba(15,23,42,.06);
        }

        .gazette-title {
          margin: 0;
          font-size: 34px;
          line-height: 1.05;
          letter-spacing: -.04em;
          font-weight: 1000;
        }

        .gazette-lead {
          margin: 16px 0 22px;
          font-size: 18px;
          line-height: 1.45;
          color: #334155;
          font-weight: 800;
        }

        .gazette-card {
          border-radius: 20px;
          padding: 18px;
          background: rgba(255,255,255,.62);
          border: 1px solid rgba(15,23,42,.12);
          margin-bottom: 16px;
        }

        .gazette-card h2 {
          margin: 0 0 12px;
          font-size: 22px;
          font-weight: 1000;
          letter-spacing: -.03em;
        }

        .gazette-podium {
          display: grid;
          gap: 10px;
        }

        .gazette-rank-row {
          display: grid;
          grid-template-columns: 42px 1fr auto;
          gap: 12px;
          align-items: center;
          padding: 12px;
          border-radius: 16px;
          background: rgba(15,23,42,.06);
          font-weight: 950;
        }

        .gazette-place {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: #07111f;
          color: #baff00;
          font-weight: 1000;
        }

        .gazette-points {
          color: #07111f;
          font-weight: 1000;
        }

        .gazette-move {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 7px 10px;
          font-weight: 1000;
          background: rgba(15,23,42,.08);
        }

        .gazette-move.up {
          color: #15803d;
          background: rgba(34,197,94,.16);
        }

        .gazette-move.down {
          color: #b91c1c;
          background: rgba(239,68,68,.14);
        }

        .gazette-empty {
          padding: 22px;
          border-radius: 20px;
          background: rgba(15,23,42,.08);
          font-weight: 900;
          color: #334155;
        }

        @media (max-width: 900px) {
          .gazette-grid {
            grid-template-columns: 1fr;
          }

          .gazette-main {
            border-right: 0;
          }

          .gazette-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .gazette-date {
            text-align: left;
          }

          .gazette-header h1 {
            font-size: 36px;
          }
        }
      \`}</style>

      <div className="gazette-paper">
        <header className="gazette-header">
          <div>
            <div className="gazette-kicker">Edition spéciale classement</div>
            <h1>La Gazette des Pronos</h1>
          </div>

          <div className="gazette-date">
            Saison 2026/2027<br />
            Analyse sportive
          </div>
        </header>

        {!hasRanking ? (
          <div className="gazette-main">
            <h2 className="gazette-title">Aucun classement trouvé pour le moment</h2>
            <p className="gazette-lead">
              Dès que le classement sera alimenté, la Gazette affichera automatiquement le leader,
              le podium et les évolutions de place.
            </p>
            <div className="gazette-empty">
              Conseil : va d'abord dans la page Classement ou sauvegarde les données joueurs.
            </div>
          </div>
        ) : (
          <div className="gazette-grid">
            <main className="gazette-main">
              <h2 className="gazette-title">
                {leader.name} prend la lumière, le classement commence à parler
              </h2>

              <p className="gazette-lead">
                Avec {leader.points} points au compteur, {leader.name} mène la danse.
                Derrière, la bataille reste ouverte : chaque score exact peut changer la hiérarchie
                et relancer la course au podium.
              </p>

              <div className="gazette-card">
                <h2>Le fait marquant</h2>
                <p>
                  Le haut du tableau se joue sur la régularité. Les joueurs les mieux placés
                  ne font pas seulement des bons coups : ils limitent surtout les journées ratées.
                </p>
              </div>

              <div className="gazette-card">
                <h2>Podium actuel</h2>
                <div className="gazette-podium">
                  {podium.map((player) => (
                    <div className="gazette-rank-row" key={player.name}>
                      <div className="gazette-place">{player.rank}</div>
                      <div>{player.name}</div>
                      <div className="gazette-points">{player.points} pts</div>
                    </div>
                  ))}
                </div>
              </div>
            </main>

            <aside className="gazette-side">
              <div className="gazette-card">
                <h2>Ceux qui montent</h2>
                {rises.length ? (
                  rises.map((player) => (
                    <div className="gazette-rank-row" key={player.name}>
                      <div className="gazette-place">{player.rank}</div>
                      <div>{player.name}</div>
                      <div className="gazette-move up">{evolutionLabel(player.evolution)}</div>
                    </div>
                  ))
                ) : (
                  <div className="gazette-empty">Pas encore d'évolution positive enregistrée.</div>
                )}
              </div>

              <div className="gazette-card">
                <h2>Ceux qui reculent</h2>
                {falls.length ? (
                  falls.map((player) => (
                    <div className="gazette-rank-row" key={player.name}>
                      <div className="gazette-place">{player.rank}</div>
                      <div>{player.name}</div>
                      <div className="gazette-move down">{evolutionLabel(player.evolution)}</div>
                    </div>
                  ))
                ) : (
                  <div className="gazette-empty">Aucune chute marquante pour l'instant.</div>
                )}
              </div>

              <div className="gazette-card">
                <h2>Phrase du journal</h2>
                <p>
                  Le championnat est long, mais les écarts se creusent vite :
                  la prochaine journée peut déjà faire basculer la dynamique.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
`;

fs.writeFileSync(gazetteFile, gazetteCode);

let app = fs.readFileSync(appFile, "utf8");

if (!app.includes('import GazettePage from "./pages/GazettePage.jsx";')) {
  app = app.replace(
    'import RankingPage from "./pages/RankingPage.jsx";',
    'import RankingPage from "./pages/RankingPage.jsx";\nimport GazettePage from "./pages/GazettePage.jsx";'
  );
}

if (!app.includes('{ id: "gazette"')) {
  app = app.replace(
    '{ id: "ranking", label: "Classement", short: "CL" },',
    '{ id: "ranking", label: "Classement", short: "CL" },\n  { id: "gazette", label: "Gazette", short: "GZ" },'
  );
}

if (!app.includes('case "gazette":')) {
  app = app.replace(
    `      case "ranking":
        return <RankingPage />;`,
    `      case "ranking":
        return <RankingPage />;

      case "gazette":
        return <GazettePage />;`
  );
}

fs.writeFileSync(appFile, app);

console.log("✅ Page Gazette ajoutée.");
console.log("✅ Menu Gazette ajouté.");
console.log("✅ App.jsx patché.");
