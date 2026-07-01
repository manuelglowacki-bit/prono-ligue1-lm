const fs = require("fs");

const file = "src/pages/AdminPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ AdminPage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

fs.writeFileSync(file + ".bak-vrai-layout-admin", code);

if (!code.includes("const FAVORITE_DEADLINE_KEYS")) {
  code = code.replace(
`const PUBLIC_JOURNEES_KEY = "admin_journees";`,
`const PUBLIC_JOURNEES_KEY = "admin_journees";
const FAVORITE_DEADLINE_KEYS = [
  "favorite_team_deadline",
  "favorite_club_deadline",
  "admin_favorite_deadline",
  "favoriteDeadline"
];`
  );
}

if (!code.includes("function loadFavoriteDeadlineValue")) {
  code = code.replace(
`function savePublicJournees(journees) {
  localStorage.setItem(PUBLIC_JOURNEES_KEY, JSON.stringify(journees));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(journees));
}`,
`function savePublicJournees(journees) {
  localStorage.setItem(PUBLIC_JOURNEES_KEY, JSON.stringify(journees));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(journees));
}

function loadFavoriteDeadlineValue() {
  try {
    for (const key of FAVORITE_DEADLINE_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value.replace(/^"|"$/g, "");
    }
  } catch {
    return "";
  }

  return "";
}

function saveFavoriteDeadlineValue(value) {
  FAVORITE_DEADLINE_KEYS.forEach((key) => {
    localStorage.setItem(key, value || "");
  });
}

function formatFavoriteDeadline(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}`
  );
}

if (!code.includes("favoriteDeadlineMessage")) {
  code = code.replace(
`  const [message, setMessage] = useState("Page admin prete.");`,
`  const [message, setMessage] = useState("Page admin prete.");
  const [favoriteDeadline, setFavoriteDeadline] = useState(() => loadFavoriteDeadlineValue());
  const [favoriteDeadlineMessage, setFavoriteDeadlineMessage] = useState("Date butoir non modifiee.");`
  );
}

if (!code.includes("function validateFavoriteDeadline")) {
  code = code.replace(
`  function saveAll() {
    savePublicJournees(journees);
    setMessage("Sauvegarde OK. La page Pronos recupere cette configuration.");
  }`,
`  function saveAll() {
    savePublicJournees(journees);
    setMessage("Sauvegarde OK. La page Pronos recupere cette configuration.");
  }

  function validateFavoriteDeadline() {
    saveFavoriteDeadlineValue(favoriteDeadline);

    if (favoriteDeadline) {
      setFavoriteDeadlineMessage("Date butoir sauvegardee : " + formatFavoriteDeadline(favoriteDeadline));
      setMessage("Date butoir club favori sauvegardee.");
    } else {
      setFavoriteDeadlineMessage("Aucune date butoir : choix encore ouvert.");
      setMessage("Date butoir club favori ouverte.");
    }
  }

  function clearFavoriteDeadline() {
    setFavoriteDeadline("");
    saveFavoriteDeadlineValue("");
    setFavoriteDeadlineMessage("Date butoir effacee.");
    setMessage("Date butoir club favori effacee.");
  }`
  );
}

code = code.replace(
`    const currentBonus = ensureThreeBonus(selectedJournee);
    const bonusMatch = currentBonus.find((item) => item.id === matchId);`,
`    const currentBonus = ensureThreeBonus(selectedJournee).bonus;
    const bonusMatch = currentBonus.find((item) => item.id === matchId);`
);

const newTop = `      <div className="admin-pronos-top admin-photo-top-card">
        <div className="admin-pronos-title">
          <h1>Admin pronostics</h1>
          <p>Meme presentation que la page Pronos, mais ici tu geres les journees, les matchs et les bonus.</p>
        </div>

        <div className="admin-pronos-actions">
          <button className="admin-btn green" type="button" onClick={() => fileInputRef.current?.click()}>
            Importer Excel
          </button>

          <button className="admin-btn" type="button" onClick={previousJournee}>
            Journee avant
          </button>

          <select
            className="admin-select"
            value={selectedJournee.id}
            onChange={(e) => setSelectedJourneeId(e.target.value)}
          >
            {journees.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>

          <button className="admin-btn" type="button" onClick={nextJournee}>
            Journee apres
          </button>

          <button className="admin-btn" type="button" onClick={addJournee}>
            Ajouter journee
          </button>

          <button className="admin-btn gold" type="button" onClick={toggleLock}>
            {selectedJournee.locked ? "Rouvrir journee" : "Fermer journee"}
          </button>

          <button className="admin-btn green" type="button" onClick={saveAll}>
            Sauvegarder
          </button>
        </div>

        <div className="admin-message">
          {message}
        </div>
      </div>

      <div className="admin-favorite-card">
        <div className="admin-favorite-left">
          <h2>Date butoir club favori</h2>
          <p>Definis jusqu'a quand les joueurs peuvent choisir ou modifier leur equipe favorite.</p>

          <input
            className="admin-lock-input"
            type="datetime-local"
            value={favoriteDeadline}
            onChange={(e) => setFavoriteDeadline(e.target.value)}
          />

          <div className="admin-deadline-pill">
            {favoriteDeadline
              ? "Date butoir : " + formatFavoriteDeadline(favoriteDeadline)
              : "Aucune date butoir : choix encore ouvert"}
          </div>

          <div className="admin-deadline-note">
            {favoriteDeadlineMessage}
          </div>
        </div>

        <div className="admin-favorite-actions">
          <button className="admin-btn green" type="button" onClick={validateFavoriteDeadline}>
            Valider date butoir
          </button>

          <button className="admin-btn red" type="button" onClick={clearFavoriteDeadline}>
            Effacer
          </button>
        </div>
      </div>`;

const start = code.indexOf(`      <div className="admin-pronos-top">`);
const end = code.indexOf(`      <div className="section-head">`, start);

if (start === -1 || end === -1) {
  console.error("❌ Je ne trouve pas la zone admin du haut.");
  process.exit(1);
}

code = code.slice(0, start) + newTop + "\n\n" + code.slice(end);

const css = `

        /* Layout admin propre */
        .admin-photo-top-card {
          display: grid !important;
          grid-template-columns: 1fr auto !important;
          align-items: flex-start !important;
          gap: 22px !important;
          margin-bottom: 28px !important;
          padding: 28px !important;
        }

        .admin-photo-top-card .admin-message {
          grid-column: 1 / -1 !important;
          margin: 8px 0 0 !important;
        }

        .admin-favorite-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: flex-start;
          gap: 28px;
          margin-bottom: 28px;
          padding: 28px;
          border-radius: 28px;
          background:
            radial-gradient(circle at top left, rgba(186,255,0,.14), transparent 34%),
            linear-gradient(135deg, rgba(15,23,42,.98), rgba(29,78,216,.28));
          border: 1px solid rgba(255,255,255,.10);
        }

        .admin-favorite-card h2 {
          margin: 0;
          font-size: 24px;
          line-height: 1.1;
          font-weight: 950;
          letter-spacing: -.03em;
        }

        .admin-favorite-card p {
          margin: 10px 0 18px;
          color: #cbd5e1;
          font-weight: 750;
        }

        .admin-favorite-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          flex-wrap: wrap;
          padding-top: 22px;
        }

        .admin-deadline-pill {
          width: fit-content;
          margin-top: 16px;
          padding: 10px 16px;
          border-radius: 999px;
          background: rgba(34,197,94,.16);
          color: #d9ff99;
          border: 1px solid rgba(34,197,94,.32);
          font-weight: 950;
        }

        .admin-deadline-note {
          width: fit-content;
          margin-top: 14px;
          padding: 9px 14px;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
          color: #cbd5e1;
          font-weight: 850;
        }

        @media (max-width: 760px) {
          .admin-photo-top-card,
          .admin-favorite-card {
            grid-template-columns: 1fr !important;
          }

          .admin-favorite-actions {
            justify-content: flex-start;
            padding-top: 0;
          }
        }
`;

if (!code.includes("Layout admin propre")) {
  code = code.replace("        @media (max-width: 1200px) {", css + "\n        @media (max-width: 1200px) {");
}

fs.writeFileSync(file, code);

console.log("✅ C'est bon : Admin pronostics est en haut.");
console.log("✅ Date butoir club favori est juste en dessous.");
console.log("✅ La case date vide a ete supprimee.");
console.log("✅ Backup cree : AdminPage.jsx.bak-vrai-layout-admin");
