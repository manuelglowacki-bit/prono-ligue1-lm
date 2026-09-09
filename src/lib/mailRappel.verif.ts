/**
 * Verification du lien de relance par mail.
 *   npm run verif-mail-rappel
 */
import { adressePlausible, lienRappel } from "./mailRappel";

let total = 0;
let echecs = 0;
function verifier(titre: string, condition: boolean, detail?: string) {
  total += 1;
  if (condition) console.log(`  ok    ${titre}`);
  else {
    echecs += 1;
    console.log(`  ECHEC ${titre}${detail ? `\n        ${detail}` : ""}`);
  }
}
function egal(titre: string, obtenu: unknown, attendu: unknown) {
  verifier(titre, JSON.stringify(obtenu) === JSON.stringify(attendu),
    `obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);
}

console.log("\nLIEN DE RELANCE PAR MAIL");
console.log("=".repeat(60));

console.log("\nAdresses acceptees ou refusees");
for (const bonne of ["a@b.fr", "manuel.glowacki@gmail.com", "x_y+z@sous.domaine.co.uk"]) {
  verifier(`acceptee : ${bonne}`, adressePlausible(bonne));
}
for (const mauvaise of ["", "   ", "sansarobase.fr", "@domaine.fr", "a@b", "a@@b.fr", "a b@c.fr", "a@.fr", "a@fr."]) {
  verifier(`refusee : ${JSON.stringify(mauvaise)}`, !adressePlausible(mauvaise));
}
verifier("refusee : null", !adressePlausible(null));

console.log("\nConstruction du lien");
const r = lienRappel(
  [
    { pseudo: "Sanji", email: "sanji@mail.fr" },
    { pseudo: "Mel11", email: "mel@mail.fr" },
  ],
  "Pronos J3",
  "Salut, pense à tes pronos !",
);
egal("les deux joueurs sont destinataires", r.destinataires, ["sanji@mail.fr", "mel@mail.fr"]);
egal("personne n'est laisse de cote", r.sansAdresse, []);
verifier("tout le monde en copie CACHEE", r.url.startsWith("mailto:?bcc="),
  `obtenu ${r.url.slice(0, 40)}`);
verifier("aucun destinataire en clair (pas de 'to=')", !r.url.includes("to="),
  `obtenu ${r.url}`);
verifier("l'objet est dans le lien", r.url.includes(`subject=${encodeURIComponent("Pronos J3")}`));
verifier("le corps est dans le lien", r.url.includes(encodeURIComponent("pense à tes pronos")));

console.log("\nCas particuliers");
const sans = lienRappel(
  [
    { pseudo: "Sanji", email: "sanji@mail.fr" },
    { pseudo: "Phiphi", email: null },
    { pseudo: "Chris", email: "pasuneadresse" },
  ],
  "o", "c",
);
egal("seul le joignable est destinataire", sans.destinataires, ["sanji@mail.fr"]);
egal("les autres sont signales, pas oublies", sans.sansAdresse, ["Phiphi", "Chris"]);

const doublon = lienRappel(
  [
    { pseudo: "Compte A", email: "meme@mail.fr" },
    { pseudo: "Compte B", email: "MEME@mail.fr" },
  ],
  "o", "c",
);
egal("une adresse en double n'est ecrite qu'une fois", doublon.destinataires, ["meme@mail.fr"]);

const vide = lienRappel([], "o", "c");
egal("aucun joueur : pas de lien", vide.url, "");
const aucunJoignable = lienRappel([{ pseudo: "Phiphi", email: null }], "o", "c");
egal("aucun joignable : pas de lien non plus", aucunJoignable.url, "");
egal("mais on sait qui manque", aucunJoignable.sansAdresse, ["Phiphi"]);

console.log("\nEncodage");
const accents = lienRappel(
  [{ pseudo: "X", email: "x@mail.fr" }],
  "Journée 3 : c'est l'heure",
  "Ligne 1\nLigne 2 & fin",
);
verifier("le saut de ligne est encode", accents.url.includes("%0A"), accents.url);
verifier("l'esperluette ne coupe pas le lien",
  accents.url.includes("%26") && accents.url.split("&").length === 3,
  accents.url);

console.log("\n" + "=".repeat(60));
console.log(echecs === 0 ? `TOUT PASSE (${total} verifications)` : `${echecs} ECHEC(S) sur ${total}`);
if (echecs > 0) process.exit(1);
