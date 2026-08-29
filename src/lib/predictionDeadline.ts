/**
 * FERMETURE DES PRONOSTICS — règle unique de l'application.
 *
 * Extraite de src/routes/pronostics.tsx (comportement strictement inchangé,
 * juste déplacé) pour que l'Accueil puisse annoncer « il te reste N pronos à
 * faire » sans réécrire la règle de son côté — et donc sans risquer de dire
 * qu'un match est encore jouable alors que la page Pronos le refuse.
 *
 * Deux modes, portés par la journée (`matchdays.deadline_mode`) :
 * - `auto_minus_1` : chaque match se ferme UNE MINUTE avant son coup d'envoi.
 *   Les matchs d'une même journée se ferment donc un par un.
 * - `manual` (défaut) : la date/heure saisie par l'admin dans
 *   `matchdays.deadline` vaut pour TOUS les matchs de la journée.
 *
 * Sans coup d'envoi connu, on retombe sur la deadline manuelle ; sans deadline
 * manuelle non plus, il n'y a pas de fermeture calculable et le match reste
 * ouvert (`null`).
 */

export type DeadlineMatch = {
  kickoff?: string | null;
};

export type DeadlineMatchday = {
  deadline?: string | null;
  /** "manual" | "auto_minus_1" — typé large : la valeur vient de Supabase. */
  deadline_mode?: string | null;
};

/** Instant précis où ce match n'est plus pronosticable, ou `null` si aucune
 *  échéance n'est calculable. */
export function matchLockDate(
  match: DeadlineMatch | null | undefined,
  matchday: DeadlineMatchday | null | undefined,
): Date | null {
  const manualRaw = matchday?.deadline ?? null;
  const manual = manualRaw ? new Date(manualRaw) : null;
  const manualValid = manual && !Number.isNaN(manual.getTime()) ? manual : null;

  if (!match?.kickoff) return manualValid;

  const kickoff = new Date(match.kickoff);
  if (Number.isNaN(kickoff.getTime())) return manualValid;

  if ((matchday?.deadline_mode ?? "manual") === "auto_minus_1") {
    return new Date(kickoff.getTime() - 60_000);
  }

  return manualValid;
}

/** `true` dès que l'échéance est atteinte. Un match sans échéance calculable
 *  n'est jamais considéré comme fermé. */
export function isMatchLocked(
  match: DeadlineMatch | null | undefined,
  matchday: DeadlineMatchday | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const lockDate = matchLockDate(match, matchday);
  return Boolean(lockDate && nowMs >= lockDate.getTime());
}
