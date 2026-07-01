const fs = require("fs");

const file = "src/pages/HomePage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ HomePage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-fix-empty-profile-photo", code);

let before = code;

// Supprime le bloc vide : {data.profilePhoto && ( )}
code = code.replace(/\{\s*data\.profilePhoto\s*&&\s*\(\s*\)\s*\}/g, "");

// Sécurité : supprime aussi si espaces/lignes bizarres
code = code.replace(/\{\s*data\.profilePhoto\s*&&\s*\(\s*\n\s*\)\s*\}/g, "");

if (code === before) {
  console.log("⚠️ Bloc vide profilePhoto non trouvé automatiquement.");
  console.log("On va afficher les lignes autour de profilePhoto :");
  const lines = code.split("\n");
  lines.forEach((line, i) => {
    if (line.includes("data.profilePhoto")) {
      const start = Math.max(0, i - 5);
      const end = Math.min(lines.length, i + 8);
      for (let n = start; n < end; n++) {
        console.log(String(n + 1).padStart(4, " ") + " | " + lines[n]);
      }
    }
  });
} else {
  fs.writeFileSync(file, code);
  console.log("✅ Bloc profilePhoto vide supprimé dans HomePage.jsx");
}
