const fs = require("fs");

const adminFile = "src/pages/AdminPage.jsx";

if (!fs.existsSync(adminFile)) {
  console.error("❌ Fichier introuvable : " + adminFile);
  process.exit(1);
}

let code = fs.readFileSync(adminFile, "utf8");
fs.writeFileSync(adminFile + ".bak-fix-css-error", code);

// Supprime le bloc CSS mal placé dans AdminPage.jsx
code = code.replace(
  /\s*\.admin-validate-btn\.validated\s*\{[\s\S]*?\}\s*/g,
  "\n"
);

// Sécurité : supprime les lignes CSS seules qui cassent JSX
code = code
  .split(/\r?\n/)
  .filter((line) => {
    const l = line.trim();
    return !(
      l === "background: rgba(34, 197, 94, 0.22) !important;" ||
      l === "border-color: rgba(34, 197, 94, 0.65) !important;" ||
      l === "color: #86efac !important;"
    );
  })
  .join("\n");

fs.writeFileSync(adminFile, code);

// Ajoute le CSS au bon endroit : dans un vrai fichier CSS
const cssFiles = ["src/index.css", "src/App.css"];
const cssFile = cssFiles.find((f) => fs.existsSync(f));

if (cssFile) {
  let css = fs.readFileSync(cssFile, "utf8");

  if (!css.includes(".admin-validate-btn.validated")) {
    css += `

.admin-validate-btn.validated {
  background: rgba(34, 197, 94, 0.22) !important;
  border-color: rgba(34, 197, 94, 0.65) !important;
  color: #86efac !important;
}
`;
    fs.writeFileSync(cssFile, css);
    console.log("✅ CSS ajouté dans " + cssFile);
  }
}

console.log("✅ Erreur CSS corrigée dans AdminPage.jsx");
