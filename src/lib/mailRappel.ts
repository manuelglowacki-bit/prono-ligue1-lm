/**
 * LE LIEN « mailto: » DE RELANCE.
 *
 * Le rappel part de la boite mail de l'organisateur, pas d'un service tiers :
 * le lien ouvre son application de courrier avec les destinataires et le
 * message deja remplis, il n'a plus qu'a envoyer. Consequence directe :
 * l'adresse d'expedition est la sienne, les joueurs peuvent lui repondre, et
 * il n'y a ni cle d'API, ni domaine a verifier, ni cout.
 *
 * LES DESTINATAIRES VONT EN COPIE CACHEE. Vingt-trois joueurs qui decouvrent
 * l'adresse personnelle des vingt-deux autres, ce serait une fuite — et elle
 * serait irrattrapable une fois le message parti.
 */

export type JoueurARelancer = {
  pseudo: string | null;
  email: string | null;
};

export type LienRappel = {
  /** L'URL mailto: complete, prete pour window.location.href. */
  url: string;
  /** Ceux qui recevront le message. */
  destinataires: string[];
  /** Ceux qu'on n'a pas pu joindre, faute d'adresse connue. */
  sansAdresse: string[];
};

/** Une adresse plausible. Volontairement simple : c'est un garde-fou contre
 *  une valeur vide ou manifestement fausse, pas un validateur de norme. */
export function adressePlausible(valeur: string | null | undefined): boolean {
  const v = String(valeur ?? "").trim();
  if (!v || /\s/.test(v)) return false;
  const arobase = v.indexOf("@");
  if (arobase <= 0 || arobase !== v.lastIndexOf("@")) return false;
  const domaine = v.slice(arobase + 1);
  return domaine.includes(".") && !domaine.startsWith(".") && !domaine.endsWith(".");
}

/**
 * Construit le lien de relance.
 *
 * @param joueurs Les retardataires — ceux qui n'ont pas fini leurs pronostics.
 * @param sujet Objet du message.
 * @param corps Corps du message.
 */
export function lienRappel(
  joueurs: readonly JoueurARelancer[],
  sujet: string,
  corps: string,
): LienRappel {
  const destinataires: string[] = [];
  const sansAdresse: string[] = [];
  const dejaVues = new Set<string>();

  for (const joueur of joueurs) {
    const email = String(joueur?.email ?? "").trim();
    const nom = (joueur?.pseudo || "Joueur").trim();

    if (!adressePlausible(email)) {
      sansAdresse.push(nom);
      continue;
    }
    // Deux comptes peuvent partager une adresse : on n'ecrit qu'une fois.
    const cle = email.toLowerCase();
    if (dejaVues.has(cle)) continue;
    dejaVues.add(cle);
    destinataires.push(email);
  }

  // `mailto:` sans destinataire visible, tout le monde en copie cachee.
  const parametres = [
    `bcc=${encodeURIComponent(destinataires.join(","))}`,
    `subject=${encodeURIComponent(sujet)}`,
    `body=${encodeURIComponent(corps)}`,
  ];

  return {
    url: destinataires.length ? `mailto:?${parametres.join("&")}` : "",
    destinataires,
    sansAdresse,
  };
}
