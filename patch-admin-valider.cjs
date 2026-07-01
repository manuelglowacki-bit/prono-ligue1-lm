const fs = require("fs");

const file = "src/pages/AdminPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ Fichier introuvable : " + file);
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8");
fs.writeFileSync(file + ".bak-admin-valider", code);

function findFunctionEnd(src, start) {
  const firstBrace = src.indexOf("{", start);
  if (firstBrace === -1) return -1;

  let depth = 0;
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = firstBrace; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];

    if (lineComment) {
      if (c === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (c === "*" && n === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === quote) {
        quote = null;
      }
      continue;
    }

    if (c === "/" && n === "/") {
      lineComment = true;
      i++;
      continue;
    }

    if (c === "/" && n === "*") {
      blockComment = true;
      i++;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }

    if (c === "{") depth++;
    if (c === "}") depth--;

    if (depth === 0) return i;
  }

  return -1;
}

const helper = `

  function adminScoreIsFilled(value) {
    return value !== "" && value !== null && value !== undefined;
  }

  function adminToScore(value) {
    if (!adminScoreIsFilled(value)) return "";
    const number = Number(value);
    return Number.isNaN(number) ? "" : number;
  }

  function adminResultFromScore(home, away) {
    if (home > away) return "1";
    if (home < away) return "2";
    return "N";
  }

  function getRegularMatchesAdmin(journee) {
    if (Array.isArray(journee?.matches)) {
      return { key: "matches", list: journee.matches };
    }

    if (Array.isArray(journee?.matchs)) {
      return { key: "matchs", list: journee.matchs };
    }

    if (Array.isArray(journee?.normal)) {
      return { key: "normal", list: journee.normal };
    }

    return { key: "matches", list: [] };
  }

  function buildAdminValidatedPatch(match) {
    const home = adminToScore(
      match.scoreDomicile ??
      match.scoreHome ??
      match.homeScore ??
      match.scoreDom ??
      match.finalHome ??
      match.resultHome ??
      match.homeGoals
    );

    const away = adminToScore(
      match.scoreExterieur ??
      match.scoreAway ??
      match.awayScore ??
      match.scoreExt ??
      match.finalAway ??
      match.resultAway ??
      match.awayGoals
    );

    if (!adminScoreIsFilled(home) || !adminScoreIsFilled(away)) {
      return null;
    }

    const resultat = adminResultFromScore(home, away);

    return {
      scoreDomicile: home,
      scoreExterieur: away,
      scoreHome: home,
      scoreAway: away,
      homeScore: home,
      awayScore: away,
      scoreDom: home,
      scoreExt: away,
      finalHome: home,
      finalAway: away,
      resultHome: home,
      resultAway: away,
      homeGoals: home,
      awayGoals: away,
      score: home + "-" + away,
      resultat,
      result: resultat,
      resultatFinal: resultat,
      status: "FINISHED",
      statut: "FINISHED",
      statutLong: "Résultat validé",
      adminValidated: true,
      validated: true,
      isValidated: true,
      resultValidatedAt: new Date().toISOString()
    };
  }

  function validateAdminMatch(matchId) {
    const regular = getRegularMatchesAdmin(selectedJournee);
    const regularMatch = regular.list.find((item) => item.id === matchId);

    if (regularMatch) {
      const patch = buildAdminValidatedPatch(regularMatch);

      if (!patch) {
        alert("Mets le résultat final avant de valider.");
        return;
      }

      const nextMatches = regular.list.map((item) =>
        item.id === matchId ? { ...item, ...patch } : item
      );

      updateSelectedJournee({
        [regular.key]: nextMatches
      });

      return;
    }

    const currentBonus = ensureThreeBonus(selectedJournee);
    const bonusMatch = currentBonus.find((item) => item.id === matchId);

    if (bonusMatch) {
      const patch = buildAdminValidatedPatch(bonusMatch);

      if (!patch) {
        alert("Mets le résultat final bonus avant de valider.");
        return;
      }

      updateBonus(matchId, patch);
    }
  }
`;

if (!code.includes("function validateAdminMatch(")) {
  const idx = code.indexOf("function updateBonus");
  if (idx === -1) {
    console.error("❌ Je ne trouve pas function updateBonus dans AdminPage.jsx");
    process.exit(1);
  }

  const end = findFunctionEnd(code, idx);
  if (end === -1) {
    console.error("❌ Impossible de trouver la fin de updateBonus");
    process.exit(1);
  }

  code = code.slice(0, end + 1) + helper + code.slice(end + 1);
}

function replaceButtonBlocks(src) {
  return src.replace(/<button[\s\S]*?<\/button>/g, (btn, offset, full) => {
    const clean = btn.replace(/\s+/g, " ");

    if (/>\s*Supprimer\s*<\/button>/i.test(clean)) {
      return "";
    }

    const before = full.slice(Math.max(0, offset - 700), offset);
    const after = full.slice(offset, Math.min(full.length, offset + 700));
    const zoneMatch =
      /RESULTAT FINAL|Resultat final|Résultat final|admin-match-actions|score-final|score/i.test(before + after);

    if (/>\s*Valider\s*<\/button>/i.test(clean) && zoneMatch) {
      return `<button
                  type="button"
                  className={match.adminValidated ? "admin-validate-btn validated" : "admin-validate-btn"}
                  onClick={() => validateAdminMatch(match.id)}
                >
                  {match.adminValidated ? "Validé" : "Valider"}
                </button>`;
    }

    return btn;
  });
}

code = replaceButtonBlocks(code);

if (!code.includes(".admin-validate-btn.validated")) {
  code = code.replace(
    /<\/style>/,
    `
        .admin-validate-btn.validated {
          background: rgba(34, 197, 94, 0.22) !important;
          border-color: rgba(34, 197, 94, 0.65) !important;
          color: #86efac !important;
        }
      </style>`
  );
}

fs.writeFileSync(file, code);
console.log("✅ AdminPage.jsx corrigé : bouton Supprimer retiré + Valider branché.");
