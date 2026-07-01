const fs = require("fs");

const file = "src/App.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ App.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-clean-favorite-json", code);

// Ajoute useEffect
code = code.replace(
  'import React, { useState } from "react";',
  'import React, { useEffect, useState } from "react";'
);

const helper = `
function cleanFavoriteTeamValue(value) {
  if (!value) return value;

  if (typeof value === "string") {
    const raw = value.trim();

    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        return cleanFavoriteTeamValue(parsed);
      } catch {
        return raw;
      }
    }

    return raw;
  }

  if (typeof value === "object") {
    return (
      value.favoriteTeam ||
      value.club ||
      value.clubFavori ||
      value.team ||
      value.Manu ||
      Object.values(value).find((item) => typeof item === "string" && item.trim()) ||
      ""
    );
  }

  return String(value);
}

function cleanFavoriteTeamStorage() {
  try {
    const keys = [];

    for (let i = 0; i < localStorage.length; i++) {
      keys.push(localStorage.key(i));
    }

    keys.forEach((key) => {
      const lower = key.toLowerCase();

      const isFavoriteKey =
        lower.includes("favorite") ||
        lower.includes("favori") ||
        lower.includes("club") ||
        lower.includes("team");

      if (!isFavoriteKey) return;

      const raw = localStorage.getItem(key);
      if (!raw) return;

      const cleaned = cleanFavoriteTeamValue(raw);

      if (cleaned && cleaned !== raw && !String(cleaned).trim().startsWith("{")) {
        localStorage.setItem(key, cleaned);
      }
    });
  } catch {
    // ignore
  }
}
`;

if (!code.includes("function cleanFavoriteTeamStorage")) {
  const navIndex = code.indexOf("const NAV_ITEMS");
  code = code.slice(0, navIndex) + helper + "\n" + code.slice(navIndex);
}

// Ajoute le nettoyage au lancement de App
if (!code.includes("cleanFavoriteTeamStorage();")) {
  code = code.replace(
    `export default function App() {
  const [activePage, setActivePage] = useState("home");`,
    `export default function App() {
  const [activePage, setActivePage] = useState("home");

  useEffect(() => {
    cleanFavoriteTeamStorage();
  }, []);`
  );
}

fs.writeFileSync(file, code);

console.log("✅ Nettoyage club favori ajouté dans App.jsx.");
console.log("✅ Les valeurs JSON seront remplacées par RC Lens au lancement du site.");
