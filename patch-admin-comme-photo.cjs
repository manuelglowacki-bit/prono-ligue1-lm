const fs = require("fs");

const file = "src/pages/AdminPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ Fichier introuvable : " + file);
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8");
fs.writeFileSync(file + ".bak-layout-photo-admin", code);

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

function findBlock(src, marker, requiredWords = []) {
  const idx = src.indexOf(marker);
  if (idx === -1) return null;

  const tags = ["section", "article", "div"];
  const found = [];

  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*>`, "g");
    let m;

    while ((m = re.exec(src))) {
      if (m.index > idx) break;

      const end = findMatchingClose(src, m.index, tag);
      if (end > idx) {
        const html = src.slice(m.index, end);

        const ok = requiredWords.every((word) => html.includes(word));

        if (ok) {
          found.push({
            tag,
            start: m.index,
            end,
            html,
            size: end - m.index
          });
        }
      }
    }
  }

  if (!found.length) return null;

  found.sort((a, b) => a.size - b.size);
  return found[0];
}

function addClassToRoot(block, className) {
  const open = block.match(/^(\s*<\w+\b[^>]*>)/);
  if (!open) return block;

  let opening = open[1];

  if (opening.includes(className)) return block;

  if (/className="([^"]*)"/.test(opening)) {
    opening = opening.replace(/className="([^"]*)"/, `className="$1 ${className}"`);
  } else if (/className='([^']*)'/.test(opening)) {
    opening = opening.replace(/className='([^']*)'/, `className='$1 ${className}'`);
  } else {
    opening = opening.replace(/>$/, ` className="${className}">`);
  }

  return opening + block.slice(open[1].length);
}

function insertBeforeRootClose(block, htmlToInsert) {
  const open = block.match(/^(\s*<(\w+)\b[^>]*>)/);
  if (!open) return block + htmlToInsert;

  const tag = open[2];
  const close = `</${tag}>`;
  const pos = block.lastIndexOf(close);

  if (pos === -1) return block + htmlToInsert;

  return block.slice(0, pos) + "\n" + htmlToInsert + "\n" + block.slice(pos);
}

const adminBlock = findBlock(code, "Admin pronostics", ["Importer Excel", "Sauvegarder"]);
const favBlock = findBlock(code, "Date butoir club favori", ["Valider date butoir"]);

if (!adminBlock) {
  console.error("❌ Je ne trouve pas le bloc Admin pronostics.");
  process.exit(1);
}

if (!favBlock) {
  console.error("❌ Je ne trouve pas le bloc Date butoir club favori.");
  process.exit(1);
}

let adminHtml = addClassToRoot(adminBlock.html, "admin-photo-top-card");
let favHtml = addClassToRoot(favBlock.html, "admin-photo-favorite-card");

// Remplace les deux blocs par des marqueurs
code = code.replace(adminBlock.html, "___ADMIN_PHOTO_BLOCK___");
code = code.replace(favBlock.html, "___FAVORITE_PHOTO_BLOCK___");

// Récupère le message import Excel séparé pour le remettre dans Admin pronostics
let importBlock = findBlock(code, "journée(s) importée", ["Excel"]);

if (importBlock && !importBlock.html.includes("Admin pronostics")) {
  let importHtml = addClassToRoot(importBlock.html, "admin-photo-import-line");
  code = code.replace(importBlock.html, "");
  adminHtml = insertBeforeRootClose(adminHtml, importHtml);
}

// Supprime la case date isolée restante
function removeLonelyDateBlock(src) {
  const dateRe = /<input[\s\S]*?type=["']datetime-local["'][\s\S]*?>/gi;
  const matches = [...src.matchAll(dateRe)];

  for (let i = matches.length - 1; i >= 0; i--) {
    const idx = matches[i].index;
    const zone = src.slice(Math.max(0, idx - 800), Math.min(src.length, idx + 800));

    if (
      zone.includes("Date butoir club favori") ||
      zone.includes("Valider date butoir") ||
      zone.includes("Admin pronostics") ||
      zone.includes("Importer Excel") ||
      zone.includes("Résultat final") ||
      zone.includes("RESULTAT FINAL") ||
      zone.includes("Equipe domicile") ||
      zone.includes("Équipe domicile") ||
      zone.includes("match")
    ) {
      continue;
    }

    const tags = ["section", "article", "div"];
    const candidates = [];

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
            html.length < 3000 &&
            !html.includes("Admin pronostics") &&
            !html.includes("Date butoir club favori") &&
            !html.includes("Importer Excel") &&
            !html.includes("RESULTAT FINAL") &&
            !html.includes("Résultat final")
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

code = removeLonelyDateBlock(code);

// Remet dans le bon ordre : Admin en haut, Date butoir en dessous
const combined = `
${adminHtml}

${favHtml}
`;

const firstMarkerIndex = Math.min(
  code.indexOf("___ADMIN_PHOTO_BLOCK___"),
  code.indexOf("___FAVORITE_PHOTO_BLOCK___")
);

if (firstMarkerIndex === -1) {
  console.error("❌ Marqueur introuvable.");
  process.exit(1);
}

code = code.replace("___ADMIN_PHOTO_BLOCK___", "");
code = code.replace("___FAVORITE_PHOTO_BLOCK___", "");
code = code.slice(0, firstMarkerIndex) + combined + code.slice(firstMarkerIndex);

// Nettoyage gros espaces
code = code.replace(/\n{4,}/g, "\n\n\n");

fs.writeFileSync(file, code);

// CSS propre comme sur la photo
const cssFiles = ["src/index.css", "src/App.css"];
const cssFile = cssFiles.find((f) => fs.existsSync(f));

if (cssFile) {
  let css = fs.readFileSync(cssFile, "utf8");

  const marker = "/* ADMIN PHOTO LAYOUT */";

  if (!css.includes(marker)) {
    css += `

${marker}
.admin-photo-top-card,
.admin-photo-favorite-card {
  width: 100% !important;
  border-radius: 28px !important;
  border: 1px solid rgba(120, 160, 255, 0.22) !important;
  background:
    radial-gradient(circle at top left, rgba(26, 44, 68, 0.95), rgba(6, 12, 30, 0.98) 55%),
    linear-gradient(135deg, rgba(5, 12, 25, 0.98), rgba(20, 45, 90, 0.88)) !important;
  box-shadow: 0 22px 50px rgba(0, 0, 0, 0.28) !important;
}

.admin-photo-top-card {
  margin-bottom: 28px !important;
  padding: 28px !important;
}

.admin-photo-favorite-card {
  margin-top: 0 !important;
  margin-bottom: 28px !important;
  padding: 26px 28px !important;
}

.admin-photo-top-card h1,
.admin-photo-top-card h2,
.admin-photo-top-card h3 {
  font-size: 30px !important;
  line-height: 1.1 !important;
  margin-bottom: 14px !important;
}

.admin-photo-favorite-card h1,
.admin-photo-favorite-card h2,
.admin-photo-favorite-card h3 {
  font-size: 24px !important;
  line-height: 1.1 !important;
  margin-bottom: 12px !important;
}

.admin-photo-top-card p,
.admin-photo-favorite-card p {
  color: rgba(255, 255, 255, 0.82) !important;
}

.admin-photo-import-line {
  margin-top: 24px !important;
  padding: 12px 14px !important;
  border-radius: 10px !important;
  border: 1px solid rgba(163, 255, 18, 0.35) !important;
  background: rgba(1, 47, 41, 0.35) !important;
  color: rgba(255, 255, 255, 0.8) !important;
}

.admin-photo-favorite-card input {
  max-width: 360px !important;
  min-height: 58px !important;
  border-radius: 16px !important;
}

.admin-photo-top-card button,
.admin-photo-favorite-card button {
  border-radius: 14px !important;
  font-weight: 900 !important;
}
`;
    fs.writeFileSync(cssFile, css);
  }
}

console.log("✅ Layout page admin refait comme la photo.");
console.log("✅ Admin pronostics est en haut.");
console.log("✅ Date butoir club favori est en dessous.");
console.log("✅ La case date isolée est supprimée.");
