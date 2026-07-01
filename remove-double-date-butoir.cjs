const fs = require("fs");
const path = require("path");

const files = [
  "src/pages/AdminPage.jsx",
  "src/App.jsx"
].filter((file) => fs.existsSync(file));

const marker = "Date butoir club favori";

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

function findSmallestBlock(src, index) {
  const tags = ["section", "article", "div", "form"];
  const blocks = [];

  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*>`, "g");
    let match;

    while ((match = re.exec(src))) {
      if (match.index > index) break;

      const end = findMatchingClose(src, match.index, tag);

      if (end > index) {
        const html = src.slice(match.index, end);

        if (html.includes(marker)) {
          blocks.push({
            start: match.index,
            end,
            html,
            size: end - match.index
          });
        }
      }
    }
  }

  if (!blocks.length) return null;

  blocks.sort((a, b) => a.size - b.size);
  return blocks[0];
}

for (const file of files) {
  let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

  if (!code.includes(marker)) continue;

  fs.writeFileSync(file + ".bak-remove-double-date-butoir", code);

  const adminIndex = code.indexOf("Admin pronostics");
  const positions = [];
  let pos = code.indexOf(marker);

  while (pos !== -1) {
    positions.push(pos);
    pos = code.indexOf(marker, pos + marker.length);
  }

  const blocks = [];

  for (const index of positions) {
    const block = findSmallestBlock(code, index);

    if (block && !blocks.some((b) => b.start === block.start && b.end === block.end)) {
      blocks.push(block);
    }
  }

  if (!blocks.length) continue;

  const blocksToRemove = [];

  for (const block of blocks) {
    const isNewGoodBlock =
      file.endsWith("AdminPage.jsx") &&
      block.html.includes("admin-favorite-card") &&
      adminIndex !== -1 &&
      block.start > adminIndex;

    if (!isNewGoodBlock) {
      blocksToRemove.push(block);
    }
  }

  blocksToRemove
    .sort((a, b) => b.start - a.start)
    .forEach((block) => {
      code = code.slice(0, block.start) + code.slice(block.end);
    });

  fs.writeFileSync(file, code);

  console.log("✅ Corrigé :", file);
  console.log("🗑️ Bloc(s) supprimé(s) :", blocksToRemove.length);
}

console.log("✅ Doublon Date butoir supprimé. On garde seulement le bloc sous Admin pronostics.");
