const fs = require("fs");

const appFile = "src/App.jsx";
const cssFile = "src/styles/layout.css";

if (!fs.existsSync(appFile)) {
  console.error("❌ App.jsx introuvable");
  process.exit(1);
}

let app = fs.readFileSync(appFile, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(appFile + ".bak-name-save-visible", app);

app = app.replace(
  'import React, { useState } from "react";',
  'import React, { useEffect, useState } from "react";'
);

if (!app.includes("handleNameSaveVisible")) {
  app = app.replace(
`  const [activePage, setActivePage] = useState("home");`,
`  const [activePage, setActivePage] = useState("home");

  useEffect(() => {
    function handleNameSaveVisible(event) {
      const button = event.target.closest?.("button");
      if (!button) return;

      const label = button.textContent.trim().toLowerCase();

      if (label !== "enregistrer") return;

      const card =
        button.closest(".profile-pref-card") ||
        button.closest(".profile-card") ||
        button.closest("article") ||
        button.closest("div");

      const zoneText = card?.textContent?.toLowerCase() || "";

      if (!zoneText.includes("nom affiché") && !zoneText.includes("nom affiche")) return;

      const oldText = button.textContent;

      button.classList.add("name-save-confirmed");
      button.textContent = "Nom validé ✓";

      card.classList.add("name-card-confirmed");

      setTimeout(() => {
        button.classList.remove("name-save-confirmed");
        button.textContent = oldText;
        card.classList.remove("name-card-confirmed");
      }, 1800);
    }

    document.addEventListener("click", handleNameSaveVisible);

    return () => {
      document.removeEventListener("click", handleNameSaveVisible);
    };
  }, []);`
  );
}

fs.writeFileSync(appFile, app);

if (fs.existsSync(cssFile)) {
  let css = fs.readFileSync(cssFile, "utf8");
  fs.writeFileSync(cssFile + ".bak-name-save-visible", css);

  if (!css.includes("/* VALIDATION NOM AFFICHE */")) {
    css += `

/* VALIDATION NOM AFFICHE */
.name-save-confirmed {
  background: #22c55e !important;
  color: #ffffff !important;
  border-color: #86efac !important;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.20), 0 0 26px rgba(34, 197, 94, 0.55) !important;
  transform: scale(1.04);
}

.name-card-confirmed {
  border-color: rgba(34, 197, 94, 0.75) !important;
  box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.45), 0 0 28px rgba(34, 197, 94, 0.18) !important;
}

.name-card-confirmed input {
  border-color: #22c55e !important;
  color: #86efac !important;
}
`;
    fs.writeFileSync(cssFile, css);
  }
}

console.log("✅ Validation visible ajoutée uniquement pour le changement de nom.");
