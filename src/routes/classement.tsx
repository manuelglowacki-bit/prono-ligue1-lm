import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Minus,
  Target,
  Trophy,
} from "lucide-react";
import { AppShell } from "@/components/prono/AppShell";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { matchday as currentMatchday } from "@/lib/prono-data";
import { calculateCareerScore, aggregateCareerStatsByUser } from "@/lib/careerLevel";
import { computeLeagueStats } from "@/lib/leaderboardStats";
import { rankMovement, rankPlayers } from "@/lib/leaderboardRanking";
import { computePrizeByRank } from "@/lib/prizePool";
import { fetchLiveApiMatches, reconcileMatchesWithLive, markLiveMatchesScorable } from "@/lib/liveMatches";

export const Route = createFileRoute("/classement")({
  head: () => ({
    meta: [
      { title: "Classement Général — Prono Ligue 1" },
      { name: "description", content: "Classement général et statistiques de la ligue de pronostics." },
    ],
  }),
  component: ClassementPage,
});

// ============================================================
// Données & calcul du classement
// ============================================================
type PlayerProfile = {
  id: string;
  pseudo: string | null;
  avatar_url: string | null;
  favorite_team_id: string | null;
  /** Ancienne colonne texte (nom du club, pré-datant favorite_team_id) —
   * utilisée uniquement en repli si l'id ne permet pas de détecter le match
   * de l'équipe favorite (voir isFavoriteMatch dans lib/predictionScoring.ts). */
  favorite_team?: string | null;
};

type TeamRow = { id: string; name: string; short_name: string | null; logo_url: string | null };

type RankedPlayer = PlayerProfile & {
  rank: number;
  points: number;
  exactScores: number;
  predictionsCount: number;
  /** Nombre de pronostics ayant rapporté au moins 1 point — sert au calcul du pourcentage de régularité. */
  regularitySuccess: number;
  /** Participation : pronostics Ligue 1 déposés / matchs Ligue 1 déjà joués. */
  predictionsMade?: number;
  matchesPlayable?: number;
  /** Nombre de journées Ligue 1 sur lesquelles le joueur a effectivement pronostiqué. */
  playedMatchdays: number;
  careerLevel: number;
  careerTitle: string;
};

/**
 * ÉVOLUTION — nombre de matchs terminés couverts par la pastille.
 *
 * La référence avance d'un cran à chaque coup de sifflet final : la pastille
 * bouge donc à chaque fin de match. Une fenêtre de 3 matchs (et non 1) évite
 * qu'une écrasante majorité de joueurs reste à « — » : un seul résultat ne
 * fait bouger que quelques rangs, trois en font bouger beaucoup plus, tout en
 * gardant une lecture « forme du moment ».
 */
const EVOLUTION_WINDOW_MATCHES = 3;

/**
 * Réduit progressivement la taille d'un nom de joueur trop long au lieu de le
 * tronquer — retourne un facteur d'échelle à appliquer à la taille de police
 * de base (via calc(... * facteur)).
 */
function podiumNameScale(name: string): number {
  const len = name.length;
  if (len > 16) return 0.68;
  if (len > 12) return 0.8;
  if (len > 9) return 0.9;
  return 1;
}

/**
 * Médaille de classement (or / argent / bronze) — remplace le chiffre de
 * position (1/2/3) à l'intérieur des bannières du podium. `scope` évite les
 * collisions d'id de gradient entre la scène desktop et la scène mobile
 * (toutes deux présentes dans le DOM en même temps, seule leur visibilité
 * CSS diffère).
 */
function RankMedal({ rank, scope, className }: { rank: 1 | 2 | 3; scope: string; className?: string }) {
  const palette =
    rank === 1
      ? { from: "#FFF3D0", mid: "#F5C24D", to: "#B8790F", ribbonA: "#7A1F2B", ribbonB: "#54141C" }
      : rank === 2
        ? { from: "#FDFEFF", mid: "#D7DEE8", to: "#8B96A6", ribbonA: "#2E4B7A", ribbonB: "#1E3455" }
        : { from: "#F7D9AE", mid: "#C8813F", to: "#7C441C", ribbonA: "#7A1F2B", ribbonB: "#54141C" };

  const gradId = `medal-disc-${scope}-${rank}`;

  return (
    <svg viewBox="0 0 64 64" className={className} style={{ width: "100%", height: "100%" }} aria-hidden="true">
      <defs>
        <radialGradient id={gradId} cx="34%" cy="26%" r="78%">
          <stop offset="0%" stopColor={palette.from} />
          <stop offset="55%" stopColor={palette.mid} />
          <stop offset="100%" stopColor={palette.to} />
        </radialGradient>
      </defs>
      {/* Rubans */}
      <path d="M21 2 L30 25 L19 30 Z" fill={palette.ribbonA} />
      <path d="M43 2 L34 25 L45 30 Z" fill={palette.ribbonB} />
      <path d="M24 3 L30 20 L27 23 L21 5 Z" fill="#fff" opacity="0.14" />
      {/* Disque métallique */}
      <circle cx="32" cy="38" r="22" fill={`url(#${gradId})`} stroke={palette.from} strokeWidth="1.4" />
      <circle cx="32" cy="38" r="19" fill="none" stroke="rgba(255,255,255,.62)" strokeWidth="1.1" opacity="0.72" />
      <circle cx="32" cy="38" r="15.5" fill="none" stroke={palette.to} strokeWidth="1.2" opacity="0.8" />
      {/* Reflet */}
      <ellipse cx="25" cy="29" rx="9" ry="5" fill="#fff" opacity="0.24" />
      {/* Emblème étoile gravée */}
      <path
        d="M32,26 L34.12,32.09 L40.56,32.22 L35.42,36.11 L37.29,42.28 L32,38.6 L26.71,42.28 L28.58,36.11 L23.44,32.22 L29.88,32.09 Z"
        fill={palette.to}
        opacity="0.42"
      />
      <text x="32" y="43" textAnchor="middle" fontSize="16" fontWeight="900"
        fontFamily="Arial, sans-serif" fill="#fff" stroke="rgba(0,0,0,.22)"
        strokeWidth="0.8" paintOrder="stroke">
        {rank}
      </text>
    </svg>
  );
}

function ClassementPage() {
  const { user } = useAuth();

  const [players, setPlayers] = useState<PlayerProfile[] | null>(null);
  // Empêche une ancienne requête live de revenir après une requête plus récente
  // et d'écraser le classement avec des points obsolètes.
  const loadSequenceRef = useRef(0);
  const [teamsById, setTeamsById] = useState<Record<string, TeamRow>>({});
  const [season, setSeason] = useState("2026-2027");

  const [pointsByUser, setPointsByUser] = useState<Record<string, number>>({});
  const [predictionsCountByUser, setPredictionsCountByUser] = useState<Record<string, number>>({});
  // Scores exacts réels (pronostic "club de cœur" home_score/away_score === score final du match),
  // et compteur de pronostics 1N2 réussis pour la régularité — tous deux calculés dynamiquement
  // depuis Supabase (voir load() ci-dessous), jamais de valeur fictive.
  const [exactScoresByUser, setExactScoresByUser] = useState<Record<string, number>>({});
  const [regularitySuccessByUser, setRegularitySuccessByUser] = useState<Record<string, number>>({});
  // PARTICIPATION — pronostics Ligue 1 deposes / matchs Ligue 1 deja joues.
  // C'est ce que la colonne "Régularité" affiche desormais : est-ce que le
  // joueur depose ses pronostics a chaque journee, ou en saute-t-il ?
  const [participationCountsByUser, setParticipationCountsByUser] = useState<Record<string, number>>({});
  const [participationTotalByUser, setParticipationTotalByUser] = useState<Record<string, number>>({});
  const [playedMatchdaysByUser, setPlayedMatchdaysByUser] = useState<Record<string, number>>({});
  const [finishedMatchdayCount, setFinishedMatchdayCount] = useState(0);
  const [careerStatsByUser, setCareerStatsByUser] = useState<Record<string, { points: number; exactScores: number }>>({});
  const [previousRankByUser, setPreviousRankByUser] = useState<Record<string, number>>({});
  // Nombre de matchs terminés réellement couverts par la pastille
  // « Évolution » — sert uniquement à son infobulle.
  const [evolutionWindowSize, setEvolutionWindowSize] = useState(0);
  // Liste des journées Ligue 1 de la saison (id + numéro) — sert uniquement au
  // sélecteur visuel sous le titre. Le classement lui-même reste un cumul
  // saison complet : ce sélecteur est préparé pour un futur filtrage réel
  // par journée, mais n'est pas encore branché sur une logique de calcul
  // (décision produit du 14/08 : pas de nouvelle requête de classement par
  // journée dans cette refonte visuelle).
  const [matchdaysList, setMatchdaysList] = useState<{ id: string; number: number }[]>([]);
  // Journée ayant distribué le plus de points cumulés (tous joueurs
  // confondus), calculée en ré-agrégeant les points déjà attribués par
  // load() ci-dessous (aucune valeur de point recalculée/modifiée — simple
  // regroupement par matchday_id de ce qui est déjà additionné à points[]).
  const [bestMatchday, setBestMatchday] = useState<{ number: number; points: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    type MatchForRanking = {
      id: string;
      matchday_id: string | null;
      home_team_id: string | null;
      away_team_id: string | null;
      /** Noms bruts (colonnes texte de `matches`, indépendantes de `teams`) —
       * servent de repli pour la détection de l'équipe favorite quand
       * home_team_id/away_team_id est manquant/incohérent. */
      home_team: string | null;
      away_team: string | null;
      home_score: number | null;
      away_score: number | null;
      finished: boolean;
      is_bonus: boolean;
      api_fixture_id?: number | null;
      status?: string | null;
      kickoff?: string | null;
    };

    type BonusOptionForRanking = {
      matchday_id: string;
      match_id: string;
      is_active: boolean;
    };

    async function load() {
      const loadId = ++loadSequenceRef.current;
      const isStale = () => cancelled || loadId !== loadSequenceRef.current;

      try {
        // La source du classement est maintenant cohérente avec le système
        // actuel :
        // - profiles.favorite_team_id = équipe de cœur
        // - predictions.home_prediction / away_prediction = pronostic
        // - matches = résultat + équipes + type du match
        // - bonus_options = les 4 matchs bonus rattachés à UNE journée Ligue 1
        const [
          { data: profilesData, error: profilesError },
          { data: teamsData, error: teamsError },
          { data: settingsData, error: settingsError },
          { data: matchdaysData, error: matchdaysError },
          { data: favoriteHistoryData, error: favoriteHistoryError },
        ] = await Promise.all([
          supabase.from("profiles").select("id, pseudo, avatar_url, favorite_team_id, favorite_team"),
          supabase.from("teams").select("id, name, short_name, logo_url"),
          supabase.from("app_settings").select("season").eq("id", 1).maybeSingle(),
          supabase
            .from("matchdays")
            .select("id, number, code, season, season_id, competition_id")
            .order("number", { ascending: true }),
          // Équipe favorite HISTORISÉE par saison (Lot 4) — pour que le
          // barème favori (2/1/0) d'un pronostic passé utilise toujours le
          // club qui était réellement favori À CETTE ÉPOQUE, jamais le
          // favori courant du profil. Erreur non bloquante : sans cette
          // donnée, repli automatique sur le favori courant (comportement
          // d'avant), voir computeLeagueStats().
          supabase.from("user_season_favorite_teams").select("user_id, season_id, favorite_team_id"),
        ]);

        if (isStale()) return;
        if (profilesError) throw profilesError;
        if (teamsError) throw teamsError;
        if (settingsError) throw settingsError;
        if (favoriteHistoryError) {
          console.warn("Historique équipe favorite non chargé :", favoriteHistoryError);
        }
        if (matchdaysError) throw matchdaysError;

        const seasonName = settingsData?.season ?? "2026-2027";
        if (settingsData?.season) setSeason(settingsData.season);

        const teamsMap: Record<string, TeamRow> = {};
        (teamsData ?? []).forEach((t: TeamRow) => {
          teamsMap[t.id] = t;
        });
        setTeamsById(teamsMap);

        // On ne travaille que sur les journées Ligue 1 de la saison courante.
        // Le filtre compétition évite de mélanger les J1/J2 des 4 championnats
        // bonus avec les J1/J2 de Ligue 1.
        const ligue1Matchdays = (matchdaysData ?? []).filter((md: any) => {
          const sameSeason = String(md.season ?? seasonName) === String(seasonName);
          const competitionCode = String(md.competition_id ?? "");
          return sameSeason && competitionCode !== "";
        });

        // Certaines anciennes lignes peuvent avoir season vide mais être liées
        // à une journée de la saison courante. On garde aussi les journées
        // explicitement marquées 2026-2027.
        const matchdayIds = ligue1Matchdays.map((md: any) => String(md.id));

        if (matchdayIds.length === 0) {
          if (!isStale()) {
            setPlayers(profilesData ?? []);
            setPointsByUser({});
            setPredictionsCountByUser({});
            setExactScoresByUser({});
            setRegularitySuccessByUser({});
            setPlayedMatchdaysByUser({});
            setFinishedMatchdayCount(0);
            setBestMatchday(null);
            setPreviousRankByUser({});
          }
          return;
        }

        const [
          { data: competitionsData, error: competitionsError },
          { data: finishedLigue1Matches, error: matchesError },
        ] = await Promise.all([
          supabase.from("competitions").select("id, code, external_code"),
          supabase
            .from("matches")
            .select(
              "id, matchday_id, home_team_id, away_team_id, home_team, away_team, home_score, away_score, finished, is_bonus, api_fixture_id, status, kickoff",
            )
            .eq("is_bonus", false)
            .in("matchday_id", matchdayIds),
        ]);

        if (isStale()) return;
        if (competitionsError) throw competitionsError;
        if (matchesError) throw matchesError;

        const ligue1CompetitionIds = new Set(
          (competitionsData ?? [])
            .filter((c: any) => c.code === "FL1" || c.external_code === "FL1")
            .map((c: any) => String(c.id)),
        );

        // Les journées Ligue 1 sont liées à FL1. On utilise ce contrôle en plus
        // du season pour rester compatible avec les anciennes données.
        const ligue1MatchdayIds = new Set(
          ligue1Matchdays
            .filter((md: any) => !md.competition_id || ligue1CompetitionIds.has(String(md.competition_id)))
            .map((md: any) => String(md.id)),
        );

        // Sélecteur de journées (visuel) : uniquement les VRAIES journées
        // Ligue 1 (ligue1MatchdayIds, filtrées FL1 ci-dessus) — `ligue1Matchdays`
        // seul incluait par erreur les journées des 4 championnats bonus
        // (même saison, competition_id non vide), d'où des numéros dupliqués
        // dans les chips (ex. "J17 J17 J17 J18…"). Dédoublonnage par numéro en
        // plus, par sécurité vis-à-vis d'éventuelles anciennes lignes en base.
        if (!isStale()) {
          const uniqueByNumber = new Map<number, { id: string; number: number }>();
          ligue1Matchdays
            .filter((md: any) => ligue1MatchdayIds.has(String(md.id)))
            .forEach((md: any) => {
              const number = Number(md.number ?? 0);
              if (!uniqueByNumber.has(number)) {
                uniqueByNumber.set(number, { id: String(md.id), number });
              }
            });
          setMatchdaysList([...uniqueByNumber.values()].sort((a, b) => a.number - b.number));
        }

        const matches = ((finishedLigue1Matches ?? []) as MatchForRanking[]).filter(
          (m) =>
            !!m.matchday_id &&
            ligue1MatchdayIds.has(String(m.matchday_id)),
        );

        // DIRECT LIVE :
        // Supabase reste la source du calendrier et des pronostics, mais le
        // score/statut en cours est rafraîchi depuis l'API football-data.org.
        // Fusion + garde anti-régression + fenêtre "match commencé -> scorable"
        // : logique UNIQUE, partagée avec Accueil/Profil/Stats/Pronostics,
        // voir src/lib/liveMatches.ts (avant cette extraction, le Classement
        // n'avait ni garde anti-régression, ni scoring en direct pendant un
        // match encore EN COURS — un vrai retard par rapport aux 3 autres
        // pages, corrigé ici).
        const liveApiMatches = await fetchLiveApiMatches();
        if (isStale()) return;

        const liveMatches = reconcileMatchesWithLive(matches, liveApiMatches);

        // Les 4 matchs bonus sont rattachés à la journée Ligue 1 via
        // bonus_options.matchday_id. Le match bonus lui-même peut appartenir
        // à une autre compétition et avoir un autre matchday_id dans matches.
        //
        // IMPORTANT — CORRECTIF (bug du 9 au lieu de 13) : on récupère ICI
        // toutes les lignes, actives ET historiques (plus de `.eq("is_active",
        // true)`). Un joueur peut avoir pronostiqué sur le match bonus
        // sélectionné AU MOMENT de son pronostic ; si l'admin change ensuite
        // la sélection (bonusOptionsService.replaceBonusSelection désactive
        // l'ancienne ligne sans y toucher), ce pronostic devenait invisible
        // pour le calcul — silencieusement exclu au lieu d'être compté. Le
        // pronostic du joueur reste rattaché au match qu'il a réellement
        // joué, jamais à la sélection "active" au moment du calcul.
        const { data: bonusOptionsData, error: bonusOptionsError } = await supabase
          .from("bonus_options")
          .select("matchday_id, match_id, is_active")
          .in("matchday_id", matchdayIds);

        if (isStale()) return;
        if (bonusOptionsError) throw bonusOptionsError;

        const bonusOptions = (bonusOptionsData ?? []) as BonusOptionForRanking[];

        const bonusMatchIds = [...new Set(bonusOptions.map((o) => String(o.match_id)).filter(Boolean))];

        let bonusMatches: MatchForRanking[] = [];
        if (bonusMatchIds.length > 0) {
          const { data: bonusMatchesData, error: bonusMatchesError } = await supabase
            .from("matches")
            .select(
              "id, matchday_id, home_team_id, away_team_id, home_team, away_team, home_score, away_score, finished, is_bonus, api_fixture_id, status, kickoff",
            )
            .in("id", bonusMatchIds);

          if (isStale()) return;
          if (bonusMatchesError) throw bonusMatchesError;

          bonusMatches = reconcileMatchesWithLive(
            (bonusMatchesData ?? []) as MatchForRanking[],
            liveApiMatches,
          );
        }

        const allScoredMatchIds = [
          ...new Set([
            ...liveMatches.map((m) => String(m.id)),
            ...bonusMatches.map((m) => String(m.id)),
          ]),
        ];

        const { data: predictionsData, error: predictionsError } = await supabase
          .from("predictions")
          .select("user_id, match_id, home_prediction, away_prediction, created_at")
          .in("match_id", allScoredMatchIds);

        if (isStale()) return;
        if (predictionsError) throw predictionsError;

        const profiles = (profilesData ?? []) as PlayerProfile[];

        // Agrégation officielle (points / scores exacts / régularité) —
        // extraite dans src/lib/leaderboardStats.ts, comportement identique
        // à avant (même code, juste déplacé) : c'est désormais LA seule
        // source de vérité, réutilisée telle quelle par index.tsx et
        // profil.tsx au lieu de leur propre lecture de `predictions.points`
        // (colonne jamais mise à jour par l'application — voir le
        // commentaire dans leaderboardStats.ts pour le détail du bug corrigé).
        const teamNameById: Record<string, string | undefined> = {};
        Object.entries(teamsMap).forEach(([id, team]) => {
          teamNameById[id] = team.name;
        });

        // Résolution de saison par journée — sur TOUTES les journées connues
        // (matchdaysData, non filtré), pas seulement ligue1Matchdays : un
        // match bonus a son propre matchday_id, potentiellement dans une
        // autre compétition (PL/PD/SA/BL1) mais toujours rattaché à une
        // saison réelle (season_id). Utilisé à la fois par computeLeagueStats
        // (favori historique, Lot 4) et par la carrière plus bas.
        const seasonByMatchdayIdForCareer = new Map<string, string>();
        (matchdaysData ?? []).forEach((md: any) => {
          if (!md?.id) return;
          seasonByMatchdayIdForCareer.set(String(md.id), String(md.season_id || md.season || "unknown"));
        });
        const seasonByMatchdayIdObj: Record<string, string> = Object.fromEntries(seasonByMatchdayIdForCareer);

        // Équipe favorite historisée par saison (Lot 4) — clé `${user_id}:${season_id}`.
        const favoriteTeamBySeason: Record<string, string> = {};
        (favoriteHistoryData ?? []).forEach((row: any) => {
          if (!row?.user_id || !row?.season_id || !row?.favorite_team_id) return;
          favoriteTeamBySeason[`${row.user_id}:${row.season_id}`] = row.favorite_team_id;
        });

        // Vue "scorable" dérivée de liveMatches/bonusMatches (voir
        // src/lib/liveMatches.ts) : réservée à computeLeagueStats. Un match
        // encore EN COURS (pas encore FINISHED côté API) mais dont le score
        // est déjà connu doit déjà rapporter des points — jamais utilisée
        // pour "dernière journée terminée"/l'évolution (matchesByDayNumber
        // plus bas continue d'utiliser liveMatches/bonusMatches, l'état RÉEL).
        const scorableLigue1Matches = markLiveMatchesScorable(liveMatches);
        const scorableBonusMatches = markLiveMatchesScorable(bonusMatches);

        const { pointsByUser: points, predictionsCountByUser: predictionsCount, exactScoresByUser: exactScores, regularitySuccessByUser: regularitySuccess, participationByUser: participationCounts, participationTotalByUser: participationTotals, pointsByMatchday, pointsByPredictionKey } =
          computeLeagueStats(scorableLigue1Matches, scorableBonusMatches, bonusOptions, predictionsData ?? [], profiles, teamNameById, {
            seasonByMatchdayId: seasonByMatchdayIdObj,
            favoriteTeamBySeason,
          });

        let topMatchday: { number: number; points: number } | null = null;
        Object.entries(pointsByMatchday).forEach(([dayId, total]) => {
          if (!topMatchday || total > topMatchday.points) {
            const md = ligue1Matchdays.find((m: any) => String(m.id) === dayId);
            if (md) topMatchday = { number: Number(md.number ?? 0), points: total };
          }
        });

        // CARRIÈRE — même source unique que index.tsx/profil.tsx
        // (aggregateCareerStatsByUser, src/lib/careerLevel.ts), plus de
        // boucle séparée lisant `predictions.points` (colonne jamais mise à
        // jour, toujours 0 — c'était un vrai bug : niveau/titre de carrière
        // affichés ici tombaient systématiquement à 0 point).
        //
        // LIMITE ACTUELLE ASSUMÉE : `matches`/`bonusMatches`/`predictionsData`
        // ci-dessus sont déjà filtrés sur la SAISON COURANTE (comme le reste
        // du classement). Tant qu'une seule saison existe, carrière = saison
        // courante, donc ce calcul est exact dès aujourd'hui. Le jour où une
        // saison 2 démarre, cette entrée devra être élargie à un jeu de
        // données multi-saisons.
        // liveMatches/bonusMatches (état RÉEL fusionné avec le live, voir
        // src/lib/liveMatches.ts) — jamais `matches` brut : un match encore
        // en cours doit déjà compter pour le score exact/carrière, comme
        // partout ailleurs dans l'app.
        const matchByIdForCareer = new Map<string, any>();
        [...liveMatches, ...bonusMatches].forEach((m: any) => matchByIdForCareer.set(String(m.id), m));

        const isExactPrediction = (p: any) => {
          if (p.home_prediction == null || p.away_prediction == null) return false;
          const m = matchByIdForCareer.get(String(p.match_id));
          if (!m || m.home_score == null || m.away_score == null) return false;
          return (
            Number(p.home_prediction) === Number(m.home_score) &&
            Number(p.away_prediction) === Number(m.away_score)
          );
        };

        const predictionsWithRealPoints = (predictionsData ?? []).map((p: any) => ({
          ...p,
          points: pointsByPredictionKey[`${p.user_id}:${p.match_id}`] ?? 0,
        }));

        const careerByUser = aggregateCareerStatsByUser(
          predictionsWithRealPoints,
          isExactPrediction,
          (matchId) => {
            const m = matchByIdForCareer.get(matchId);
            if (!m || !m.matchday_id) return null;
            return seasonByMatchdayIdForCareer.get(String(m.matchday_id)) ?? null;
          },
        );

        // ÉVOLUTION RÉELLE — comparaison avec le classement juste avant
        // la dernière journée terminée. On ne fabrique pas une tendance
        // selon la position actuelle : on recalcule le classement précédent
        // avec exactement les mêmes pronostics/règles de points.
        const l1NumberById = new Map<string, number>();
        ligue1Matchdays.forEach((md: any) => {
          if (ligue1MatchdayIds.has(String(md.id))) {
            l1NumberById.set(String(md.id), Number(md.number ?? 0));
          }
        });

        const matchdayNumberByMatchId = new Map<string, number>();
        liveMatches.forEach((m) => {
          if (m.matchday_id) {
            matchdayNumberByMatchId.set(String(m.id), l1NumberById.get(String(m.matchday_id)) ?? 0);
          }
        });

        // Les matchs bonus utilisent leur propre matchday_id dans `matches`,
        // mais leur journée de compétition est portée par bonus_options.
        const bonusParentNumberByMatchId = new Map<string, number>();
        bonusOptions.forEach((option) => {
          const number = l1NumberById.get(String(option.matchday_id));
          if (number != null) {
            bonusParentNumberByMatchId.set(String(option.match_id), number);
          }
        });
        bonusMatches.forEach((m) => {
          const parentNumber = bonusParentNumberByMatchId.get(String(m.id));
          if (parentNumber != null) {
            matchdayNumberByMatchId.set(String(m.id), parentNumber);
          }
        });

        // Une journée est considérée comme TERMINÉE uniquement lorsque TOUS
        // ses matchs Ligue 1 sont terminés. Avant, un seul match terminé de J2
        // suffisait à faire entrer J2 dans "finishedNumbers", ce qui rendait
        // l'évolution instable pendant la journée.
        const matchesByDayNumber = new Map<number, MatchForRanking[]>();
        liveMatches.forEach((m) => {
          const dayNumber = m.matchday_id
            ? l1NumberById.get(String(m.matchday_id))
            : undefined;
          if (dayNumber == null || dayNumber <= 0) return;
          const dayMatches = matchesByDayNumber.get(dayNumber) ?? [];
          dayMatches.push(m);
          matchesByDayNumber.set(dayNumber, dayMatches);
        });

        const finishedNumbers = [...matchesByDayNumber.entries()]
          .filter(([, dayMatches]) =>
            dayMatches.length > 0 &&
            dayMatches.every(
              (m) => m.finished && m.home_score != null && m.away_score != null,
            ),
          )
          .map(([dayNumber]) => dayNumber)
          .sort((a, b) => a - b);

        // RÉFÉRENCE DE L'ÉVOLUTION — FENÊTRE GLISSANTE DE MATCHS.
        //
        // La colonne « Évolution » montre les places gagnées ou perdues sur les
        // EVOLUTION_WINDOW_MATCHES derniers matchs TERMINÉS. La référence
        // avance donc d'un cran à chaque coup de sifflet final : la pastille
        // bouge à chaque fin de match, y compris entre deux journées.
        //
        // BUG CORRIGÉ : la référence était « le classement après la dernière
        // journée entièrement terminée ». Entre deux journées, cette référence
        // EST le classement affiché : l'écart de rang était nul pour tout le
        // monde et la colonne affichait « — » du 1er au dernier — c'est ce
        // qu'on voyait sur les premières places. Seuls les joueurs à égalité de
        // points semblaient bouger, et uniquement à cause d'un départage
        // incohérent (voir plus bas).
        //
        // Ordre des résultats : le coup d'envoi (`kickoff`) est le seul repère
        // chronologique dont on dispose — la base ne stocke aucune heure de fin.
        // Les matchs joués simultanément sont départagés par leur id, pour que
        // la fenêtre reste stable d'un rafraîchissement à l'autre.
        //
        // On part de l'état RÉEL des matchs (liveMatches/bonusMatches), jamais
        // de la vue « scorable » : un match en cours n'entre ni dans la fenêtre
        // ni dans la référence. Son score live ne joue donc que sur le
        // classement affiché — la pastille réagit en direct sans que la
        // référence, elle, ne bouge avant le coup de sifflet final.
        const finishedInOrder = [...liveMatches, ...bonusMatches]
          .filter((m) => m.finished === true && m.home_score != null && m.away_score != null)
          .sort((a, b) => {
            const kickoffA = a.kickoff ? new Date(a.kickoff).getTime() : 0;
            const kickoffB = b.kickoff ? new Date(b.kickoff).getTime() : 0;
            if (kickoffA !== kickoffB) return kickoffA - kickoffB;
            return String(a.id).localeCompare(String(b.id));
          });

        const windowSize = Math.min(EVOLUTION_WINDOW_MATCHES, finishedInOrder.length);
        const baselineMatchIds = new Set(
          finishedInOrder
            .slice(0, finishedInOrder.length - windowSize)
            .map((m) => String(m.id)),
        );

        // RÉGULARITÉ :
        // - regularitySuccess = nombre de pronostics ayant rapporté au moins 1 point
        // - predictionsCount = nombre de pronostics effectivement scorés
        // La régularité affichée est donc un vrai pourcentage de réussite et
        // évolue à chaque nouveau résultat, au lieu d'afficher uniquement Jx/Jy.
        const playedMatchdaysSets: Record<string, Set<number>> = {};
        for (const p of predictionsData ?? []) {
          const userId = String(p.user_id ?? "");
          const dayNumber = matchdayNumberByMatchId.get(String(p.match_id));
          if (!userId || dayNumber == null || dayNumber <= 0) continue;
          if (!playedMatchdaysSets[userId]) playedMatchdaysSets[userId] = new Set<number>();
          playedMatchdaysSets[userId].add(dayNumber);
        }
        const playedMatchdaysByUser: Record<string, number> = {};
        Object.entries(playedMatchdaysSets).forEach(([userId, days]) => {
          playedMatchdaysByUser[userId] = days.size;
        });

        // Classement de référence : EXACTEMENT le même moteur que le classement
        // affiché (computeLeagueStats + rankPlayers), appliqué aux seuls
        // résultats antérieurs à la fenêtre.
        //
        // BUG CORRIGÉ : la référence était ré-agrégée à la main ici et
        // n'alimentait ni `participation` ni `participationTotal`. rankPlayers
        // retombait donc, pour elle seule, sur l'ancien départage au taux de
        // RÉUSSITE, alors que le classement affiché départage à la
        // PARTICIPATION. Deux joueurs à égalité de points pouvaient ainsi
        // changer de place d'un classement à l'autre sans avoir rien joué :
        // c'est ce qui fabriquait les « +4 » et « -1 » fantômes du bas de
        // tableau pendant que le haut restait figé sur « — ».
        //
        // `bonusOptions` est passé entier : computeLeagueStats ne compte un
        // bonus que si le match correspondant fait partie de la liste reçue,
        // donc filtrer les matchs suffit.
        const baselineStats = computeLeagueStats(
          liveMatches.filter((m) => baselineMatchIds.has(String(m.id))),
          bonusMatches.filter((m) => baselineMatchIds.has(String(m.id))),
          bonusOptions,
          (predictionsData ?? []).filter((p: any) => baselineMatchIds.has(String(p.match_id))),
          profiles,
          teamNameById,
          {
            seasonByMatchdayId: seasonByMatchdayIdObj,
            favoriteTeamBySeason,
          },
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
            careerLevel: 1,
            careerTitle: "Débutant",
          })) as any,
        );

        // Aucun résultat antérieur à la fenêtre (tout début de saison) : la
        // référence mettrait tout le monde à 0 point, donc à égalité, et le
        // classement se réduirait à l'ordre alphabétique — des évolutions
        // inventées de toutes pièces. On préfère « — » pour tout le monde
        // (map laissée vide, voir `hasPreviousRanking` côté rendu).
        const previousRanks: Record<string, number> = {};
        if (baselineMatchIds.size > 0) {
          baselineRanking.forEach((player: any) => {
            previousRanks[player.id] = player.rank;
          });
        }

        if (!isStale()) {
          setPlayers(profiles);
          setPointsByUser(points);
          setPredictionsCountByUser(predictionsCount);
          setExactScoresByUser(exactScores);
          setRegularitySuccessByUser(regularitySuccess);
          setParticipationCountsByUser(participationCounts);
          setParticipationTotalByUser(participationTotals);
          setPlayedMatchdaysByUser(playedMatchdaysByUser);
          setFinishedMatchdayCount(finishedNumbers.length);
          setBestMatchday(topMatchday);
          setCareerStatsByUser(Object.fromEntries(careerByUser));
          setPreviousRankByUser(previousRanks);
          setEvolutionWindowSize(baselineMatchIds.size > 0 ? windowSize : 0);

          // SOURCE DE VÉRITÉ POUR LE PROFIL :
          // le Profil lit ce snapshot produit par la page Classement,
          // au lieu de reconstruire une seconde fois le classement.
          try {
            // On publie uniquement les valeurs déjà calculées par le Classement.
            // Aucun second appel à rankPlayers() : le moteur officiel reste inchangé.
            const canonicalRanked = profiles.map((player: any) => ({
              id: player.id,
              rank: 0,
              points: Number(points[player.id] ?? 0),
              exactScores: Number(exactScores[player.id] ?? 0),
              predictionsCount: Number(predictionsCount[player.id] ?? 0),
              regularitySuccess: Number(regularitySuccess[player.id] ?? 0),
              playedMatchdays: Number(playedMatchdaysByUser[player.id] ?? 0),
              career: careerByUser.get(player.id) ?? {
                points: 0,
                exactScores: 0,
              },
            }));

            window.localStorage.setItem(
              "prono_ligue1_classement_snapshot",
              JSON.stringify({
                season: seasonName,
                updatedAt: Date.now(),
                players: canonicalRanked,
              }),
            );

            window.dispatchEvent(
              new CustomEvent("classement-snapshot-updated"),
            );
          } catch (snapshotError) {
            console.warn(
              "Snapshot Classement -> Profil indisponible :",
              snapshotError,
            );
          }
        }
      } catch (error) {
        console.error("Erreur chargement/calcul du classement :", error);
        if (!isStale()) {
          setPlayers([]);
          setPointsByUser({});
          setPredictionsCountByUser({});
          setExactScoresByUser({});
          setRegularitySuccessByUser({});
          setPlayedMatchdaysByUser({});
          setFinishedMatchdayCount(0);
          setBestMatchday(null);
          setCareerStatsByUser({});
          setPreviousRankByUser({});
        }
      }
    }

    load();

    const refreshRanking = () => {
      load();
    };

    // Le classement est vivant : pendant un match, le score de l'API peut
    // changer sans qu'aucun événement Supabase ne soit déclenché. On recharge
    // donc les données toutes les 30 secondes.
    const liveRefreshTimer = window.setInterval(refreshRanking, 15_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshRanking();
    };

    window.addEventListener("pronos-updated", refreshRanking);
    window.addEventListener("pronos-saved", refreshRanking);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      // Invalide immédiatement toute requête encore en vol.
      ++loadSequenceRef.current;
      window.clearInterval(liveRefreshTimer);
      window.removeEventListener("pronos-updated", refreshRanking);
      window.removeEventListener("pronos-saved", refreshRanking);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
  const careerTitles = [
    "Débutant","Apprenti","Novice","Amateur","Confirmé","Régulier","Compétiteur","Averti","Spécialiste","Expert",
    "Stratège","Tacticien","Maître","Élite","Grand Maître","Virtuose","Maître Prono","Champion","Champion confirmé","Champion d'élite",
    "Légendaire","Icône","Icône majeure","Référence","Grand Stratège","Maître absolu","Légende","Légende ultime","Immortel","Icône de la Ligue",
  ] as const;


  const loading = players === null;

  // Statistiques dérivées mémoïsées avec DÉPARTAGE STRICT + ASSIDUITÉ
  const { totalPlayers } = useMemo(() => {
    const sortedList = (players ?? []).map((p) => ({
      ...p,
      points: pointsByUser[p.id] ?? 0,
      exactScores: exactScoresByUser[p.id] ?? 0,
      predictionsCount: predictionsCountByUser[p.id] ?? 0,
      regularitySuccess: regularitySuccessByUser[p.id] ?? 0,
      participation: participationCountsByUser[p.id] ?? 0,
      participationTotal: participationTotalByUser[p.id] ?? 0,
      playedMatchdays: playedMatchdaysByUser[p.id] ?? 0,
      ...(() => {
        const career = careerStatsByUser[p.id] ?? { points: 0, exactScores: 0 };
        const result = calculateCareerScore(career);
        return {
          careerLevel: result.level,
          careerTitle: careerTitles[Math.max(0, Math.min(result.level - 1, careerTitles.length - 1))],
        };
      })(),
    }));

    const list: RankedPlayer[] = rankPlayers(sortedList);
    return { totalPlayers: list.length };
  }, [
    players,
    pointsByUser,
    predictionsCountByUser,
    exactScoresByUser,
    regularitySuccessByUser,
    careerStatsByUser,
    playedMatchdaysByUser,
  ]);

  // Gains de fin de saison : 10 € par joueur.
  // Base 50/30/20, avec arrondi à la dizaine supérieure.
  // Le 3e reçoit le solde afin que le total reste exactement égal à la cagnotte.
  // Règle de répartition extraite dans src/lib/prizePool.ts : l'Accueil
  // affiche les mêmes montants sans recopier le calcul.
  const prizePool = totalPlayers * 10;
  const prizeByRank = computePrizeByRank(prizePool);

  // Y a-t-il un classement de référence exploitable ? (calculé une seule fois
  // ici, au lieu d'être recalculé pour chaque ligne dans les deux listes.)
  const hasPreviousRanking = Object.keys(previousRankByUser).length > 0;

  return (
    <AppShell>
      <main className="relative mx-auto w-full max-w-[1400px] overflow-hidden px-3 pb-28 pt-3 sm:px-5 lg:px-8">
        {/* Fond volontairement épuré : aucune bannière de podium. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[900px] overflow-hidden">
          <div className="absolute left-1/2 top-20 h-[620px] w-[1000px] -translate-x-1/2 rounded-full bg-sky-500/[0.035] blur-[130px]" />
          <div className="absolute left-[5%] top-[420px] h-[360px] w-[360px] rounded-full bg-cyan-400/[0.02] blur-[120px]" />
          <div className="absolute right-[5%] top-[430px] h-[360px] w-[360px] rounded-full bg-orange-400/[0.018] blur-[120px]" />
        </div>

        <header className="relative z-10 mx-auto max-w-5xl pt-3 text-center sm:pt-6">
          <div className="mb-3 flex items-center justify-center gap-3 text-[9px] font-bold uppercase tracking-[0.32em] text-slate-500">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-slate-600" />
            <span>Prono Ligue 1 LM</span>
            <span className="h-px w-8 bg-gradient-to-l from-transparent to-slate-600" />
          </div>
          <h1 className="font-display text-[clamp(2.2rem,6vw,4.2rem)] font-black uppercase leading-[0.9] tracking-[-0.045em] text-white drop-shadow-[0_8px_30px_rgba(0,0,0,.45)]">
            Classement
          </h1>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px] font-bold uppercase tracking-[0.16em] sm:text-xs">
            <span className="text-emerald-300">{currentMatchday.label}</span>
            <span className="text-slate-700">•</span>
            <span className="text-slate-300">Saison {season}</span>
            <span className="text-slate-700">•</span>
            <span className="text-slate-500">Classement général</span>
          </div>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-slate-500 sm:text-sm">
            Les meilleurs pronostiqueurs de la compétition, classés aux points.
          </p>
        </header>

        {loading && (
          <div className="flex min-h-[420px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-white/10 border-t-emerald-300" />
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-600">Chargement du classement</p>
            </div>
          </div>
        )}

        {!loading && totalPlayers === 0 && (
          <div className="mx-auto mt-10 max-w-xl rounded-3xl border border-white/[0.07] bg-[#07101d]/70 p-12 text-center backdrop-blur-xl">
            <Trophy className="mx-auto mb-4 h-9 w-9 text-slate-600" />
            <p className="font-display text-lg font-bold text-slate-300">Aucun joueur inscrit</p>
            <p className="mt-1 text-xs text-slate-600">Le classement apparaîtra dès les premières inscriptions.</p>
          </div>
        )}

        {!loading && totalPlayers > 0 && (
          <section className="relative z-10 mx-auto mt-6 max-w-[1180px] sm:mt-8">
            {/* Gains : placés au-dessus du classement pour libérer de la largeur dans les cartes joueurs. */}
            <div className="mb-5 overflow-hidden rounded-2xl border border-amber-300/20 bg-gradient-to-r from-[#101c2b]/95 via-[#17283a]/90 to-[#0b1725]/95 shadow-[0_0_34px_rgba(245,158,11,.08)]">
              <div className="border-b border-white/[0.06] px-4 py-2.5 text-center">
                <span className="font-mono text-[9px] font-black uppercase tracking-[0.28em] text-amber-300">Gains de la compétition</span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-white/[0.08]">
                {[1, 2, 3].map((rank) => {
                  const medalTone =
                    rank === 1
                      ? "text-amber-200 border-amber-300/35 bg-amber-300/[0.08]"
                      : rank === 2
                        ? "text-slate-100 border-white/20 bg-white/[0.06]"
                        : "text-orange-200 border-orange-300/35 bg-orange-300/[0.08]";
                  return (
                    <div key={rank} className="flex items-center justify-center gap-2 px-2 py-3 sm:gap-3 sm:py-3.5">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-display text-sm font-black ${medalTone}`}>
                        {rank}
                      </div>
                      <div className="min-w-0 text-left">
                        <div className="font-display text-lg font-black leading-none sm:text-xl">{prizeByRank[rank]} €</div>
                        <div className="mt-1 font-mono text-[6px] font-bold uppercase tracking-[0.16em] text-slate-500 sm:text-[7px]">
                          {rank === 1 ? "1er" : rank === 2 ? "2e" : "3e"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mb-3 flex items-center gap-3 px-1">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
              <div className="flex min-w-0 items-center gap-2">
                <span className="whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                CLASSEMENT ACTUEL · {totalPlayers} JOUEURS
              </span>
                <span className="hidden h-3 w-px bg-white/10 sm:block" />
              </div>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
            </div>

            {/* Desktop : 1er → dernier, une seule liste continue. */}
            <div className="hidden sm:block">
              <div className="grid grid-cols-[64px_minmax(0,1fr)_104px_82px_150px_110px_92px] items-center gap-3 px-5 pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                <span>#</span>
                <span>Joueur</span>
                <span className="text-center">Points</span>
                <span className="text-center">Écart pts</span>
                <span className="text-center">Score exact</span>
                <span>Régularité</span>
                <span
                  className="text-center"
                  title={
                    hasPreviousRanking && evolutionWindowSize > 0
                      ? `Places gagnées ou perdues sur ${
                          evolutionWindowSize > 1
                            ? `les ${evolutionWindowSize} derniers matchs terminés`
                            : "le dernier match terminé"
                        }`
                      : "Pas encore assez de matchs joués pour mesurer une évolution"
                  }
                >
                  Évolution
                </span>
              </div>

              <div className="space-y-2.5">
                {(() => {
                  const ranked = (players ?? [])
                    .map((p) => {
                      const career = careerStatsByUser[p.id] ?? { points: 0, exactScores: 0 };
                      const result = calculateCareerScore(career);
                      return {
                        ...p,
                        points: pointsByUser[p.id] ?? 0,
                        exactScores: exactScoresByUser[p.id] ?? 0,
                        predictionsCount: predictionsCountByUser[p.id] ?? 0,
                        regularitySuccess: regularitySuccessByUser[p.id] ?? 0,
                        predictionsMade: participationCountsByUser[p.id] ?? 0,
                        matchesPlayable: participationTotalByUser[p.id] ?? 0,
                        participation: participationCountsByUser[p.id] ?? 0,
                        participationTotal: participationTotalByUser[p.id] ?? 0,
                        playedMatchdays: playedMatchdaysByUser[p.id] ?? 0,
                        careerLevel: result.level,
                        careerTitle: careerTitles[Math.max(0, Math.min(result.level - 1, careerTitles.length - 1))],
                      };
                    });
                  const list = rankPlayers(ranked as any) as RankedPlayer[];
                  const totalDays = finishedMatchdayCount;
                  return list.map((p) => {
                    const team = p.favorite_team_id ? teamsById[p.favorite_team_id] : undefined;
                    const isMe = p.id === user?.id;
                    const { trend, label: trendLabel } = rankMovement(
                      previousRankByUser[p.id],
                      p.rank,
                      hasPreviousRanking,
                    );

                    const leaderPoints = list[0]?.points ?? 0;
                    const pointsGap = Math.max(0, leaderPoints - p.points);

                    const topTone =
                      p.rank === 1
                        ? "border-amber-200/95 from-amber-400/[0.44] via-[#173451]/78 to-[#081523]/88 shadow-[0_0_58px_rgba(245,158,11,.38),inset_0_0_38px_rgba(245,158,11,.16)]"
                        : p.rank === 2
                          ? "border-white/95 from-white/[0.38] via-[#30445b]/78 to-[#0a1624]/88 shadow-[0_0_54px_rgba(226,232,240,.34),inset_0_0_34px_rgba(226,232,240,.13)]"
                          : p.rank === 3
                            ? "border-orange-200/95 from-orange-400/[0.42] via-[#3a2b2b]/78 to-[#0c1723]/88 shadow-[0_0_56px_rgba(249,115,22,.36),inset_0_0_36px_rgba(249,115,22,.14)]"
                            : p.rank === totalPlayers - 2
                              ? "border-amber-300/90 from-amber-400/[0.34] via-[#5a3410]/88 to-[#1c1208]/94 shadow-[0_0_52px_rgba(245,158,11,.30),inset_0_0_32px_rgba(245,158,11,.12)]"
                              : p.rank === totalPlayers - 1
                                ? "border-orange-300/95 from-orange-500/[0.38] via-[#5a210b]/88 to-[#1d0c06]/94 shadow-[0_0_56px_rgba(249,115,22,.34),inset_0_0_34px_rgba(249,115,22,.14)]"
                                : p.rank === totalPlayers
                                  ? "border-rose-300/95 from-rose-500/[0.42] via-[#5b0b18]/88 to-[#24060b]/94 shadow-[0_0_62px_rgba(244,63,94,.38),inset_0_0_36px_rgba(244,63,94,.16)]"
                                  : "border-white/[0.09] from-[#102238]/92 via-[#0c1b2c]/94 to-[#081421]/96";

                    const rankTone =
                      p.rank === 1 ? "text-amber-100" :
                      p.rank === 2 ? "text-slate-100" :
                      p.rank === 3 ? "text-orange-100" :
                      p.rank === totalPlayers - 2 ? "text-amber-100" :
                      p.rank === totalPlayers - 1 ? "text-orange-100" :
                      p.rank === totalPlayers ? "text-rose-100" :
                      "text-slate-100";

                    const pointTone =
                      p.rank === 1 ? "text-amber-300" :
                      p.rank === 2 ? "text-slate-100" :
                      p.rank === 3 ? "text-orange-300" :
                      p.rank === totalPlayers - 2 ? "text-amber-100 drop-shadow-[0_0_12px_rgba(245,158,11,.62)]" :
                      p.rank === totalPlayers - 1 ? "text-orange-100 drop-shadow-[0_0_12px_rgba(249,115,22,.68)]" :
                      p.rank === totalPlayers ? "text-rose-100 drop-shadow-[0_0_14px_rgba(244,63,94,.72)]" :
                      "text-white";

                    const gapTone =
                      p.rank === 1 ? "text-amber-200/90" :
                      p.rank === 2 ? "text-slate-300" :
                      p.rank === 3 ? "text-orange-200/90" :
                      "text-slate-500";

                    const evolutionTone =
                      trend === "up" ? "border-emerald-300/35 bg-emerald-300/[0.09] text-emerald-200" :
                      trend === "down" ? "border-rose-300/35 bg-rose-300/[0.09] text-rose-200" :
                      "border-white/[0.08] bg-white/[0.025] text-slate-500";

                    return (
                      <article
                        key={p.id}
                        className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br shadow-[0_14px_34px_rgba(0,0,0,.22)] transition-all duration-300 hover:-translate-y-[1px] hover:border-white/[0.16] ${topTone} ${isMe ? "ring-1 ring-emerald-300/20" : ""}`}
                      >
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/[0.045] to-transparent" />
                        <div className="relative grid grid-cols-[64px_minmax(0,1fr)_104px_82px_150px_110px_92px] items-center gap-4 px-5 py-4">
                          <div className="relative flex h-14 w-14 items-center justify-center">
                            {p.rank <= 3 ? (
                              <div className={`h-14 w-14 transition-transform duration-300 group-hover:scale-110 ${
                                p.rank === 1 ? "drop-shadow-[0_0_24px_rgba(245,158,11,.82)]" :
                                p.rank === 2 ? "drop-shadow-[0_0_22px_rgba(226,232,240,.72)]" :
                                "drop-shadow-[0_0_23px_rgba(249,115,22,.76)]"
                              }`}>
                                <RankMedal rank={p.rank as 1 | 2 | 3} scope="desktop" />
                              </div>
                            ) : (
                              <div className={`relative flex h-12 w-12 items-center justify-center rounded-xl border bg-black/20 font-mono text-sm font-black shadow-[inset_0_1px_0_rgba(255,255,255,.1),0_4px_10px_rgba(0,0,0,.35)] ${p.rank > totalPlayers - 3 ? "border-white/20" : "border-white/[0.1]"} ${rankTone}`}>
                                {String(p.rank).padStart(2, "0")}
                              </div>
                            )}
                          </div>

                          <div className="flex min-w-0 items-center gap-3">
                            <div className="relative h-[58px] w-[58px] shrink-0">
                              <div className="h-full w-full overflow-hidden rounded-full border border-white/15 bg-[#0a1423] shadow-[0_6px_16px_rgba(0,0,0,.4)]">
                                {p.avatar_url ? (
                                  <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center font-display text-xs font-black text-white/70">
                                    {(p.pseudo ?? "?").slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              {team?.logo_url && (
                                <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-[#050b16] shadow-[0_2px_6px_rgba(0,0,0,.5)]">
                                  <img src={team.logo_url} alt="" className="h-3.5 w-3.5 object-contain" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-display text-base font-black text-white">{p.pseudo ?? "Joueur"}</span>
                                {isMe && <span className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-1.5 py-0.5 font-mono text-[7px] font-bold uppercase tracking-wider text-emerald-200">Vous</span>}
                              </div>
                              <span className="mt-1 inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[7px] uppercase tracking-wider text-slate-400">
                                {p.careerTitle} · Niv. {p.careerLevel}
                              </span>
                            </div>
                          </div>

                          <div className="text-center">
                            <div className={`font-display text-3xl font-black leading-none ${pointTone}`}>{p.points}</div>
                            <div className="mt-1 font-mono text-[7px] font-bold uppercase tracking-widest text-slate-500">pts</div>
                          </div>

                          <div className={`text-center font-display text-base font-black ${gapTone}`}>
                            {p.rank === 1 ? "—" : `-${pointsGap}`}
                            <div className="mt-1 font-mono text-[7px] font-bold uppercase tracking-widest text-slate-400">écart</div>
                          </div>
<div className="flex flex-col items-center text-center">
                            <div className="flex items-center gap-1 text-sky-200">
                              <Target className="h-3.5 w-3.5" />
                              <span className="font-display text-lg font-black">{p.exactScores}</span>
                            </div>
                            <div className="mt-1 font-mono text-[7px] uppercase tracking-widest text-slate-600">exacts</div>
                          </div>

                          <div>
                            {(() => {
                              // RÉGULARITÉ = PARTICIPATION : pronostics déposés
                              // sur les matchs Ligue 1 déjà joués depuis le
                              // début de la saison. Auparavant on affichait un
                              // taux de RÉUSSITE (pronostics ayant rapporté des
                              // points), ce qui n'est pas le sens du mot.
                              const regularityTotal = p.matchesPlayable ?? 0;
                              const regularitySuccess = p.predictionsMade ?? 0;
                              const regularityPct = regularityTotal > 0
                                ? Math.round((regularitySuccess / regularityTotal) * 100)
                                : 0;
                              return (
                                <>
                                  <div className="mb-1.5 flex items-baseline justify-between gap-2 font-mono text-[8px] uppercase tracking-wider text-slate-400">
                                    <span className="font-bold text-slate-300">
                                      {regularityPct}% <span className="text-slate-600">({regularitySuccess}/{regularityTotal})</span>
                                    </span>
                                    <span>régularité</span>
                                  </div>
                                  <div className="h-[4px] overflow-hidden rounded-full bg-white/[0.06]">
                                    <div
                                      className={`h-full rounded-full ${
                                        p.rank === 1 ? "bg-gradient-to-r from-amber-500 to-yellow-200" :
                                        p.rank === 2 ? "bg-gradient-to-r from-slate-400 to-white" :
                                        p.rank === 3 ? "bg-gradient-to-r from-orange-600 to-orange-300" :
                                        p.rank === totalPlayers - 2 ? "bg-gradient-to-r from-cyan-300 via-sky-200 to-white" :
                                        p.rank === totalPlayers - 1 ? "bg-gradient-to-r from-violet-300 via-fuchsia-200 to-white" :
                                        p.rank === totalPlayers ? "bg-gradient-to-r from-fuchsia-300 via-rose-200 to-white" :
                                        "bg-gradient-to-r from-slate-600 to-slate-400"
                                      }`}
                                      style={{ width: `${regularityPct}%` }}
                                    />
                                  </div>
                                </>
                              );
                            })()}
                          </div>

                          <div className="flex items-center justify-center">
                            <div className={`flex min-w-[72px] h-8 items-center justify-center gap-1.5 rounded-full border px-2 transition-transform duration-300 group-hover:scale-105 ${evolutionTone}`}>
                              {trend === "up" ? <ArrowUp className="h-3.5 w-3.5" /> : trend === "down" ? <ArrowDown className="h-3.5 w-3.5" /> : <Minus className="h-3 w-3" />}
                              <span className="font-mono text-[10px] font-black">{trendLabel}</span>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Mobile : lecture prioritaire du joueur, pensée pour smartphone. */}
            <div className="space-y-2.5 sm:hidden">
              {(() => {
                const ranked = (players ?? []).map((p) => {
                  const career = careerStatsByUser[p.id] ?? { points: 0, exactScores: 0 };
                  const result = calculateCareerScore(career);
                  return {
                    ...p,
                    points: pointsByUser[p.id] ?? 0,
                    exactScores: exactScoresByUser[p.id] ?? 0,
                    predictionsCount: predictionsCountByUser[p.id] ?? 0,
                    regularitySuccess: regularitySuccessByUser[p.id] ?? 0,
                    predictionsMade: participationCountsByUser[p.id] ?? 0,
                    matchesPlayable: participationTotalByUser[p.id] ?? 0,
                    participation: participationCountsByUser[p.id] ?? 0,
                    participationTotal: participationTotalByUser[p.id] ?? 0,
                    playedMatchdays: playedMatchdaysByUser[p.id] ?? 0,
                    careerLevel: result.level,
                    careerTitle: careerTitles[Math.max(0, Math.min(result.level - 1, careerTitles.length - 1))],
                  };
                });

                const list = rankPlayers(ranked as any) as RankedPlayer[];
                const totalDays = finishedMatchdayCount;

                return list.map((p) => {
                  const team = p.favorite_team_id ? teamsById[p.favorite_team_id] : undefined;
                  const isMe = p.id === user?.id;
                  const { trend, label: trendLabel } = rankMovement(
                    previousRankByUser[p.id],
                    p.rank,
                    hasPreviousRanking,
                  );

                  const tone =
                    p.rank === 1
                      ? "border-amber-300/85 from-amber-400/[0.24] via-[#12253d]/90 to-[#081522]/95 shadow-[0_0_34px_rgba(245,158,11,.18)]"
                      : p.rank === 2
                        ? "border-slate-100/80 from-white/[0.20] via-[#17283a]/90 to-[#091521]/95 shadow-[0_0_32px_rgba(226,232,240,.15)]"
                        : p.rank === 3
                          ? "border-orange-300/85 from-orange-400/[0.23] via-[#1e2634]/90 to-[#0a1621]/95 shadow-[0_0_32px_rgba(249,115,22,.17)]"
                          : p.rank === totalPlayers - 2
                            ? "border-amber-300/90 from-amber-400/[0.34] via-[#5a3410]/90 to-[#1c1208]/94 shadow-[0_0_42px_rgba(245,158,11,.30)]"
                            : p.rank === totalPlayers - 1
                              ? "border-orange-300/95 from-orange-500/[0.38] via-[#5a210b]/90 to-[#1d0c06]/94 shadow-[0_0_46px_rgba(249,115,22,.34)]"
                              : p.rank === totalPlayers
                                ? "border-rose-300/95 from-rose-500/[0.42] via-[#5b0b18]/90 to-[#24060b]/95 shadow-[0_0_50px_rgba(244,63,94,.38)]"
                                : "border-white/[0.09] from-[#102238]/92 to-[#081522]/96";

                  const rankTone =
                    p.rank === 1
                      ? "text-amber-100"
                      : p.rank === 2
                        ? "text-slate-100"
                        : p.rank === 3
                          ? "text-orange-100"
                          : p.rank === totalPlayers - 2
                            ? "text-amber-100"
                            : p.rank === totalPlayers - 1
                              ? "text-orange-100"
                              : p.rank === totalPlayers
                                ? "text-rose-100"
                                : "text-slate-100";

                  const pointTone =
                    p.rank === 1
                      ? "text-amber-300"
                      : p.rank === 2
                        ? "text-slate-100"
                        : p.rank === 3
                          ? "text-orange-300"
                          : p.rank === totalPlayers - 2
                            ? "text-amber-200"
                            : p.rank === totalPlayers - 1
                              ? "text-orange-200"
                              : p.rank === totalPlayers
                                ? "text-rose-200"
                                : "text-white";

                  const evolutionTone =
                    trend === "up"
                      ? "border-emerald-300/35 bg-emerald-300/[0.09] text-emerald-200"
                      : trend === "down"
                        ? "border-rose-300/35 bg-rose-300/[0.09] text-rose-200"
                        : "border-white/[0.08] bg-white/[0.025] text-slate-400";

                  return (
                    <article
                      key={p.id}
                      className={`overflow-hidden rounded-2xl border bg-gradient-to-br shadow-[0_12px_28px_rgba(0,0,0,.20)] ${tone} ${
                        isMe ? "ring-1 ring-emerald-300/20" : ""
                      }`}
                    >
                      {/* Ligne principale : position + avatar + NOM COMPLET + points */}
                      <div className="flex min-w-0 items-center gap-2.5 px-3 py-3">
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                          {p.rank <= 3 ? (
                            <div
                              className={`h-10 w-10 ${
                                p.rank === 1
                                  ? "drop-shadow-[0_0_13px_rgba(245,158,11,.52)]"
                                  : p.rank === 2
                                    ? "drop-shadow-[0_0_12px_rgba(226,232,240,.42)]"
                                    : "drop-shadow-[0_0_12px_rgba(249,115,22,.45)]"
                              }`}
                            >
                              <RankMedal rank={p.rank as 1 | 2 | 3} scope="mobile" />
                            </div>
                          ) : (
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-xl border bg-black/20 font-mono text-[10px] font-black ${
                                p.rank === totalPlayers - 2
                                  ? "border-cyan-300/35 shadow-[0_0_14px_rgba(34,211,238,.12)]"
                                  : p.rank === totalPlayers - 1
                                    ? "border-violet-300/35 shadow-[0_0_14px_rgba(167,139,250,.12)]"
                                    : p.rank === totalPlayers
                                      ? "border-rose-300/40 shadow-[0_0_14px_rgba(251,113,133,.14)]"
                                      : "border-white/10"
                              } ${rankTone}`}
                            >
                              {String(p.rank).padStart(2, "0")}
                            </div>
                          )}
                        </div>

                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/15 bg-[#0a1423] shadow-[0_4px_12px_rgba(0,0,0,.30)]">
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center font-display text-[10px] font-black text-white/70">
                              {(p.pseudo ?? "?").slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          {team?.logo_url && (
                            <div className="absolute bottom-0 right-0 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-[#07101d] bg-[#050b16]">
                              <img src={team.logo_url} alt="" className="h-3 w-3 object-contain" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 overflow-hidden pr-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="block min-w-0 break-words font-display text-[15px] font-black leading-[1.05] text-white">
                              {p.pseudo ?? "Joueur"}
                            </span>
                            {isMe && (
                              <span className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-1.5 py-0.5 font-mono text-[6px] font-bold uppercase tracking-wider text-emerald-200">
                                Vous
                              </span>
                            )}
                          </div>
                          <div className="mt-1 truncate font-mono text-[6px] font-bold uppercase tracking-[0.07em] text-slate-400">
                            {p.careerTitle} · Niv. {p.careerLevel}
                          </div>
                        </div>

                        <div className="w-[44px] shrink-0 text-right">
                          <div className={`font-display text-[23px] font-black leading-none ${pointTone}`}>
                            {p.points}
                          </div>
                          <div className="mt-0.5 font-mono text-[6px] font-bold uppercase tracking-widest text-slate-400">
                            points
                          </div>
                        </div>
                      </div>

                      {/* Infos secondaires : exacts / écart pts / régularité / évolution */}
                      <div className="grid grid-cols-4 items-center gap-1 border-t border-white/[0.06] bg-black/10 px-2.5 py-2.5">
                        <div className="min-w-0 text-center">
                          <div className="flex items-center justify-center gap-1 text-sky-200">
                            <Target className="h-3 w-3 shrink-0" />
                            <span className="font-display text-sm font-black">{p.exactScores}</span>
                          </div>
                          <div className="mt-0.5 font-mono text-[6px] uppercase tracking-widest text-slate-500">
                            exacts
                          </div>
                        </div>

                        <div className="min-w-0 text-center">
                          <div className={`font-display text-sm font-black ${
                            p.rank === 1
                              ? "text-amber-200/90"
                              : p.rank === 2
                                ? "text-slate-300"
                                : p.rank === 3
                                  ? "text-orange-200/90"
                                  : "text-slate-400"
                          }`}>
                            {p.rank === 1 ? "—" : `-${Math.max(0, (list[0]?.points ?? 0) - p.points)}`}
                          </div>
                          <div className="mt-0.5 font-mono text-[6px] font-bold uppercase tracking-widest text-slate-500">
                            écart pts
                          </div>
                        </div>

                        {(() => {
                          // Même définition que la vue bureau ci-dessus :
                          // participation, pas réussite.
                          const regularityTotal = p.matchesPlayable ?? 0;
                          const regularitySuccess = p.predictionsMade ?? 0;
                          const regularityPct = regularityTotal > 0
                            ? Math.round((regularitySuccess / regularityTotal) * 100)
                            : 0;
                          return (
                            <div className="min-w-0 px-1">
                              <div className="mb-1 flex items-center justify-center gap-1 font-mono text-[6px] uppercase tracking-wider text-slate-400">
                                <span className="font-bold text-slate-300">
                                  {regularityPct}%
                                </span>
                                <span>réussite</span>
                              </div>
                              <div className="h-[4px] overflow-hidden rounded-full bg-white/[0.10]">
                                <div
                                  className={`h-full rounded-full ${
                                    p.rank === 1
                                      ? "bg-gradient-to-r from-amber-400 to-yellow-200"
                                      : p.rank === 2
                                        ? "bg-gradient-to-r from-slate-300 to-white"
                                        : p.rank === 3
                                          ? "bg-gradient-to-r from-orange-300 to-amber-200"
                                          : p.rank === totalPlayers - 2
                                            ? "bg-gradient-to-r from-cyan-300 via-sky-200 to-white"
                                            : p.rank === totalPlayers - 1
                                              ? "bg-gradient-to-r from-violet-300 via-fuchsia-200 to-white"
                                              : p.rank === totalPlayers
                                                ? "bg-gradient-to-r from-fuchsia-300 via-rose-200 to-white"
                                                : "bg-slate-400"
                                  }`}
                                  style={{ width: `${regularityPct}%` }}
                                />
                              </div>
                              <div className="mt-0.5 text-center font-mono text-[5px] uppercase tracking-widest text-slate-500">
                                {regularitySuccess}/{regularityTotal}
                              </div>
                            </div>
                          );
                        })()}

                        <div className="flex min-w-0 justify-center">
                          <div
                            className={`flex h-7 min-w-8 items-center justify-center gap-0.5 rounded-full border px-1.5 ${evolutionTone}`}
                          >
                            {trend === "up" ? (
                              <ArrowUp className="h-2.5 w-2.5" />
                            ) : trend === "down" ? (
                              <ArrowDown className="h-2.5 w-2.5" />
                            ) : (
                              <Minus className="h-2.5 w-2.5" />
                            )}
                            <span className="font-mono text-[7px] font-black">{trendLabel}</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                });
              })()}
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}