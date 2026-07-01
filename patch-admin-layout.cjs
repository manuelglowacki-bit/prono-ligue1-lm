const fs = require("fs");

const file = "src/pages/AdminPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ Fichier introuvable : " + file);
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8");
fs.writeFileSync(file + ".bak-reorder-admin-favori", code);

function findMatchingClose(src, start, tag) {
  const re = new RegExp(`<\\/?${tag}\\b[^>]*>`, "g");
  re.lastIndex = start;

  let depth = 0;
  let match;

  while ((match = re.exec(src))) {
    const txt = match[0];

    if (txt.startsWith(`</${tag}`)) {
      depth--;
      if (depth === 0) return re.lastIndex;
    } else if (!txt.endsWith("/>")) {
      depth++;
    }
  }

  return -1;
}

function findSmallestBlockContaining(src, text) {
  const idx = src.indexOf(text);
  if (idx === -1) return null;

  const tags = ["section", "article", "div"];
  let found = [];

  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*>`, "g");
    let m;

    while ((m = re.exec(src))) {
      if (m.index > idx) break;

      const end = findMatchingClose(src, m.index, tag);
      if (end > idx) {
        found.push({
          tag,
          start: m.index,
          end,
          html: src.slice(m.index, end),
          size: end - m.index
        });
      }
    }
  }

  if (!found.length) return null;

  found.sort((a, b) => a.size - b.size);
  return found[0];
}

// 1) Récupère et supprime le bloc "Date butoir club favori"
const favBlock = findSmallestBlockContaining(code, "Date butoir club favori");

if (!favBlock) {
  console.error("❌ Je ne trouve pas le bloc Date butoir club favori.");
  process.exit(1);
}

let favHtml = favBlock.html;

code = code.slice(0, favBlock.start) + code.slice(favBlock.end);

// 2) Nettoie le bloc favori pour le rendre plus compact
favHtml = favHtml
  .replace(/Date butoir club favori/g, "Date butoir club favori")
  .replace(/className="([^"]*)"/, (m, cls) => {
    if (cls.includes("admin-favorite-deadline-compact")) return m;
    return `className="${cls} admin-favorite-deadline-compact"`;
  });

// 3) Insère le bloc favori juste après le bloc Admin pronostics
const adminBlock = findSmallestBlockContaining(code, "Admin pronostics");

if (!adminBlock) {
  console.error("❌ Je ne trouve pas le bloc Admin pronostics.");
  process.exit(1);
}

code = code.slice(0, adminBlock.end) + "\n\n" + favHtml + "\n" + code.slice(adminBlock.end);

// 4) Supprime la dernière case avec uniquement le champ date/heure isolé
function removeLonelyDateBlocks(src) {
  const dateInputRe = /<input[\s\S]*?(type=["']datetime-local["']|type=["']date["'])[\s\S]*?>/gi;
  let matches = [...src.matchAll(dateInputRe)];

  // On garde le bloc Date butoir club favori, on supprime les autres gros blocs date isolés
  for (let i = matches.length - 1; i >= 0; i--) {
    const idx = matches[i].index;
    const before = src.slice(Math.max(0, idx - 700), idx);
    const after = src.slice(idx, Math.min(src.length, idx + 700));
    const zone = before + after;

    if (zone.includes("Date butoir club favori")) continue;

    const tags = ["section", "article", "div"];
    let candidates = [];

    for (const tag of tags) {
      const re = new RegExp(`<${tag}\\b[^>]*>`, "g");
      let m;

      while ((m = re.exec(src))) {
        if (m.index > idx) break;

        const end = findMatchingClose(src, m.index, tag);
        if (end > idx) {
          const html = src.slice(m.index, end);

          if (
            html.includes(matches[i][0]) &&
            !html.includes("Admin pronostics") &&
            !html.includes("Date butoir club favori") &&
            !html.includes("Importer Excel") &&
            !html.includes("Journée avant") &&
            html.length < 2500
          ) {
            candidates.push({
              start: m.index,
              end,
              size: end - m.index
            });
          }
        }
      }
    }

    if (candidates.length) {
      candidates.sort((a, b) => a.size - b.size);
      const target = candidates[0];
      src = src.slice(0, target.start) + src.slice(target.end);
    }
  }

  return src;
}

code = removeLonelyDateBlocks(code);

// 5) Ajoute le CSS pour que la date butoir soit plus petite
const css = `

.admin-favorite-deadline-compact {
  margin-top: 18px !important;
  padding: 18px 22px !important;
  border-radius: 22px !important;
}

.admin-favorite-deadline-compact h1,
.admin-favorite-deadline-compact h2,
.admin-favorite-deadline-compact h3 {
  font-size: 18px !important;
  margin-bottom: 6px !important;
}

.admin-favorite-deadline-compact p {
  font-size: 13px !important;
  margin-bottom: 10px !important;
}

.admin-favorite-deadline-compact input,
.admin-favorite-deadline-compact button {
  min-height: 44px !important;
  font-size: 13px !important;
  border-radius: 14px !important;
}

.admin-favorite-deadline-compact .badge,
.admin-favorite-deadline-compact span {
  font-size: 12px !important;
}
`;

if (!code.includes(".admin-favorite-deadline-compact")) {
  code = code.replace("</style>", css + "\n</style>");
} else if (!code.includes("admin-favorite-deadline-compact h1")) {
  code = code.replace("</style>", css + "\n</style>");
}

fs.writeFileSync(file, code);

console.log("✅ Page admin réorganisée.");
console.log("✅ Admin pronostics est maintenant en haut.");
console.log("✅ Date butoir club favori déplacée en dessous et réduite.");
console.log("✅ Dernière case date isolée supprimée.");
