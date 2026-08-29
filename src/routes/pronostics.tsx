import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Heart,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  Sparkles,
  Trophy,
} from "lucide-react";
import { AppShell } from "@/components/prono/AppShell";
import { CountdownBlocksIconic } from "@/components/prono/Countdown";
import { supabase } from "@/lib/supabase";
import {
  isMatchLocked as isMatchLockedByDeadline,
  matchLockDate,
} from "@/lib/predictionDeadline";
import { useFavoriteTeam } from "@/hooks/useFavoriteTeam";
import { useTeamTheme } from "@/hooks/useTeamTheme";
import { withAlpha } from "@/lib/team-theme";
import { resolveBonusClubLogo } from "@/services/bonusClubLogoService";
import {
  fetchLiveApiMatches,
  LIVE_SCORE_CACHE_PREFIX,
  FINISHED_STATUSES,
  IN_PROGRESS_STATUSES,
} from "@/lib/liveMatches";

export const Route = createFileRoute("/pronostics")({
  head: () => ({
    meta: [
      { title: "Mes pronostics | Prono Ligue 1" },
      {
        name: "description",
        content: "Saisis tes pronostics de la journée : résultats, équipe de cœur et matchs bonus.",
      },
      { property: "og:title", content: "Mes pronostics de la journée" },
      {
        property: "og:description",
        content: "Saisis tes pronos avant le coup d'envoi et grimpe au classement.",
      },
    ],
  }),
  component: PronosticsPage,
});

type Pick = "1" | "N" | "2";
type Score = { home: string; away: string };

// ============================================================
// DONNÉES RÉELLES SUPABASE — mêmes tables que la synchro admin
// (src/routes/admin.tsx / src/services/adminService.ts) : `teams`,
// `matchdays`, `matches`. Plus de mock ni de club en dur ici : cette page
// affiche exactement les matchs synchronisés depuis football-data.org.
// ============================================================
type TeamRow = { id: string; name: string; short_name: string | null; logo_url: string | null };
type MatchdayRow = {
  id: string;
  number: number;
  code: string | null;
  label: string | null;
  deadline: string | null;
  deadline_mode: "manual" | "auto_minus_1" | null;
  is_finished: boolean;
};
type MatchRow = {
  id: string;
  matchday_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  // Colonnes texte, remplies à la synchro football-data.org — nécessaires
  // pour les matchs bonus (clubs étrangers absents de `teams`, voir
  // resolveBonusClubLogo) : home_team_id/away_team_id y restent null.
  home_team: string | null;
  away_team: string | null;
  api_fixture_id: number | null;
  kickoff: string | null;
  status: string | null;
  finished: boolean;
  home_score: number | null;
  away_score: number | null;
};

type BonusCompetitionCode = "PL" | "PD" | "SA" | "BL1";
type BonusOptionRow = {
  id: string;
  matchday_id: string | null;
  competition_code?: string | null;
  competition?: string | null;
  league_code?: string | null;
  match_id?: string | null;
  is_active: boolean;
};

type BonusScore = Score;

const BONUS_LEAGUES: Record<
  BonusCompetitionCode,
  { name: string; logos: string[] }
> = {
  PL: {
    name: "Premier League",
    logos: [
      "/logos/Premier league/premierleague.png",
      "/logos/championnats/england.png",
    ],
  },
  PD: {
    name: "Liga",
    logos: [
      "/logos/Liga/laliga.png",
      "/logos/championnats/spain.png",
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/LaLiga_EA_Sports_2023.svg",
    ],
  },
  SA: {
    name: "Serie A",
    logos: [
      "/logos/Serie A/seriea.png",
      "/logos/championnats/italy.png",
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Serie_A_logo_2022.svg",
    ],
  },
  BL1: {
    name: "Bundesliga",
    logos: [
      "/logos/Bundesliga/bundesliga.png",
      "/logos/championnats/germany.png",
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Bundesliga_logo.svg",
    ],
  },
};

function normalizeBonusCompetition(value: unknown): BonusCompetitionCode | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "PL" || raw === "PREMIER LEAGUE") return "PL";
  if (raw === "PD" || raw === "LL" || raw === "LIGA" || raw === "LALIGA") return "PD";
  if (raw === "SA" || raw === "SERIE A") return "SA";
  if (raw === "BL1" || raw === "BL" || raw === "BUNDESLIGA") return "BL1";
  return null;
}

const FALLBACK_TEAM: TeamRow = { id: "", name: "Équipe à venir", short_name: null, logo_url: null };

/** Résout un `team_id` (uuid Supabase) vers la ligne `teams` correspondante — jamais un id/nom en dur. */
function teamOf(teamsById: Map<string, TeamRow>, id: string | null | undefined): TeamRow {
  if (!id) return FALLBACK_TEAM;
  return teamsById.get(id) ?? FALLBACK_TEAM;
}

function ClubCrest({
  club,
  size = "size-8",
  className = "",
}: {
  club: { name: string; logo_url: string | null };
  size?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showFallback = broken || !club.logo_url;
  const initials = club.name
    .replace(/^(AS|AJ|RC|FC|OGC|ESTAC|LOSC|Olympique|Stade|Le)\s+/i, "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`relative ${size} shrink-0 rounded-lg overflow-hidden flex items-center justify-center ${className}`}
    >
      {showFallback && (
        <span className="font-mono text-[10px] font-bold text-slate-300">{initials}</span>
      )}
      {!showFallback && (
        <img
          src={club.logo_url!}
          alt={club.name}
          className="size-full object-contain"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}

function CompetitionLogo({
  league,
  className = "size-9",
}: {
  league: { name: string; logos: string[] };
  className?: string;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = league.logos[sourceIndex] ?? null;

  return (
    <div className={`relative ${className} shrink-0 flex items-center justify-center`}>
      {source ? (
        <img
          src={source}
          alt={league.name}
          className="size-full object-contain"
          onError={() => setSourceIndex((index) => index + 1)}
        />
      ) : (
        <div className="grid size-full place-items-center rounded-lg border border-white/10 bg-white/[0.03] px-1">
          <span className="font-mono text-[7px] font-black uppercase leading-tight text-slate-400 text-center">
            {league.name}
          </span>
        </div>
      )}
    </div>
  );
}

/** `J{number}` — même format court que src/routes/admin.tsx (matchdayLabel). */
function matchdayCode(md: MatchdayRow): string {
  return md.code || `J${md.number}`;
}

/** Plage de dates affichée sous le code de journée, calculée depuis les vrais coup d'envoi des matchs de cette journée (plus de dates en dur). */
function matchdayRangeLabel(mdId: string, allMatches: MatchRow[]): string {
  const dates = allMatches
    .filter((m) => m.matchday_id === mdId && m.kickoff)
    .map((m) => new Date(m.kickoff as string))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (dates.length === 0) return "À VENIR";

  const fmt = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Paris",
  });
  const format = (d: Date) => fmt.format(d).toUpperCase().replace(".", "");

  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  return format(min) === format(max) ? format(min) : `${format(min)} → ${format(max)}`;
}

/**
 * `predictions` ne stocke qu'un score (home_prediction/away_prediction —
 * confirmé via `supabase gen types typescript`, aucune colonne `pick`,
 * `home_score`/`away_score`, `prediction_type` ni `bonus_option_id`
 * n'existe). Résultat 1N2 dérivé d'un score, utilisée pour :
 *  - reconstruire le pick affiché (boutons 1/N/2) à partir du score
 *    sauvegardé d'un match classique (voir la restauration plus bas) ;
 *  - dériver le pick du score exact saisi pour le club de cœur/bonus (même
 *    logique de lecture que classement.tsx/gazette.tsx/stats.tsx).
 */
function derivePick(home: number, away: number): Pick {
  if (home > away) return "1";
  if (home < away) return "2";
  return "N";
}

/** Retourne les points du pronostic 1N2 une fois le match terminé. */
function getMainMatchPoints(match: MatchRow, pick: Pick | undefined): number | null {
  if (!match.finished || match.home_score == null || match.away_score == null || !pick) {
    return null;
  }

  const finalResult = derivePick(match.home_score, match.away_score);
  return pick === finalResult ? 1 : 0;
}

/**
 * Calcul du score affiché uniquement à l'écran.
 * Ne modifie ni Supabase ni les points déjà enregistrés.
 */
function getExactScorePoints(
  predictionHome: string | number | null | undefined,
  predictionAway: string | number | null | undefined,
  finalHome: number | null | undefined,
  finalAway: number | null | undefined,
  exactPoints: number,
  resultPoints: number,
): number | null {
  if (
    predictionHome == null ||
    predictionAway == null ||
    predictionHome === "" ||
    predictionAway === "" ||
    finalHome == null ||
    finalAway == null
  ) {
    return null;
  }

  const ph = Number(predictionHome);
  const pa = Number(predictionAway);

  if (!Number.isFinite(ph) || !Number.isFinite(pa)) return null;

  if (ph === finalHome && pa === finalAway) return exactPoints;

  return derivePick(ph, pa) === derivePick(finalHome, finalAway)
    ? resultPoints
    : 0;
}

/**
 * Sens inverse : un pick 1/N/2 (matchs Ligue 1 classiques, qui n'ont pas de
 * saisie de score dans l'UI) doit être représenté par un score puisque
 * `predictions` n'a pas de colonne dédiée. Représentation déterministe et
 * stable (mêmes valeurs à chaque sauvegarde), compatible avec `derivePick`
 * ci-dessus : pickToScore(p) → derivePick(...) redonne toujours p.
 * Sans incidence sur le barème : le bonus "score exact" ne s'applique
 * jamais aux matchs Ligue 1 classiques (seulement club de cœur/bonus), donc
 * ce score fictif n'est jamais évalué comme score exact.
 */
function pickToScore(pick: Pick): { home: number; away: number } {
  if (pick === "1") return { home: 1, away: 0 };
  if (pick === "2") return { home: 0, away: 1 };
  return { home: 0, away: 0 };
}

/** Jour + date + heure d'un coup d'envoi, formatés pour Paris (les horaires football-data.org sont en UTC). */
function formatKickoff(kickoff: string | null): { dayName: string; dayDate: string; time: string } {
  if (!kickoff) return { dayName: "—", dayDate: "", time: "—" };
  const d = new Date(kickoff);
  if (Number.isNaN(d.getTime())) return { dayName: "—", dayDate: "", time: "—" };
  const dayName = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "Europe/Paris" })
    .format(d)
    .replace(".", "")
    .toUpperCase();
  const dayDate = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Paris",
  })
    .format(d)
    .toUpperCase()
    .replace(".", "");
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(d);
  return { dayName, dayDate, time };
}

function PronosticsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [matchdays, setMatchdays] = useState<MatchdayRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [selectedMatchdayId, setSelectedMatchdayId] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // DIRECT LIVE : Supabase reste la source du calendrier/pronos.
  // Le score et le statut en cours viennent de football-data.org.
  // Rafraîchissement raisonnable pour éviter de saturer l'API.
  const [liveByFixture, setLiveByFixture] = useState<Record<string, any>>({});
  const [liveTick, setLiveTick] = useState(() => Date.now());

  const [picks, setPicks] = useState<Record<string, Pick>>({});
  // Pronostics "score exact" du club de cœur, par match_id — un match peut
  // avoir son propre score en cours de saisie (cas rare mais géré : plusieurs
  // matchs du club de cœur sur la même journée).
  const [coeurScores, setCoeurScores] = useState<Record<string, Score>>({});
  const [bonusOptions, setBonusOptions] = useState<BonusOptionRow[]>([]);
  const [bonusSelection, setBonusSelection] = useState<string | null>(null);
  const [bonusScores, setBonusScores] = useState<Record<string, BonusScore>>({});
    const [bonusChoiceCounts, setBonusChoiceCounts] = useState<Record<string, number>>({});
    const [bonusChoiceTotal, setBonusChoiceTotal] = useState(0);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusError, setBonusError] = useState<string | null>(null);
  // Pronostics déjà enregistrés par le joueur, tels que renvoyés par
  // Supabase (uniquement home_prediction/away_prediction — aucune colonne
  // ne distingue leur "type"). La classification en picks/coeurScores/
  // bonusScores se fait dans un effet séparé ci-dessous, une fois que
  // `matches`, `bonusOptions` et `favoriteTeamId` sont disponibles (voir
  // ce commentaire plus bas pour le détail du principe).
  const [savedPredictions, setSavedPredictions] = useState<
    Record<string, { home: number; away: number }>
  >({});
  // Points déjà enregistrés par le système de scoring.
  // Cette valeur est uniquement lue pour l'affichage : aucun recalcul ici.
  const [savedPoints, setSavedPoints] = useState<Record<string, number | null>>({});
  const [saved, setSaved] = useState(false);
  // Pulse/glow bref juste après l'enregistrement (feedback visuel court),
  // distinct de `saved` qui lui reste vrai tant que les pronos ne sont pas
  // modifiés à nouveau — voir handleSave et le CTA « Valider la journée ».
  const [justSaved, setJustSaved] = useState(false);
  // ============================================================
  // SAUVEGARDE AUTOMATIQUE — voir l'effet de debounce plus bas et
  // savePronosticsCore/saveWithRetry/runAutosave. `autosaveStatus` pilote
  // l'indicateur discret (● Enregistrement… / ✓ Enregistré / ⚠ Échec) ;
  // `isSavingRef`/`pendingResaveRef` évitent deux sauvegardes concurrentes
  // (une modification arrivée pendant une sauvegarde en cours est rejouée
  // une fois celle-ci terminée, jamais perdue).
  // ============================================================
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Détail de la dernière erreur ("Ligue 1 : ..." / "Bonus : ..." / les deux)
  // — permet de distinguer un échec spécifique au bonus d'un échec général,
  // au lieu d'un "Échec de l'enregistrement" générique qui masquerait lequel
  // des deux upserts (Ligue 1 ou bonus, désormais indépendants) a échoué.
  const [autosaveErrorMessage, setAutosaveErrorMessage] = useState<string | null>(null);
  const isSavingRef = useRef(false);
  const pendingResaveRef = useRef(false);
  const [, setLockTick] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const autoSelectedRef = useRef(false);
  // Toujours à jour, contrairement à `matches` capturé une seule fois par
  // la closure de l'effet DIRECT LIVE (dépendances `[]`, volontairement non
  // relancé à chaque chargement de matchs pour ne pas réinitialiser le
  // timer de rafraîchissement toutes les 10s).
  const matchesRef = useRef<MatchRow[]>([]);
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);
  // Empêche un refresh live devenu obsolète (fetch lent, ancien tick encore
  // en vol) d'écraser un résultat plus récent — même garde que les pages
  // de calcul (request sequence, voir section "requêtes concurrentes").
  const liveSeqRef = useRef(0);
  // Passe à `true` dès que le joueur touche à un pick/score — empêche
  // l'effet de restauration (basé sur des données qui arrivent par vagues :
  // matches, bonusOptions, favoriteTeamId) d'écraser une saisie en cours.
  const userEditedRef = useRef(false);

  // Design system par équipe favorite (background, couleurs, glow, gradient,
  // bouton) — même source de vérité et même hook que la page d'accueil, voir
  // src/lib/team-theme.ts et src/hooks/useTeamTheme.ts. Le hook lit
  // `profiles.favorite_team_id` via useFavoriteTeam et se resynchronise
  // automatiquement dès qu'un autre composant change de club (ex. /profil),
  // y compris après un rechargement de page.
  const {
    theme,
    backgroundUrl: teamBg,
    backgroundFailed: teamBgFailed,
    onBackgroundError: handleTeamBgError,
  } = useTeamTheme();
  // Id réel du club de cœur (uuid `teams.id` via `profiles.favorite_team_id`)
  // — c'est CE champ qui sert à repérer les matchs du joueur, pas un nom.
  const { favoriteTeamId } = useFavoriteTeam();

  // Chargement des matchs/journées/équipes réellement synchronisés depuis
  // football-data.org (mêmes tables que l'admin — voir src/services/adminService.ts)
  // + des pronostics déjà enregistrés par le joueur connecté, pour ne pas les
  // perdre au rechargement de la page.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setDataLoading(true);
      setLoadError(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const [
          { data: competitionsData, error: competitionsError },
          { data: teamsData, error: teamsError },
          { data: matchdaysData, error: matchdaysError },
          { data: matchesData, error: matchesError },
        ] = await Promise.all([
          supabase.from("competitions").select("id, external_code, code"),
          supabase.from("teams").select("id, name, short_name, logo_url"),
          supabase
            .from("matchdays")
            .select("id, number, code, label, deadline, deadline_mode, is_finished, competition_id")
            .order("number", { ascending: true }),
          supabase
            .from("matches")
            .select(
              "id, matchday_id, home_team_id, away_team_id, home_team, away_team, api_fixture_id, kickoff, status, finished, home_score, away_score",
            )
            .order("kickoff", { ascending: true }),
        ]);

        if (cancelled) return;
        if (competitionsError) throw competitionsError;
        if (teamsError) throw teamsError;
        if (matchdaysError) throw matchdaysError;
        if (matchesError) throw matchesError;

        // Cette page n'affiche QUE le calendrier Ligue 1 — sans ce filtre,
        // les matchdays des 4 championnats bonus (PL/PD/SA/BL1, elles aussi
        // codées "J1", "J2", ... par syncCompetitionMatches) apparaissaient
        // mélangées dans le sélecteur de journée, donnant l'impression de
        // plusieurs "J1" en double avec des dates différentes, et menant
        // parfois vers des matchs de clubs étrangers absents de `teams`
        // (d'où "Équipe à venir"). Les matchdays elles ne sont pas
        // dupliquées en base : il en existe bien une seule vraie par
        // championnat et par numéro (voir migration
        // 20260810150000_fix_ligue1_matchday_links.sql).
        const ligue1CompetitionId = (competitionsData ?? []).find(
          (c: any) => c.external_code === "FL1" || c.code === "FL1",
        )?.id;
        const ligue1Matchdays = (matchdaysData ?? []).filter(
          (m: any) => m.competition_id === ligue1CompetitionId,
        );

        setTeams((teamsData ?? []) as TeamRow[]);
        setMatchdays(ligue1Matchdays as MatchdayRow[]);
        setMatches((matchesData ?? []) as MatchRow[]);

        if (user) {
          // `predictions` ne renvoie que home_prediction/away_prediction
          // (+ id/user_id/match_id/points/created_at) — rien ne distingue un
          // pick 1N2 classique d'un score club de cœur/bonus au niveau de la
          // ligne elle-même. On se contente ici de stocker le score brut par
          // match_id ; la classification (pick / coeur / bonus) se fait dans
          // l'effet dédié plus bas, une fois `matches`/`bonusOptions`/
          // `favoriteTeamId` disponibles.
          const { data: predictionsData, error: predictionsLoadError } = await supabase
            .from("predictions")
            .select("match_id, home_prediction, away_prediction, points")
            .eq("user_id", user.id);

          if (predictionsLoadError) {
            console.warn("Erreur chargement predictions :", predictionsLoadError);
          }

          if (!cancelled && predictionsData) {
            const raw: Record<string, { home: number; away: number }> = {};
            const pointsRaw: Record<string, number | null> = {};
            predictionsData.forEach((p) => {
              if (p.home_prediction == null || p.away_prediction == null) return;
              if (!p.match_id) return;
              raw[p.match_id] = { home: p.home_prediction, away: p.away_prediction };
              pointsRaw[p.match_id] =
                typeof p.points === "number" ? p.points : p.points == null ? null : Number(p.points);
            });
            setSavedPredictions(raw);
            setSavedPoints(pointsRaw);
          }
        }
      } catch (err) {
        console.error("Erreur lors du chargement des matchs :", err);
        if (!cancelled) setLoadError("Impossible de charger les matchs. Réessaie dans un instant.");
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBonusOptions() {
      setBonusLoading(true);
      setBonusError(null);
      try {
        const { data, error } = await supabase.from("bonus_options").select("*").eq("is_active", true);
        if (error) throw error;
        if (!cancelled) setBonusOptions((data ?? []) as BonusOptionRow[]);
      } catch (err) {
        console.error("Erreur chargement Matchs bonus :", err);
        if (!cancelled) {
          setBonusOptions([]);
          setBonusError("Les matchs bonus ne sont pas disponibles pour cette journée.");
        }
      } finally {
        if (!cancelled) setBonusLoading(false);
      }
    }

    loadBonusOptions();
    return () => { cancelled = true; };
  }, []);

  // Classification des pronostics déjà enregistrés (savedPredictions) en
  // picks / coeurScores / bonusSelection+bonusScores, une fois que les
  // données de référence nécessaires sont là. Un match_id est reconnu
  // comme :
  //  - "bonus" s'il apparaît dans `bonus_options` (candidats bonus, toutes
  //    journées confondues — un match_id ne peut appartenir qu'à une seule
  //    journée) : c'est déjà comme ça que handleSave identifie/nettoie le
  //    bonus choisi (delete sur les 4 candidats avant de réinsérer un seul),
  //    donc "avoir une ligne predictions pour un des 4 candidats" EST la
  //    donnée du bonus choisi — aucune colonne supplémentaire nécessaire ;
  //  - "club de cœur" si le match implique `favoriteTeamId` ;
  //  - sinon un match Ligue 1 classique, dont le pick 1/N/2 est dérivé du
  //    score sauvegardé via `derivePick` (voir pickToScore pour le sens
  //    inverse, utilisé à la sauvegarde).
  // Protégé par `userEditedRef` pour ne jamais écraser une saisie en cours
  // si ces données arrivent après que le joueur a commencé à modifier ses
  // pronostics.
  useEffect(() => {
    if (userEditedRef.current) return;
    if (Object.keys(savedPredictions).length === 0) return;
    if (matches.length === 0) return;

    const currentDayBonusIds = new Set(
      bonusOptions
        .filter((option) => option.matchday_id === selectedMatchdayId)
        .map((option) => option.match_id)
        .filter((id): id is string => Boolean(id)),
    );
    const matchById = new Map(matches.map((m) => [m.id, m]));

    const nextPicks: Record<string, Pick> = {};
    const nextCoeurScores: Record<string, Score> = {};
    let nextBonusSelection: string | null = null;
    let nextBonusScores: Record<string, BonusScore> = {};

    Object.entries(savedPredictions).forEach(([matchId, score]) => {
      if (currentDayBonusIds.has(matchId)) {
        // Ne remplace jamais le bonus sauvegardé pour la journée courante.
        if (!nextBonusSelection) {
          nextBonusSelection = matchId;
          nextBonusScores = {
            [matchId]: { home: String(score.home), away: String(score.away) },
          };
        }
        return;
      }

      const match = matchById.get(matchId);
      const isFavoriteMatch =
        favoriteTeamId != null &&
        match != null &&
        (match.home_team_id === favoriteTeamId || match.away_team_id === favoriteTeamId);

      if (isFavoriteMatch) {
        nextCoeurScores[matchId] = { home: String(score.home), away: String(score.away) };
        return;
      }

      nextPicks[matchId] = derivePick(score.home, score.away);
    });

    setPicks(nextPicks);
    setCoeurScores(nextCoeurScores);
    if (nextBonusSelection) setBonusSelection(nextBonusSelection);
    setBonusScores(nextBonusScores);
  }, [savedPredictions, matches, bonusOptions, favoriteTeamId, selectedMatchdayId]);

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  /**
   * DIRECT LIVE
   * - L'API est interrogée toutes les 30 secondes.
   * - Dès que le statut passe IN_PLAY/PAUSED, le score courant est affiché.
   * - Si le coup d'envoi est dépassé mais que l'API n'a pas encore renvoyé
   *   les buts, on affiche 0-0 pour permettre au calcul des points de démarrer
   *   dès le début du match.
   * - Les points affichés sont calculés à l'écran uniquement : aucune écriture
   *   dans `predictions.points` n'est faite pendant le direct.
   */
  useEffect(() => {
    let cancelled = false;

    async function refreshLive() {
      const requestId = ++liveSeqRef.current;
      try {
        // Même fetcher que toutes les autres pages (src/lib/liveMatches.ts).
        const apiMatches = await fetchLiveApiMatches();
        if (cancelled || requestId !== liveSeqRef.current) return;

        const next: Record<string, any> = {};

        for (const apiMatch of apiMatches) {
          if (apiMatch?.apiFixtureId == null) continue;

          const key = String(apiMatch.apiFixtureId);
          let reconciled = { ...apiMatch };

          const apiHome = apiMatch.scoreDomicile ?? apiMatch.scoreHome ?? apiMatch.homeScore ?? null;
          const apiAway = apiMatch.scoreExterieur ?? apiMatch.scoreAway ?? apiMatch.awayScore ?? null;
          const apiStatus = String(apiMatch.statut ?? apiMatch.status ?? "SCHEDULED").toUpperCase();

          // Ne jamais faire régresser un score déjà reçu.
          // Un retour temporaire de l'API vers 0-0/null, ou une réponse partielle,
          // ne doit pas annuler un 1-1 déjà affiché.
          try {
            const cacheKey = `${LIVE_SCORE_CACHE_PREFIX}${key}`;
            const cachedRaw = sessionStorage.getItem(cacheKey);
            const cached = cachedRaw ? JSON.parse(cachedRaw) : null;

            const hasApiScore =
              apiHome != null &&
              apiAway != null &&
              Number.isFinite(Number(apiHome)) &&
              Number.isFinite(Number(apiAway));

            if (hasApiScore) {
              const incomingHome = Number(apiHome);
              const incomingAway = Number(apiAway);
              const cachedHome =
                cached?.home_score != null ? Number(cached.home_score) : null;
              const cachedAway =
                cached?.away_score != null ? Number(cached.away_score) : null;

              // Le score d'un match de football ne régresse pas :
              // on conserve le plus récent score connu si l'API renvoie
              // temporairement une valeur inférieure.
              const acceptIncoming =
                cachedHome == null ||
                cachedAway == null ||
                incomingHome > cachedHome ||
                incomingAway > cachedAway ||
                (incomingHome === cachedHome && incomingAway === cachedAway);

              if (acceptIncoming) {
                reconciled = {
                  ...apiMatch,
                  scoreDomicile: incomingHome,
                  scoreExterieur: incomingAway,
                  statut: apiStatus,
                };
              } else {
                reconciled = {
                  ...apiMatch,
                  scoreDomicile: cachedHome,
                  scoreExterieur: cachedAway,
                  statut: cached.status ?? apiStatus,
                };
              }

              sessionStorage.setItem(
                cacheKey,
                JSON.stringify({
                  home_score:
                    reconciled.scoreDomicile != null
                      ? Number(reconciled.scoreDomicile)
                      : null,
                  away_score:
                    reconciled.scoreExterieur != null
                      ? Number(reconciled.scoreExterieur)
                      : null,
                  status: reconciled.statut ?? reconciled.status ?? apiStatus,
                  updatedAt: Date.now(),
                }),
              );
            } else if (cached) {
              reconciled = {
                ...apiMatch,
                scoreDomicile:
                  cached.home_score != null ? Number(cached.home_score) : null,
                scoreExterieur:
                  cached.away_score != null ? Number(cached.away_score) : null,
                statut: cached.status ?? apiStatus,
              };
            }
          } catch {
            // sessionStorage indisponible/corrompu : on utilise la réponse API brute.
          }

          next[key] = reconciled;
        }

        // Résilience totale (section "API live") : un match absent de la
        // réponse de CE cycle (API partiellement en panne, championnat
        // temporairement non renvoyé, etc.) garde son dernier score connu
        // au lieu de disparaître de l'affichage.
        for (const match of matchesRef.current) {
          if (match.api_fixture_id == null) continue;
          const key = String(match.api_fixture_id);
          if (next[key]) continue;

          try {
            const cachedRaw = sessionStorage.getItem(`${LIVE_SCORE_CACHE_PREFIX}${key}`);
            const cached = cachedRaw ? JSON.parse(cachedRaw) : null;
            if (!cached) continue;

            next[key] = {
              apiFixtureId: match.api_fixture_id,
              scoreDomicile: cached.home_score,
              scoreExterieur: cached.away_score,
              statut: cached.status ?? match.status ?? "SCHEDULED",
            };
          } catch {
            // Pas de cache exploitable pour ce match.
          }
        }

        if (!cancelled && requestId === liveSeqRef.current) {
          setLiveByFixture(next);
          setLiveTick(Date.now());
        }
      } catch (error) {
        if (cancelled || requestId !== liveSeqRef.current) return;
        console.warn("API live indisponible sur la page Pronos :", error);

        // Même en cas de panne réseau totale, conserver les derniers scores connus.
        const cachedOnly: Record<string, any> = {};
        try {
          for (const match of matchesRef.current) {
            if (match.api_fixture_id == null) continue;
            const raw = sessionStorage.getItem(
              `${LIVE_SCORE_CACHE_PREFIX}${match.api_fixture_id}`,
            );
            if (!raw) continue;
            const cached = JSON.parse(raw);
            cachedOnly[String(match.api_fixture_id)] = {
              apiFixtureId: match.api_fixture_id,
              scoreDomicile: cached.home_score,
              scoreExterieur: cached.away_score,
              statut: cached.status ?? match.status ?? "SCHEDULED",
            };
          }
        } catch {
          // Pas de cache exploitable.
        }

        if (!cancelled && Object.keys(cachedOnly).length > 0) {
          setLiveByFixture(cachedOnly);
          setLiveTick(Date.now());
        }
      }
    }

    void refreshLive();
    // Même cadence que Classement/Accueil/Profil/Stats/Gazette (15s, cf.
    // src/lib/liveMatches.ts) — compromis charge API / fraîcheur live.
    const timer = window.setInterval(refreshLive, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Permet à l'interface de reconnaître immédiatement le passage du coup
  // d'envoi, même entre deux rafraîchissements API.
  useEffect(() => {
    const timer = window.setInterval(() => setLiveTick(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const getLiveApiMatch = (match: MatchRow): any | null => {
    if (match.api_fixture_id == null) return null;
    return liveByFixture[String(match.api_fixture_id)] ?? null;
  };

  const getLiveStatus = (match: MatchRow): string => {
    const live = getLiveApiMatch(match);
    return String(live?.statut ?? live?.status ?? match.status ?? "SCHEDULED").toUpperCase();
  };

  const getLiveScore = (
    match: MatchRow,
  ): { home: number; away: number; status: string; live: boolean; finished: boolean } | null => {
    const live = getLiveApiMatch(match);
    const status = getLiveStatus(match);
    const finished =
      match.finished ||
      FINISHED_STATUSES.has(status);

    if (finished) {
      if (match.home_score == null || match.away_score == null) return null;
      return {
        home: Number(match.home_score),
        away: Number(match.away_score),
        status,
        live: false,
        finished: true,
      };
    }

    const kickoffMs = match.kickoff ? new Date(match.kickoff).getTime() : NaN;
    const kickoffStarted = Number.isFinite(kickoffMs) && liveTick >= kickoffMs;
    const apiLive = IN_PROGRESS_STATUSES.has(status);

    if (!apiLive && !kickoffStarted) return null;

    const apiHome =
      live?.scoreDomicile ??
      live?.scoreHome ??
      live?.homeScore ??
      null;
    const apiAway =
      live?.scoreExterieur ??
      live?.scoreAway ??
      live?.awayScore ??
      null;

    const home =
      apiHome == null
        ? match.home_score == null
          ? 0
          : Number(match.home_score)
        : Number(apiHome);
    const away =
      apiAway == null
        ? match.away_score == null
          ? 0
          : Number(match.away_score)
        : Number(apiAway);

    return {
      home: Number.isFinite(home) ? home : 0,
      away: Number.isFinite(away) ? away : 0,
      status,
      live: true,
      finished: false,
    };
  };

  const getLivePoints = (
    match: MatchRow,
    pick: Pick | undefined,
    predictionHome?: string,
    predictionAway?: string,
    exactPoints = 2,
    resultPoints = 1,
  ): number | null => {
    const current = getLiveScore(match);
    if (!current) return null;

    const realResult = derivePick(current.home, current.away);

    if (predictionHome != null || predictionAway != null) {
      if (
        predictionHome == null ||
        predictionAway == null ||
        predictionHome === "" ||
        predictionAway === ""
      ) {
        return 0;
      }

      const ph = Number(predictionHome);
      const pa = Number(predictionAway);
      if (!Number.isFinite(ph) || !Number.isFinite(pa)) return 0;

      if (ph === current.home && pa === current.away) return exactPoints;
      return derivePick(ph, pa) === realResult ? resultPoints : 0;
    }

    if (!pick) return 0;
    return pick === realResult ? 1 : 0;
  };

  const liveLabel = (match: MatchRow): string | null => {
    const current = getLiveScore(match);
    if (!current) return null;
    if (current.finished) return null;
    if (current.status === "PAUSED" || current.status === "HT" || current.status === "HALFTIME") {
      return "MI-TEMPS";
    }
    return "LIVE";
  };

  useEffect(() => {
    const timer = window.setInterval(() => setLockTick((v) => v + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const sortedMatchdays = useMemo(
    () => [...matchdays].sort((a, b) => a.number - b.number),
    [matchdays],
  );

  // Présélectionne la journée en cours (la première qui contient un match pas
  // encore terminé), une seule fois au chargement — même logique que le
  // filtre par journée côté admin (src/routes/admin.tsx). Le joueur reste
  // ensuite libre de naviguer vers une autre journée.
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (sortedMatchdays.length === 0) return;

    const savedDayId = window.localStorage.getItem("prono_ligue1_lm_selected_matchday");
    if (savedDayId && sortedMatchdays.some((md) => md.id === savedDayId)) {
      autoSelectedRef.current = true;
      setSelectedMatchdayId(savedDayId);
      return;
    }

    autoSelectedRef.current = true;
    const current = sortedMatchdays.find((md) =>
      matches.some((m) => m.matchday_id === md.id && !m.finished),
    );
    setSelectedMatchdayId(current?.id ?? sortedMatchdays[0].id);
  }, [sortedMatchdays, matches]);

  useEffect(() => {
    if (selectedMatchdayId) {
      window.localStorage.setItem(
        "prono_ligue1_lm_selected_matchday",
        selectedMatchdayId,
      );
    }
  }, [selectedMatchdayId]);

  // Le flag "journée validée" ne doit valoir que pour la journée sur
  // laquelle le joueur vient de cliquer « Valider » — en changer réinitialise
  // le CTA plutôt que d'afficher à tort "Journée validée" sur une autre
  // journée pas encore enregistrée.
  useEffect(() => {
    setSaved(false);
    setJustSaved(false);
    setAutosaveStatus("idle");
    setAutosaveErrorMessage(null);
  }, [selectedMatchdayId]);

  const matchesForDay = useMemo(
    () => matches.filter((m) => m.matchday_id === selectedMatchdayId),
    [matches, selectedMatchdayId],
  );

  // Séparation stricte des deux types de pronostic : le(s) match(s) du club
  // de cœur ne doivent JAMAIS apparaître dans la liste 1N2 — ils ont leur
  // propre formulaire "score exact" dans le bloc dédié ci-dessous.
  const mainMatches = useMemo(
    () =>
      matchesForDay.filter(
        (m) =>
          !(
            favoriteTeamId &&
            (m.home_team_id === favoriteTeamId || m.away_team_id === favoriteTeamId)
          ),
      ),
    [matchesForDay, favoriteTeamId],
  );
  const coeurMatchesForDay = useMemo(
    () =>
      matchesForDay.filter(
        (m) =>
          !!favoriteTeamId &&
          (m.home_team_id === favoriteTeamId || m.away_team_id === favoriteTeamId),
      ),
    [matchesForDay, favoriteTeamId],
  );

  const selectedMatchday = sortedMatchdays.find((md) => md.id === selectedMatchdayId) ?? null;

  const bonusByCompetition = useMemo(() => {
    const map = new Map<BonusCompetitionCode, { option: BonusOptionRow; match: MatchRow }>();
    if (!selectedMatchdayId) return map;

    // Le filtrage "actif" se fait déjà côté requête (.eq("is_active", true)),
    // donc toute ligne qui arrive ici pour cette journée est valide.
    for (const row of bonusOptions.filter((item) => item.matchday_id === selectedMatchdayId)) {
      const code = normalizeBonusCompetition(row.competition_code ?? row.league_code ?? row.competition);
      const matchId = row.match_id;
      if (!code || !matchId) continue;

      const match = matches.find((item) => item.id === matchId);
      if (match) map.set(code, { option: row, match });
    }
    return map;
  }, [bonusOptions, matches, selectedMatchdayId]);

  const bonusCandidates = useMemo(
    () => (["PL", "PD", "SA", "BL1"] as BonusCompetitionCode[])
      .map((code) => {
        const item = bonusByCompetition.get(code);
        if (!item) return null;
        // Clubs étrangers (PL/PD/SA/BL1) : absents de `teams` (Ligue 1
        // uniquement), donc home_team_id/away_team_id sont null en base —
        // teamOf/teamsById ne peut pas les résoudre. On repart du nom texte
        // déjà correct (matches.home_team/away_team) et on résout le logo
        // via resolveBonusClubLogo (public/logos/<Ligue>/), pas via `teams`.
        const homeName = item.match.home_team ?? "Équipe à venir";
        const awayName = item.match.away_team ?? "Équipe à venir";
        return {
          code,
          ...item,
          home: { name: homeName, logo_url: resolveBonusClubLogo(homeName, code) },
          away: { name: awayName, logo_url: resolveBonusClubLogo(awayName, code) },
        };
      })
      .filter(Boolean) as Array<{
        code: BonusCompetitionCode;
        option: BonusOptionRow;
        match: MatchRow;
        home: { name: string; logo_url: string | null };
        away: { name: string; logo_url: string | null };
      }>,
    [bonusByCompetition],
  );


  useEffect(() => {
    let cancelled = false;

    async function loadBonusChoiceStats() {
      if (!selectedMatchdayId || bonusCandidates.length === 0) {
        setBonusChoiceCounts({});
        setBonusChoiceTotal(0);
        return;
      }

      const bonusMatchIds = bonusCandidates.map((candidate) => candidate.match.id);

      try {
        const { data: players, error: playersError } = await supabase
          .from("profiles")
          .select("id");

        if (playersError) throw playersError;

        const { data: predictions, error: predictionsError } = await supabase
          .from("predictions")
          .select("user_id, match_id")
          .in("match_id", bonusMatchIds);

        if (predictionsError) throw predictionsError;

        if (cancelled) return;

        const counts: Record<string, number> = {};
        for (const matchId of bonusMatchIds) {
          counts[matchId] = 0;
        }

        const counted = new Set<string>();

        for (const prediction of predictions ?? []) {
          if (!prediction.user_id || !prediction.match_id) continue;

          const key = `${prediction.user_id}:${prediction.match_id}`;
          if (counted.has(key)) continue;

          counted.add(key);
          counts[prediction.match_id] =
            (counts[prediction.match_id] ?? 0) + 1;
        }

        setBonusChoiceCounts(counts);
        setBonusChoiceTotal(players?.length ?? 0);
      } catch (error) {
        console.error("Erreur chargement statistiques bonus :", error);

        if (!cancelled) {
          setBonusChoiceCounts({});
          setBonusChoiceTotal(0);
        }
      }
    }

    void loadBonusChoiceStats();

    return () => {
      cancelled = true;
    };
  }, [selectedMatchdayId, bonusCandidates]);

  const selectedBonusCandidate =
    bonusCandidates.find((candidate) => candidate.match.id === bonusSelection) ?? null;

  // BUG corrigé ici (cause du "⚠ Échec de l'enregistrement" systématique sur
  // le bonus) : juste après avoir choisi un nouveau match bonus (selectBonusMatch),
  // bonusScores[matchId] n'existe pas encore (aucun score saisi). L'ancienne
  // condition lisait `bonusScores[id]?.home !== ""`, qui vaut `undefined !== ""`
  // → `true` — bonusComplete devenait donc vrai à tort, AVANT toute saisie de
  // score. savePronosticsCore accédait ensuite à `bonusScores[id].home` sur un
  // objet `undefined` → TypeError → l'autosave du bonus échouait à chaque fois
  // qu'on changeait de match. Il faut d'abord vérifier que l'objet score existe.
  const selectedBonusScore = selectedBonusCandidate ? bonusScores[selectedBonusCandidate.match.id] : undefined;
  const bonusComplete = Boolean(
    selectedBonusCandidate &&
      selectedBonusScore &&
      selectedBonusScore.home !== "" &&
      selectedBonusScore.away !== "",
  );

  const filled =
    mainMatches.reduce((acc, m) => acc + (picks[m.id] ? 1 : 0), 0) +
    coeurMatchesForDay.reduce((acc, m) => {
      const s = coeurScores[m.id];
      return acc + (s && s.home !== "" && s.away !== "" ? 1 : 0);
    }, 0) +
    (bonusComplete ? 1 : 0);
  const total = mainMatches.length + coeurMatchesForDay.length + (bonusCandidates.length > 0 ? 1 : 0);
  const progressPct = total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0;
  const allDone = filled === total && total > 0;

  // ============================================================
  // BLOCAGE DES PRONOSTICS
  // - MANUAL : date/heure définie par l'Admin dans matchdays.deadline
  // - AUTO -1 MIN : chaque match est verrouillé 1 minute avant son coup d'envoi
  // Le verrouillage est calculé côté joueur avec les vrais kickoff UTC.
  // ============================================================
  // La règle elle-même vit dans src/lib/predictionDeadline.ts : l'Accueil s'en
  // sert pour annoncer « il te reste N pronos à faire », et doit fermer les
  // matchs exactement au même instant que cette page.
  const getMatchLockDate = (match: MatchRow): Date | null =>
    matchLockDate(match, selectedMatchday);

  const isMatchLocked = (match: MatchRow): boolean =>
    isMatchLockedByDeadline(match, selectedMatchday);

  // FAILLE CORRIGEE — selectBonusMatch ne verifiait que le match VISE :
  //     if (!match || isMatchLocked(match)) return;
  // Rien ne regardait le match DEJA choisi. Un joueur ayant pris
  // Atletico-Villarreal le samedi pouvait donc, le dimanche soir, une fois ce
  // match joue et son resultat connu, basculer sur Bologne-Lazio du lundi :
  // il choisissait son bonus EN CONNAISSANT deja l'issue du premier. Sur un
  // bonus qui vaut jusqu'a 3 points, c'est la partie faussee.
  //
  // Le choix se fige donc des que le match choisi a demarre. Un joueur qui
  // n'a encore rien choisi garde evidemment la main sur les matchs a venir.
  const bonusChoiceLocked = Boolean(
    selectedBonusCandidate && isMatchLocked(selectedBonusCandidate.match),
  );

  const lockLabel = (match: MatchRow): string => {
    if (!isMatchLocked(match)) return "";
    return "🔒 Bloqué";
  };

  // État global « journée verrouillée » pour le CTA de validation : réutilise
  // isMatchLocked (déjà la seule source de vérité du verrouillage, manuel ou
  // auto -1 min) sur tous les matchs concernés par cette journée — matchs
  // 1N2, match(s) du club de cœur et candidats bonus. Verrouillée seulement
  // quand il y a au moins un match ET qu'ils sont tous bloqués.
  const dayRelevantMatches = [
    ...mainMatches,
    ...coeurMatchesForDay,
    ...bonusCandidates.map((c) => c.match),
  ];
  const dayLocked = dayRelevantMatches.length > 0 && dayRelevantMatches.every((m) => isMatchLocked(m));

  // ÉCHÉANCE RÉELLE DU COMPTE À REBOURS "Fin des pronos".
  // Il visait COUNTDOWN_TARGET, une date ecrite en dur dans Countdown.tsx
  // (21 aout 2026) : passee, il affichait 00 00 00 00 pour le restant de la
  // saison. On vise desormais la prochaine fermeture reelle, calculee par
  // getMatchLockDate — la seule source de verite du verrouillage, qui gere
  // deja le mode manuel (matchdays.deadline) et le mode automatique
  // (coup d'envoi moins une minute).
  //
  // C'est le MINIMUM des echeances encore a venir : en mode automatique, les
  // matchs d'une journee se ferment un par un, et ce qui interesse le joueur
  // est le prochain moment ou il ne pourra plus jouer un match.
  // Rien a enregistrer : journee ouverte, tout est rempli, et l'autosave n'a
  // ni tache en cours ni echec a rattraper.
  const nothingToSave =
    !dayLocked && allDone && autosaveStatus !== "saving" && autosaveStatus !== "error";

  const nextLockAt: number | null = (() => {
    const now = Date.now();
    const upcoming = dayRelevantMatches
      .map((m) => getMatchLockDate(m))
      .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
      .map((d) => d.getTime())
      .filter((t) => t > now);

    return upcoming.length > 0 ? Math.min(...upcoming) : null;
  })();

  const pick = (id: string, value: Pick) => {
    const match = matches.find((item) => item.id === id);
    if (!match || isMatchLocked(match)) return;
    userEditedRef.current = true;
    setSaved(false);
    setPicks((prev) => ({ ...prev, [id]: value }));
  };

  const setCoeurValue = (matchId: string, side: "home" | "away", value: string) => {
    const match = matches.find((item) => item.id === matchId);
    if (!match || isMatchLocked(match)) return;
    userEditedRef.current = true;
    setSaved(false);
    setCoeurScores((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] ?? { home: "", away: "" }),
        [side]: value.replace(/[^0-9]/g, "").slice(0, 2),
      },
    }));
  };

  const selectBonusMatch = (matchId: string) => {
    // Le choix deja fait est verrouille : on ne peut plus en changer une fois
    // que le match retenu a demarre (voir bonusChoiceLocked).
    if (bonusChoiceLocked && matchId !== bonusSelection) return;

    const match = matches.find((item) => item.id === matchId);
    if (!match || isMatchLocked(match)) return;
    userEditedRef.current = true;
    setSaved(false);
    setBonusSelection(matchId);
  };

  const setBonusValue = (matchId: string, side: "home" | "away", value: string) => {
    const match = matches.find((item) => item.id === matchId);
    if (!match || isMatchLocked(match)) return;
    userEditedRef.current = true;
    setSaved(false);
    setBonusScores((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] ?? { home: "", away: "" }),
        [side]: value.replace(/[^0-9]/g, "").slice(0, 2),
      },
    }));
  };

  const scroll = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * 180, behavior: "smooth" });
  };

  // ============================================================
  // SAUVEGARDE — cœur unique réutilisé par l'autosave ET par le bouton
  // "Valider" (fallback manuel). Comportement de persistance identique à
  // l'ancien handleSave (mêmes tables, même upsert user_id+match_id, même
  // nettoyage des candidats bonus non retenus, même stockage secondaire) —
  // seule différence : un match verrouillé est silencieusement EXCLU de ce
  // qui est envoyé (au lieu de faire échouer toute la sauvegarde), pour que
  // les autres matchs encore ouverts continuent à s'autosauvegarder même si
  // un match de la même journée vient de se verrouiller.
  const savePronosticsCore = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("Vous devez être connecté pour enregistrer vos pronostics.");

    const isOpen = (matchId: string) => {
      const match = matches.find((item) => item.id === matchId);
      return !!match && !isMatchLocked(match);
    };

    // `predictions` utilise uniquement home_prediction / away_prediction.
    const pickRows = Object.entries(picks)
      .filter(([matchId]) => isOpen(matchId))
      .map(([matchId, pickValue]) => {
        const score = pickToScore(pickValue);
        return {
          user_id: user.id,
          match_id: matchId,
          home_prediction: score.home,
          away_prediction: score.away,
        };
      });

    const coeurRows = Object.entries(coeurScores)
      .filter(([matchId, s]) => isOpen(matchId) && s.home !== "" && s.away !== "")
      .map(([matchId, s]) => ({
        user_id: user.id,
        match_id: matchId,
        home_prediction: Number(s.home),
        away_prediction: Number(s.away),
      }));

    // BONUS — `selectedBonusScore` (défini plus haut, à côté de bonusComplete)
    // est LE score de CE joueur pour LE match bonus actuellement sélectionné.
    // Ne jamais relire `bonusScores[...]` directement ici sans passer par
    // cette variable déjà garantie non-undefined par `bonusComplete`.
    const bonusReady = !!selectedBonusCandidate && bonusComplete && isOpen(selectedBonusCandidate.match.id);
    const bonusRow =
      bonusReady && selectedBonusScore
        ? {
            user_id: user.id,
            match_id: selectedBonusCandidate!.match.id,
            home_prediction: Number(selectedBonusScore.home),
            away_prediction: Number(selectedBonusScore.away),
          }
        : null;

    // SOURCE DE VÉRITÉ : predictions. Deux upserts DISTINCTS (Ligue 1 + club
    // de cœur d'un côté, bonus de l'autre) plutôt qu'un seul appel combiné :
    // une erreur sur le bonus (match encore verrouillé entre-temps, conflit
    // réseau...) ne doit jamais empêcher la sauvegarde des matchs Ligue 1
    // déjà valides, et inversement.
    const l1Rows = [...pickRows, ...coeurRows];
    let l1Error: string | null = null;
    let bonusError: string | null = null;

    if (l1Rows.length > 0) {
      const { error } = await supabase
        .from("predictions")
        .upsert(l1Rows, { onConflict: "user_id, match_id" });
      if (error) l1Error = error.message;
    }

    if (bonusRow) {
      const { error } = await supabase
        .from("predictions")
        .upsert([bonusRow], { onConflict: "user_id, match_id" });

      if (error) {
        bonusError = error.message;
        // Erreur Supabase réelle, jamais masquée par un message générique.
        console.error("Erreur Supabase predictions (bonus) :", {
          match_id: bonusRow.match_id,
          code: (error as { code?: string }).code,
          message: error.message,
          details: (error as { details?: string }).details,
          hint: (error as { hint?: string }).hint,
        });
      } else {
        // Le bonus est sauvegardé : SEULEMENT MAINTENANT on nettoie les 3
        // autres candidats de LA JOURNÉE courante. Ne jamais supprimer
        // l'ancienne sélection avant confirmation que la nouvelle est bien
        // enregistrée (sinon un joueur qui change de bonus pourrait se
        // retrouver sans aucun bonus si l'écriture avait échoué).
        if (selectedMatchdayId) {
          const currentDayBonusIds = bonusOptions
            .filter((option) => option.matchday_id === selectedMatchdayId)
            .map((option) => option.match_id)
            .filter((id): id is string => Boolean(id));

          // DESTRUCTION DE DONNEES CORRIGEE : ce nettoyage supprimait les
          // pronostics des autres candidats SANS regarder si leur match avait
          // deja ete joue. Un joueur basculant de l'Atletico-Villarreal du
          // dimanche (score saisi, match termine) vers le Bologne-Lazio du
          // lundi perdait definitivement sa ligne, score et points compris.
          //
          // On n'efface plus que les candidats dont le match n'a PAS demarre :
          // eux n'ont jamais pu rapporter le moindre point, leur suppression
          // est sans consequence et garde le compteur de repartition juste.
          // Une ligne portant sur un match deja joue est conservee : c'est un
          // resultat acquis, il n'appartient plus a l'interface de l'effacer.
          const otherBonusIds = currentDayBonusIds.filter((id) => {
            if (id === bonusRow.match_id) return false;
            const other = matches.find((item) => item.id === id);
            return !other || !isMatchLocked(other);
          });

          if (otherBonusIds.length > 0) {
            const { error: cleanupError } = await supabase
              .from("predictions")
              .delete()
              .eq("user_id", user.id)
              .in("match_id", otherBonusIds);

            // Le bonus sélectionné est déjà sauvegardé.
            // Un éventuel refus RLS du nettoyage ne doit pas annuler la validation.
            if (cleanupError) {
              console.warn(
                "Bonus enregistré, mais nettoyage des autres candidats impossible :",
                cleanupError.message,
              );
            }
          }
        }
      }
    }

    // Signale aux autres pages (classement notamment) qu'un pronostic vient
    // de changer — mêmes événements que handleReset ci-dessous, jamais
    // émis jusqu'ici par la sauvegarde elle-même. Émis même en cas d'échec
    // partiel : la partie qui a réussi doit quand même se propager.
    window.dispatchEvent(new CustomEvent("pronos-updated"));
    window.dispatchEvent(new CustomEvent("pronos-saved"));

    if (l1Error && bonusError) {
      throw new Error(`Ligue 1 : ${l1Error} · Bonus : ${bonusError}`);
    }
    if (l1Error) throw new Error(`Ligue 1 : ${l1Error}`);
    if (bonusError) throw new Error(`Bonus : ${bonusError}`);
  };

  /** 1ère tentative → échec → retente après 1s → retente après 3s, puis abandonne
   * (3 tentatives max) — la dernière erreur remonte à l'appelant, qui affiche
   * l'indicateur ⚠. La modification reste affichée à l'écran dans tous les cas
   * : seul l'état "enregistré en base" échoue, jamais la saisie visible. */
  const RETRY_DELAYS_MS = [1000, 3000];
  async function saveWithRetry(): Promise<void> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        await savePronosticsCore();
        return;
      } catch (err) {
        lastError = err;
        if (attempt < RETRY_DELAYS_MS.length) {
          await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
      }
    }
    throw lastError;
  }

  /** Point d'entrée unique de la sauvegarde (autosave ET bouton "Valider").
   * Empêche deux sauvegardes concurrentes : si une modification arrive
   * pendant qu'une sauvegarde est déjà en cours, elle est rejouée juste
   * après plutôt que de partir en parallèle. */
  const runAutosave = async () => {
    if (isSavingRef.current) {
      pendingResaveRef.current = true;
      return;
    }
    isSavingRef.current = true;
    setAutosaveStatus("saving");
    try {
      await saveWithRetry();
      setAutosaveStatus("saved");
      setAutosaveErrorMessage(null);
      setSaved(true);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1600);
    } catch (err) {
      console.error("Erreur lors de l'enregistrement automatique des pronos :", err);
      setAutosaveStatus("error");
      setAutosaveErrorMessage(err instanceof Error ? err.message : String(err ?? "Erreur inconnue"));
    } finally {
      isSavingRef.current = false;
      if (pendingResaveRef.current) {
        pendingResaveRef.current = false;
        void runAutosave();
      }
    }
  };

  // Debounce ~400ms : une modification (pick, score, bonus) relance ce délai
  // au lieu d'envoyer une requête à chaque frappe. `userEditedRef` (déjà posé
  // par pick/setCoeurValue/selectBonusMatch/setBonusValue) évite de
  // déclencher une sauvegarde lors de la restauration initiale des données
  // sauvegardées.
  const AUTOSAVE_DEBOUNCE_MS = 400;
  useEffect(() => {
    if (!userEditedRef.current) return;
    setAutosaveStatus((prev) => (prev === "error" ? prev : "saving"));
    const timer = window.setTimeout(() => {
      void runAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, coeurScores, bonusSelection, bonusScores]);

  // Best-effort : si le joueur change d'onglet ou quitte la page pendant que
  // le délai de debounce court encore, on tente de forcer l'envoi tout de
  // suite plutôt que d'attendre les 400ms restantes. Ne bloque jamais la
  // navigation (pas de confirm()/preventDefault) — une requête déjà partie
  // continue normalement en arrière-plan même après le démontage de la page.
  useEffect(() => {
    const flush = () => {
      if (userEditedRef.current && !isSavingRef.current) {
        void runAutosave();
      }
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bouton "Valider" : reste fonctionnel comme méthode de sauvegarde
  // secondaire/de secours (ex. juste après une erreur pour relancer tout de
  // suite sans attendre une nouvelle modification), mais l'autosave ci-dessus
  // n'en dépend plus du tout.
  const handleSave = () => {
    void runAutosave();
  };


  // Suppression réelle en Supabase de la journée actuellement sélectionnée.
  // On ne touche jamais aux autres journées.
  const handleReset = async () => {
    if (dayLocked || !selectedMatchdayId) return;

    // La confirmation annonce desormais ce qui va REELLEMENT etre supprime :
    // les matchs deja joues ne sont plus concernes, le message ne doit donc
    // plus promettre "tous vos pronostics".
    const confirmed = window.confirm(
      `Supprimer vos pronostics encore modifiables de la J${selectedMatchday?.number ?? ""} ?\n\nLes matchs deja commences ne sont pas concernes : leurs pronostics et leurs points sont conserves.`
    );
    if (!confirmed) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("Vous devez être connecté pour supprimer vos pronostics.");
        return;
      }

      const [{ data: dayMatches, error: matchesError }, { data: dayBonus, error: bonusError }] =
        await Promise.all([
          supabase
            .from("matches")
            .select("id")
            .eq("matchday_id", selectedMatchdayId)
            .eq("is_bonus", false),
          supabase
            .from("bonus_options")
            .select("match_id")
            .eq("matchday_id", selectedMatchdayId),
        ]);

      if (matchesError) throw matchesError;
      if (bonusError) throw bonusError;

      // PERTE DE DONNEES CORRIGEE. Ce bouton supprimait TOUS les pronostics de
      // la journee, matchs deja joues compris. Le garde-fou `dayLocked` ne
      // protegeait rien : il exige que TOUS les matchs concernes soient
      // verrouilles, or un seul candidat bonus programme plus tard suffit a le
      // maintenir a faux. Sur une J1 entierement jouee dont le bonus du lundi
      // n'avait pas commence, le bouton restait donc actif et effacait neuf
      // resultats acquis — sans possibilite de les ressaisir, les matchs etant
      // verrouilles.
      //
      // On ne supprime plus que les pronostics dont le match n'a PAS demarre :
      // eux seuls sont encore modifiables, donc eux seuls peuvent legitimement
      // etre effaces. Un resultat acquis n'appartient plus a l'interface.
      const startedIds = new Set(
        matches.filter((m) => isMatchLocked(m)).map((m) => String(m.id)),
      );

      const matchIds = [
        ...(dayMatches ?? []).map((match) => match.id),
        ...(dayBonus ?? []).map((bonus) => bonus.match_id),
      ]
        .filter(Boolean)
        .filter((id) => !startedIds.has(String(id)));

      if (matchIds.length === 0) {
        alert(
          "Aucun pronostic ne peut etre supprime : tous les matchs de cette journee ont deja commence.",
        );
        return;
      }

      if (matchIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("predictions")
          .delete()
          .eq("user_id", user.id)
          .in("match_id", [...new Set(matchIds)]);

        if (deleteError) throw deleteError;
      }

      userEditedRef.current = true;
      setPicks({});
      setCoeurScores({});
      setBonusSelection(null);
      setBonusScores({});
      setSaved(false);

      window.dispatchEvent(new CustomEvent("pronos-updated"));
      window.dispatchEvent(new CustomEvent("pronos-saved"));
    } catch (error: any) {
      console.error("Erreur suppression pronostics :", error);
      alert(`Suppression impossible : ${error?.message ?? String(error)}`);
    }
  };

  const favoriteTeam = favoriteTeamId ? teamOf(teamsById, favoriteTeamId) : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 pb-32">
        {/* ================= EN-TÊTE PREMIUM ================= */}
        <section
          className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-[#060b16] p-6 shadow-[0_0_60px_rgba(0,0,0,0.6)] sm:p-9"
          style={{
            backgroundImage: "url('/prono-hero-bg.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(ellipse 65% 55% at 88% -10%, rgba(16,185,129,0.20), transparent 70%), radial-gradient(ellipse 45% 40% at 10% 110%, rgba(52,211,153,0.10), transparent 70%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-24 h-72 w-[28rem] rotate-[18deg] bg-gradient-to-b from-white/10 via-white/5 to-transparent blur-2xl"
          />

          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                {favoriteTeam ? (
                  <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1">
                    <ClubCrest club={favoriteTeam} size="size-5" />
                    <span className="font-mono text-[10px] text-slate-300">
                      {favoriteTeam.name}
                    </span>
                  </div>
                ) : (
                  <Link
                    to="/profil"
                    className="tap flex items-center gap-2 rounded-full border border-dashed border-slate-700 bg-slate-900/80 px-3 py-1 text-slate-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-400"
                  >
                    <Heart className="size-3.5" />
                    <span className="font-mono text-[10px]">Choisis ton club de cœur</span>
                  </Link>
                )}
              </div>

              {/* TAILLES INVERSEES. "Mes pronostics" occupait jusqu'a 3.6rem
                  alors que la barre de navigation dit deja ou l'on est ; la
                  JOURNEE, seule information qui indique sur QUOI on pronostique,
                  tenait en 14 px sous ce titre geant. Le rapport est inverse :
                  la journee prend la tete, le titre devient un surtitre.
                  Le degrade descendait par ailleurs vers un bleu clair des la
                  moitie des lettres, ce qui delavait le bas du texte. */}
              <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-400/90">
                Mes pronostics
              </p>
              <h1
                className="mt-1 flex items-center gap-2.5 bg-gradient-to-b from-white from-30% via-white via-70% to-[color-mix(in_oklab,var(--sky)_26%,white)] bg-clip-text font-display text-[clamp(1.9rem,5vw,3rem)] font-bold uppercase leading-none tracking-tight text-transparent"
                style={{
                  filter:
                    "drop-shadow(0 1px 0 rgba(0,0,0,.35)) drop-shadow(0 0 20px rgba(22,82,240,.16))",
                }}
              >
                <Trophy className="size-7 shrink-0 text-amber-400 md:size-8" />
                {selectedMatchday
                  ? `Journée ${selectedMatchday.number}`
                  : "Sélectionne une journée"}
              </h1>
            </div>

            <div className="shrink-0 text-right">
              <div className="relative inline-flex size-20 items-center justify-center">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="6"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="url(#progGrad)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - progressPct / 100)}`}
                    className="transition-all duration-500"
                  />
                  <defs>
                    <linearGradient id="progGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#a7f3d0" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="flex flex-col items-center">
                  <span className="font-display text-xl font-black text-white leading-none">
                    {filled}/{total}
                  </span>
                </div>
              </div>
              {/* La legende disait "Pronostics", ce que le "10/10" juste
                  au-dessus indique deja. Elle porte desormais l'etat, et
                  rapproche l'anneau du message d'avancement qui vivait tout
                  en bas du bandeau. */}
              <p
                className={`mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                  allDone ? "text-emerald-400" : "text-slate-400"
                }`}
              >
                {total === 0
                  ? "Pronostics"
                  : allDone
                    ? "Complet"
                    : `${total - filled} à remplir`}
              </p>
              {/* Le bouton "Valider" qui vivait ici a été retiré : l'action
                  de validation a désormais un unique emplacement, bien plus
                  visible, juste après le sélecteur de journée (voir le
                  nouveau "BLOC VALIDATION" ci-dessous) — deux boutons
                  "Valider" à quelques centimètres l'un de l'autre n'apportait
                  rien. Ce badge redevient un simple indicateur de statut,
                  la seule occurrence de "X/10" dans le header. */}
            </div>
          </div>

          {/* ================= COMPTE À REBOURS — un seul bloc ================= */}
          {nextLockAt !== null && !dayLocked && (
            <div className="relative z-10 mt-6">
              <div className="mb-3 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                <Clock className="size-3.5 text-emerald-400" />
                Fin des pronos
              </div>
              {/* auto-fit : la grille se referme proprement quand la carte
                  "JOURS" disparait, au lieu de laisser une case vide. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
                <CountdownBlocksIconic target={nextLockAt} />
              </div>
            </div>
          )}

          {/* Le message etait fixe : "Complète tous tes pronostics avant le
              coup d'envoi" s'affichait aussi quand tout etait deja rempli, ou
              quand la journee etait fermee. Il dit maintenant ou en est le
              joueur. */}
          <div className="relative z-10 mt-6 flex items-center gap-2 rounded-2xl border border-slate-800 bg-white/[0.02] px-4 py-2.5">
            <Sparkles className="size-3.5 shrink-0 text-emerald-400" />
            <p className="text-xs text-slate-400">
              {dayLocked
                ? "Les pronostics de cette journée sont clos. Rendez-vous au classement."
                : allDone
                  ? "Tous tes pronostics sont enregistrés. Tu peux encore les modifier jusqu'à la fermeture."
                  : `Il te reste ${total - filled} prono${total - filled > 1 ? "s" : ""} à remplir.`}
            </p>
          </div>
        </section>

        {/* ================= SÉLECTEUR DE JOURNÉE - EA SPORTS HUD ================= */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-800/80 p-4 shadow-[0_15px_50px_rgba(0,0,0,0.6)] sm:p-5">
          <div
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              backgroundImage: "url('/bg-journee.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              transform: "scale(1.04)",
            }}
          />
          <div className="pointer-events-none absolute inset-0 z-0 bg-[#030712]/50" />
          <p className="relative z-10 mb-3 font-mono text-[10px] font-bold tracking-[0.18em] text-slate-300">
            SÉLECTIONNE TA JOURNÉE
          </p>

          {sortedMatchdays.length === 0 ? (
            <p className="relative z-10 font-mono text-xs text-slate-500">
              {dataLoading
                ? "Chargement des journées…"
                : "Aucune journée synchronisée pour l'instant."}
            </p>
          ) : (
            <div className="relative z-10 flex items-center gap-2">
              <button
                onClick={() => scroll(-1)}
                className="tap grid size-9 shrink-0 place-items-center rounded-full border border-slate-700/50 bg-[#060b16]/60 text-slate-400 backdrop-blur-md transition-colors hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-[#060b16]/80"
                aria-label="Journées précédentes"
              >
                <ChevronLeft className="size-4" />
              </button>
              <div
                ref={scrollerRef}
                // min-w-0 : sans ça, un enfant flex-1 garde son min-width
                // "auto" par défaut et refuse de rétrécir sous la largeur de
                // son contenu — overflow-x-auto ne s'active donc jamais, et
                // les ~34 boutons de journée poussent toute la page en
                // largeur au lieu de défiler dans leur propre bandeau (bug
                // réel confirmé : jusqu'à 680px de débordement horizontal
                // mesuré à 360px de large).
                className="flex min-w-0 flex-1 gap-3 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative py-2"
              >
                {sortedMatchdays.map((md) => {
                  const active = md.id === selectedMatchdayId;
                  return (
                    <button
                      key={md.id}
                      onClick={() => setSelectedMatchdayId(md.id)}
                      className={`tap relative flex shrink-0 flex-col items-center gap-1 rounded-2xl border px-5 py-3 transition-all duration-300 backdrop-blur-md ${
                        active
                          ? "border-emerald-400/80 bg-emerald-950/40 shadow-[0_0_20px_rgba(16,185,129,0.3)] scale-105 z-10"
                          : "border-slate-800/60 bg-[#060b16]/40 hover:border-slate-600 hover:bg-[#060b16]/60"
                      }`}
                    >
                      {active && (
                        <div className="absolute inset-0 -z-10 rounded-2xl bg-emerald-500/25 blur-xl pointer-events-none" />
                      )}
                      <span
                        className={`font-display text-xl font-bold leading-none transition-colors ${
                          active ? "text-emerald-400" : "text-slate-300"
                        }`}
                      >
                        {matchdayCode(md)}
                      </span>
                      <span
                        className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-wider transition-colors ${
                          active ? "text-emerald-200" : "text-slate-500"
                        }`}
                      >
                        {matchdayRangeLabel(md.id, matches)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => scroll(1)}
                className="tap grid size-9 shrink-0 place-items-center rounded-full border border-slate-700/50 bg-[#060b16]/60 text-slate-400 backdrop-blur-md transition-colors hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-[#060b16]/80"
                aria-label="Journées suivantes"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </section>

        {/* ================= BLOC VALIDATION =================
            Unique emplacement pour valider/réinitialiser la journée —
            juste après le sélecteur, avant les matchs. Remplace l'ancienne
            barre d'action flottante (qui dupliquait "X/Y pronostics" avec
            sa propre barre de progression) : cette info n'existe plus
            qu'ici et dans le badge du header ci-dessus. */}
        <section
          className={`relative overflow-hidden rounded-3xl border p-5 shadow-[0_15px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-colors duration-500 sm:p-6 ${
            !dayLocked && allDone ? "border-emerald-400/40 bg-emerald-500/[0.07]" : "border-slate-800 bg-[#0d1322]/70"
          }`}
        >
          <style>{`
            @keyframes validate-pulse {
              0% { box-shadow: 0 0 0 rgba(16,185,129,0.55); }
              35% { box-shadow: 0 0 45px rgba(16,185,129,0.6); }
              100% { box-shadow: 0 0 25px rgba(16,185,129,0.35); }
            }
            .animate-validate-pulse { animation: validate-pulse 1.6s ease-out; }
          `}</style>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border ${
                  !dayLocked && allDone
                    ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-400"
                    : "border-slate-700 bg-slate-800/60 text-slate-300"
                }`}
              >
                {dayLocked ? <Lock className="size-4" /> : <Check className="size-4" />}
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold uppercase tracking-wide text-white sm:text-base">
                  {dayLocked ? "Journée verrouillée" : `Tu as ${filled}/${total} pronostics`}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  {/* "Sauvegarde automatique activée — rien à valider" doublait
                      le libelle du bouton et la legende de l'anneau. La mention
                      n'apparait plus que tant qu'il reste quelque chose a
                      enregistrer, la ou elle rassure vraiment. */}
                  <p className="text-xs text-slate-400">
                    {dayLocked
                      ? "Les pronostics ne sont plus modifiables."
                      : nothingToSave
                        ? "Tu peux encore les modifier jusqu'à la fermeture."
                        : "Sauvegarde automatique activée — rien à valider."}
                  </p>
                  {/* Indicateur discret de sauvegarde — voir runAutosave/
                      autosaveStatus. Pas de popup, juste ce petit texte qui
                      change d'état. */}
                  {!dayLocked && autosaveStatus !== "idle" && (
                    <span
                      aria-live="polite"
                      className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider ${
                        autosaveStatus === "error"
                          ? "text-amber-400"
                          : autosaveStatus === "saving"
                            ? "text-slate-400"
                            : "text-emerald-400"
                      }`}
                    >
                      {autosaveStatus === "saving" && (
                        <>
                          <Loader2 className="size-3 animate-spin" /> Enregistrement…
                        </>
                      )}
                      {autosaveStatus === "saved" && (
                        <>
                          <Check className="size-3" /> Enregistré
                        </>
                      )}
                      {autosaveStatus === "error" && (
                        <>
                          <AlertTriangle className="size-3" />
                          {autosaveErrorMessage ? `Échec — ${autosaveErrorMessage}` : "Échec de l'enregistrement"}
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:shrink-0 sm:items-center">
              {/* Le bouton vert plein ne s'affiche QUE s'il y a quelque chose a
                  faire. Quand tout etait deja enregistre, il portait le libelle
                  "Tous les pronostics sont enregistrés" : un ETAT sur un bouton
                  d'action, en vert plein, qui invitait a cliquer sans que le
                  joueur sache ce qu'il declencherait. L'etat passe en simple
                  mention a cote, et le bouton disparait. */}
              {nothingToSave ? (
                <span className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-5 py-3 font-display text-sm font-bold text-emerald-300">
                  <Check className="size-4" />
                  Tout est enregistré
                </span>
              ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={dayLocked || autosaveStatus === "saving"}
                aria-live="polite"
                className={`tap flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 font-display text-sm font-bold uppercase tracking-wide transition-all duration-300 ${
                  dayLocked
                    ? "cursor-not-allowed border border-slate-700 bg-slate-800/70 text-slate-400"
                    : autosaveStatus === "error"
                      ? "bg-amber-400 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:bg-amber-500"
                      : `bg-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-80 ${
                          justSaved ? "animate-validate-pulse" : ""
                        }`
                }`}
              >
                {dayLocked ? (
                  <Lock className="size-4" />
                ) : autosaveStatus === "saving" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : autosaveStatus === "error" ? (
                  <AlertTriangle className="size-4" />
                ) : allDone ? (
                  <Check className="size-4" />
                ) : (
                  <Save className="size-4" />
                )}
                {/* Le "✓" en tete de libelle faisait DOUBLON avec l'icone
                    <Check /> juste au-dessus : le bouton affichait deux
                    coches a la suite. */}
                {dayLocked
                  ? "Verrouillée"
                  : autosaveStatus === "saving"
                    ? "Enregistrement…"
                    : autosaveStatus === "error"
                      ? "Réessayer"
                      : "Enregistrer maintenant"}
              </button>
              )}

              {/* Supprime réellement les pronostics de la journée sélectionnée
                  dans Supabase, sans toucher aux autres journées. */}
              <button
                type="button"
                onClick={handleReset}
                disabled={dayLocked}
                className={`tap flex items-center justify-center gap-2 rounded-2xl border px-5 py-3.5 font-display text-sm font-bold transition-all ${
                  dayLocked
                    ? "cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-600"
                    : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-red-500/40 hover:text-red-400"
                }`}
              >
                <RotateCcw className="size-4" />
                Supprimer
              </button>
            </div>
          </div>
        </section>

        {/* ================= CONTENU PRINCIPAL ================= */}
        <div className="space-y-8">
          {/* ================= MATCHS 1N2 LIGUE 1 - INTERFACE BROADCAST / EA SPORTS ================= */}
          <section className="relative overflow-hidden rounded-[28px] border border-emerald-500/20 bg-[#050A14] shadow-[0_40px_80px_rgba(0,0,0,0.9)] p-4 sm:p-8">
            <style>{`
              .hud-dots {
                background-image: radial-gradient(circle, #34d399 1px, transparent 1px);
                background-size: 24px 24px;
                mask-image: radial-gradient(ellipse at center, transparent 40%, black 100%);
                -webkit-mask-image: radial-gradient(ellipse at center, transparent 40%, black 100%);
              }
            `}</style>

            <div
              aria-hidden
              className="absolute inset-0 z-0 pointer-events-none bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: "url('/images/fond-bloc-matchs.png')" }}
            />
            <div aria-hidden className="absolute inset-0 z-0 pointer-events-none bg-black/45" />

            <div className="absolute inset-0 z-0 pointer-events-none hud-dots opacity-25" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-64 bg-emerald-400/10 blur-[120px] pointer-events-none z-0" />
            <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-transparent via-[#050A14]/70 to-[#050A14]" />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-emerald-500/15 pb-5">
              <div className="flex items-center gap-4">
                <div className="size-12 md:size-14 shrink-0 rounded-2xl bg-[#081221] border border-emerald-500/20 p-2 flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.15)] overflow-hidden">
                  {!logoFailed ? (
                    <img
                      src="/logo ligue 1.png"
                      alt="Ligue 1"
                      className="size-full object-contain"
                      onError={() => setLogoFailed(true)}
                    />
                  ) : (
                    <span className="font-display font-black text-white text-sm">L1</span>
                  )}
                </div>
                <div>
                  <h2 className="font-display text-2xl md:text-3xl font-bold tracking-wide text-white drop-shadow-md">
                    Ligue 1 McDonald's
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[11px] text-emerald-400 uppercase tracking-widest font-bold">
                      {selectedMatchday ? matchdayCode(selectedMatchday) : "Journée"}
                    </span>
                    <span className="text-[#E7B542]">•</span>
                    <span className="font-mono text-[11px] text-slate-300 uppercase tracking-widest">
                      Saison 2026-2027
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Deux lignes plutôt qu'une seule ligne longue — évite tout
                    débordement sur petit mobile (voir contrainte responsive). */}
                <div className="flex flex-col gap-0.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
                  <span className="font-mono text-[11px] font-bold text-emerald-300">
                    1 PT · RÉSULTAT CORRECT
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-400">
                    0 PT · RÉSULTAT INCORRECT
                  </span>
                </div>
                <div className="text-right pl-3 border-l border-emerald-500/25">
                  <div className="font-mono text-[11px] text-slate-400 uppercase tracking-widest">
                    Pronos
                  </div>
                  <div className="font-display text-2xl text-[#17F1A7] font-bold">
                    {filled} <span className="text-slate-500 font-normal">/</span>{" "}
                    <span className="text-slate-300">{total}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex flex-col gap-3">
              {dataLoading && (
                <p className="py-8 text-center font-mono text-xs text-slate-500">
                  Chargement des matchs…
                </p>
              )}

              {!dataLoading && loadError && (
                <p className="py-8 text-center font-mono text-xs text-red-400">{loadError}</p>
              )}

              {!dataLoading && !loadError && mainMatches.length === 0 && (
                <p className="py-8 text-center font-mono text-xs text-slate-500">
                  {coeurMatchesForDay.length > 0
                    ? "Le seul match de cette journée est celui de ton club de cœur, juste en dessous 👇"
                    : "Aucun match programmé pour cette journée."}
                </p>
              )}

              {!dataLoading &&
                !loadError &&
                mainMatches.map((match, matchIndex) => {
                  const home = teamOf(teamsById, match.home_team_id);
                  const away = teamOf(teamsById, match.away_team_id);
                  const current = picks[match.id];
                  const { dayName, dayDate, time } = formatKickoff(match.kickoff);

                  // La colonne de gauche repetait "SAM 29 AOÛT" sur quatre
                  // lignes d'affilee. Le jour passe en intertitre, la ligne ne
                  // garde que l'heure — la seule chose qui change d'un match a
                  // l'autre au sein d'une meme journee.
                  const previous = matchIndex > 0 ? mainMatches[matchIndex - 1] : null;
                  const previousDay = previous ? formatKickoff(previous.kickoff) : null;
                  const newDay =
                    !previousDay ||
                    previousDay.dayName !== dayName ||
                    previousDay.dayDate !== dayDate;

                  return (
                    <Fragment key={match.id}>
                    {newDay && (
                      <div className="relative z-10 flex items-center gap-3 pt-2">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-400/90">
                          {dayName} {dayDate}
                        </span>
                        <span className="h-px flex-1 bg-white/[.07]" />
                      </div>
                    )}
                    <div className="relative group z-10">
                      <div className="relative overflow-hidden rounded-[20px] bg-white/[0.02] backdrop-blur-xl border border-white/5 p-4 transition-all duration-500 hover:-translate-y-1 hover:bg-[#081221]/80 hover:border-emerald-400/50 hover:shadow-[0_15px_40px_rgba(52,211,153,0.15)]">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="flex w-[56px] shrink-0 flex-col items-center justify-center border-r border-emerald-500/25 pr-4">
                            <span className="font-mono text-sm font-black text-emerald-400">
                              {time}
                            </span>
                          </div>

                          <div className="flex flex-1 items-center gap-4 min-w-0 justify-start">
                            <div className="relative size-12 shrink-0 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                              <ClubCrest
                                club={home}
                                size="size-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]"
                              />
                            </div>
                            {/* Le nom de l'equipe choisie s'allume : le joueur
                                voit son pronostic sans avoir a traduire 1/N/2.
                                Un nul laisse les deux noms au blanc. */}
                            <b
                              className={`truncate font-display text-base font-bold transition-colors md:text-lg ${
                                current === "1" ? "text-emerald-300" : "text-white"
                              }`}
                            >
                              {home.name}
                            </b>
                          </div>

                          <div className="flex shrink-0 flex-col items-center gap-2 mx-auto">
                            {/* Les trois boutons etaient colles au centre : le
                                "1" (victoire a domicile) se retrouvait aussi
                                loin de l'equipe de gauche que le "2". Ils
                                s'ecartent maintenant vers l'equipe qu'ils
                                designent, sans quitter leur pilule commune. */}
                            <div className="flex w-[164px] justify-between rounded-2xl border border-black/50 bg-[#050A14] p-1 shadow-inner">
                              {(["1", "N", "2"] as const).map((k) => (
                                <button
                                  key={k}
                                  type="button"
                                  disabled={isMatchLocked(match)}
                                  onClick={() => pick(match.id, k)}
                                  className={`tap relative grid size-10 place-items-center rounded-xl font-display text-base font-black transition-all duration-300 ${
                                    current === k
                                      ? "bg-gradient-to-t from-[#17F1A7] to-emerald-400 text-[#050A14] shadow-[0_0_15px_rgba(23,241,167,0.4)] scale-105 border-transparent"
                                      : "bg-white/5 text-slate-300 border border-white/20 hover:border-emerald-400/50 hover:text-white hover:shadow-[0_0_15px_rgba(52,211,153,0.2)] active:scale-95"
                                  }`}
                                >
                                  {k}
                                </button>
                              ))}
                            </div>

                            {(() => {
                              const currentScore = getLiveScore(match);
                              const isLive = Boolean(currentScore?.live);
                              const points = isLive
                                ? getLivePoints(match, current)
                                : getMainMatchPoints(match, current);

                              if (!currentScore) return null;

                              return (
                                <div className="flex flex-col items-center gap-1 font-mono text-[10px] font-black uppercase tracking-wider">
                                  <div className="flex items-center gap-2">
                                    {isLive && (
                                      <span className="rounded-full border border-emerald-400/35 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] text-emerald-300 animate-pulse">
                                        {liveLabel(match)}
                                      </span>
                                    )}
                                    <span className="text-white">
                                      {currentScore.home} — {currentScore.away}
                                    </span>
                                  </div>
                                  <span
                                    className={
                                      points === 1
                                        ? "text-emerald-400"
                                        : points === 0
                                          ? "text-red-400"
                                          : "text-slate-400"
                                    }
                                  >
                                    {points === 1 ? "+1 pt" : "0 pt"}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>

                          {isMatchLocked(match) && (
                            <span className="shrink-0 rounded-full border border-red-500/25 bg-red-500/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-red-300">
                              {lockLabel(match)}
                            </span>
                          )}

                          <div className="flex flex-1 items-center gap-4 min-w-0 justify-end">
                            <b
                              className={`truncate text-right font-display text-base font-bold transition-colors md:text-lg ${
                                current === "2" ? "text-emerald-300" : "text-white"
                              }`}
                            >
                              {away.name}
                            </b>
                            <div className="relative size-12 shrink-0 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                              <ClubCrest
                                club={away}
                                size="size-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    </Fragment>
                  );
                })}
            </div>
          </section>

          {/* ================= ÉQUIPE DE CŒUR - FOND DYNAMIQUE WALLPAPER & CLUB THEME ================= */}
          <section
            className="relative overflow-hidden rounded-[28px] border p-5 sm:p-8 shadow-[0_40px_80px_rgba(0,0,0,0.9)] transition-all duration-500"
            style={{
              borderColor: theme.primary + "40",
              // Overlay allégé : le fond d'écran du club doit rester bien visible.
              // La lisibilité du texte est assurée séparément par le voile
              // gradient ci-dessous (plus fort côté texte, quasi transparent
              // côté visuel) plutôt que par un assombrissement uniforme.
              backgroundImage: `linear-gradient(180deg, rgba(4,9,19,0.35), rgba(8,20,37,0.55)), url('${teamBg}')`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {/* Image cachée servant uniquement à détecter un fond d'écran manquant
                (404) et à retomber sur /stadium-bg.jpg — même mécanisme que la carte
                profil de la page d'accueil (src/routes/index.tsx), via useTeamTheme. */}
            {theme.id !== "default" && !teamBgFailed && (
              <img src={theme.background} alt="" className="hidden" onError={handleTeamBgError} />
            )}

            <style>{`
              @keyframes light-sweep {
                0% { transform: translateX(-100%) skewX(-20deg); }
                20% { transform: translateX(200%) skewX(-20deg); }
                100% { transform: translateX(200%) skewX(-20deg); }
              }
              .animate-light-sweep {
                animation: light-sweep 12s infinite ease-in-out;
              }
            `}</style>

            <div className="absolute inset-0 z-0 pointer-events-none opacity-5 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px]" />
            <div
              className="absolute top-0 left-0 w-48 h-48 blur-[80px] pointer-events-none z-0"
              style={{ backgroundColor: theme.glow }}
            />
            <div
              className="absolute bottom-0 right-0 w-48 h-48 blur-[80px] pointer-events-none z-0"
              style={{ backgroundColor: withAlpha(theme.secondary, 0.15) }}
            />

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none z-0">
              <div className="font-display font-black text-[25rem] text-white opacity-[0.03] tracking-tighter mix-blend-screen">
                1
              </div>
            </div>

            <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
              <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent animate-light-sweep" />
            </div>

            {/* Voile de lisibilité : appuyé côté texte (zone gauche), quasi
                transparent côté visuel (zone droite) — le fond d'écran du club
                reste visible là où il n'y a pas de texte à protéger. */}
            <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-[#050b16]/85 via-[#050b16]/35 to-transparent lg:to-40%" />
            {/* Léger voile bas pour les noms d'équipe sous les blasons (zone droite). */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[#050b16]/60 to-transparent" />

            {favoriteTeam && coeurMatchesForDay.length > 0 ? (
              <div className="relative z-20 grid grid-cols-1 lg:grid-cols-[35%_65%] gap-6 items-center">
                {/* ZONE GAUCHE (35%) : Infos club de cœur */}
                <div className="flex flex-col justify-between space-y-4 lg:border-r lg:border-white/10 lg:pr-6 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                  {/* Le blason apparaissait TROIS fois dans le meme bloc : ici,
                      dans la confrontation a droite, et en geant dans le fond
                      d'ecran. Celui-ci etait le seul a ne rien apprendre — le
                      titre juste a cote nomme deja le club. Une barre aux
                      couleurs de l'equipe le remplace. */}
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="h-11 w-1.5 shrink-0 rounded-full"
                      style={{ background: theme.gradient }}
                    />
                    <div className="min-w-0">
                      <span
                        className="font-mono text-[10px] uppercase tracking-widest font-bold block"
                        style={{ color: theme.primary }}
                      >
                        ❤️ Mon équipe de cœur
                      </span>
                      <h3 className="font-display text-2xl md:text-3xl text-white uppercase tracking-wide font-black mt-0.5">
                        {favoriteTeam.name}
                      </h3>
                    </div>
                  </div>

                  <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-1" />

                  {/* "1 match" n'apprenait rien : le club de coeur joue une
                      fois par journee, la valeur ne changera jamais. Remplace
                      par domicile/exterieur, qui dit dans quel ordre lire la
                      confrontation et compte vraiment pour pronostiquer.

                      Le bouton "Calendrier" qui vivait ici a ete retire : il
                      n'avait AUCUN onClick. Style, survol, ombre portee — mais
                      cliquer dessus ne declenchait rien. C'etait l'element le
                      plus voyant du bloc, devant les cases de score qui sont
                      l'action reelle. */}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold uppercase tracking-wide text-slate-200">
                      Journée {selectedMatchday?.number ?? "—"}
                    </span>
                    {(() => {
                      const coeurMatch = coeurMatchesForDay[0];
                      if (!coeurMatch || !favoriteTeamId) return null;
                      const atHome = String(coeurMatch.home_team_id) === String(favoriteTeamId);
                      return (
                        <>
                          <span className="text-slate-600">·</span>
                          <span
                            className="rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
                            style={{
                              borderColor: withAlpha(theme.primary, 0.4),
                              color: theme.primary,
                            }}
                          >
                            {atHome ? "À domicile" : "À l'extérieur"}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* ZONE DROITE (65%) : le(s) match(s) du club de cœur — un
                    formulaire "score exact" par match (normalement un seul
                    par journée, mais rien n'empêche d'en gérer plusieurs). */}
                <div className="flex flex-col items-center justify-center gap-6 lg:pl-4 w-full">
                  {coeurMatchesForDay.map((match) => {
                    const home = teamOf(teamsById, match.home_team_id);
                    const away = teamOf(teamsById, match.away_team_id);
                    const score = coeurScores[match.id] ?? { home: "", away: "" };
                    const { dayName, dayDate, time } = formatKickoff(match.kickoff);

                    return (
                      <div key={match.id} className="flex w-full flex-col items-center gap-3">
                        {/* La date etait en text-slate-400, pose a nu sur le
                            fond d'ecran du club : sur l'artwork rouge de Lens,
                            elle en devenait illisible. Elle repose desormais
                            sur sa propre pastille sombre, ce qui la rend
                            lisible quel que soit le club choisi. */}
                        <span className="rounded-full border border-white/10 bg-black/55 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-200 backdrop-blur-sm">
                          {dayName} {dayDate} • {time}
                        </span>

                        <div className="flex items-center justify-between w-full max-w-md gap-4">
                          {/* Équipe Domicile (90px) */}
                          <div className="flex flex-col items-center flex-1 text-center group">
                            <div className="relative size-20 md:size-[90px] flex items-center justify-center group-hover:scale-105 transition-all duration-300">
                              <ClubCrest
                                club={home}
                                size="size-full drop-shadow-[0_8px_20px_rgba(0,0,0,0.9)]"
                              />
                            </div>
                            <span className="font-display text-sm md:text-base font-bold text-white mt-2.5 truncate w-full drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                              {home.name}
                            </span>
                          </div>

                          {/* Bloc VS & Cases de Score.
                              Les deux cases tombaient au milieu de la partie la
                              plus chargee du fond d'ecran (le blason geant),
                              avec un "VS" gris a peine visible entre elles.
                              Elles reposent maintenant sur un panneau sombre :
                              l'action principale du bloc se detache du decor. */}
                          <div className="flex shrink-0 flex-col items-center space-y-2 rounded-2xl border border-white/[.07] bg-black/45 px-3 py-2.5 backdrop-blur-sm">
                            <div className="flex items-center gap-2">
                              <input
                                inputMode="numeric"
                                aria-label={`Score ${home.name}`}
                                value={score.home}
                                onChange={(e) => setCoeurValue(match.id, "home", e.target.value)}
                                placeholder="-"
                                className="size-14 md:size-16 rounded-2xl border border-emerald-500/20 bg-[#050913]/90 text-center font-display text-2xl md:text-3xl font-black text-white outline-none transition-all duration-300 shadow-[inset_0_2px_10px_rgba(0,0,0,0.9)] focus:border-[#14F195] focus:shadow-[0_0_20px_rgba(20,241,149,0.4)] focus:scale-105"
                              />
                              <span className="font-display text-xl font-bold text-slate-400">
                                —
                              </span>
                              <input
                                inputMode="numeric"
                                aria-label={`Score ${away.name}`}
                                value={score.away}
                                onChange={(e) => setCoeurValue(match.id, "away", e.target.value)}
                                placeholder="-"
                                className="size-14 md:size-16 rounded-2xl border border-emerald-500/20 bg-[#050913]/90 text-center font-display text-2xl md:text-3xl font-black text-white outline-none transition-all duration-300 shadow-[inset_0_2px_10px_rgba(0,0,0,0.9)] focus:border-[#14F195] focus:shadow-[0_0_20px_rgba(20,241,149,0.4)] focus:scale-105"
                              />
                            </div>
                            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
                              <span>───</span>{" "}
                              <span className="font-bold" style={{ color: theme.primary }}>
                                VS
                              </span>{" "}
                              <span>───</span>
                            </div>

                            {(() => {
                              const currentScore = getLiveScore(match);
                              if (!currentScore) return null;

                              const displayPoints =
                                score.home !== "" && score.away !== ""
                                  ? getLivePoints(
                                      match,
                                      undefined,
                                      score.home,
                                      score.away,
                                      2,
                                      1,
                                    )
                                  : 0;

                              return (
                                <div className="mt-2 flex flex-col items-center leading-none">
                                  <div className="flex items-center gap-2">
                                    {currentScore.live && (
                                      <span className="rounded-full border border-emerald-400/35 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[9px] font-black uppercase text-emerald-300 animate-pulse">
                                        {liveLabel(match)}
                                      </span>
                                    )}
                                    <span className="font-display text-base md:text-lg font-black tracking-wide text-white">
                                      {currentScore.home} — {currentScore.away}
                                    </span>
                                  </div>
                                  <span
                                    className={`mt-1 font-display text-[11px] font-black uppercase tracking-wider ${
                                      displayPoints > 0
                                        ? "text-emerald-300"
                                        : "text-red-300"
                                    }`}
                                  >
                                    {score.home !== "" && score.away !== ""
                                      ? displayPoints > 0
                                        ? `+${displayPoints} PT`
                                        : "0 PT"
                                      : "Prono à saisir"}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Équipe Extérieur (90px) */}
                          <div className="flex flex-col items-center flex-1 text-center group">
                            <div className="relative size-20 md:size-[90px] flex items-center justify-center group-hover:scale-105 transition-all duration-300">
                              <ClubCrest
                                club={away}
                                size="size-full drop-shadow-[0_8px_20px_rgba(0,0,0,0.9)]"
                              />
                            </div>
                            <span className="font-display text-sm md:text-base font-bold text-white mt-2.5 truncate w-full drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                              {away.name}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-[#14F195] tracking-widest uppercase mt-2">
                    <Sparkles size={12} /> Pronostique le score exact
                  </p>
                  {/* Barème de points : même badge pilule que la carte "Matchs bonus"
                    ci-dessous (bordure dorée subtile + fond ambré semi-transparent).
                    Points = toujours or/amber, jamais une autre couleur (cohérence
                    avec le bloc Match bonus juste en dessous). */}
                  <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 mt-2">
                    <span className="font-mono text-[11px] font-bold text-amber-300">
                      SCORE EXACT · 2 PTS
                      <span className="mx-2 text-amber-500">•</span>
                      RÉSULTAT CORRECT · 1 PT
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative z-20 flex flex-col items-center justify-center gap-3 py-10 text-center">
                <Heart className="size-8 text-slate-600" />
                {!favoriteTeam ? (
                  <>
                    <p className="font-display text-lg text-white">
                      Tu n'as pas encore choisi de club de cœur
                    </p>
                    <p className="max-w-sm font-mono text-xs text-slate-400">
                      Choisis ton équipe favorite depuis ton profil pour la retrouver ici et suivre
                      son prochain match.
                    </p>
                    <Link
                      to="/profil"
                      className="tap mt-2 flex items-center gap-2 rounded-xl border px-4 py-2.5 font-display text-xs font-bold transition-all shadow-lg"
                      style={{
                        borderColor: withAlpha(theme.primary, 0.4),
                        backgroundColor: theme.button.background,
                        color: theme.button.text,
                      }}
                    >
                      Choisir mon club
                    </Link>
                  </>
                ) : (
                  <>
                    <ClubCrest club={favoriteTeam} size="size-14" />
                    <p className="font-display text-lg text-white">{favoriteTeam.name}</p>
                    <p className="max-w-sm font-mono text-xs text-slate-400">
                      {favoriteTeam.name} ne joue pas lors de cette journée.
                    </p>
                  </>
                )}
              </div>
            )}
          </section>

          {/* ================= MATCH BONUS ================= */}
          <section className="relative overflow-hidden rounded-[28px] border border-amber-400/20 bg-[#07101d]/90 p-5 shadow-[0_25px_60px_rgba(0,0,0,0.45)] sm:p-8">

  {/* IMAGE DE FOND — plus visible */}
  <div
    aria-hidden
    className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-55"
    style={{ backgroundImage: "url('/match-bonus.png')" }}
  />

  {/* VOILE LÉGER — conserve les logos visibles */}
  <div
    aria-hidden
    className="pointer-events-none absolute inset-0 bg-[#06101d]/25"
  />

  {/* ASSOMBRISSEMENT UNIQUEMENT SUR LES BORDS */}
  <div
    aria-hidden
    className="pointer-events-none absolute inset-0"
    style={{
      background:
        "radial-gradient(circle at 50% 35%, transparent 15%, rgba(4,10,20,0.18) 75%, rgba(4,10,20,0.45) 100%)",
    }}
  />

  <div className="relative z-10">

    {/* ================= HEADER ================= */}
    <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">

      <div className="flex items-center gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-amber-400/30 bg-black/25 text-amber-300 backdrop-blur-sm">
          <Flame className="size-5" />
        </div>

        <div>
          <h2 className="font-display text-2xl font-black uppercase tracking-wide text-white drop-shadow-lg">
            Match bonus
          </h2>

          {/* Le "4" etait ecrit en dur. bonusCandidates fait pourtant
              disparaitre silencieusement tout championnat sans ligne dans
              bonus_options pour la journee : le bloc pouvait annoncer quatre
              championnats en n'en affichant que trois. Le compte suit
              desormais ce qui est reellement propose. */}
          <p className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            1 match à choisir · {bonusCandidates.length} championnat
            {bonusCandidates.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="w-fit rounded-full border border-amber-400/30 bg-black/25 px-4 py-2 backdrop-blur-sm">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-amber-300">
          EXACT · 3 PTS
          <span className="mx-2 text-amber-500/80">•</span>
          RÉSULTAT · 2 PTS
        </span>
      </div>
    </div>

    {/* ================= CONTENU ================= */}
    {bonusLoading ? (
      <p className="py-10 text-center font-mono text-xs text-slate-300">
        Chargement de la sélection bonus…
      </p>
    ) : bonusError ? (
      <p className="py-10 text-center font-mono text-xs text-amber-300">
        {bonusError}
      </p>
    ) : bonusCandidates.length === 0 ? (
      <div className="py-10 text-center">
        <p className="font-display text-lg font-bold text-white">
          Aucun match bonus disponible pour le moment.
        </p>
        <p className="mt-1 font-mono text-[11px] text-slate-300">
          La sélection sera publiée par l’administrateur.
        </p>
      </div>
    ) : (
      <>
        {/* ================= 4 CHAMPIONNATS ================= */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

          {bonusCandidates.map(({ code, match, home, away }) => {
            const league = BONUS_LEAGUES[code];
            const selected = bonusSelection === match.id;
            const score = bonusScores[match.id] ?? { home: "", away: "" };
            const { dayName, dayDate, time } = formatKickoff(match.kickoff);
            const locked = isMatchLocked(match);
            // Une carte n'est cliquable que si son match n'a pas demarre ET que
            // le joueur n'a pas deja un choix fige (voir bonusChoiceLocked).
            // Sans ce second test, le clic appelait selectBonusMatch qui
            // refusait en silence : la carte gardait son curseur et son survol
            // de bouton, mais ne faisait rien.
            const selectable = !locked && (!bonusChoiceLocked || selected);
            const choiceCount = bonusChoiceCounts[match.id] ?? 0;
            const choicePercent =
              bonusChoiceTotal > 0
                ? Math.round((choiceCount / bonusChoiceTotal) * 100)
                : 0;

            return (
              <div
                key={match.id}
                role="button"
                tabIndex={0}
                onClick={() => selectable && selectBonusMatch(match.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (selectable) selectBonusMatch(match.id);
                  }
                }}
                aria-disabled={!selectable}
                className={`group relative overflow-hidden rounded-2xl border p-4 backdrop-blur-md transition-all duration-300 ${
                  selected
                    ? "border-amber-300/80 bg-amber-400/[0.10] shadow-[0_0_35px_rgba(245,158,11,0.20)]"
                    : selectable
                      ? "cursor-pointer border-white/15 bg-[#07101d]/55 hover:border-amber-300/45 hover:bg-[#07101d]/65"
                      : "border-white/10 bg-[#07101d]/40"
                } ${selectable || selected ? "" : "cursor-not-allowed opacity-55"}`}
              >

                {selected && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-400/[0.08] via-transparent to-transparent"
                  />
                )}

                {/* CHAMPIONNAT */}
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 p-1 backdrop-blur-sm">
                      <CompetitionLogo league={league} className="size-8" />
                    </div>

                    <span className="truncate font-mono text-[10px] font-bold uppercase tracking-wider text-slate-200">
                      {league.name}
                    </span>
                  </div>

                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full border transition-all duration-200 ${
                      selected
                        ? "border-amber-300 bg-amber-300 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.45)]"
                        : "border-slate-500/70 bg-black/10 text-transparent"
                    }`}
                  >
                    <Check className="size-3.5" />
                  </span>
                </div>

                <div className="relative mt-3 flex justify-center">
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-amber-200">
                    🔥 {choicePercent}% des joueurs
                  </span>
                </div>

                {/* MATCH */}
                <div className="relative mt-6 flex items-center gap-2">

                  <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <ClubCrest
                      club={home}
                      size="size-11"
                      className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
                    />
                    {/* "Ipswich To...", "Club Atléti..." : la troncature sur
                        une ligne coupait la moitie des noms. Deux lignes
                        autorisees, avec une taille legerement reduite — un nom
                        de club reste plus lisible sur deux lignes que coupe. */}
                    <p className="line-clamp-2 w-full text-center font-display text-[13px] font-bold leading-tight text-white drop-shadow-md">
                      {home.name}
                    </p>
                  </div>

                  <span className="shrink-0 font-mono text-[10px] font-black text-amber-300">
                    VS
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <ClubCrest
                      club={away}
                      size="size-11"
                      className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
                    />
                    <p className="line-clamp-2 w-full text-center font-display text-[13px] font-bold leading-tight text-white drop-shadow-md">
                      {away.name}
                    </p>
                  </div>
                </div>

                {/* DATE */}
                <p className="relative mt-4 text-center font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-300">
                  {dayName} {dayDate}
                  <span className="mx-1.5 text-slate-500">•</span>
                  {time}
                </p>

                {/* SCORE DU MATCH + POINTS EN DIRECT
                    Affichés sous CHAQUE match bonus, comme pour les autres matchs.
                    Le score réel vient du moteur live/final ; les points ne sont
                    calculés que pour le bonus effectivement sélectionné par le joueur. */}
                {(() => {
                  const currentScore = getLiveScore(match);
                  if (!currentScore) return null;

                  const hasPrediction = score.home !== "" && score.away !== "";
                  const displayPoints =
                    selected && hasPrediction
                      ? getLivePoints(
                          match,
                          undefined,
                          score.home,
                          score.away,
                          3,
                          2,
                        )
                      : null;

                  return (
                    <div className="relative mt-4 border-t border-white/10 pt-3 flex flex-col items-center leading-none">
                      <div className="flex items-center gap-2">
                        {currentScore.live && (
                          <span className="rounded-full border border-emerald-400/35 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[9px] font-black uppercase text-emerald-300 animate-pulse">
                            {liveLabel(match)}
                          </span>
                        )}
                        <span className="font-display text-base font-black tracking-wide text-white">
                          {currentScore.home} — {currentScore.away}
                        </span>
                      </div>

                      <span
                        className={`mt-1 font-display text-[11px] font-black uppercase tracking-wider ${
                          displayPoints != null
                            ? displayPoints > 0
                              ? "text-emerald-300"
                              : "text-red-300"
                            : "text-slate-400"
                        }`}
                      >
                        {!selected
                          ? "Match non sélectionné"
                          : hasPrediction
                            ? displayPoints != null
                              ? displayPoints > 0
                                ? `+${displayPoints} PT`
                                : "0 PT"
                              : "Prono à saisir"
                            : "Prono à saisir"}
                      </span>
                    </div>
                  );
                })()}

                {/* VERROUILLAGE */}
                {locked && (
                  <p className="relative mt-2 text-center font-mono text-[9px] font-bold uppercase tracking-wider text-red-300">
                    🔒 Pronostic bloqué
                  </p>
                )}

                {/* SCORE EXACT */}
                {selected && (
                  <div
                    className="relative mt-4 border-t border-amber-300/20 pt-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="mb-3 text-center font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-amber-300">
                      Score exact
                    </p>

                    <div className="flex items-center justify-center gap-2">
                      <input
                        inputMode="numeric"
                        disabled={locked}
                        value={score.home}
                        onChange={(e) =>
                          setBonusValue(match.id, "home", e.target.value)
                        }
                        placeholder="-"
                        aria-label={`Score bonus ${home.name}`}
                        className="size-12 rounded-xl border border-amber-400/25 bg-black/35 text-center font-display text-xl font-black text-white outline-none backdrop-blur-sm transition-all focus:border-amber-300 focus:bg-black/45 focus:ring-2 focus:ring-amber-400/15"
                      />

                      <span className="font-display text-lg font-bold text-slate-400">
                        —
                      </span>

                      <input
                        inputMode="numeric"
                        disabled={locked}
                        value={score.away}
                        onChange={(e) =>
                          setBonusValue(match.id, "away", e.target.value)
                        }
                        placeholder="-"
                        aria-label={`Score bonus ${away.name}`}
                        className="size-12 rounded-xl border border-amber-400/25 bg-black/35 text-center font-display text-xl font-black text-white outline-none backdrop-blur-sm transition-all focus:border-amber-300 focus:bg-black/45 focus:ring-2 focus:ring-amber-400/15"
                      />
                    </div>


                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* FOOTER */}
        <div className="relative mt-6 flex flex-col items-center gap-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
            {selectedBonusCandidate
              ? `Sélection : ${
                  BONUS_LEAGUES[
                    bonusCandidates.find(
                      (c) => c.match.id === selectedBonusCandidate.match.id
                    )!.code
                  ].name
                }`
              : "Sélectionne un seul match"}
          </p>

          {/* Le joueur doit comprendre pourquoi les autres cartes ne repondent
              plus, sans quoi il croit a un bug de l'application. */}
          {bonusChoiceLocked && (
            <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">
              <span aria-hidden="true">🔒</span>
              Choix figé — ton match bonus a démarré
            </p>
          )}

          {selectedBonusCandidate && (
            <p
              className={`font-mono text-[10px] font-bold ${
                bonusComplete ? "text-emerald-400" : "text-amber-300"
              }`}
            >
              {bonusComplete
                ? "✓ Score exact saisi"
                : "Saisis le score exact pour valider ton choix"}
            </p>
          )}
        </div>
      </>
    )}
  </div>
</section>
        </div>

    </div>
  </AppShell>
  );
}