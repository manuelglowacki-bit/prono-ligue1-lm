const fs = require("fs");

const file = "src/pages/ProfilePage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ ProfilePage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-simplify-preferences", code);

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

function removeSmallCardContaining(src, text) {
  const idx = src.indexOf(text);
  if (idx === -1) return { src, removed: false };

  const tags = ["div", "article", "section"];
  const blocks = [];

  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*>`, "g");
    let match;

    while ((match = re.exec(src))) {
      if (match.index > idx) break;

      const end = findMatchingClose(src, match.index, tag);
      if (end > idx) {
        const html = src.slice(match.index, end);

        if (
          html.includes(text) &&
          !html.includes("Nom affiché") &&
          !html.includes("Nom affiche") &&
          html.length < 2500
        ) {
          blocks.push({
            start: match.index,
            end,
            size: end - match.index
          });
        }
      }
    }
  }

  if (!blocks.length) return { src, removed: false };

  blocks.sort((a, b) => a.size - b.size);
  const target = blocks[0];

  return {
    src: src.slice(0, target.start) + src.slice(target.end),
    removed: true
  };
}

let removed = 0;

// On cible uniquement la zone Préférences joueur si elle existe
const prefIndex =
  code.indexOf("Préférences joueur") !== -1
    ? code.indexOf("Préférences joueur")
    : code.indexOf("Preferences joueur");

if (prefIndex !== -1) {
  const before = code.slice(0, prefIndex);
  let after = code.slice(prefIndex);

  let r1 = removeSmallCardContaining(after, "Photo");
  after = r1.src;
  if (r1.removed) removed++;

  let r2 = removeSmallCardContaining(after, "Club favori");
  after = r2.src;
  if (r2.removed) removed++;

  code = before + after;
} else {
  let r1 = removeSmallCardContaining(code, "Photo");
  code = r1.src;
  if (r1.removed) removed++;

  let r2 = removeSmallCardContaining(code, "Club favori");
  code = r2.src;
  if (r2.removed) removed++;
}

code = code.replace(/\n{4,}/g, "\n\n\n");

fs.writeFileSync(file, code);

console.log("✅ Préférences joueur simplifiées.");
console.log("🗑️ Bloc(s) supprimé(s) :", removed);
console.log("✅ On garde seulement Nom affiché + boutons.");
