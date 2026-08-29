/**
 * Classement officiel de l'application — tri + attribution du rang.
 *
 * Source unique de vérité : le même algorithme que celui utilisé sur la
 * page Classement (src/routes/classement.tsx), extrait ici pour être
 * réutilisé tel quel par l'Accueil (podium du tableau de bord) et le Profil
 * ("#N du classement") — un joueur donné doit toujours avoir le MÊME rang,
 * quelle que soit la page qui l'affiche.
 *
 * Départage strict, dans cet ordre :
 *   1) points (décroissant)
 *   2) scores exacts (décroissant)
 *   3) régularité — ratio pronostics réussis / pronostics joués (décroissant)
 *   4) pseudo (alphabétique) — départage final déterministe
 * Rang strictement séquentiel (1, 2, 3, ...), sans partage d'ex-aequo —
 * comme sur la page Classement.
 *
 * Ne recalcule AUCUN point ni score : prend en entrée des valeurs déjà
 * calculées ailleurs (voir predictionScoring.ts pour le calcul des points).
 */
export type RankablePlayer = {
  points: number;
  exactScores: number;
  predictionsCount: number;
  regularitySuccess: number;
  /** PARTICIPATION — pronostics deposes / rencontres jouables pour CE joueur
   * (voir participationByUser et participationTotalByUser dans
   * leaderboardStats.ts). C'est la "regularite" affichee au Classement, et
   * donc le critere de departage attendu par les joueurs.
   * Optionnels : sans eux, on retombe sur l'ancien ratio de reussite, ce qui
   * evite qu'un appelant ne fournissant pas ces champs perde tout departage. */
  participation?: number;
  participationTotal?: number;
  pseudo?: string | null;
};

export function rankPlayers<T extends RankablePlayer>(players: T[]): (T & { rank: number })[] {
  return [...players]
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.exactScores !== a.exactScores) return b.exactScores - a.exactScores;

      // 3e critere : la REGULARITE, au sens ou elle est affichee — la part
      // des rencontres jouables que le joueur a effectivement pronostiquees.
      // CORRECTIF : ce departage utilisait regularitySuccess / predictionsCount,
      // c'est-a-dire un taux de REUSSITE. Un joueur ayant marque 3 points en 5
      // pronostics passait donc devant un joueur a 3 points en 7 pronostics,
      // alors que le classement affichait 71 % pour le premier et 100 % pour
      // le second : l'ordre contredisait visiblement la colonne.
      const ratio = (player: RankablePlayer) => {
        if (player.participationTotal && player.participationTotal > 0) {
          return (player.participation ?? 0) / player.participationTotal;
        }
        // Repli historique quand la participation n'est pas fournie.
        return player.predictionsCount > 0
          ? player.regularitySuccess / player.predictionsCount
          : 0;
      };

      const aRatio = ratio(a);
      const bRatio = ratio(b);
      if (bRatio !== aRatio) return bRatio - aRatio;

      return (a.pseudo ?? "").localeCompare(b.pseudo ?? "");
    })
    .map((player, index) => ({ ...player, rank: index + 1 }));
}

/**
 * ÉVOLUTION AU CLASSEMENT — un seul calcul, partagé par la liste desktop et
 * la liste mobile (elles en avaient chacune une copie, avec des règles
 * légèrement différentes : le libellé ignorait `hasBaseline`).
 *
 * `previousRank` vient du classement de référence calculé par la page
 * Classement (voir « JOURNÉE DE RÉFÉRENCE DE L'ÉVOLUTION »). Sans référence
 * exploitable,
 * on affiche « — » : on ne fabrique jamais une tendance à partir du rang
 * courant.
 */
export function rankMovement(
  previousRank: number | undefined,
  rank: number,
  hasBaseline: boolean,
) {
  const delta = hasBaseline && previousRank != null ? previousRank - rank : 0;
  return {
    delta,
    trend: delta > 0 ? "up" : delta < 0 ? "down" : "same",
    label: delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "—",
  } as const;
}
