const fs = require("fs");

const file = "src/pages/ProfilePage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ ProfilePage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-remove-joueur-actif", code);

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

function removeJoueurActifBlock(src) {
  const idx = src.indexOf("Joueur actif");

  if (idx === -1) {
    console.log("⚠️ Bloc Joueur actif introuvable.");
    return src;
  }

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
          html.includes("Joueur actif") &&
          html.includes("<select") &&
          html.length < 3000
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

  if (!blocks.length) {
    console.log("⚠️ Je trouve le texte, mais pas le cadran complet.");
    return src;
  }

  blocks.sort((a, b) => a.size - b.size);
  const target = blocks[0];

  console.log("✅ Bloc Joueur actif supprimé.");
  return src.slice(0, target.start) + src.slice(target.end);
}

code = removeJoueurActifBlock(code);
code = code.replace(/\n{4,}/g, "\n\n\n");

fs.writeFileSync(file, code);
