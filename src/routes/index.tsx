import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/prono/AppShell";
import { useFavoriteTeam } from "@/hooks/useFavoriteTeam";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { resizeImageToDataUrl } from "@/lib/resizeImage";
import {
  Trophy,
  Medal,
  ArrowRight,
  Camera,
  Heart,
  Check,
  ChevronRight,
  Sparkles,
  Star,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Minus
} from "lucide-react";
import { CountdownBlocks } from "@/components/prono/Countdown";
import { useTeamTheme } from "@/hooks/useTeamTheme";
import { calculateCareerScore, aggregateCareerStatsByUser, CAREER_LEVEL_TITLES } from "@/lib/careerLevel";
import { rankMovement, rankPlayers } from "@/lib/leaderboardRanking";
import { computeEvolutionBaseline } from "@/lib/leaderboardEvolution";
import { isMatchLocked, matchLockDate } from "@/lib/predictionDeadline";
import { computePrizeByRank } from "@/lib/prizePool";
import { computeLeagueStats } from "@/lib/leaderboardStats";
import { fetchAllRows } from "@/lib/supabaseFetchAll";
import { fetchLiveApiMatches, reconcileMatchesWithLive, markLiveMatchesScorable } from "@/lib/liveMatches";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Accueil — Prono Ligue 1 LM" },
      { name: "description", content: "Tableau de bord principal de ta ligue de pronostics entre amis." },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  const { favoriteTeamId, saveFavoriteTeam } = useFavoriteTeam();
  const { user, profile, refreshProfile } = useAuth();

  const [teams, setTeams] = useState<any[]>([]);
  const [clubId, setClubId] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [isChangingTeam, setIsChangingTeam] = useState(false);
  const [pendingTeamId, setPendingTeamId] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);

  // Verrouillage de l'équipe de cœur : même règle que le Profil,
  // appliquée aussi à l'Accueil pour empêcher tout contournement.
  const [favoriteTeamDeadline, setFavoriteTeamDeadline] = useState<Date | null>(null);
  const [favoriteTeamAutoLock, setFavoriteTeamAutoLock] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  // Rangs de référence pour la pastille d'évolution du mini-classement —
  // MÊME calcul que la page Classement (src/lib/leaderboardEvolution.ts).
  const [previousRankByUser, setPreviousRankByUser] = useState<Record<string, number>>({});
  // Grille de la prochaine journée : ce qu'il reste à jouer, et jusqu'à quand.
  // `null` tant qu'on n'a pas de journée à venir identifiable.
  const [pendingPronos, setPendingPronos] = useState<{
    day: string;
    missing: number;
    total: number;
    bonusMissing: boolean;
    closesAt: number | null;
  } | null>(null);
  const [myStats, setMyStats] = useState({
    rank: 0,
    points: 0,
    exactScores: 0,
    successRate: 0,
    totalPronos: 0,
    bestDay: "-",
    bestDayPoints: 0,
    // Régularité = participation : rencontres pronostiquées sur celles que ce
    // joueur pouvait pronostiquer (voir leaderboardStats.ts).
    participation: 0,
    participationTotal: 0,
  });
  const [currentMatchday, setCurrentMatchday] = useState("J1");
  // Prochain coup d'envoi REEL, et journee en cours. Le compte a rebours
  // visait jusqu'ici une date figee dans Countdown.tsx (21 aout 2026) : une
  // fois passee, il affichait 00 00 00 00 indefiniment, sous un libelle
  // "Prochaine journee · J1 • 21 aout 2026" lui aussi ecrit en dur.
  const [nextKickoff, setNextKickoff] = useState<{ at: number; label: string; day: string } | null>(null);
  const [potAmount, setPotAmount] = useState(0);
  // Gains affiches a cote du classement : meme regle 50/30/20 que la page
  // Classement (src/lib/prizePool.ts), appliquee a la cagnotte reelle.
  const homePrizeByRank = useMemo(() => computePrizeByRank(potAmount), [potAmount]);
  const [careerLevel, setCareerLevel] = useState(1);
  const homeRequestSeq = useRef(0);


  // 1. Liste des équipes
  useEffect(() => {
    async function fetchTeams() {
      const { data } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url")
        .order("name");
      if (data) setTeams(data);
    }
    fetchTeams();
  }, []);

  // 2. Données d’accueil (classement, stats, cagnotte) – robuste
  useEffect(() => {
    let cancelled = false;

    async function fetchHomeData() {
      const requestId = ++homeRequestSeq.current;
      try {
        // On récupère chaque ressource indépendamment pour ne pas tout casser
        const [
          { data: profiles, error: profilesError },
          { data: predictions, error: predictionsError },
          { data: matches, error: matchesError },
          { data: settingsRow, error: settingsError },
          { data: matchdays, error: matchdaysError },
          { data: competitions, error: competitionsError },
          { data: bonusOptionsData, error: bonusOptionsError },
          { data: favoriteHistoryData, error: favoriteHistoryError },
        ] = await Promise.all([
          supabase
            .from("profiles")
            // `username`/`player_name`/`account_status` n'existent pas en
            // base (confirmé via `supabase gen types typescript` : profiles
            // n'a que id/pseudo/avatar_url/favorite_team/favorite_team_id/
            // favorite_team_override/is_admin/created_at/updated_at).
            .select("id,pseudo,avatar_url,favorite_team_id,favorite_team"),
          // `points` n'est plus utilisé pour le calcul (voir plus bas) :
          // cette colonne n'est jamais mise à jour par l'application
          // (column_default 0, aucun trigger, vérifié en base) — les
          // points sont recalculés depuis les résultats réels via
          // computeLeagueStats, la même fonction que le Classement.
          // Paginé : sans .range(), PostgREST tronque silencieusement à 1000
          // lignes (voir src/lib/supabaseFetchAll.ts).
          fetchAllRows(
            "predictions",
            "user_id,match_id,home_prediction,away_prediction,created_at",
            ["user_id", "match_id"],
          ),
          // Paginé pour la même raison (5 championnats = plus de 1000 matchs).
          // L'ordre de pagination doit être stable : `id`, pas `kickoff` (des
          // matchs partagent le même coup d'envoi, la pagination sauterait ou
          // dupliquerait des lignes). L'ancien .order("kickoff") n'était utilisé
          // nulle part : la seule sélection qui dépend d'un ordre, la journée
          // terminée la plus récente, retrie explicitement par numéro de journée.
          fetchAllRows(
            "matches",
            "id,matchday_id,matchday_code,matchday,match_day,status,kickoff,kickoff_time,home_score,away_score,home_team_id,away_team_id,home_team,away_team,is_bonus,finished,api_fixture_id",
            ["id"],
          ),
          // Cagnotte théorique = nombre de joueurs inscrits × droit d'entrée
          // configuré dans Admin → Réglages, JAMAIS basée sur qui a réellement
          // payé (voir Admin → Paiements pour ce suivi individuel, inchangé).
          // `app_settings` est déjà lisible par tout joueur connecté (même
          // table que src/routes/profil.tsx) — pas de nouvelle table/policy.
          supabase
            .from("app_settings")
            .select("entry_fee, favorite_team_deadline, favorite_team_auto_lock")
            .eq("id", 1)
            .maybeSingle(),
          // `number`, `deadline` et `deadline_mode` servent au bloc « pronos à
          // faire » : le numéro de journée fiable (plutôt que le texte libre
          // porté par les matchs) et la règle de fermeture, appliquée via
          // src/lib/predictionDeadline.ts — la même que la page Pronos.
          supabase
            .from("matchdays")
            .select("id,number,season_id,season,competition_id,deadline,deadline_mode"),
          supabase.from("competitions").select("id, code, external_code"),
          // Actives ET historiques — même raison que classement.tsx : un
          // pronostic bonus reste valable même si l'admin a changé la
          // sélection depuis.
          supabase.from("bonus_options").select("matchday_id, match_id"),
          // Équipe favorite historisée par saison (Lot 4) — voir
          // computeLeagueStats() dans leaderboardStats.ts.
          supabase.from("user_season_favorite_teams").select("user_id, season_id, favorite_team_id"),
        ]);

        // On logue les erreurs individuelles mais on continue
        if (profilesError) console.warn("Erreur chargement profils :", profilesError);
        if (predictionsError) console.warn("Erreur chargement pronostics :", predictionsError);
        if (matchesError) console.warn("Erreur chargement matchs :", matchesError);
        if (settingsError) console.warn("Cagnotte non calculable (réglages) :", settingsError);
        if (competitionsError) console.warn("Erreur chargement compétitions :", competitionsError);
        if (bonusOptionsError) console.warn("Erreur chargement bonus :", bonusOptionsError);
        if (favoriteHistoryError) console.warn("Historique équipe favorite non chargé :", favoriteHistoryError);

        if (cancelled || requestId !== homeRequestSeq.current) return;

        const profileById = new Map((profiles || []).map((p: any) => [p.id, p]));
        const teamById = new Map((teams || []).map((t: any) => [t.id, t]));

        // Même source live que le Classement (et toutes les autres pages) :
        // fusion + garde anti-régression + fenêtre "match commencé -> scorable"
        // centralisées dans src/lib/liveMatches.ts, jamais dupliquées ici.
        const liveApiMatches = await fetchLiveApiMatches();

        if (cancelled || requestId !== homeRequestSeq.current) return;

        const reconciledMatches = reconcileMatchesWithLive((matches || []) as any[], liveApiMatches);

        // Vue "scorable" dérivée : un match commencé avec un score live
        // devient provisoirement scorable pour computeLeagueStats, sans
        // jamais modifier Supabase (voir markLiveMatchesScorable).
        const liveScoringMatches = markLiveMatchesScorable(reconciledMatches);

        // --- Prochain coup d'envoi + matchs en cours ---
        const now = Date.now();
        const kickoffOf = (m: any) => {
          const value = m?.kickoff ?? m?.kickoff_time;
          const time = value ? new Date(value).getTime() : NaN;
          return Number.isFinite(time) ? time : null;
        };

        // ------------------------------------------------------------------
        // OUVERTURE DE LA PROCHAINE JOURNEE
        //
        // Les dates viennent de l'API (football-data.org, via
        // /api/ligue1/matchs) et non de Supabase : ce sont les horaires
        // officiels, tenus a jour en cas de report ou de reprogrammation, la
        // ou la base ne contient que ce qui a ete importe le jour de l'import.
        //
        // Le compte a rebours vise l'ouverture de la JOURNEE, pas le prochain
        // match : une journee se pronostique en bloc, donc des que son premier
        // match est lance, elle n'est plus a preparer et le compteur bascule
        // sur la suivante. Viser le prochain match ferait au contraire
        // redemarrer un decompte entre chaque rencontre d'une journee entamee.
        // ------------------------------------------------------------------
        const firstKickoffByDay = new Map<number, number>();

        (liveApiMatches || []).forEach((m: any) => {
          // Ligue 1 uniquement : les matchs bonus appartiennent aux quatre
          // autres championnats et portent leurs propres numeros de journee,
          // ce qui ferait viser une date etrangere au calendrier.
          if (String(m?.competitionCode ?? "") !== "FL1") return;

          const journee = Number(m?.journee ?? 0);
          if (!Number.isFinite(journee) || journee <= 0) return;

          const at = m?.kickoff ? new Date(String(m.kickoff)).getTime() : NaN;
          if (!Number.isFinite(at)) return;

          const known = firstKickoffByDay.get(journee);
          if (known === undefined || at < known) firstKickoffByDay.set(journee, at);
        });

        // Repli si l'API n'a rien renvoye (reseau, quota) : on repart du
        // calendrier Supabase plutot que de vider le bloc.
        // La reference reste LE PREMIER MATCH DE LIGUE 1 de la journee : le
        // filtre is_bonus ecarte ici les matchs des quatre autres
        // championnats, comme le filtre competitionCode === "FL1" le fait sur
        // le chemin API. Sans lui, un match bonus programme plus tot aurait
        // fixe l'ouverture de la journee sur ce chemin-la.
        if (firstKickoffByDay.size === 0) {
          (reconciledMatches || []).forEach((m: any) => {
            if (m?.is_bonus === true) return;
            const at = kickoffOf(m);
            const journee = Number(m?.matchday ?? m?.match_day ?? 0);
            if (at === null || !Number.isFinite(journee) || journee <= 0) return;
            const known = firstKickoffByDay.get(journee);
            if (known === undefined || at < known) firstKickoffByDay.set(journee, at);
          });
        }

        // Premiere journee dont le coup d'envoi n'est pas encore passe.
        const nextDay = [...firstKickoffByDay.entries()]
          .filter(([, at]) => at > now)
          .sort((a, b) => a[1] - b[1])[0];

        if (nextDay) {
          const [journee, at] = nextDay;
          const dateLabel = new Date(at).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
          });
          const timeLabel = new Date(at).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          });
          // `label` ne porte QUE la date : le libelle affiche deja la journee
          // juste avant, les deux se repeteraient.
          setNextKickoff({ at, label: `${dateLabel} à ${timeLabel}`, day: `J${journee}` });
        } else {
          setNextKickoff(null);
        }



        const matchById = new Map(
          reconciledMatches.map((m: any) => [String(m.id), m]),
        );

        // Pas de colonne `exact_score` en base : un pronostic est "exact"
        // quand home_prediction/away_prediction correspondent exactement au
        // score final du match (matches.home_score/away_score). Toujours
        // utilisé tel quel plus bas pour le widget "stats personnelles".
        const isExactPrediction = (p: any) => {
          if (p.home_prediction == null || p.away_prediction == null) return false;
          const m = matchById.get(String(p.match_id));
          if (!m || m.home_score == null || m.away_score == null) return false;
          return (
            Number(p.home_prediction) === Number(m.home_score) &&
            Number(p.away_prediction) === Number(m.away_score)
          );
        };

        // -------- Classement — même moteur que src/routes/classement.tsx --------
        // Identifie les vraies journées Ligue 1 (FL1) de la saison courante,
        // exactement comme classement.tsx, pour isoler les matchs Ligue 1
        // classiques des matchs bonus (qui peuvent appartenir à PL/PD/SA/BL1).
        const ligue1CompetitionIds = new Set(
          (competitions || [])
            .filter((c: any) => c.code === "FL1" || c.external_code === "FL1")
            .map((c: any) => String(c.id)),
        );
        const ligue1MatchdayIds = new Set(
          (matchdays || [])
            .filter((md: any) => !md.competition_id || ligue1CompetitionIds.has(String(md.competition_id)))
            .map((md: any) => String(md.id)),
        );

        const ligue1Matches = (liveScoringMatches || []).filter(
          (m: any) =>
            m.home_score != null &&
            m.away_score != null &&
            m.finished &&
            !m.is_bonus &&
            m.matchday_id &&
            ligue1MatchdayIds.has(String(m.matchday_id)),
        );

        const bonusOptions = (bonusOptionsData || []) as { matchday_id: string; match_id: string }[];
        const bonusMatchIds = new Set(bonusOptions.map((o) => String(o.match_id)));
        const bonusMatches = (liveScoringMatches || []).filter(
          (m: any) => m.home_score != null && m.away_score != null && m.finished && bonusMatchIds.has(String(m.id)),
        );

        const teamNameById: Record<string, string | undefined> = {};
        (teams || []).forEach((t: any) => {
          teamNameById[t.id] = t.name;
        });

        const allProfilesForStats = (profiles || []) as Array<{
          id: string;
          favorite_team_id?: string | null;
          favorite_team?: string | null;
        }>;

        // Saison par journée (matchday -> season_id) et équipe favorite
        // HISTORISÉE par saison (Lot 4) — construits AVANT computeLeagueStats
        // pour que le barème favori (2/1/0) d'un pronostic passé utilise le
        // club réellement favori à cette époque, jamais le favori courant.
        const seasonByMatchdayIdMap = new Map<string, string>();
        (matchdays || []).forEach((md: any) => {
          if (!md?.id) return;
          seasonByMatchdayIdMap.set(String(md.id), String(md.season_id || md.season || "unknown"));
        });
        const seasonByMatchdayId: Record<string, string> = Object.fromEntries(seasonByMatchdayIdMap);

        const favoriteTeamBySeason: Record<string, string> = {};
        (favoriteHistoryData ?? []).forEach((row: any) => {
          if (!row?.user_id || !row?.season_id || !row?.favorite_team_id) return;
          favoriteTeamBySeason[`${row.user_id}:${row.season_id}`] = row.favorite_team_id;
        });

        const {
          pointsByUser: rankingPointsByUser,
          predictionsCountByUser: rankingCountByUser,
          exactScoresByUser: rankingExactByUser,
          regularitySuccessByUser: rankingRegularityByUser,
          participationByUser: rankingParticipationByUser,
          participationTotalByUser: rankingParticipationTotalByUser,
          pointsByUserAndMatchday,
          pointsByPredictionKey,
        } = computeLeagueStats(
          ligue1Matches,
          bonusMatches,
          bonusOptions,
          predictions || [],
          allProfilesForStats,
          teamNameById,
          { seasonByMatchdayId, favoriteTeamBySeason },
        );

        // On complète avec les profils manquants (pour les joueurs sans pronos)
        const allUserIds = new Set(Object.keys(rankingPointsByUser));
        (profiles || []).forEach((p: any) => allUserIds.add(p.id));

        const normalizedRankings = Array.from(allUserIds).map((uid) => {
          const p = profileById.get(uid) || {};
          const team = teamById.get(p.favorite_team_id);
          const pseudo = p.pseudo || "Joueur";
          return {
            user_id: uid,
            total_points: rankingPointsByUser[uid] || 0,
            exact_scores: rankingExactByUser[uid] || 0,
            predictions_count: rankingCountByUser[uid] || 0,
            name: pseudo,
            avatar_url: p.avatar_url || "",
            favorite_team: team?.name || "",
            favorite_logo: team?.logo_url || "",
            // Champs canoniques pour rankPlayers (src/lib/leaderboardRanking.ts)
            // — même classement que la page Classement et le Profil.
            points: rankingPointsByUser[uid] || 0,
            exactScores: rankingExactByUser[uid] || 0,
            predictionsCount: rankingCountByUser[uid] || 0,
            regularitySuccess: rankingRegularityByUser[uid] || 0,
            // Départage sur la RÉGULARITÉ affichée (participation), comme le
            // Classement — sans ces champs, rankPlayers retomberait sur
            // l'ancien taux de réussite et l'ordre differerait d'une page a
            // l'autre pour deux joueurs a egalite de points.
            participation: rankingParticipationByUser[uid] || 0,
            participationTotal: rankingParticipationTotalByUser[uid] || 0,
            pseudo,
          };
        });

        // Tri + attribution du rang : source unique de vérité, réutilisée
        // telle quelle par la page Classement et le Profil.
        const rankedRankings = rankPlayers(normalizedRankings);
        // -------- Carriere multi-saisons --------
        // prediction -> match -> matchday -> season.
        // Toutes les saisons sont cumulees ; aucun reset annuel.
        // (seasonByMatchdayIdMap déjà construit plus haut, réutilisé ici.)

        // Points réels injectés depuis computeLeagueStats (voir plus haut) —
        // aggregateCareerStatsByUser lit un champ `points` par pronostic ;
        // `predictions.points` n'est jamais mis à jour par l'application
        // (voir le commentaire dans leaderboardStats.ts), donc on ne lui
        // passe jamais cette colonne brute, mais la valeur recalculée.
        const predictionsWithRealPoints = (predictions || []).map((p: any) => ({
          ...p,
          points: pointsByPredictionKey[`${p.user_id}:${p.match_id}`] ?? 0,
        }));

        const careerByUser = aggregateCareerStatsByUser(
          predictionsWithRealPoints,
          isExactPrediction,
          (matchId) => {
            const match = matchById.get(matchId);
            if (!match || !match.matchday_id) return null;
            return seasonByMatchdayIdMap.get(String(match.matchday_id)) ?? null;
          },
        );

        if (user?.id) {
          const mineCareer = careerByUser.get(user.id) || {
            points: 0,
            exactScores: 0,
          };

          const career = calculateCareerScore(mineCareer);
          setCareerLevel(career.level);
        }
        // -------- Évolution du mini-classement --------
        // Même fonction que la page Classement : deux calculs séparés
        // finiraient par diverger, et un joueur verrait « +2 » ici et « — »
        // là-bas. On lui passe l'état RÉEL des matchs (reconciledMatches),
        // jamais la vue « scorable » : un match en cours ne doit pas faire
        // bouger la référence avant le coup de sifflet final.
        const realLigue1Matches = (reconciledMatches || []).filter(
          (m: any) =>
            !m.is_bonus && m.matchday_id && ligue1MatchdayIds.has(String(m.matchday_id)),
        );
        const realBonusMatches = (reconciledMatches || []).filter((m: any) =>
          bonusMatchIds.has(String(m.id)),
        );

        // Population et pseudos identiques à ceux du classement affiché : le
        // départage final de rankPlayers est alphabétique, un pseudo manquant
        // suffirait à décaler la référence.
        const evolutionProfiles = normalizedRankings.map((row) => {
          const source: any = profileById.get(row.user_id) || {};
          return {
            id: row.user_id,
            pseudo: row.pseudo,
            favorite_team_id: source.favorite_team_id ?? null,
            favorite_team: source.favorite_team ?? null,
          };
        });

        const { previousRankByUser: evolutionPreviousRanks } = computeEvolutionBaseline({
          ligue1Matches: realLigue1Matches,
          bonusMatches: realBonusMatches,
          bonusOptions,
          predictions: predictions || [],
          profiles: evolutionProfiles,
          teamNameById,
          history: { seasonByMatchdayId, favoriteTeamBySeason },
        });
        setPreviousRankByUser(evolutionPreviousRanks);

        // -------- Grille de la prochaine journée --------
        // L'Accueil affichait un compte à rebours vers l'ouverture de la
        // journée sans jamais dire si la grille du joueur était remplie.
        // C'est pourtant la seule action qu'il a à faire d'ici là.
        //
        // La fermeture d'un match suit la règle de la page Pronos
        // (src/lib/predictionDeadline.ts) : jamais une seconde règle ici, qui
        // annoncerait un match « à faire » que la page Pronos refuse déjà.
        const matchdayById = new Map(
          (matchdays || []).map((md: any) => [String(md.id), md]),
        );
        const journeeOfMatch = (m: any) => {
          const day = m?.matchday_id ? matchdayById.get(String(m.matchday_id)) : null;
          const value = Number(day?.number ?? m?.matchday ?? m?.match_day ?? 0);
          return Number.isFinite(value) && value > 0 ? value : 0;
        };

        if (user?.id && nextDay) {
          const [nextJournee] = nextDay;
          const dayMatches = realLigue1Matches.filter(
            (m: any) => journeeOfMatch(m) === nextJournee,
          );
          // La journée est portée par une seule ligne `matchdays` : c'est elle
          // qui définit le mode de fermeture, y compris pour le match bonus
          // (même règle que la page Pronos, qui applique la journée Ligue 1
          // sélectionnée à ses candidats bonus).
          const dayMatchdayRow = dayMatches
            .map((m: any) => matchdayById.get(String(m.matchday_id)))
            .find(Boolean);

          const myPredictedMatchIds = new Set(
            (predictions || [])
              .filter((pred: any) => pred.user_id === user.id)
              .map((pred: any) => String(pred.match_id)),
          );

          const openMatches = dayMatches.filter(
            (m: any) => !isMatchLocked(m, dayMatchdayRow, now),
          );
          const missing = openMatches.filter(
            (m: any) => !myPredictedMatchIds.has(String(m.id)),
          ).length;

          // Bonus : une seule option est retenue par journée. Il reste « à
          // faire » tant que le joueur n'en a choisi aucune ET qu'au moins une
          // option est encore ouverte.
          const dayMatchdayIds = new Set(
            dayMatches.map((m: any) => String(m.matchday_id)),
          );
          const dayBonusMatchIds = bonusOptions
            .filter((option) => dayMatchdayIds.has(String(option.matchday_id)))
            .map((option) => String(option.match_id));
          const bonusChosen = dayBonusMatchIds.some((id) => myPredictedMatchIds.has(id));
          const bonusStillOpen = dayBonusMatchIds.some((id) => {
            const bonusMatch = matchById.get(id);
            return bonusMatch && !isMatchLocked(bonusMatch, dayMatchdayRow, now);
          });

          // Prochaine fermeture réelle : en mode « auto -1 min », les matchs
          // d'une journée se ferment un par un — ce qui intéresse le joueur est
          // le prochain instant où il ne pourra plus jouer.
          const nextClose = openMatches
            .map((m: any) => matchLockDate(m, dayMatchdayRow))
            .filter((date): date is Date => Boolean(date) && date!.getTime() > now)
            .sort((a, b) => a.getTime() - b.getTime())[0];

          // Rien d'ouvert = rien a annoncer. Sans ce garde, une journee dont
          // les matchs ne sont pas encore importes en base (dayMatches vide)
          // afficherait un rassurant "grille complete" alors qu'il n'y a
          // simplement rien a compter — et une journee dont la deadline
          // manuelle est passee avant le coup d'envoi afficherait la meme
          // chose alors que le joueur ne peut plus rien jouer.
          setPendingPronos(
            openMatches.length > 0
              ? {
                  day: `J${nextJournee}`,
                  missing,
                  total: openMatches.length,
                  bonusMissing: !bonusChosen && bonusStillOpen,
                  closesAt: nextClose ? nextClose.getTime() : null,
                }
              : null,
          );
        } else {
          setPendingPronos(null);
        }

setLeaderboard(rankedRankings);

        // -------- Journée la plus récente terminée --------
        const finished = (reconciledMatches || []).filter((m: any) =>
          String(m.status || "").toLowerCase() === "finished" ||
          String(m.status || "").toLowerCase() === "ft"
        );
        const dayNumber = (value: any) => {
          const match = String(value ?? "").match(/\d+/);
          return match ? Number(match[0]) : 0;
        };
        const latest = [...finished].sort((a: any, b: any) =>
          dayNumber(b.matchday_code || b.matchday || b.match_day) -
          dayNumber(a.matchday_code || a.matchday || a.match_day)
        )[0];
        if (latest) {
          const raw = latest.matchday_code || latest.matchday || latest.match_day;
          setCurrentMatchday(String(raw).toUpperCase().startsWith("J") ? String(raw).toUpperCase() : `J${raw}`);
        }

        // -------- Stats personnelles --------
        // Mêmes valeurs que le Classement (computeLeagueStats ci-dessus) —
        // plus de recalcul séparé ni de lecture de predictions.points.
        if (user?.id) {
          const meRanking = rankedRankings.find((r: any) => r.user_id === user.id);
          const points = rankingPointsByUser[user.id] || 0;
          const exacts = rankingExactByUser[user.id] || 0;
          const bons = rankingRegularityByUser[user.id] || 0;
          const totalCount = rankingCountByUser[user.id] || 0;

          // Libellé de journée ("J5") par matchday_id — pur affichage, un
          // seul match suffit pour retrouver le libellé de sa journée.
          const dayLabelByMatchdayId = new Map<string, string>();
          (reconciledMatches || []).forEach((m: any) => {
            if (!m.matchday_id || dayLabelByMatchdayId.has(String(m.matchday_id))) return;
            const rawDay = m.matchday_code || m.matchday || m.match_day;
            if (rawDay === null || rawDay === undefined || rawDay === "") return;
            const day = String(rawDay).toUpperCase().startsWith("J") ? String(rawDay).toUpperCase() : `J${rawDay}`;
            dayLabelByMatchdayId.set(String(m.matchday_id), day);
          });

          const myPointsByDay = pointsByUserAndMatchday[user.id] ?? {};
          let bestDay = "-";
          let bestDayPoints = 0;
          Object.entries(myPointsByDay).forEach(([matchdayId, value]) => {
            if (value > bestDayPoints) {
              bestDayPoints = value;
              bestDay = dayLabelByMatchdayId.get(matchdayId) ?? "-";
            }
          });

          const finalPoints = points;
          const finalExacts = exacts;
          const finalCount = totalCount;
          const rank = meRanking?.rank ?? 0;

          setMyStats({
            rank,
            points: finalPoints,
            exactScores: finalExacts,
            // Le denominateur est le nombre de pronostics REELLEMENT scores
            // (totalCount), pas le nombre total de lignes en base : celui-ci
            // inclut les pronostics deposes sur des matchs pas encore joues,
            // donc remplir la journee suivante faisait CHUTER le pourcentage
            // sans qu'aucun resultat n'ait change. C'est aussi le chiffre
            // affiche juste en dessous ("N pronos") : les deux parlent enfin
            // de la meme chose.
            successRate: totalCount ? Math.round((bons / totalCount) * 100) : 0,
            totalPronos: finalCount,
            bestDay,
            bestDayPoints,
            participation: rankingParticipationByUser[user.id] ?? 0,
            participationTotal: rankingParticipationTotalByUser[user.id] ?? 0,
          });
        }

        // -------- Verrouillage équipe de cœur --------
        // La date est stockée en UTC dans app_settings. On la convertit en
        // objet Date pour comparer l'instant réel, indépendamment du fuseau.
        if (!settingsError) {
          const rawDeadline = settingsRow?.favorite_team_deadline;
          const parsedDeadline = rawDeadline ? new Date(rawDeadline) : null;
          setFavoriteTeamDeadline(
            parsedDeadline && !Number.isNaN(parsedDeadline.getTime()) ? parsedDeadline : null,
          );
          setFavoriteTeamAutoLock(settingsRow?.favorite_team_auto_lock ?? true);
        }

        // -------- Cagnotte --------
        // Cagnotte théorique = nombre de joueurs inscrits × droit d'entrée
        // (Admin → Réglages) — jamais basée sur qui a réellement payé (le
        // statut de paiement individuel reste géré uniquement par
        // Admin → Paiements, inchangé). Se met à jour automatiquement dès
        // qu'un joueur s'inscrit ou que le droit d'entrée change.
        if (!settingsError && !profilesError) {
          const entryFee = Number(settingsRow?.entry_fee || 0);
          const registeredPlayers = (profiles || []).length;
          setPotAmount(registeredPlayers * entryFee);
        }
      } catch (error) {
        console.error("Erreur de chargement Supabase accueil :", error);
      }
    }

    fetchHomeData();

    const interval = window.setInterval(fetchHomeData, 15000);
    const onFocus = () => fetchHomeData();
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchHomeData();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, teams]);

  // Horloge légère pour que le verrouillage se déclenche sans rechargement
  // lorsque la date limite est atteinte alors que la page reste ouverte.
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Echeance de la grille, relative et vivante : `currentTime` bat a la
  // seconde, donc le libelle se met a jour sans rechargement.
  const pronosCloseLabel = useMemo(() => {
    if (!pendingPronos?.closesAt) return null;
    const remaining = pendingPronos.closesAt - currentTime.getTime();
    if (remaining <= 0) return null;
    const minutes = Math.floor(remaining / 60000);
    if (minutes < 60) return `ferme dans ${Math.max(minutes, 1)} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `ferme dans ${hours} h`;
    return `ferme dans ${Math.floor(hours / 24)} j`;
  }, [pendingPronos?.closesAt, currentTime]);

  // La phrase sous le mini-classement etait ecrite en dur ("Ligue ultra serree
  // en tete !") : elle s'affichait a l'identique que le leader ait 1 point ou
  // 40 d'avance. Elle dit maintenant l'ecart reel.
  const leadSentence = useMemo(() => {
    if (leaderboard.length < 2) return "En attente des premiers résultats.";
    const gap =
      Number(leaderboard[0]?.total_points ?? 0) - Number(leaderboard[1]?.total_points ?? 0);
    if (gap <= 0) return "1er et 2e à égalité parfaite !";
    if (gap <= 2) return `Ça se joue à ${gap} pt${gap > 1 ? "s" : ""} en tête.`;
    return `${gap} pts d'avance pour le leader.`;
  }, [leaderboard]);

  // Sans reference exploitable (debut de saison), la colonne affiche "—"
  // plutot que des mouvements inventes — meme regle que le Classement.
  const hasEvolution = Object.keys(previousRankByUser).length > 0;

  const isFavoriteTeamLocked = Boolean(
    favoriteTeamAutoLock &&
      favoriteTeamDeadline &&
      currentTime >= favoriteTeamDeadline,
  );

  // 3. Équipe favorite par défaut
  useEffect(() => {
    if (favoriteTeamId) {
      setClubId(favoriteTeamId);
    } else if (teams.length > 0 && !clubId) {
      const defaultTeam = teams.find(t => t.short_name === 'RCL') || teams[0];
      if (defaultTeam) setClubId(defaultTeam.id);
    }
  }, [favoriteTeamId, teams]);

  const activeClub = teams.find((c) => c.id === clubId);
  const {
    theme: clubTheme,
    backgroundUrl: clubWallpaperUrl,
    backgroundFailed: clubWallpaperFailedProbe,
    onBackgroundError: handleClubWallpaperError,
  } = useTeamTheme(activeClub?.name ?? null);

  const openTeamPicker = () => {
    if (isFavoriteTeamLocked) {
      alert("La période de choix de l'équipe de cœur est terminée.");
      return;
    }
    setPendingTeamId(clubId);
    setIsChangingTeam(true);
  };

  const handleConfirmTeamChange = async () => {
    if (!pendingTeamId) return;

    // Recontrôle au moment exact de l'enregistrement pour éviter qu'un
    // sélecteur déjà ouvert puisse être validé après l'heure limite.
    const lockedNow = Boolean(
      favoriteTeamAutoLock &&
        favoriteTeamDeadline &&
        new Date() >= favoriteTeamDeadline,
    );
    if (lockedNow) {
      setIsChangingTeam(false);
      alert("La période de choix de l'équipe de cœur est terminée.");
      return;
    }

    setSavingTeam(true);
    try {
      await saveFavoriteTeam(pendingTeamId);
      setClubId(pendingTeamId);
      setIsChangingTeam(false);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err) {
      console.error("Erreur équipe favorite :", err);
      alert("Impossible d'enregistrer l'équipe.");
    } finally {
      setSavingTeam(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    setAvatarUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, avatar_url: dataUrl, updated_at: new Date().toISOString() });

      if (error) throw error;
      await refreshProfile();
    } catch (err) {
      console.error("Erreur lors de l'envoi de la photo :", err);
      alert("Erreur lors de l'envoi de la photo de profil.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const currentCareerTitle =
    CAREER_LEVEL_TITLES[Math.max(0, Math.min(careerLevel - 1, CAREER_LEVEL_TITLES.length - 1))];

  return (

  <AppShell>
      {/* Animations discrètes, propres à cette page (n'affecte aucune autre
          route) : légère apparition en fondu + translation, désactivée si
          l'utilisateur préfère moins de mouvement. Même convention que la
          page Trophées (voir trophees.tsx). */}
      <style>{`
        @keyframes dash-fade-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .dash-fade-up { animation: dash-fade-up .55s cubic-bezier(.22,1,.36,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .dash-fade-up { animation: none; }
        }
      `}</style>

      {/* pb-28 (au lieu de pb-20) : plus de respiration au-dessus de la nav
          mobile fixe, qui a elle-même grandi avec l'ajout de safe-area
          (voir AppShell.tsx) — évite que la dernière carte stats se sente
          collée à la nav sur téléphone. space-y-7/8 : sections plus
          clairement séparées, cohérent avec la demande de blocs "qui
          respirent" plutôt que compressés. */}
      <div className="relative z-10 mx-auto max-w-6xl space-y-7 pb-28 md:space-y-8 md:pb-20">

        {/* HERO SECTION avec Effet Verre */}
        {/* Rembourrage reduit (p-12 -> p-8 sur grand ecran) : c'est lui qui
            faisait le plus pour la hauteur du bandeau. */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#0d1322]/75 backdrop-blur-xl p-5 shadow-[0_0_50px_rgba(0,0,0,0.7)] sm:p-7 md:p-8">
          <div
            role="img"
            aria-label="Ligue 1"
            /* L'image couvre TOUT le bloc, centree. Le "contain" cale a droite
               essaye precedemment laissait une couture nette au milieu du
               bandeau, l'image ne commencant qu'a mi-largeur. */
            className="pointer-events-none absolute inset-0 block bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url('/logo-ligue1.png')" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0d1322] from-0% via-[#0d1322]/80 via-40% to-[#0d1322]/25 to-95%"
          />

          <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] items-center">
            {/* Bandeau resserre : le titre en deux lignes geantes, le
                sous-titre publicitaire et le compte a rebours en pleine
                largeur occupaient un ecran entier pour quatre informations.
                Titre reduit d'un cran, sous-titre supprime (il ne disait rien
                qu'un joueur deja inscrit ignore), compte a rebours ramene a
                une seule ligne. */}
            <div className="dash-fade-up max-w-full space-y-4 lg:max-w-[56%]">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-[10px] font-bold text-emerald-400 tracking-wider">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                SAISON 2026—2027 • LIGUE 1 MCDONALD'S
              </div>
              {/* Titre STABLE, qui nomme la competition entre amis.
                  Deux essais precedents ne tenaient pas : "Prédis les
                  résultats de la Ligue 1" s'adressait a un visiteur a
                  convaincre alors que le lecteur est deja inscrit, et un
                  titre change a chaque etat ("ça se joue maintenant")
                  repetait ce que le bandeau juste en dessous annonce deja.
                  L'etat en direct reste donc sous le titre, la ou il a sa
                  place. Le titre nomme la competition, l'accroche juste en
                  dessous donne l'enjeu. */}
              <h1
                /* Le degrade descendait jusqu'a un bleu clair des la moitie
                   des lettres, ce qui delavait le bas du titre sur un fond
                   deja sombre. Le blanc tient maintenant les deux tiers. */
                className="bg-gradient-to-b from-white from-30% via-white via-70% to-[color-mix(in_oklab,var(--sky)_26%,white)] bg-clip-text font-display text-[1.75rem] leading-[1.05] tracking-tight text-transparent [text-wrap:balance] sm:text-4xl md:text-5xl md:leading-none"
                style={{
                  filter:
                    "drop-shadow(0 1px 0 rgba(0,0,0,.35)) drop-shadow(0 0 20px rgba(22,82,240,.16))",
                }}
              >
                LE CHAMPIONNAT DES PRONOS
              </h1>
              {/* Accroche d'une ligne : elle donne l'enjeu que le titre se
                  contente de nommer. Volontairement courte — c'est le
                  sous-titre publicitaire de trois lignes qui avait fait
                  gonfler le bandeau. */}
              <p className="font-mono text-[11px] uppercase tracking-[.2em] text-slate-400 sm:text-xs">
                Une saison, un vainqueur
              </p>

              {/* Compte a rebours vers le prochain coup d'envoi REEL, au lieu
                  d'une date figee dans Countdown.tsx qui laissait 00 00 00 00
                  a l'ecran. Le bandeau "N matchs en direct" a ete retire :
                  l'information vit deja sur les pages Pronos et Classement. */}
              {nextKickoff ? (
                <div className="max-w-md rounded-2xl border border-slate-800 bg-[#060b16]/70 px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                      Ouverture de la {nextKickoff.day || "journée"} · {nextKickoff.label}
                    </span>
                  </div>
                  <CountdownBlocks target={nextKickoff.at} />
                </div>
              ) : (
                <div className="flex max-w-md items-center gap-3 rounded-2xl border border-slate-800 bg-[#060b16]/70 px-4 py-3">
                  <span className="size-1.5 shrink-0 rounded-full bg-slate-600" />
                  <span className="font-mono text-[11px] text-slate-400">
                    Aucun match programmé pour l'instant.
                  </span>
                </div>
              )}

              {/* CE QUI RESTE A FAIRE.
                  Le compte a rebours annoncait l'ouverture de la journee sans
                  jamais dire si la grille du joueur etait remplie — c'est
                  pourtant la seule action qu'il ait a faire d'ici la. La regle
                  de fermeture est celle de la page Pronos
                  (src/lib/predictionDeadline.ts), jamais une seconde regle
                  ecrite ici, qui annoncerait "a faire" un match deja bloque. */}
              {pendingPronos && (pendingPronos.missing > 0 || pendingPronos.bonusMissing) ? (
                <Link
                  to="/pronostics"
                  className="tap flex max-w-md items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 transition-colors hover:bg-amber-400/[.16]"
                >
                  <AlertTriangle size={18} className="shrink-0 text-amber-300" />
                  <span className="min-w-0">
                    <span className="block font-display text-sm font-bold text-amber-100">
                      {pendingPronos.missing > 0
                        ? `${pendingPronos.missing} prono${pendingPronos.missing > 1 ? "s" : ""} à faire pour la ${pendingPronos.day}`
                        : `Bonus de la ${pendingPronos.day} à choisir`}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-amber-200/70">
                      {[
                        pendingPronos.missing > 0 && pendingPronos.bonusMissing
                          ? "bonus non choisi"
                          : null,
                        pronosCloseLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "à remplir avant le coup d'envoi"}
                    </span>
                  </span>
                  <ArrowRight size={16} className="ml-auto shrink-0 text-amber-300" />
                </Link>
              ) : pendingPronos ? (
                <div className="flex max-w-md items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[.07] px-4 py-3">
                  <Check size={18} className="shrink-0 text-emerald-400" />
                  <span className="font-display text-sm font-bold text-emerald-200">
                    Grille complète pour la {pendingPronos.day}
                  </span>
                </div>
              ) : null}

              {/* flex-col sur mobile : boutons pleine largeur, empilés
                  proprement (grande cible tactile), plutôt qu'un flex-wrap
                  qui les laissait retomber côte à côte de façon imprévisible
                  selon la largeur exacte de l'écran. */}
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:gap-4">
                <Link
                  to="/pronostics"
                  className="tap flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-6 py-3 font-display text-sm font-bold text-slate-950 shadow-[0_0_25px_rgba(16,185,129,0.35)] transition-all hover:bg-emerald-500"
                >
                  <Medal size={18} /> Faire mes pronos <ArrowRight size={16} />
                </Link>
                <Link
                  to="/classement"
                  className="tap flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-3 font-display text-sm font-bold text-white transition-all hover:bg-slate-800"
                >
                  <Trophy size={18} className="text-amber-400" /> Voir le classement
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* LIGNE : PROFIL avec Effet Verre */}
        <div className="dash-fade-up w-full" style={{ animationDelay: "80ms" }}>
          <div
            className="relative overflow-hidden rounded-3xl border bg-[#0d1322]/75 backdrop-blur-xl p-5 md:p-6 flex flex-col justify-between shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-colors duration-500"
            style={{ borderColor: clubTheme.primary + "40" }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0"
              /* "100% 100%" ETIRAIT le visuel du club pour remplir le cadre,
                 sans respecter son ratio : sur un bloc large et court, le
                 blason se retrouvait ecrase en hauteur. "cover" cadre sans
                 deformer ; la position a droite garde le blason visible, la
                 ou l'artwork le place. */
              style={{
                backgroundImage: `url('${clubWallpaperUrl}')`,
                backgroundSize: "cover",
                backgroundPosition: "right center",
                backgroundRepeat: "no-repeat",
                filter: "saturate(1.2) brightness(1.02)",
              }}
            />
            {clubTheme.id !== "default" && !clubWallpaperFailedProbe && (
              <img
                src={clubTheme.background}
                alt=""
                className="hidden"
                onError={handleClubWallpaperError}
              />
            )}
            <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-[#0d1322]/90 from-0% via-[#0d1322]/60 via-35% to-transparent to-62%" />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-[62%] z-0 bg-gradient-to-t from-[#0d1322]/70 from-0% via-transparent via-30% to-transparent" />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-16 -left-16 z-0 h-64 w-64 rounded-full blur-[110px]"
              style={{ backgroundColor: clubTheme.glow }}
            />
            <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-amber-500/5 to-transparent pointer-events-none" />

            {/* Voile bas sur TOUTE la largeur : la barre d'actions ("Gérer mon
                profil") tombait pile sur le slogan grave dans le visuel du
                club — "Toujours plus haut, fiers d'être Lensois" pour Lens.
                Deux typographies se croisaient sans se voir. Le degrade
                gauche existant ne couvrait que 62 % de la largeur. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-28 bg-gradient-to-t from-[#0d1322] via-[#0d1322]/70 to-transparent" />

            {/* Assombrissement supplémentaire, mobile uniquement : les dégradés
                ci-dessus sont pensés pour le layout desktop (texte à gauche /
                blason à droite sur toute la largeur restante) — sur une seule
                colonne (mobile), le texte occupe toute la largeur et se
                retrouve directement sur le fond du club, parfois trop clair/vif
                (ex. rouge RC Lens) pour rester lisible. Purement additif,
                masqué dès md: donc aucun changement du rendu desktop. */}
            <div className="pointer-events-none absolute inset-0 z-0 bg-[#070c16]/50 md:hidden" />

            <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:pr-[30%] lg:pr-[34%]">
              <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
                <div className="relative shrink-0">
                  {/* Avatar nettement réduit sur mobile (96px au lieu de 144px) :
                      à 144px il écrasait la colonne pseudo/niveau/classement
                      contre le blason du club sur les écrans étroits (360-412px).
                      Desktop inchangé (md:size-40). */}
                  <div className="size-24 rounded-full bg-gradient-to-tr from-amber-500 via-amber-300 to-yellow-500 p-1 shadow-[0_0_20px_rgba(245,158,11,0.3)] sm:size-28 md:size-32">
                    <div className="size-full rounded-full bg-[#060b16] flex items-center justify-center overflow-hidden border border-slate-800">
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt="Avatar"
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="font-display text-xl font-extrabold text-red-500 tracking-wider sm:text-2xl md:text-4xl">{(profile?.pseudo || user?.email?.split("@")[0] || "JO").slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                  </div>
                  <input
                    type="file"
                    ref={avatarInputRef}
                    onChange={handleAvatarUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    title="Changer ma photo de profil"
                    className="tap absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full bg-amber-400 text-slate-950 border-2 border-[#0d1322] shadow-[0_2px_10px_rgba(0,0,0,0.5)] hover:bg-amber-300 transition-colors disabled:opacity-60 sm:size-9 md:size-10"
                  >
                    <Camera size={16} className={avatarUploading ? "animate-pulse" : undefined} />
                  </button>
                </div>

                {/* HIERARCHIE INVERSEE. Le pavé ambré "Niveau 1 · DÉBUTANT"
                    passait AVANT le pseudo, avec bordure doree, halo et fond
                    opaque : l'element le plus voyant du bloc annoncait
                    l'information la moins interessante, et le sujet reel —
                    le joueur — venait apres, en texte nu. Le pseudo prend la
                    tete, le niveau rejoint le rang et les points sur la meme
                    ligne de pastilles. */}
                <div className="min-w-0">
                  <h3 className="font-display text-2xl text-white tracking-tight truncate sm:text-3xl md:text-4xl">
                    {profile?.pseudo || user?.email?.split("@")[0] || "Joueur"}
                  </h3>

                  <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-2.5">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 font-mono text-xs font-bold text-emerald-400 sm:text-sm">
                      <Trophy size={14} /> #{myStats.rank || "—"} du classement
                    </span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 font-mono text-xs font-bold text-yellow-400 sm:text-sm">
                      {myStats.points} pts
                    </span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 font-mono text-xs font-bold text-amber-300 sm:text-sm">
                      Niv. {careerLevel}
                      <span className="text-amber-400/60">·</span>
                      <span className="truncate uppercase">{currentCareerTitle}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="hidden self-stretch w-px bg-gradient-to-b from-transparent via-slate-500/70 to-transparent md:block" />

              <div className="md:w-72 lg:w-80 md:shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
                <span className="font-mono text-[10px] uppercase text-red-400 font-bold tracking-widest flex items-center gap-1.5">
                  <Heart size={12} className="fill-red-400" /> Équipe de cœur
                </span>
                {/* Le nom etait rempli d'un degrade aux couleurs du club. Sur
                    le fond du club lui-meme — rouge vif pour Lens — un degrade
                    rouge et or devenait illisible. Blanc plein, avec une barre
                    aux couleurs du club en rappel : le contraste ne depend
                    plus de l'equipe choisie. */}
                <div className="mt-1 flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="h-6 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: clubTheme.primary }}
                  />
                  <span className="block truncate font-display text-xl font-bold text-white md:text-2xl">
                    {activeClub?.name || "À choisir"}
                  </span>
                </div>

                {/* Le cadenas vivait en bas a gauche du bloc, a l'oppose du
                    nom du club qu'il concerne. Il le suit desormais. */}
                {isFavoriteTeamLocked && !isChangingTeam && (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-red-300">
                    <span aria-hidden="true">🔒</span> Choix verrouillé
                  </span>
                )}
              </div>
            </div>

            <div className="relative z-10 mt-6 pt-5 border-t border-slate-800/80 flex flex-wrap items-center gap-3 justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {!isChangingTeam ? (
                  !isFavoriteTeamLocked ? (
                    <button
                      type="button"
                      onClick={openTeamPicker}
                    className="tap flex items-center gap-2 rounded-xl border bg-slate-900/80 px-4 py-2.5 text-[13px] font-display font-bold text-slate-200 hover:border-red-500/50 hover:text-red-400 transition-all"
                      style={{ borderColor: clubTheme.primary + "55" }}
                    >
                      <Heart size={14} style={{ color: clubTheme.primary }} /> Changer mon équipe
                    </button>
                  ) : null
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={pendingTeamId}
                      onChange={(e) => setPendingTeamId(e.target.value)}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-display font-bold text-white focus:border-red-500 focus:outline-none transition-colors cursor-pointer"
                    >
                      {teams.length === 0 && <option value="">Chargement...</option>}
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleConfirmTeamChange}
                      disabled={!pendingTeamId || savingTeam}
                      className="tap flex items-center gap-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-500 px-3.5 py-2 text-xs font-display font-bold text-slate-950 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check size={14} /> {savingTeam ? "..." : "Valider"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsChangingTeam(false)}
                      className="text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors px-1"
                    >
                      Annuler
                    </button>
                  </div>
                )}
                {isSaved && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400 animate-fade-in">
                    <Check size={14} /> Équipe enregistrée !
                  </span>
                )}
              </div>
              <Link
                to="/profil"
                className="tap group flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-[13px] font-display font-bold text-slate-200 hover:border-emerald-500/50 hover:text-emerald-400 transition-all"
              >
                <Camera size={14} className="text-emerald-400" /> Gérer mon profil <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>
        </div>

        {/* SECTION : PODIUM & STATS avec Effet Verre */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-7">

          <div className="dash-fade-up relative overflow-hidden rounded-3xl border border-slate-800 bg-[#0d1322]/75 backdrop-blur-xl p-6 md:p-8 flex flex-col justify-between shadow-[0_0_40px_rgba(0,0,0,0.6)]" style={{ animationDelay: "140ms" }}>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center opacity-60"
              style={{ backgroundImage: "url('/images/fond-bloc-accueil.png')" }}
            />
            <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[#0d1322]/20 via-[#0d1322]/35 to-[#0d1322]/55" />
            <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-amber-500/10 via-transparent to-transparent pointer-events-none" />

            <div className="relative z-10 mb-6 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles size={14} className="text-amber-400 animate-pulse" />
                  <span className="font-mono text-[11px] uppercase text-amber-400 font-bold tracking-widest">À l'issue de la {currentMatchday}</span>
                </div>
                <h3 className="font-display text-[26px] font-black md:text-3xl text-white tracking-tight">Classement général</h3>
              </div>
              <Link
                to="/classement"
                className="tap shrink-0 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-2 font-mono text-xs text-slate-200 hover:text-white hover:border-amber-500/50 transition-all shadow-md"
              >
                Complet →
              </Link>
            </div>

            {/* Podium en cartes remplacé par les 5 premiers, dans le même
                ordre de lecture que la page Classement : place, joueur,
                points, gain. Trois cartes empilées disaient moins que cinq
                lignes, et n'affichaient pas les gains. */}
            <div className="relative z-10 space-y-1.5">
              <div className="grid grid-cols-[28px_minmax(0,1fr)_38px_52px_64px] items-center gap-2 px-2 pb-1 font-mono text-[9px] font-bold uppercase tracking-[.16em] text-slate-500">
                <span>#</span>
                <span>Joueur</span>
                {/* Meme pastille que la page Classement, meme calcul
                    (src/lib/leaderboardEvolution.ts) : un joueur ne peut pas
                    lire "+2" ici et "—" la-bas. */}
                <span
                  className="text-center"
                  title={
                    hasEvolution
                      ? "Places gagnées ou perdues sur les derniers matchs terminés"
                      : "Pas encore assez de matchs joués pour mesurer une évolution"
                  }
                >
                  Évo
                </span>
                <span className="text-right">Pts</span>
                <span className="text-right">Gain</span>
              </div>

              {leaderboard.slice(0, 5).map((player, index) => {
                const place = Number(player?.rank ?? index + 1);
                const prize = homePrizeByRank[place] ?? 0;
                // Comparaison directe sur l'identifiant : l'ancien
                // `myStats.rank === place` confrontait un rang a un index de
                // ligne, ce qui ne tenait que tant que les rangs restaient
                // strictement sequentiels.
                const isMe = Boolean(user?.id) && String(player?.user_id ?? "") === String(user?.id);
                const movement = rankMovement(
                  previousRankByUser[String(player?.user_id ?? "")],
                  place,
                  hasEvolution,
                );

                return (
                  <div
                    key={player?.user_id || `place-${place}`}
                    className={`dash-fade-up grid grid-cols-[28px_minmax(0,1fr)_38px_52px_64px] items-center gap-2 rounded-xl border px-2 py-2 transition-colors ${
                      isMe
                        ? "border-emerald-400/30 bg-emerald-400/[.07]"
                        : place === 1
                          ? "border-amber-500/30 bg-amber-500/[.06]"
                          : "border-slate-800/70 bg-slate-900/40 hover:bg-slate-900/70"
                    }`}
                    style={{ animationDelay: `${180 + index * 60}ms` }}
                  >
                    <span
                      className={`grid size-6 place-items-center rounded-lg font-mono text-[10px] font-black ${
                        place === 1
                          ? "bg-amber-400 text-slate-950"
                          : place === 2
                            ? "bg-slate-400 text-slate-950"
                            : place === 3
                              ? "bg-amber-900/70 text-amber-200"
                              : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {place}
                    </span>

                    <div className="flex min-w-0 items-center gap-2">
                      {player?.avatar_url ? (
                        <img
                          src={player.avatar_url}
                          alt=""
                          className="size-7 shrink-0 rounded-full border border-white/10 object-cover"
                        />
                      ) : (
                        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/10 bg-slate-800 font-mono text-[9px] font-black text-slate-300">
                          {String(player?.name || "?").slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="truncate font-display text-sm font-bold text-white">
                        {player?.name || "En attente"}
                      </span>
                      {isMe && (
                        <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase text-emerald-300">
                          Toi
                        </span>
                      )}
                    </div>

                    <span
                      className={`mx-auto inline-flex items-center justify-center gap-0.5 rounded-full border px-1 py-0.5 font-mono text-[9px] font-black ${
                        movement.trend === "up"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                          : movement.trend === "down"
                            ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                            : "border-slate-700/60 bg-slate-800/40 text-slate-500"
                      }`}
                    >
                      {movement.trend === "up" ? (
                        <>
                          <ArrowUp size={9} />
                          {Math.abs(movement.delta)}
                        </>
                      ) : movement.trend === "down" ? (
                        <>
                          <ArrowDown size={9} />
                          {Math.abs(movement.delta)}
                        </>
                      ) : (
                        <Minus size={9} />
                      )}
                    </span>

                    <span className="text-right font-display text-base font-black text-white">
                      {Number(player?.total_points || 0)}
                    </span>

                    <span
                      className={`text-right font-mono text-xs font-bold ${
                        prize > 0 ? "text-amber-300" : "text-slate-700"
                      }`}
                    >
                      {prize > 0 ? `${prize} €` : "—"}
                    </span>
                  </div>
                );
              })}

              {!leaderboard.length && (
                <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-6 text-center font-mono text-[11px] text-slate-500">
                  Le classement apparaîtra dès les premiers résultats.
                </div>
              )}
            </div>

            <div className="relative z-10 mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between font-mono">
              <span className="text-[13px] text-slate-300 font-medium">{leadSentence}</span>
              <span className="text-sm text-amber-400 font-black">Cagnotte : {potAmount.toFixed(0)} €</span>
            </div>
          </div>

          <div className="dash-fade-up relative overflow-hidden rounded-3xl border border-slate-800 bg-[#0d1322]/75 backdrop-blur-xl p-6 md:p-8 flex flex-col justify-between shadow-[0_0_30px_rgba(0,0,0,0.5)]" style={{ animationDelay: "200ms" }}>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center opacity-60"
              style={{ backgroundImage: "url('/images/fond-bloc-accueil.png')" }}
            />
            <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[#0d1322]/20 via-[#0d1322]/35 to-[#0d1322]/55" />

            <div className="relative z-10 mb-6 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-400">Tes performances</span>
                <h3 className="font-display text-2xl font-semibold text-white mt-0.5">Statistiques personnelles</h3>
              </div>
              <Link to="/stats" className="tap shrink-0 whitespace-nowrap rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2 font-mono text-xs text-slate-300 hover:text-white">
                Tout voir →
              </Link>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-3.5 sm:gap-4">
              <div
                className="relative flex min-h-[112px] flex-col justify-center overflow-hidden rounded-2xl border border-slate-800 bg-[#060b16]/90 p-4 bg-cover bg-center bg-no-repeat sm:p-5"
                style={{ backgroundImage: "url('/images/stats/stat-bons-pronos.png')" }}
              >
                <div className="absolute inset-0 bg-black/45" />
                <span className="relative font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-slate-300 block mb-1">Bons pronos</span>
                <strong
                  className="relative block font-display text-[28px] text-white sm:text-3xl"
                  style={{ filter: "drop-shadow(0 0 14px rgba(110,231,183,.35))" }}
                >
                  {myStats.successRate}
                  <span className="text-[0.6em] align-top">%</span>
                </strong>
                <span className="relative text-[11px] text-slate-300 block mt-1">{myStats.totalPronos} pronos</span>
              </div>

              <div
                className="relative flex min-h-[112px] flex-col justify-center overflow-hidden rounded-2xl border border-slate-800 bg-[#060b16]/90 p-4 bg-cover bg-center bg-no-repeat sm:p-5"
                style={{ backgroundImage: "url('/images/stats/stat-scores-exacts.png')" }}
              >
                <div className="absolute inset-0 bg-black/45" />
                <span className="relative font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-slate-300 block mb-1">Scores exacts</span>
                <strong
                  className="relative block font-display text-[28px] text-white sm:text-3xl"
                  style={{ filter: "drop-shadow(0 0 14px rgba(96,165,250,.35))" }}
                >
                  {myStats.exactScores}
                </strong>
                {/* "0% des pronos" ne dit rien quand le compteur est a zero. */}
                <span className="relative text-[11px] text-slate-300 block mt-1">
                  {myStats.exactScores > 0
                    ? `${Math.round((myStats.exactScores / Math.max(myStats.totalPronos, 1)) * 100)}% des pronos`
                    : "Pas encore trouvé"}
                </span>
              </div>

              <div
                className="relative flex min-h-[112px] flex-col justify-center overflow-hidden rounded-2xl border border-slate-800 bg-[#060b16]/90 p-4 bg-cover bg-center bg-no-repeat sm:p-5"
                style={{ backgroundImage: "url('/images/stats/stat-points-moyens.png')" }}
              >
                <div className="absolute inset-0 bg-black/45" />
                {/* "Points moyens" affichait le meme chiffre que "Meilleure
                    journee" tant qu'une seule journee etait jouee. Remplace par
                    la REGULARITE, qui manquait a l'Accueil alors qu'elle sert
                    desormais a departager le classement. */}
                <span className="relative font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-slate-300 block mb-1">Régularité</span>
                <strong
                  className="relative block font-display text-[28px] text-white sm:text-3xl"
                  style={{ filter: "drop-shadow(0 0 14px rgba(252,211,77,.35))" }}
                >
                  {myStats.participationTotal
                    ? `${Math.round((myStats.participation / myStats.participationTotal) * 100)}%`
                    : "—"}
                </strong>
                <span className="relative text-[11px] text-slate-300 block mt-1">
                  {myStats.participationTotal
                    ? `${myStats.participation} sur ${myStats.participationTotal} matchs`
                    : "Aucun match joué"}
                </span>
              </div>

              <div
                className="relative flex min-h-[112px] flex-col justify-center overflow-hidden rounded-2xl border border-slate-800 bg-[#060b16]/90 p-4 bg-cover bg-center bg-no-repeat sm:p-5"
                style={{ backgroundImage: "url('/images/stats/stat-meilleure-journee.png')" }}
              >
                <div className="absolute inset-0 bg-black/45" />
                <span className="relative font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-slate-300 block mb-1">Meilleure journée</span>
                <strong
                  className="relative block font-display text-[28px] text-white sm:text-3xl"
                  style={{ filter: "drop-shadow(0 0 14px rgba(129,140,248,.35))" }}
                >
                  {myStats.bestDayPoints}
                </strong>
                <span className="relative text-[11px] text-slate-300 block mt-1">Points • {myStats.bestDay}</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </AppShell>
  );
}