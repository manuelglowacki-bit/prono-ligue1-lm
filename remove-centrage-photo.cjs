const fs = require("fs");
const path = require("path");

function walk(dir) {
  let files = [];

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      if (item !== "node_modules" && item !== "dist") {
        files = files.concat(walk(full));
      }
    } else if (/\.(jsx|js|tsx|ts)$/.test(item)) {
      files.push(full);
    }
  }

  return files;
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
      if (depth === 0) return re.lastIndex;
    } else if (!txt.endsWith("/>")) {
      depth++;
    }
  }

  return -1;
}

function findSmallestBlock(src, index) {
  const tags = ["section", "article", "div", "fieldset"];
  const blocks = [];

  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*>`, "g");
    let match;

    while ((match = re.exec(src))) {
      if (match.index > index) break;

      const end = findMatchingClose(src, match.index, tag);

      if (end > index) {
        const html = src.slice(match.index, end);

        if (
          html.includes("Centrage photo") &&
          html.includes("Horizontal") &&
          html.includes("Vertical")
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

  if (!blocks.length) return null;

  blocks.sort((a, b) => a.size - b.size);
  return blocks[0];
}

const files = walk("src");
let totalRemoved = 0;

for (const file of files) {
  let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

  if (!code.includes("Centrage photo")) continue;

  fs.writeFileSync(file + ".bak-remove-centrage-photo", code);

  let removedInFile = 0;

  while (code.includes("Centrage photo")) {
    const idx = code.indexOf("Centrage photo");
    const block = findSmallestBlock(code, idx);

    if (!block) break;

    code = code.slice(0, block.start) + code.slice(block.end);
    removedInFile++;
    totalRemoved++;
  }

  code = code.replace(/\n{4,}/g, "\n\n\n");

  fs.writeFileSync(file, code);

  console.log("✅ Corrigé :", file);
  console.log("🗑️ Bloc(s) Centrage photo supprimé(s) :", removedInFile);
}

if (totalRemoved === 0) {
  console.log("⚠️ Aucun bloc 'Centrage photo' trouvé.");
} else {
  console.log("✅ Total supprimé :", totalRemoved);
}
