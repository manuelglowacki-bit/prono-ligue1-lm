const fs = require("fs");
const path = require("path");

const cssFiles = ["src/index.css", "src/App.css"].filter(fs.existsSync);

for (const cssFile of cssFiles) {
  let css = fs.readFileSync(cssFile, "utf8");
  fs.writeFileSync(cssFile + ".bak-fix-ecriture", css);

  if (!css.includes("/* FIX ECRITURE PROFIL */")) {
    css += `

/* FIX ECRITURE PROFIL */
.profile-page *,
.profil-page *,
.home-page *,
.player-profile *,
.profile-card *,
.stats-card * {
  text-shadow: none;
}

.profile-page h1,
.profile-page h2,
.profile-page h3,
.profile-page p,
.profile-page span,
.profile-page strong,
.profile-page label,
.profile-page small,
.profil-page h1,
.profil-page h2,
.profil-page h3,
.profil-page p,
.profil-page span,
.profil-page strong,
.profil-page label,
.profil-page small,
.home-page h1,
.home-page h2,
.home-page h3,
.home-page p,
.home-page span,
.home-page strong,
.home-page label,
.home-page small {
  background: transparent !important;
  box-shadow: none !important;
}

.profile-page ::selection,
.profil-page ::selection,
.home-page ::selection {
  background: rgba(186, 255, 0, 0.25);
  color: #ffffff;
}
`;
    fs.writeFileSync(cssFile, css);
    console.log("✅ CSS corrigé :", cssFile);
  }
}

const pageFiles = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      if (item !== "node_modules" && item !== "dist") walk(full);
    } else if (/\.(jsx|js)$/.test(item)) {
      pageFiles.push(full);
    }
  }
}

walk("src");

for (const file of pageFiles) {
  let code = fs.readFileSync(file, "utf8");

  if (!code.includes("favoriteTeam") && !code.includes("club favori") && !code.includes("Club favori")) {
    continue;
  }

  fs.writeFileSync(file + ".bak-fix-club-favori-json", code);

  if (!code.includes("function cleanFavoriteClubDisplay")) {
    code = code.replace(
      /export default function|function HomePage|function ProfilPage|function ProfilePage/,
      `function cleanFavoriteClubDisplay(value) {
  if (!value) return "Non choisi";

  if (typeof value === "string") {
    const raw = value.trim();

    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        return parsed.favoriteTeam || parsed.club || parsed.Manu || Object.values(parsed).find(Boolean) || "Non choisi";
      } catch {
        return raw;
      }
    }

    return raw;
  }

  if (typeof value === "object") {
    return value.favoriteTeam || value.club || value.Manu || Object.values(value).find(Boolean) || "Non choisi";
  }

  return String(value);
}

$&`
    );
  }

  code = code.replace(/\{data\.favoriteTeam\}/g, "{cleanFavoriteClubDisplay(data.favoriteTeam)}");
  code = code.replace(/\{data\.club\}/g, "{cleanFavoriteClubDisplay(data.club)}");
  code = code.replace(/\{favoriteTeam\}/g, "{cleanFavoriteClubDisplay(favoriteTeam)}");
  code = code.replace(/\{clubFavori\}/g, "{cleanFavoriteClubDisplay(clubFavori)}");

  fs.writeFileSync(file, code);
  console.log("✅ Club favori nettoyé dans :", file);
}

console.log("✅ Correction écriture terminée.");
