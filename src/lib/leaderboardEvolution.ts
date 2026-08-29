/**
 * ÉVOLUTION AU CLASSEMENT — classement de référence, partagé.
 *
 * Extrait de src/routes/classement.tsx pour que l'Accueil affiche EXACTEMENT
 * les mêmes flèches que le Classement : deux calculs séparés finiraient par
 * diverger, et un joueur verrait « +2 » sur une page et « — » sur l'autre.
 *
 * PRINCIPE — fenêtre glissante de matchs. La pastille montre les places
 * gagnées ou perdues sur les `windowMatches` derniers matchs TERMINÉS. La
 * référence avance donc d'un cran à chaque coup de sifflet final : elle bouge
 * à chaque résultat, y compris entre deux journées.
 *
 * Pourquoi une fenêtre et pas « le dernier match » : un seul résultat ne fait
 * bouger que quelques rangs, la quasi-totalité des joueurs resterait à « — ».
 * Pourquoi pas « la dernière journée » : entre deux journées, cette référence
 * EST le classement affiché, donc « — » du 1er au dernier.
 */
import {
  computeLeagueStats,
  type LeagueBonusOption,
  type LeagueMatch,
  type LeaguePrediction,
  type LeagueProfile,
} from "./leaderboardStats";
import { rankPlayers } from "./leaderboardRanking";

/** Nombre de matchs terminés couverts par la pastille « Évolution ». */
export const EVOLUTION_WINDOW_MATCHES = 3;

export type EvolutionInput = {
  /** Matchs Ligue 1 dans leur état RÉEL (reconcileMatchesWithLive), JAMAIS la
   *  vue « scorable » : un match en cours ne doit entrer ni dans la fenêtre ni
   *  dans la référence, sinon celle-ci bougerait pendant le match. */
  ligue1Matches: LeagueMatch[];
  /** Matchs bonus, même règle. */
  bonusMatches: LeagueMatch[];
  bonusOptions: LeagueBonusOption[];
  predictions: LeaguePrediction[];
  profiles: (LeagueProfile & { pseudo?: string | null })[];
  teamNameById: Record<string, string | undefined>;
  history?: {
    seasonByMatchdayId?: Record<string, string | undefined>;
    favoriteTeamBySeason?: Record<string, string | undefined>;
  };
  windowMatches?: number;
};

export type EvolutionBaseline = {
  /** Rang de référence par joueur. VIDE quand aucune évolution n'est
   *  mesurable — l'appelant doit alors afficher « — » pour tout le monde. */
  previousRankByUser: Record<string, number>;
  /** Nombre de matchs réellement couverts (0 si aucune référence). */
  windowSize: number;
};

export function computeEvolutionBaseline(input: EvolutionInput): EvolutionBaseline {
  const {
    ligue1Matches,
    bonusMatches,
    bonusOptions,
    predictions,
    profiles,
    teamNameById,
    history,
    windowMatches = EVOLUTION_WINDOW_MATCHES,
  } = input;

  // Ordre des résultats : le coup d'envoi est le seul repère chronologique
  // disponible — la base ne stocke aucune heure de fin. Les matchs joués
  // simultanément sont départagés par leur id, pour que la fenêtre reste
  // stable d'un rafraîchissement à l'autre.
  const finishedInOrder = [...ligue1Matches, ...bonusMatches]
    .filter((m) => m.finished === true && m.home_score != null && m.away_score != null)
    .sort((a, b) => {
      const kickoffA = a.kickoff ? new Date(a.kickoff).getTime() : 0;
      const kickoffB = b.kickoff ? new Date(b.kickoff).getTime() : 0;
      if (kickoffA !== kickoffB) return kickoffA - kickoffB;
      return String(a.id).localeCompare(String(b.id));
    });

  const windowSize = Math.min(Math.max(windowMatches, 0), finishedInOrder.length);
  const baselineMatchIds = new Set(
    finishedInOrder.slice(0, finishedInOrder.length - windowSize).map((m) => String(m.id)),
  );

  // Aucun résultat antérieur à la fenêtre (tout début de saison) : la
  // référence mettrait tout le monde à 0 point, donc à égalité, et le
  // classement se réduirait à l'ordre alphabétique — des évolutions inventées
  // de toutes pièces. On préfère ne rien affirmer.
  if (baselineMatchIds.size === 0) {
    return { previousRankByUser: {}, windowSize: 0 };
  }

  // EXACTEMENT le même moteur que le classement affiché : computeLeagueStats
  // puis rankPlayers, avec les mêmes champs de départage. Une référence
  // ré-agrégée à la main, sans `participation`/`participationTotal`, ferait
  // retomber rankPlayers sur l'ancien départage au taux de réussite : deux
  // joueurs à égalité de points changeraient de place d'un classement à
  // l'autre sans avoir rien joué, fabriquant des évolutions fantômes.
  //
  // `bonusOptions` est passé entier : computeLeagueStats ne compte un bonus
  // que si le match correspondant fait partie de la liste reçue, donc filtrer
  // les matchs suffit.
  const baselineStats = computeLeagueStats(
    ligue1Matches.filter((m) => baselineMatchIds.has(String(m.id))),
    bonusMatches.filter((m) => baselineMatchIds.has(String(m.id))),
    bonusOptions,
    predictions.filter((p) => baselineMatchIds.has(String(p.match_id))),
    profiles,
    teamNameById,
    history,
  );

  const baselineRanking = rankPlayers(
    profiles.map((p) => ({
      ...p,
      points: baselineStats.pointsByUser[p.id] ?? 0,
      exactScores: baselineStats.exactScoresByUser[p.id] ?? 0,
      predictionsCount: baselineStats.predictionsCountByUser[p.id] ?? 0,
      regularitySuccess: baselineStats.regularitySuccessByUser[p.id] ?? 0,
      participation: baselineStats.participationByUser[p.id] ?? 0,
      participationTotal: baselineStats.participationTotalByUser[p.id] ?? 0,
    })),
  );

  const previousRankByUser: Record<string, number> = {};
  baselineRanking.forEach((player) => {
    previousRankByUser[player.id] = player.rank;
  });

  return { previousRankByUser, windowSize };
}
