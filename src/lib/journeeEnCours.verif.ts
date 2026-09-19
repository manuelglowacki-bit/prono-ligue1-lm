/**
 * Verification de la journee en cours.
 *   npm run verif-journee-en-cours
 */
import { numeroJourneeEnCours, type JourneeAvecMatchs } from "./journeeEnCours";

let total = 0;
let echecs = 0;
function egal(titre: string, obtenu: unknown, attendu: unknown) {
  total += 1;
  if (JSON.stringify(obtenu) === JSON.stringify(attendu)) console.log(`  ok    ${titre}`);
  else {
    echecs += 1;
    console.log(`  ECHEC ${titre}\n        obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);
  }
}

console.log("\nQUELLE JOURNEE EST EN COURS");
console.log("=".repeat(64));

const T = (jour: string) => new Date(`2026-09-${jour}T20:00:00Z`).getTime();
const heure = (jour: string) => `2026-09-${jour}T20:00:00Z`;

const journees: JourneeAvecMatchs[] = [
  { numero: 3, coupsDenvoi: [heure("05"), heure("06"), heure("07")] },
  { numero: 4, coupsDenvoi: [heure("12"), heure("13"), heure("14")] },
  { numero: 5, coupsDenvoi: [heure("19"), heure("20"), heure("21")] },
];

console.log("\nLe fil d'une saison");
egal("avant le premier match : aucune journee",
  numeroJourneeEnCours(journees, T("01")), null);
egal("la J3 vient de commencer", numeroJourneeEnCours(journees, T("05")), 3);
egal("pendant la J3", numeroJourneeEnCours(journees, T("06")), 3);
// LE POINT IMPORTANT : entre deux journees, le compteur NE S'EFFACE PAS.
// Effacer le lundi priverait tout le monde du resultat du week-end pendant
// quatre jours, pour le remplacer par des zeros.
egal("le lundi, on reste sur la journee ecoulee",
  numeroJourneeEnCours(journees, T("09")), 3);
egal("le jeudi aussi", numeroJourneeEnCours(journees, T("11")), 3);
egal("au coup d'envoi de la J4, le compteur repart",
  numeroJourneeEnCours(journees, T("12")), 4);
egal("puis la J5", numeroJourneeEnCours(journees, T("19")), 5);

console.log("\nCas limites");
egal("aucune journee", numeroJourneeEnCours([], T("12")), null);
egal("une journee sans match", numeroJourneeEnCours([{ numero: 4, coupsDenvoi: [] }], T("12")), null);
egal("un numero de journee absurde",
  numeroJourneeEnCours([{ numero: 0, coupsDenvoi: [heure("01")] }], T("12")), null);
egal("une date illisible n'ouvre pas une journee",
  numeroJourneeEnCours([{ numero: 4, coupsDenvoi: ["pas une date"] }], T("12")), null);
egal("une valeur vide non plus",
  numeroJourneeEnCours([{ numero: 4, coupsDenvoi: [null, "", undefined] }], T("12")), null);
egal("un seul match donne suffit",
  numeroJourneeEnCours([{ numero: 4, coupsDenvoi: [heure("12"), heure("28")] }], T("12")), 4);
egal("l'ordre des journees n'a pas d'importance",
  numeroJourneeEnCours([...journees].reverse(), T("13")), 4);
// Une journee reportee, jouee plus tard que la suivante, ne doit pas faire
// reculer le compteur : c'est le NUMERO le plus grand qui gagne.
egal("une journee reportee ne fait pas reculer le compteur",
  numeroJourneeEnCours(
    [{ numero: 4, coupsDenvoi: [heure("12")] }, { numero: 2, coupsDenvoi: [heure("13")] }],
    T("14"),
  ),
  4);

console.log("\n" + "=".repeat(64));
console.log(echecs === 0 ? `TOUT PASSE (${total} verifications)` : `${echecs} ECHEC(S) sur ${total}`);
if (echecs > 0) process.exit(1);
