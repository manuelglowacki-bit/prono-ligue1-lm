/**
 * QUELLE JOURNEE EST EN COURS.
 *
 * Le Classement affiche sous chaque total ce que le joueur a pris SUR LA
 * JOURNEE. Encore faut-il savoir de quelle journee on parle, et quand le
 * compteur repart de zero.
 *
 * LA REGLE : la journee en cours est la plus recente dont AU MOINS UN MATCH
 * a ete donne. Autrement dit, le compteur se remet a zero au coup d'envoi du
 * premier match d'une journee, puis monte match apres match.
 *
 * POURQUOI LE PREMIER COUP D'ENVOI, et non minuit le lundi : entre la fin
 * d'une journee et le debut de la suivante, il ne se passe rien. Effacer le
 * compteur le lundi matin priverait tout le monde du resultat du week-end
 * pendant quatre jours, pour le remplacer par des zeros qui ne veulent rien
 * dire. Il reste donc sur la journee ecoulee jusqu'au prochain match.
 *
 * Aucun point n'est calcule ici : on ne fait que designer une journee.
 */

export type JourneeAvecMatchs = {
  numero: number;
  /** Les coups d'envoi de ses matchs, tels quels. */
  coupsDenvoi: readonly (string | number | Date | null | undefined)[];
};

/**
 * @param journees Les journees connues, avec les coups d'envoi de leurs matchs.
 * @param maintenant L'instant de reference (Date.now() en general).
 * @returns Le numero de la journee en cours, ou `null` si aucune n'a commence.
 */
export function numeroJourneeEnCours(
  journees: readonly JourneeAvecMatchs[],
  maintenant: number,
): number | null {
  let enCours: number | null = null;

  journees.forEach((journee) => {
    const numero = Number(journee?.numero);
    if (!Number.isFinite(numero) || numero < 1) return;

    const commencee = (journee.coupsDenvoi ?? []).some((brut) => {
      if (brut == null || brut === "") return false;
      const debut = new Date(brut as any).getTime();
      // Une date illisible n'est pas un coup d'envoi : mieux vaut ignorer la
      // ligne que de declarer une journee commencee sur une donnee abimee.
      return Number.isFinite(debut) && debut <= maintenant;
    });
    if (!commencee) return;

    if (enCours === null || numero > enCours) enCours = numero;
  });

  return enCours;
}
