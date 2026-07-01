const fs = require("fs");

const file = "src/pages/HomePage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ HomePage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-fix-site-inaccessible", code);

// Supprime le bloc vide qui casse Vite : {data.profilePhoto && ( )}
code = code.replace(/\{\s*data\.profilePhoto\s*&&\s*\(\s*\)\s*\}/g, "");

// Supprime aussi les versions avec retour ligne
code = code.replace(/\{\s*data\.profilePhoto\s*&&\s*\(\s*\n\s*\)\s*\}/g, "");

fs.writeFileSync(file, code);

console.log("✅ HomePage.jsx corrigé.");
