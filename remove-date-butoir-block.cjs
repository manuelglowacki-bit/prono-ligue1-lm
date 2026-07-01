const fs = require("fs");

const file = "src/pages/AdminPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ AdminPage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-remove-favorite-card-empty", code);

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

let removed = 0;

// Supprime tous les blocs avec className admin-favorite-card
while (code.includes("admin-favorite-card")) {
  const idx = code.indexOf("admin-favorite-card");

  let start = code.lastIndexOf("<div", idx);
  if (start === -1) break;

  const end = findMatchingClose(code, start, "div");
  if (end === -1) break;

  code = code.slice(0, start) + code.slice(end);
  removed++;
}

// Sécurité : supprime un bloc restant qui contient seulement Valider date butoir / Effacer
while (code.includes("Valider date butoir")) {
  const idx = code.indexOf("Valider date butoir");

  let start = code.lastIndexOf("<div", idx);
  if (start === -1) break;

  const end = findMatchingClose(code, start, "div");
  if (end === -1) break;

  const block = code.slice(start, end);

  if (
    block.includes("Valider date butoir") &&
    block.includes("Effacer") &&
    !block.includes("Admin pronostics")
  ) {
    code = code.slice(0, start) + code.slice(end);
    removed++;
  } else {
    break;
  }
}

code = code.replace(/\n{4,}/g, "\n\n\n");

fs.writeFileSync(file, code);

console.log("✅ Bloc Valider date butoir supprimé.");
console.log("🗑️ Bloc(s) supprimé(s) :", removed);
