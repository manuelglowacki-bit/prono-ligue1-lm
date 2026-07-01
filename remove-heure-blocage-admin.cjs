const fs = require("fs");

const file = "src/pages/AdminPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ Fichier introuvable : " + file);
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8");
fs.writeFileSync(file + ".bak-remove-heure-blocage", code);

const phrase = "Heure de blocage des pronos";
const idx = code.indexOf(phrase);

if (idx === -1) {
  console.error("❌ Je ne trouve pas le bloc : " + phrase);
  process.exit(1);
}

function findMatchingClose(src, start, tag) {
  const re = new RegExp(`<\\/?${tag}\\b[^>]*>`, "g");
  re.lastIndex = start;

  let depth = 0;
  let match;

  while ((match = re.exec(src))) {
    const txt = match[0];

    if (txt.startsWith(`</${tag}`)) {
      depth--;
      if (depth === 0) {
        return re.lastIndex;
      }
    } else if (!txt.endsWith("/>")) {
      depth++;
    }
  }

  return -1;
}

const tags = ["section", "article", "div"];
let candidates = [];

for (const tag of tags) {
  const re = new RegExp(`<${tag}\\b[^>]*>`, "g");
  let match;

  while ((match = re.exec(code))) {
    if (match.index > idx) break;

    const end = findMatchingClose(code, match.index, tag);
    if (end > idx) {
      const block = code.slice(match.index, end);

      if (
        block.includes("Heure de blocage des pronos") &&
        (
          block.includes("Cette heure sera affichee") ||
          block.includes("Cette heure sera affichée") ||
          block.includes("datetime-local") ||
          block.includes("date")
        )
      ) {
        candidates.push({
          start: match.index,
          end,
          size: end - match.index
        });
      }
    }
  }
}

if (!candidates.length) {
  console.error("❌ Bloc trouvé, mais impossible de détecter le conteneur complet.");
  process.exit(1);
}

candidates.sort((a, b) => a.size - b.size);
const target = candidates[0];

code = code.slice(0, target.start) + code.slice(target.end);

fs.writeFileSync(file, code);

console.log("✅ Bloc 'Heure de blocage des pronos' supprimé de la page admin.");
console.log("✅ Sauvegarde créée : " + file + ".bak-remove-heure-blocage");
