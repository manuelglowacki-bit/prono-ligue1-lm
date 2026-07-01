const fs = require("fs");

const file = "src/pages/AdminPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ Fichier introuvable : " + file);
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8");
fs.writeFileSync(file + ".bak-force-admin-layout", code);

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

function findPanel(src, marker, required = []) {
  const idx = src.indexOf(marker);

  if (idx === -1) {
    console.error("❌ Texte introuvable :", marker);
    return null;
  }

  const tags = ["section", "article", "div"];
  const panels = [];

  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*>`, "g");
    let m;

    while ((m = re.exec(src))) {
      if (m.index > idx) break;

      const end = findMatchingClose(src, m.index, tag);

      if (end > idx) {
        const html = src.slice(m.index, end);
        const ok = required.every((word) => html.includes(word));

        if (ok && html.length > 400 && html.length < 12000) {
          panels.push({
            start: m.index,
            end,
            html,
            size: html.length,
            open: html.slice(0, html.indexOf(">") + 1)
          });
        }
      }
    }
  }

  if (!panels.length) {
    console.error("❌ Bloc introuvable pour :", marker);
    return null;
  }

  panels.sort((a, b) => b.size - a.size);
  return panels[0];
}

function addClass(html, cls) {
  const openMatch = html.match(/^(\s*<\w+\b[^>]*>)/);
  if (!openMatch) return html;

  let open = openMatch[1];

  if (open.includes(cls)) return html;

  if (open.includes("className=")) {
    open = open.replace(/className=(["'])(.*?)\1/, (m, q, c) => {
      return `className=${q}${c} ${cls}${q}`;
    });
  } else {
    open = open.replace(/>$/, ` className="${cls}">`);
  }

  return open + html.slice(openMatch[1].length);
}

function removeBlockByRange(src, block) {
  return src.slice(0, block.start) + src.slice(block.end);
}

let admin = findPanel(code, "Admin pronostics", ["Importer Excel", "Sauvegarder"]);
let fav = findPanel(code, "Date butoir club favori", ["Valider date butoir", "Effacer"]);

if (!admin || !fav) {
  console.error("❌ Patch annulé : envoie-moi AdminPage.jsx si ça bloque.");
  process.exit(1);
}

console.log("✅ Bloc Admin trouvé :", admin.size, "caractères");
console.log("✅ Bloc Date butoir trouvé :", fav.size, "caractères");

let adminHtml = addClass(admin.html, "admin-photo-top-card");
let favHtml = addClass(fav.html, "admin-photo-favorite-card");

// Supprime les deux blocs sans se tromper d'index
const blocks = [admin, fav].sort((a, b) => b.start - a.start);
for (const block of blocks) {
  code = removeBlockByRange(code, block);
}

// Supprime la dernière case isolée avec juste une date
code = code.replace(
  /\n\s*<div[^>]*>\s*<input[\s\S]*?type=["']datetime-local["'][\s\S]*?<\/div>\s*/gi,
  "\n"
);

// Supprime aussi un éventuel gros bloc date isolé restant
code = code.replace(
  /\n\s*<section[^>]*>\s*<input[\s\S]*?type=["']datetime-local["'][\s\S]*?<\/section>\s*/gi,
  "\n"
);

// Insère dans le bon ordre à l'endroit du premier bloc
const insertAt = Math.min(admin.start, fav.start);

const newLayout = `

${adminHtml}

${favHtml}

`;

code = code.slice(0, insertAt) + newLayout + code.slice(insertAt);

// Nettoyage vieux espaces
code = code.replace(/\n{4,}/g, "\n\n\n");

fs.writeFileSync(file, code);

console.log("✅ Admin pronostics remis en haut.");
console.log("✅ Date butoir club favori mise en dessous.");
console.log("✅ Case date isolée supprimée.");
