export function buildAIReminderText({ journee, firstMatch, missingPlayers }) {
  const names = missingPlayers
    .map((account) => account.displayName || account.player)
    .join(', ');

  const matchLabel = firstMatch
    ? `${firstMatch.domicile || 'Équipe A'} - ${firstMatch.exterieur || 'Équipe B'}`
    : `Journée ${journee}`;

  if (missingPlayers.length === 1) {
    return `IA Rappel : la journée ${journee} approche. ${names} n’a pas encore validé ses pronos. Premier match : ${matchLabel}. Pense à le relancer avant le blocage. ⚽`;
  }

  return `IA Rappel : la journée ${journee} approche. ${missingPlayers.length} joueurs n’ont pas encore validé leurs pronos : ${names}. Premier match : ${matchLabel}. Il faut les relancer avant le blocage. ⚽`;
}

export function shouldSendAIReminder({ firstMatchDate, alreadySent, force = false }) {
  if (force) return true;
  if (!firstMatchDate) return false;
  if (alreadySent) return false;

  const now = new Date();
  const diff = firstMatchDate.getTime() - now.getTime();
  const sixHoursMs = 6 * 60 * 60 * 1000;

  return diff > 0 && diff <= sixHoursMs;
}
