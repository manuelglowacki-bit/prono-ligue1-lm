import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { fetchAllRowsCache } from "@/lib/supabaseFetchAll";
import { nomFichier, versCSV, type LigneClassement } from "@/lib/exportClassement";
import { preparerAnnonce, resumerEnvoi, LONGUEUR_MAX } from "@/lib/annonce";
import { computeLeagueStats } from "@/lib/leaderboardStats";
import { rankPlayers } from "@/lib/leaderboardRanking";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/prono/AppShell";
import AdminRoute from "@/components/auth/AdminRoute";
import {
  type Player,
  type Payment,
  type Match,
  type Matchday,
  type Team,
  type Season,
  type Competition,
  type DiscoveredCompetition,
  type AppSettings,
  getPlayers,
  deletePlayer as apiDeletePlayer,
  setPlayerAdmin,
  updatePlayer,
  getPayments,
  regeneratePayments,
  setPaymentPaid,
  setPaymentAmount,
  generateMissingPayments,
  getMatches,
  createMatch,
  updateMatch,
  deleteMatch as apiDeleteMatch,
  syncLigue1Matches,
  syncCompetitionMatches,
  getMatchdays,
  updateMatchday,
  setMatchdayDeadline,
  setMatchdayAutoMinusOne,
  clearMatchdayDeadline,
  setMatchdayFinished,
  deleteMatchday as apiDeleteMatchday,
  getTeams,
  getSeasons,
  getCompetitions,
  getAvailableCompetitions,
  setCompetitionActive,
  getSettings,
  updateSettings,
} from "@/services/adminService";
import { lienRappel } from "@/lib/mailRappel";
import {
  type BonusCandidate,
  type BonusCompetitionCode,
  BONUS_SELECTION_WEIGHTS,
  selectBestBonusMatch,
  isMatchInWindow,
  parisLocalToUtcIso,
  utcIsoToParisLocalInput,
  formatParisWindow,
} from "@/services/bonusSelectionService";
import {
  type BonusOption,
  getBonusOptions,
  replaceBonusSelection,
  clearBonusSelections,
} from "@/services/bonusOptionsService";
import { type CompetitionStandings, getAllBonusStandings } from "@/services/standingsService";
import { resolveBonusClubLogo, BONUS_LEAGUE_LOGO } from "@/services/bonusClubLogoService";
import { sendManualReminder } from "@/services/pushReminderService";

import {
  Users,
  Wallet,
  Shield,
  ShieldOff,
  Settings as SettingsIcon,
  Calendar,
  RefreshCw,
  CheckCircle2,
  Save,
  Trash2,
  Plus,
  Minus,
  Pencil,
  X,
  Lock,
  Unlock,
  AlertTriangle,
  Crown,
  Gift,
  Timer,
  CalendarClock,
  Check,
  Download,
  Globe,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Bell,
  Share2,
  Newspaper,
  Trophy,
  KeyRound,
  Copy,
  BarChart3,
  Megaphone,
  Send,
  FileDown,
  Mail,
} from "lucide-react";
import {
  genererCodeInvitation,
  lireCodeInvitation,
  enregistrerCodeInvitation,
} from "@/services/inviteCodeService";

/** Onglets de l'espace admin, adressables via le search param `tab`
 * (`/admin?tab=...`) plutôt que par un simple state local, pour rester
 * partageable/bookmarkable. */
const ADMIN_TAB_VALUES = ["joueurs", "paiements", "matchs", "bonus", "suivi", "audience", "verrouillage", "reglages"] as const;
export type AdminTab = (typeof ADMIN_TAB_VALUES)[number];

function isAdminTab(value: unknown): value is AdminTab {
  return typeof value === "string" && (ADMIN_TAB_VALUES as readonly string[]).includes(value);
}

type AdminSearch = { tab?: AdminTab };

// L'onglet "Journées" a été fusionné dans "Bonus" (tirage bonus + gestion
// des championnats européens) : un ancien lien/bookmark `?tab=journees`
// doit continuer à pointer quelque part plutôt que de retomber sur l'onglet
// par défaut.
const LEGACY_TAB_REDIRECTS: Record<string, AdminTab> = { journees: "bonus" };

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  validateSearch: (search: Record<string, unknown>): AdminSearch => {
    if (typeof search.tab === "string" && search.tab in LEGACY_TAB_REDIRECTS) {
      return { tab: LEGACY_TAB_REDIRECTS[search.tab] };
    }
    return { tab: isAdminTab(search.tab) ? search.tab : undefined };
  },
});

// ============================================================
// Données club (réutilisées de la page pronostics)
// ============================================================
const OFFICIAL_L1_CLUBS = [
  { id: "angers", name: "Angers SCO", crestUrl: "/logos/ligue1/angers.png" },
  { id: "monaco", name: "AS Monaco", crestUrl: "/logos/ligue1/monaco.png" },
  { id: "auxerre", name: "AJ Auxerre", crestUrl: "/logos/ligue1/auxerre.png" },
  { id: "brest", name: "Stade Brestois 29", crestUrl: "/logos/ligue1/brest.png" },
  { id: "lehavre", name: "Le Havre AC", crestUrl: "/logos/ligue1/lehavre.png" },
  { id: "lemans", name: "Le Mans FC", crestUrl: "/logos/ligue1/lemans.png" },
  { id: "lens", name: "RC Lens", crestUrl: "/logos/ligue1/lens.png" },
  { id: "lorient", name: "FC Lorient", crestUrl: "/logos/ligue1/lorient.png" },
  { id: "lille", name: "LOSC Lille", crestUrl: "/logos/ligue1/lille.png" },
  { id: "ol", name: "Olympique Lyonnais", crestUrl: "/logos/ligue1/ol.png" },
  { id: "om", name: "Olympique de Marseille", crestUrl: "/logos/ligue1/om.png" },
  { id: "parisfc", name: "Paris FC", crestUrl: "/logos/ligue1/parisfc.png" },
  { id: "psg", name: "Paris Saint-Germain", crestUrl: "/logos/ligue1/psg.png" },
  { id: "rennes", name: "Stade Rennais FC", crestUrl: "/logos/ligue1/rennes.png" },
  { id: "strasbourg", name: "RC Strasbourg Alsace", crestUrl: "/logos/ligue1/strasbourg.png" },
  { id: "tfc", name: "Toulouse FC", crestUrl: "/logos/ligue1/tfc.png" },
  { id: "troyes", name: "ESTAC Troyes", crestUrl: "/logos/ligue1/troyes.png" },
  { id: "nice", name: "OGC Nice", crestUrl: "/logos/ligue1/nice.png" },
];

function clubOf(key: string | null | undefined) {
  if (!key) return null;
  const normalized = key.toLowerCase();
  return (
    OFFICIAL_L1_CLUBS.find((c) => c.id === normalized) ||
    OFFICIAL_L1_CLUBS.find((c) => c.name.toLowerCase().includes(normalized)) ||
    null
  );
}

function teamOf(teams: Team[], id: string | null | undefined) {
  if (!id) return null;
  return teams.find((t) => t.id === id) ?? null;
}

/** Forme normalisée consommée par EntityBadge, qu'il s'agisse d'une
 * équipe Supabase (`teams`) ou d'un club officiel L1 codé en dur. */
type BadgeEntity = { name: string; shortName?: string | null; logoUrl?: string | null } | null;

/** Badge générique logo + nom, avec repli sur les initiales si le logo
 * est absent ou casse au chargement. Réutilisé par TeamBadge et ClubBadge
 * ci-dessous, qui ne font plus qu'adapter leur source de données au
 * format BadgeEntity attendu ici. */
function EntityBadge({
  entity,
  fallbackLabel = "—",
  size = "size-6",
  imgClassName = "",
}: {
  entity: BadgeEntity;
  fallbackLabel?: string;
  size?: string;
  imgClassName?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!entity) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
        <span className={`${size} rounded-md bg-slate-800 border border-slate-700`} />
        {fallbackLabel}
      </span>
    );
  }

  const label = entity.shortName || entity.name;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`relative ${size} shrink-0 rounded-md overflow-hidden bg-white/5 border border-slate-800 flex items-center justify-center`}>
        {broken || !entity.logoUrl ? (
          <span className="font-mono text-[8px] font-bold text-slate-300">{label.slice(0, 2).toUpperCase()}</span>
        ) : (
          <img
            src={entity.logoUrl}
            alt={entity.name}
            className={`size-full object-contain ${imgClassName}`}
            onError={() => setBroken(true)}
          />
        )}
      </span>
      <span className="text-xs font-semibold text-slate-200">{label}</span>
    </span>
  );
}

function TeamBadge({ teams, teamId, size = "size-6" }: { teams: Team[]; teamId: string | null; size?: string }) {
  const team = teamOf(teams, teamId);
  return (
    <EntityBadge
      entity={team ? { name: team.name, shortName: team.short_name, logoUrl: team.logo_url } : null}
      size={size}
    />
  );
}

function ClubBadge({ value, size = "size-6" }: { value: string | null; size?: string }) {
  const club = clubOf(value);
  return (
    <EntityBadge
      entity={club ? { name: club.name, logoUrl: club.crestUrl } : null}
      fallbackLabel={value || "—"}
      size={size}
      imgClassName="p-0.5"
    />
  );
}

// ============================================================
// Petits composants UI partagés (style du reste de l'app)
// ============================================================
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-[#0b1325] shadow-inner ${className}`}>
      {children}
    </div>
  );
}

function StatPill({ label, value, tone = "text-emerald-400" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0d1322] px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`font-display text-2xl font-black ${tone}`}>{value}</div>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-display text-xs font-bold uppercase tracking-wide text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  className = "",
  danger = false,
  title,
  ariaLabel,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  danger?: boolean;
  title?: string;
  /** Libellé accessible explicite — indispensable quand le bouton n'affiche
   * qu'une icône (ex. GhostButton danger de suppression). Vient s'ajouter
   * au `title` (info-bulle), il ne le remplace pas. */
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel ?? title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-[11px] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white"
          : "border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700 hover:text-white"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 ${className}`}
    />
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-300">
      <AlertTriangle size={16} className="shrink-0" />
      {message}
    </div>
  );
}

type ToastMessage = { id: number; message: string };

/** Pile de notifications non bloquantes, en bas d'écran, qui reprend le
 * style d'ErrorBanner. Remplace les alert() natifs du navigateur : chaque
 * toast disparaît de lui-même après quelques secondes ou peut être fermé
 * manuellement. */
function ToastStack({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-xl border border-amber-500/30 bg-[#0b1325]/95 px-4 py-3 text-xs font-semibold text-amber-300 shadow-2xl backdrop-blur-md"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Fermer la notification"
            className="shrink-0 rounded-lg p-1 text-amber-300/70 transition-colors hover:bg-amber-500/10 hover:text-amber-200"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

const TABLE_MISSING_HINT =
  "Table introuvable dans Supabase. Exécutez le script SQL fourni (supabase_admin_schema.sql) puis synchronisez.";

/** Extrait un message lisible d'une erreur `catch` typée `unknown` (pas de
 * `any`) — utilisé par les handlers ajoutés ci-dessous (score inline,
 * onglet Bonus, Réglages) ; le reste du fichier utilise encore
 * `catch (e: any)`, une convention préexistante non touchée ici. */
function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Enregistre une erreur de chargement sous `key` sans écraser un message
 * déjà présent pour la même clé : les messages distincts se combinent, les
 * doublons ne sont pas répétés. Évite qu'une source fasse disparaître
 * l'erreur d'une autre source rattachée au même onglet. */
function addError(bag: Record<string, string>, key: string, message: string) {
  const previous = bag[key];
  if (!previous) {
    bag[key] = message;
  } else if (!previous.includes(message)) {
    bag[key] = `${previous} ${message}`;
  }
}

// ============================================================
// PAGE ADMIN
// ============================================================
// AdminTab est défini plus haut, à côté de la Route.

const TABS: { id: AdminTab; label: string; icon: typeof Users }[] = [
  { id: "joueurs", label: "Joueurs", icon: Users },
  { id: "paiements", label: "Paiements", icon: Wallet },
  { id: "matchs", label: "Matchs", icon: Calendar },
  { id: "bonus", label: "Bonus", icon: Gift },
  { id: "suivi", label: "Suivi pronos", icon: Bell },
  { id: "audience", label: "Audience", icon: BarChart3 },
  { id: "verrouillage", label: "Verrouillage", icon: Lock },
  { id: "reglages", label: "Réglages", icon: SettingsIcon },
];

function AdminPage() {
  // L'onglet actif vit dans l'URL (?tab=...) plutôt que dans un simple
  // useState, pour rester adressable (lien partagé, retour arrière, etc.).
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab = search.tab ?? "joueurs";
  function setActiveTab(tab: AdminTab) {
    navigate({ search: (prev: AdminSearch) => ({ ...prev, tab }) });
  }

  // activeTab change via un paramètre d'URL (search), pas un changement de
  // route classique — TanStack Router ne réinitialise donc pas le scroll
  // automatiquement (comportement voulu ailleurs : filtres, pagination...).
  // Résultat concret : si on est scrollé plus bas en consultant un onglet
  // plus long (ex. Bonus) puis qu'on bascule sur Suivi des pronostics (plus
  // court), la page RESTE à cette position de scroll — le titre "Suivi des
  // pronostics" se retrouve visuellement sous le header sticky, pas parce
  // qu'il est mal positionné, mais parce qu'on est déjà scrollé plus bas
  // que sa hauteur. Remonter en haut à chaque changement d'onglet corrige
  // ça structurellement, sans aucun padding devinée.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeTab]);

  // Nettoie l'URL d'un ancien lien/bookmark `?tab=journees` (onglet fusionné
  // dans Bonus) vers `?tab=bonus`, une fois le routeur monté. validateSearch
  // fait déjà pointer `activeTab` sur "bonus" immédiatement ; ceci ne fait
  // que corriger la barre d'adresse pour ne pas perpétuer l'ancien lien.
  useEffect(() => {
    const rawTab = new URLSearchParams(window.location.search).get("tab");
    if (rawTab && rawTab in LEGACY_TAB_REDIRECTS) {
      navigate({ search: (prev: AdminSearch) => ({ ...prev, tab: LEGACY_TAB_REDIRECTS[rawTab] }), replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const [players, setPlayers] = useState<Player[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [adminPredictions, setAdminPredictions] = useState<AdminPredictionRow[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Notifications non bloquantes (remplace les alert() natifs) — voir ToastStack.
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);

  function notify(message: string) {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function clearErrors(keys: string[]) {
    setErrors((prev) => {
      const next = { ...prev };
      keys.forEach((key) => delete next[key]);
      return next;
    });
  }

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    setLoading(true);
    await loadAll();
    setLoading(false);
  }

  async function loadAll() {
    const nextErrors: Record<string, string> = {};

    // Les 8 sources sont indépendantes : on les charge en parallèle plutôt
    // qu'en série pour diviser le temps de chargement par ~8, et on garde
    // Promise.allSettled pour qu'un échec isolé (ex. table manquante)
    // n'empêche pas les autres sources de s'afficher.
    const [
      playersResult,
      paymentsResult,
      matchesResult,
      matchdaysResult,
      teamsResult,
      seasonsResult,
      competitionsResult,
      settingsResult,
      predictionsResult,
    ] = await Promise.allSettled([
      getPlayers(),
      getPayments(),
      getMatches(),
      getMatchdays(),
      getTeams(),
      getSeasons(),
      getCompetitions(),
      getSettings(),
      // Paginee : meme troncature silencieuse a 1000 lignes que sur le
      // Classement et la Gazette.
      fetchAllRowsCache(
        "predictions",
        "user_id,match_id,home_prediction,away_prediction,created_at",
        ["user_id", "match_id"],
      ),
    ]);

    if (playersResult.status === "fulfilled") {
      setPlayers(playersResult.value);
    } else {
      console.error(playersResult.reason);
      addError(nextErrors, "joueurs", "Impossible de charger les joueurs.");
    }

    if (paymentsResult.status === "fulfilled") {
      setPayments(paymentsResult.value);
    } else {
      console.warn("payments:", paymentsResult.reason);
      addError(nextErrors, "paiements", TABLE_MISSING_HINT);
    }

    if (matchesResult.status === "fulfilled") {
      setMatches(matchesResult.value);
    } else {
      console.warn("matches:", matchesResult.reason);
      addError(nextErrors, "matchs", TABLE_MISSING_HINT);
    }

    if (matchdaysResult.status === "fulfilled") {
      setMatchdays(matchdaysResult.value);
    } else {
      console.warn("matchdays:", matchdaysResult.reason);
      addError(nextErrors, "bonus", TABLE_MISSING_HINT);
      addError(nextErrors, "verrouillage", TABLE_MISSING_HINT);
    }

    if (teamsResult.status === "fulfilled") {
      setTeams(teamsResult.value);
    } else {
      console.warn("teams:", teamsResult.reason);
      // Clé distincte de "matchs" : les équipes ne sont qu'un référentiel
      // utilisé par le formulaire de l'onglet Matchs, pas l'onglet lui-même.
      // Les confondre affichait par le passé le badge d'erreur sur le
      // mauvais onglet.
      addError(nextErrors, "equipes", TABLE_MISSING_HINT);
    }

    if (seasonsResult.status === "fulfilled") {
      setSeasons(seasonsResult.value);
    } else {
      console.warn("seasons:", seasonsResult.reason);
      addError(nextErrors, "bonus", TABLE_MISSING_HINT);
      addError(nextErrors, "verrouillage", TABLE_MISSING_HINT);
    }

    if (competitionsResult.status === "fulfilled") {
      setCompetitions(competitionsResult.value);
    } else {
      console.warn("competitions:", competitionsResult.reason);
      addError(nextErrors, "bonus", TABLE_MISSING_HINT);
      addError(nextErrors, "verrouillage", TABLE_MISSING_HINT);
    }

    if (settingsResult.status === "fulfilled") {
      setSettings(settingsResult.value);
    } else {
      console.warn("app_settings:", settingsResult.reason);
      addError(nextErrors, "reglages", TABLE_MISSING_HINT);
    }

    if (predictionsResult.status === "fulfilled") {
      const predictionResponse = predictionsResult.value;
      if (predictionResponse.error) {
        console.warn("predictions:", predictionResponse.error);
        addError(nextErrors, "suivi", "Impossible de charger les pronostics.");
      } else {
        setAdminPredictions((predictionResponse.data ?? []) as AdminPredictionRow[]);
      }
    } else {
      console.warn("predictions:", predictionsResult.reason);
      addError(nextErrors, "suivi", "Impossible de charger les pronostics.");
    }

    setErrors(nextErrors);
  }

  async function handleSync() {
    setSyncing(true);
    await loadAll();
    setSyncSuccess(true);
    setSyncing(false);
    setTimeout(() => setSyncSuccess(false), 2500);
  }

  const entryFee = settings?.entry_fee ?? 10;

  const paidCount = useMemo(() => payments.filter((p) => p.paid).length, [payments]);
  const totalCollected = useMemo(
    () => payments.filter((p) => p.paid).reduce((sum, p) => sum + Number(p.amount || 0), 0),
    [payments],
  );
  const totalExpected = useMemo(() => players.length * entryFee, [players, entryFee]);
  const adminCount = useMemo(() => players.filter((p) => p.is_admin).length, [players]);
  // "Journees ouvertes" comptait les journees des CINQ championnats (Ligue 1
  // plus les quatre championnats bonus), d'ou un 182 absurde pour une ligue
  // qui joue 34 journees. Seule la Ligue 1 compte ici, comme partout ailleurs
  // dans l'application.
  const openMatchdaysCount = useMemo(() => {
    const ligue1CompetitionIds = new Set(
      competitions
        .filter((c) => c.code === "FL1" || c.external_code === "FL1")
        .map((c) => String(c.id)),
    );

    return matchdays.filter((m) => {
      if (m.is_finished) return false;
      if (!m.competition_id) return true;
      // Sans competition FL1 identifiee, on ne filtre pas plutot que de
      // masquer des journees a tort.
      if (ligue1CompetitionIds.size === 0) return true;
      return ligue1CompetitionIds.has(String(m.competition_id));
    }).length;
  }, [matchdays, competitions]);

  if (loading) {
    return (
      <AdminRoute>
        <AppShell>
          <div className="flex h-[70vh] items-center justify-center">
            <RefreshCw className="animate-spin text-emerald-400" size={42} />
          </div>
        </AppShell>
      </AdminRoute>
    );
  }

  return (
    <AdminRoute>
      <AppShell>
        <div className="mx-auto max-w-6xl space-y-6 pb-32">
          {/* ================= EN-TÊTE ================= */}
          <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-[#060b16] p-6 shadow-[0_0_60px_rgba(0,0,0,0.6)] sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{
                background:
                  "radial-gradient(ellipse 65% 55% at 88% -10%, rgba(16,185,129,0.20), transparent 70%)",
              }}
            />
            <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 font-mono text-[10px] font-bold tracking-[0.14em] text-emerald-400">
                  <Shield size={12} />
                  ESPACE ADMINISTRATEUR
                </div>
                <h1
                  className="bg-gradient-to-b from-white via-white to-[color-mix(in_oklab,var(--sky)_32%,white)] bg-clip-text font-display text-3xl font-black uppercase tracking-tight text-transparent sm:text-4xl"
                  style={{
                    filter:
                      "drop-shadow(0 1px 0 rgba(0,0,0,.35)) drop-shadow(0 0 20px rgba(22,82,240,.16))",
                  }}
                >
                  Gestion de la ligue
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Joueurs, paiements, matchs, journées et réglages{settings?.season ? ` de la saison ${settings.season}` : ""}.
                </p>
              </div>

              <GhostButton onClick={handleSync} className="!px-4 !py-2.5">
                {syncSuccess ? (
                  <CheckCircle2 size={14} className="text-emerald-400" />
                ) : (
                  <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                )}
                {syncSuccess ? "Synchronisé" : "Synchroniser"}
              </GhostButton>
            </div>

            {/* Stats rapides */}
            <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatPill label="Joueurs" value={String(players.length)} />
              <StatPill label="Admins" value={String(adminCount)} tone="text-sky-400" />
              {/* ATTENTION AU MOT : ici c'est l'argent REELLEMENT ENCAISSE
                  (Admin > Paiements), alors que la "cagnotte" annoncee aux
                  joueurs sur l'Accueil et le Classement est le total attendu
                  (nombre de joueurs x droit d'entree). Afficher les deux
                  evite de croire que la ligue a perdu de l'argent. */}
              <StatPill
                label="Encaissé / attendu"
                value={`${totalCollected}€ / ${totalExpected}€`}
                tone="text-gold"
              />
              <StatPill label="Journées ouvertes" value={String(openMatchdaysCount)} tone="text-mint" />
            </div>
          </section>

          {/* ================= NAVIGATION ONGLETS ================= */}
          <nav className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-800 bg-[#0d1322]/90 p-1.5 shadow-inner">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const hasError = !!errors[tab.id];
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 rounded-xl px-4 py-2 font-display text-xs font-bold uppercase tracking-wide transition-all ${
                    isActive
                      ? "bg-emerald-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                  {hasError && (
                    <span className="absolute -right-1 -top-1 size-2 rounded-full bg-amber-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* ================= CONTENU ================= */}
          {activeTab === "joueurs" && (
            <PlayersTab
              players={players}
              teams={teams}
              setPlayers={setPlayers}
              error={errors.joueurs}
              onChanged={async () => setPlayers(await getPlayers())}
              notify={notify}
            />
          )}

          {activeTab === "paiements" && (
            <div className="space-y-4">
              <ExportClassement
                players={players}
                matches={matches}
                predictions={adminPredictions}
                teams={teams}
                saison={settings?.season ?? null}
                notify={notify}
              />
            <PaymentsTab
              players={players}
              payments={payments}
              setPayments={setPayments}
              entryFee={entryFee}
              paidCount={paidCount}
              totalCollected={totalCollected}
              totalExpected={totalExpected}
              error={errors.paiements}
              onChanged={async () => setPayments(await getPayments())}
              notify={notify}
            />
            </div>
          )}

          {activeTab === "matchs" && (
            <MatchesTab
              matches={matches}
              setMatches={setMatches}
              matchdays={matchdays}
              teams={teams}
              error={errors.matchs}
              teamsError={errors.equipes}
              clearErrors={clearErrors}
              onChanged={async () => setMatches(await getMatches())}
              refreshMatchdays={async () => setMatchdays(await getMatchdays())}
              notify={notify}
            />
          )}

          {activeTab === "bonus" && (
            <BonusTab
              matchdays={matchdays}
              matches={matches}
              teams={teams}
              seasons={seasons}
              competitions={competitions}
              settings={settings}
              error={errors.bonus}
              onChanged={async () => {
                setMatchdays(await getMatchdays());
                setMatches(await getMatches());
              }}
              onCompetitionsChanged={async () => setCompetitions(await getCompetitions())}
              onSettingsChanged={async () => setSettings(await getSettings())}
              notify={notify}
            />
          )}

          {activeTab === "suivi" && (
            <PronoFollowUpTab
              players={players}
              matchdays={matchdays}
              matches={matches}
              predictions={adminPredictions}
              error={errors.suivi}
              notify={notify}
            />
          )}

          {activeTab === "audience" && <AudienceTab players={players} />}

          {activeTab === "verrouillage" && (
            <MatchdayLockTab
              matchdays={matchdays}
              setMatchdays={setMatchdays}
              matches={matches}
              seasons={seasons}
              competitions={competitions}
              error={errors.verrouillage}
              onChanged={async () => setMatchdays(await getMatchdays())}
              notify={notify}
            />
          )}

          {activeTab === "reglages" && (
            <SettingsTab
              settings={settings}
              error={errors.reglages}
              onChanged={async () => setSettings(await getSettings())}
              notify={notify}
            />
          )}
        </div>

        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </AppShell>
    </AdminRoute>
  );
}

// ============================================================
// 🔔 ONGLET SUIVI DES PRONOSTICS
// ============================================================

type AdminPredictionRow = {
  user_id: string | null;
  match_id: string | number | null;
  home_prediction?: number | null;
  away_prediction?: number | null;
  created_at?: string | null;
};

function PronoFollowUpTab({
  players,
  matchdays,
  matches,
  predictions,
  error,
  notify,
}: {
  players: Player[];
  matchdays: Matchday[];
  matches: Match[];
  predictions: AdminPredictionRow[];
  error?: string;
  notify: (message: string) => void;
}) {
  // BUG corrigé ici — `matchdays` (prop) contient TOUTES les journées, tous
  // championnats confondus (Ligue 1 + les 4 championnats bonus PL/PD/SA/BL1
  // synchronisés par l'onglet Bonus), qui partagent les mêmes numéros 1..38
  // mais avec un `id` différent par championnat (voir syncCompetitionMatches
  // dans adminService.ts, qui crée une ligne matchdays par compétition).
  // Sans filtre, la journée "J1" pouvait donc résoudre vers le matchday_id
  // d'un championnat étranger (0 match Ligue 1 dedans), d'où le 0/0 et le
  // "COMPLET" incorrect pour tous les joueurs. Même filtre déjà utilisé et
  // validé dans MatchesTab (ligue1MatchdayIds), réutilisé ici à l'identique
  // plutôt que dupliqué sous un autre nom.
  const ligue1MatchIdsForFollowUp = useMemo(
    () =>
      new Set(
        matches
          .filter((m) => (m.match_type ?? "LIGUE1") === "LIGUE1")
          .map((m) => m.matchday_id)
          .filter((id): id is string => !!id),
      ),
    [matches],
  );
  const ligue1Matchdays = useMemo(
    () =>
      matchdays
        .filter((md) => ligue1MatchIdsForFollowUp.has(md.id))
        .sort((a, b) => a.number - b.number),
    [matchdays, ligue1MatchIdsForFollowUp],
  );

  const [selectedMatchdayId, setSelectedMatchdayId] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "complete" | "incomplete" | "none">("all");
  const [reminded, setReminded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selectedMatchdayId || ligue1Matchdays.length === 0) return;
    setSelectedMatchdayId(computeDefaultMatchdayId(ligue1Matchdays, matches) ?? ligue1Matchdays[0].id);
  }, [ligue1Matchdays, matches, selectedMatchdayId]);

  const selectedMatchday = ligue1Matchdays.find((md) => md.id === selectedMatchdayId) ?? null;

  const selectedMatches = useMemo(() => {
    if (!selectedMatchdayId) return [];
    return matches.filter(
      (match) =>
        String(match.matchday_id ?? "") === String(selectedMatchdayId) &&
        (match.match_type ?? "LIGUE1") === "LIGUE1" &&
        !match.is_bonus,
    );
  }, [matches, selectedMatchdayId]);

  const selectedMatchIds = useMemo(
    () => new Set(selectedMatches.map((match) => String(match.id))),
    [selectedMatches],
  );

  const [bonusMatchIds, setBonusMatchIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadBonusIds() {
      if (!selectedMatchdayId) {
        setBonusMatchIds(new Set());
        return;
      }

      const { data, error: bonusError } = await supabase
        .from("bonus_options")
        .select("match_id")
        .eq("matchday_id", selectedMatchdayId)
        .eq("is_active", true);

      if (cancelled) return;

      if (bonusError) {
        console.warn("Erreur chargement bonus_options pour le suivi :", bonusError);
        setBonusMatchIds(new Set());
        return;
      }

      setBonusMatchIds(
        new Set(
          (data ?? [])
            .map((row) => row.match_id)
            .filter(Boolean)
            .map((id) => String(id)),
        ),
      );
    }

    void loadBonusIds();
    return () => {
      cancelled = true;
    };
  }, [selectedMatchdayId]);

  // IMPORTANT : `bonus_options` propose plusieurs matchs candidats (un par
  // championnat bonus PL/PD/SA/BL1) pour la journée, mais le joueur n'en
  // sélectionne qu'UN seul (voir pronostics.tsx : le save nettoie les
  // predictions des candidats non retenus). Ces candidats ne doivent donc
  // jamais compter comme autant de pronostics obligatoires : on distingue
  // le nombre de matchs Ligue 1 attendus (l1Expected, un pronostic chacun)
  // du fait qu'un bonus ait été sélectionné (bonusExpected/bonusSelected,
  // un booléen, pas un décompte).
  const l1Expected = selectedMatchIds.size;
  // `bonusExpected` gère le cas robustesse "aucun bonus configuré" pour la
  // journée (section 15) : si aucune option bonus n'existe, on ne bloque
  // jamais un joueur sur un bonus qu'il ne peut pas sélectionner.
  const bonusExpected = bonusMatchIds.size > 0;

  // Joueurs ayant reellement active les notifications. Sans cette
  // information, "Rappeler tous (20)" laissait croire que vingt personnes
  // seraient prevenues, alors que seules celles qui ont accepte les
  // notifications le sont — les autres ne recevaient rien, et on ne
  // l'apprenait qu'apres l'envoi, dans le bilan.
  const [joignables, setJoignables] = useState<Set<string> | null>(null);

  useEffect(() => {
    let annule = false;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const jeton = data.session?.access_token;
        if (!jeton) return;

        const reponse = await fetch("/api/emails-joueurs", {
          method: "POST",
          headers: { Authorization: `Bearer ${jeton}` },
        });
        if (!reponse.ok) return;

        const corps = await reponse.json().catch(() => ({}));
        if (!annule && Array.isArray(corps?.avecNotifications)) {
          setJoignables(new Set(corps.avecNotifications.map(String)));
        }
      } catch {
        // Information indisponible : on n'affiche rien de particulier.
      }
    })();

    return () => {
      annule = true;
    };
  }, []);

  const rows = useMemo(() => {
    // Ordre d'affichage : ceux qui n'ont RIEN fait d'abord, puis les
    // incomplets, puis les complets — et par pseudo a l'interieur de chaque
    // groupe. La page s'appelle "Qui a oublie ses pronos ?" : la reponse
    // doit etre la premiere chose lue, pas quelque part au milieu d'une
    // liste alphabetique.
    const rang = { none: 0, incomplete: 1, complete: 2 } as const;

    return players.map((player) => {
      const uid = String(player.id);
      const l1CompletedIds = new Set<string>();
      let bonusSelected = false;

      for (const prediction of predictions) {
        if (String(prediction.user_id ?? "") !== uid) continue;
        if (prediction.match_id == null) continue;
        if (prediction.home_prediction == null || prediction.away_prediction == null) continue;

        const matchId = String(prediction.match_id);
        if (selectedMatchIds.has(matchId)) {
          // Doublons éventuels (section 20, TEST 8) : un Set ne compte
          // qu'une fois chaque match_id distinct.
          l1CompletedIds.add(matchId);
        } else if (bonusMatchIds.has(matchId)) {
          // Une seule sélection bonus suffit à considérer le bonus "fait" —
          // ce n'est jamais un décompte des 4 candidats.
          bonusSelected = true;
        }
      }

      const l1Completed = l1CompletedIds.size;
      const l1Missing = Math.max(l1Expected - l1Completed, 0);

      // Garde-fou explicite : l1Expected === 0 ne doit JAMAIS se traduire par
      // "complet" (0/0 ne veut rien dire — soit la journée n'a pas encore de
      // matchs synchronisés, soit — c'était le bug réel ici — le matchday_id
      // résolu n'était pas celui de Ligue 1). Avec le filtre corrigé
      // ci-dessus (ligue1Matchdays), ce cas ne devrait normalement plus se
      // produire, mais on ne laisse jamais l1Expected === 0 lire "COMPLET".
      const complete = l1Expected > 0 && l1Completed === l1Expected && (!bonusExpected || bonusSelected);
      const none = l1Completed === 0 && !bonusSelected;

      return {
        player,
        l1Completed,
        l1Expected,
        l1Missing,
        bonusExpected,
        bonusSelected,
        status: complete ? "complete" : none ? "none" : "incomplete",
      } as const;
    })
      .sort(
        (a, b) =>
          rang[a.status] - rang[b.status] ||
          (a.player.pseudo ?? "").localeCompare(b.player.pseudo ?? "", "fr"),
      );
  }, [players, predictions, selectedMatchIds, bonusMatchIds, l1Expected, bonusExpected]);

  const summary = useMemo(() => {
    const total = rows.length;
    const complete = rows.filter((row) => row.status === "complete").length;
    const incomplete = rows.filter((row) => row.status === "incomplete").length;
    const none = rows.filter((row) => row.status === "none").length;

    // Moyenne de complétion (maquette Admin Suivi) : ratio pronos réalisés /
    // attendus (Ligue 1 + bonus s'il y en a un pour la journée) moyenné sur
    // tous les joueurs. 0 attendu (aucun match synchronisé) → 0% plutôt
    // qu'une division par zéro / NaN affiché.
    const totalExpected = l1Expected + (bonusExpected ? 1 : 0);
    const average =
      total === 0 || totalExpected === 0
        ? 0
        : Math.round(
            (rows.reduce((sum, row) => sum + row.l1Completed + (row.bonusSelected ? 1 : 0), 0) /
              (total * totalExpected)) *
              100,
          );

    return { total, complete, incomplete, none, average };
  }, [rows, l1Expected, bonusExpected]);

  // Joueurs réellement ciblés par "Rappeler tous" / le partage groupé —
  // jamais les complets (même logique que remindAll ci-dessous, calculée
  // ici séparément pour pouvoir afficher le compte (X) dans le libellé).
  const pendingRows = useMemo(() => rows.filter((row) => row.status !== "complete"), [rows]);

  // Combien, parmi ceux a relancer, recevront reellement la notification.
  const pendingJoignables = useMemo(
    () => (joignables ? pendingRows.filter((row) => joignables.has(String(row.player.id))).length : null),
    [pendingRows, joignables],
  );

  const filteredRows = useMemo(
    () => rows.filter((row) => filter === "all" || row.status === filter),
    [rows, filter],
  );

  // OU COMMENCE LE BLOC DES JOUEURS A JOUR.
  //
  // Le tri place deja les retardataires en tete et les complets en fin de
  // liste (voir `rang` plus haut) — mais rien ne le montrait : 23 lignes se
  // suivaient sans rupture, et les 5 joueurs a relancer se noyaient dans les
  // 18 autres. On insere donc deux bandeaux, uniquement quand la liste
  // contient VRAIMENT les deux groupes (sinon un bandeau seul n'apprend
  // rien, et sur un filtre precis il ferait doublon avec le filtre lui-meme).
  const premierComplet = useMemo(
    () => filteredRows.findIndex((row) => row.status === "complete"),
    [filteredRows],
  );
  const listeMixte = filter === "all" && premierComplet > 0;

  // Message affiché dans la notification Push réelle (Phase 2). Variantes
  // par statut reprises telles quelles du cahier des charges §9 — le
  // statut "complete" ne devrait jamais atteindre cette fonction puisque le
  // bouton Rappeler est masqué pour ces joueurs (§18), mais on garde un
  // texte de repli cohérent au cas où.
  function reminderBody(row: (typeof rows)[number]): string {
    const dayLabel = selectedMatchday ? `la Journée ${selectedMatchday.number}` : "cette journée";
    if (row.status === "none") {
      return `🔔 Tu n'as pas encore fait tes pronostics pour ${dayLabel}.`;
    }
    if (row.status === "incomplete") {
      return `🔔 Il te reste des pronostics à terminer pour ${dayLabel}.`;
    }
    return `🔔 N'oublie pas de terminer tes pronostics pour ${dayLabel} avant la deadline.`;
  }

  const [reminding, setReminding] = useState<Set<string>>(new Set());
  const [remindingAll, setRemindingAll] = useState(false);

  async function remind(row: (typeof rows)[number]) {
    const playerId = String(row.player.id);
    const label = row.player.pseudo ?? "ce joueur";

    setReminding((previous) => new Set(previous).add(playerId));
    try {
      const result = await sendManualReminder({
        userId: row.player.id,
        matchdayId: selectedMatchdayId || null,
        title: "Prono Ligue 1 LM",
        body: reminderBody(row),
      });

      if (!result.ok) {
        notify(`❌ Impossible d'envoyer le rappel à ${label}${result.error ? ` : ${result.error}` : "."}`);
        return;
      }

      if (result.subscriptionsFound === 0) {
        // Pas une erreur technique : le joueur n'a simplement jamais activé
        // les notifications Push. Ne jamais afficher ça comme un succès (§13).
        notify(`⚠️ ${label} n'a pas activé les notifications Push.`);
        return;
      }

      if (result.sent > 0) {
        notify(`✅ Rappel envoyé à ${label}`);
        setReminded((previous) => new Set(previous).add(playerId));
      } else {
        notify(`❌ Impossible d'envoyer le rappel à ${label} (abonnement(s) invalide(s)).`);
      }
    } catch (e) {
      notify(`❌ Impossible d'envoyer le rappel à ${label}${errorMessage(e, "") ? ` : ${errorMessage(e, "")}` : "."}`);
    } finally {
      setReminding((previous) => {
        const next = new Set(previous);
        next.delete(playerId);
        return next;
      });
    }
  }

  // Partage manuel (WhatsApp, SMS, etc.) en plus du Push : certains joueurs
  // n'ont jamais activé les notifications (voir `subscriptionsFound === 0`
  // ci-dessus), ce bouton leur reste donc utile sans dépendre du Push ni
  // créer un nouveau système de données — texte généré à la volée.
  // `window.location.origin` plutôt qu'une URL codée en dur : reste juste
  // que ce soit servi en local, preview Vercel ou domaine de prod.
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";

  function shareMessage(row: (typeof rows)[number]): string {
    return `${reminderBody(row)}\n👉 ${siteUrl}`;
  }

  function groupShareMessage(): string {
    const dayLabel = selectedMatchday ? `la Journée ${selectedMatchday.number}` : "cette journée";
    const count = pendingRows.length;
    return `🔔 ${count} joueur${count > 1 ? "s" : ""} n'${count > 1 ? "ont" : "a"} pas encore terminé ${count > 1 ? "leurs" : "son"} pronostics pour ${dayLabel}.\n👉 ${siteUrl}`;
  }

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedGroup, setCopiedGroup] = useState(false);

  // navigator.share (mobile, ouvre le sélecteur d'apps natif) en priorité,
  // repli sur le presse-papiers ailleurs (desktop / navigateur sans
  // support). L'annulation d'un partage (AbortError) n'est pas une erreur.
  async function shareOrCopy(text: string, onCopied?: () => void) {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Prono Ligue 1 LM", text });
        return;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        // Repli presse-papiers si le partage natif échoue pour une autre raison.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      onCopied?.();
    } catch {
      notify("❌ Impossible de copier le message. Copie-le manuellement :\n" + text);
    }
  }

  async function shareReminder(row: (typeof rows)[number]) {
    const playerId = String(row.player.id);
    await shareOrCopy(shareMessage(row), () => {
      setCopiedId(playerId);
      notify(`📋 Message copié pour ${row.player.pseudo ?? "ce joueur"}`);
      setTimeout(() => setCopiedId((current) => (current === playerId ? null : current)), 2000);
    });
  }

  async function shareGroupReminder() {
    await shareOrCopy(groupShareMessage(), () => {
      setCopiedGroup(true);
      notify("📋 Message groupé copié");
      setTimeout(() => setCopiedGroup(false), 2000);
    });
  }

  // RELANCE PAR MAIL — depuis la boite de l'organisateur, pas d'un service
  // tiers. Le lien `mailto:` ouvre son application de courrier avec les
  // retardataires deja en COPIE CACHEE et le message pret : l'expediteur est
  // son adresse a lui, les joueurs peuvent lui repondre, et il n'y a ni cle
  // d'API, ni domaine a verifier, ni cout.
  //
  // Les adresses ne sont PAS dans `profiles` : elles vivent dans auth.users,
  // que le navigateur ne peut pas lire. Elles sont demandees a la fonction
  // `emails_des_joueurs()` (migration 20260909100000), qui verifie elle-meme
  // que l'appelant est admin et ne renvoie que l'identifiant et l'adresse.
  const [preparationMail, setPreparationMail] = useState(false);

  async function relancerParMail() {
    if (pendingRows.length === 0) {
      notify("Aucun joueur à relancer pour cette journée.");
      return;
    }

    setPreparationMail(true);
    try {
      const { data, error } = await supabase.rpc("emails_des_joueurs");
      if (error) throw error;

      const parId = new Map<string, string>();
      for (const ligne of (data ?? []) as { id: string; email: string }[]) {
        if (ligne?.id) parId.set(String(ligne.id), ligne.email);
      }

      const dayLabel = selectedMatchday
        ? `journée ${selectedMatchday.number}`
        : "prochaine journée";

      const { url, destinataires, sansAdresse } = lienRappel(
        pendingRows.map((row) => ({
          pseudo: row.player.pseudo,
          email: parId.get(String(row.player.id)) ?? null,
        })),
        `Prono Ligue 1 — tes pronostics de la ${dayLabel}`,
        `Salut,\n\nTu n'as pas encore terminé tes pronostics pour la ${dayLabel}.\n` +
          `C'est par ici : ${siteUrl}\n\nÀ tout de suite !`,
      );

      if (!url) {
        notify("❌ Aucune adresse mail connue pour ces joueurs.");
        return;
      }

      // Ouvre l'application de courrier. On reste sur la page : `location.href`
      // vers un `mailto:` ne navigue pas, il passe la main au systeme.
      window.location.href = url;

      const parts = [
        `📧 Message prêt pour ${destinataires.length} joueur${destinataires.length > 1 ? "s" : ""}`,
      ];
      if (sansAdresse.length > 0) {
        parts.push(`sans adresse connue : ${sansAdresse.join(", ")}`);
      }
      notify(parts.join(" · "));
    } catch (e) {
      console.error("Relance par mail :", e);
      notify(`❌ Impossible de préparer le mail${errorMessage(e, "") ? ` : ${errorMessage(e, "")}` : "."}`);
    } finally {
      setPreparationMail(false);
    }
  }

  async function remindAll() {
    // Cible EXCLUSIVEMENT les joueurs incomplete/none — jamais les complets
    // (§4/§18, validé Phase 1 : `rows.filter(row => row.status !== "complete")`).
    const pending = pendingRows;
    if (pending.length === 0) {
      notify("Aucun joueur à rappeler pour cette journée.");
      return;
    }

    // Une notification part sur le telephone de chacun : on demande avant.
    const cibles = joignables
      ? pending.filter((row) => joignables.has(String(row.player.id)))
      : pending;

    if (joignables && cibles.length === 0) {
      notify(
        "Aucun de ces joueurs n'a activé les notifications. Utilise « Partager un rappel » pour le groupe.",
      );
      return;
    }

    const noms = cibles
      .slice(0, 5)
      .map((row) => row.player.pseudo || "Joueur")
      .join(", ");
    const reste = cibles.length > 5 ? `, et ${cibles.length - 5} autre(s)` : "";
    const nonJoints =
      joignables && pending.length > cibles.length
        ? `\n\n${pending.length - cibles.length} joueur(s) ne recevront rien : ils n'ont pas activé les notifications.`
        : "";

    if (
      !window.confirm(
        `Envoyer une notification à ${cibles.length} joueur(s) ?\n\n${noms}${reste}${nonJoints}`,
      )
    ) {
      return;
    }

    setRemindingAll(true);
    try {
      const outcomes = await Promise.allSettled(
        pending.map(async (row) => ({
          row,
          result: await sendManualReminder({
            userId: row.player.id,
            matchdayId: selectedMatchdayId || null,
            title: "Prono Ligue 1 LM",
            body: reminderBody(row),
          }),
        })),
      );

      let sentCount = 0;
      let noSubscriptionCount = 0;
      let failedCount = 0;
      const remindedIds = new Set<string>();

      // Une erreur sur un joueur ne doit jamais empêcher le traitement des
      // autres (§15) : Promise.allSettled + boucle sans early-return.
      for (const outcome of outcomes) {
        if (outcome.status !== "fulfilled") {
          failedCount++;
          continue;
        }
        const { row, result } = outcome.value;
        if (result.ok && result.sent > 0) {
          sentCount++;
          remindedIds.add(String(row.player.id));
        } else if (result.ok && result.subscriptionsFound === 0) {
          noSubscriptionCount++;
        } else {
          failedCount++;
        }
      }

      if (remindedIds.size > 0) {
        setReminded((previous) => new Set([...previous, ...remindedIds]));
      }

      const parts = [`✅ ${sentCount} rappel${sentCount > 1 ? "s" : ""} envoyé${sentCount > 1 ? "s" : ""}`];
      if (noSubscriptionCount > 0) {
        parts.push(`⚠️ ${noSubscriptionCount} joueur${noSubscriptionCount > 1 ? "s" : ""} sans notification Push`);
      }
      if (failedCount > 0) {
        parts.push(`❌ ${failedCount} échec${failedCount > 1 ? "s" : ""}`);
      }
      notify(parts.join(" · "));
    } finally {
      setRemindingAll(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ANNONCE À TOUS — à sa place ici, au milieu des outils qui parlent aux
          joueurs. Le bouton « Rappeler » n'envoie qu'un texte figé sur les
          pronos, et seulement aux retardataires ; celui-ci dit ce qu'on veut,
          à tout le monde. */}
      <AnnonceATous players={players} joignables={joignables} notify={notify} />

      {/* scroll-mt : marge de sécurité pour que le titre ne se retrouve
          jamais juste sous le header sticky d'AppShell, quel que soit le
          point de défilement d'où l'on arrive sur cet onglet. */}
      <Card className="overflow-hidden scroll-mt-20">
        <div className="border-b border-slate-800 bg-gradient-to-r from-emerald-500/10 to-transparent px-4 pb-4 pt-5 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400">
                <Bell size={13} />
                Suivi des pronostics
              </div>
              <h2 className="font-display text-lg font-black uppercase tracking-wide text-white sm:text-xl">
                Qui a oublié ses pronos ?
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Vue admin par journée pour repérer immédiatement les joueurs à relancer.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedMatchdayId}
                onChange={(event) => {
                  setSelectedMatchdayId(event.target.value);
                  setReminded(new Set());
                }}
                className="rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm font-bold text-slate-100 outline-none focus:border-emerald-500/60"
              >
                {ligue1Matchdays.map((md) => (
                  <option key={md.id} value={md.id}>
                    Journée {md.number}
                  </option>
                ))}
              </select>

              <GhostButton
                onClick={() => void shareGroupReminder()}
                disabled={pendingRows.length === 0}
                className="!px-3 !py-2 text-[11px] sm:!px-4 sm:!py-2.5 sm:text-xs"
              >
                {copiedGroup ? <Check size={12} /> : <Share2 size={12} />}
                {copiedGroup ? "Copié !" : "Partager un rappel"}
              </GhostButton>

              <GhostButton
                onClick={() => void relancerParMail()}
                disabled={preparationMail || pendingRows.length === 0}
                className="!px-3 !py-2 text-[11px] sm:!px-4 sm:!py-2.5 sm:text-xs"
                title="Ouvre ta boîte mail avec les retardataires en copie cachée"
              >
                <Mail size={12} className={preparationMail ? "animate-pulse" : ""} />
                {preparationMail ? "Préparation…" : "Relancer par mail"}
              </GhostButton>

              {/* Compact sur mobile (padding/texte réduits) mais reste la
                  priorité visuelle — même couleur, même position, juste
                  moins volumineux sur petit écran. */}
              <PrimaryButton
                onClick={remindAll}
                disabled={remindingAll || pendingRows.length === 0}
                className="!px-3 !py-2 text-[11px] sm:!px-4 sm:!py-2 sm:text-xs"
              >
                <Bell size={13} className={remindingAll ? "animate-pulse" : ""} />
                {remindingAll
                  ? "Envoi en cours…"
                  : pendingJoignables === null
                    ? `Rappeler tous (${pendingRows.length})`
                    : `Rappeler (${pendingJoignables} sur ${pendingRows.length})`}
              </PrimaryButton>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-5 pb-0">
            <ErrorBanner message={error} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-5 sm:gap-3 sm:p-5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-2xl border p-3 text-left transition sm:p-4 ${
              filter === "all" ? "border-emerald-500/50 bg-emerald-500/10" : "border-slate-800 bg-[#0d1322]"
            }`}
          >
            <div className="font-display text-xl font-black text-white sm:text-2xl">{summary.total}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">Joueurs</div>
          </button>

          <button
            type="button"
            onClick={() => setFilter("complete")}
            className={`rounded-2xl border p-3 text-left transition sm:p-4 ${
              filter === "complete" ? "border-emerald-500/50 bg-emerald-500/10" : "border-slate-800 bg-[#0d1322]"
            }`}
          >
            <div className="font-display text-xl font-black text-emerald-400 sm:text-2xl">{summary.complete}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">Complets</div>
          </button>

          <button
            type="button"
            onClick={() => setFilter("incomplete")}
            className={`rounded-2xl border p-3 text-left transition sm:p-4 ${
              filter === "incomplete" ? "border-amber-500/50 bg-amber-500/10" : "border-slate-800 bg-[#0d1322]"
            }`}
          >
            <div className="font-display text-xl font-black text-amber-400 sm:text-2xl">{summary.incomplete}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">Incomplets</div>
          </button>

          <button
            type="button"
            onClick={() => setFilter("none")}
            className={`rounded-2xl border p-3 text-left transition sm:p-4 ${
              filter === "none" ? "border-red-500/50 bg-red-500/10" : "border-slate-800 bg-[#0d1322]"
            }`}
          >
            <div className="font-display text-xl font-black text-red-400 sm:text-2xl">{summary.none}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">Aucun prono</div>
          </button>

          {/* Moyenne : indicatif uniquement (pas un filtre — il n'y a rien
              d'utile à filtrer par "moyenne de complétion" par joueur). */}
          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3 text-left sm:p-4">
            <div className="font-display text-xl font-black text-sky-300 sm:text-2xl">{summary.average}%</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">Pronos déposés</div>
          </div>
        </div>

        <div className="border-t border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
            <div className="text-xs text-slate-400">
              {selectedMatchday ? (
                <>
                  <span className="font-bold text-white">J{selectedMatchday.number}</span>
                  {" · "}
                  {selectedMatches.length} match{selectedMatches.length > 1 ? "s" : ""} Ligue 1
                </>
              ) : (
                "Aucune journée sélectionnée"
              )}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
              {l1Expected} prono{l1Expected > 1 ? "s" : ""} Ligue 1{bonusExpected ? " + 1 bonus" : ""} attendu{l1Expected + (bonusExpected ? 1 : 0) > 1 ? "s" : ""}
            </div>
          </div>

          {/* En-têtes de colonnes — desktop uniquement (même pattern que
              BonusCompetitionRow dans l'onglet Bonus) : JOUEUR / LIGUE 1 /
              BONUS / STATUT / ACTION, alignés sur la grille de chaque ligne. */}
          <div className="hidden border-b border-slate-800/70 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 lg:grid lg:grid-cols-[minmax(0,1fr)_100px_110px_170px_auto] lg:items-center lg:gap-3">
            <span>Joueur</span>
            <span className="text-center">Ligue 1</span>
            <span className="text-center">Bonus</span>
            <span>Statut</span>
            <span className="text-right">Action</span>
          </div>

          <div className="divide-y divide-slate-800/70">
            {filteredRows.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                Aucun joueur dans ce filtre.
              </div>
            ) : (
              filteredRows.map((row, index) => {
                const playerId = String(row.player.id);
                const wasReminded = reminded.has(playerId);
                const isReminding = reminding.has(playerId);
                const wasCopied = copiedId === playerId;
                const complet = row.status === "complete";

                return (
                  <Fragment key={playerId}>
                    {listeMixte && index === 0 && (
                      <div className="flex items-center gap-2 bg-amber-500/[0.06] px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/90">
                        <Bell size={11} />À relancer · {pendingRows.length}
                      </div>
                    )}
                    {listeMixte && index === premierComplet && (
                      <div className="flex items-center gap-2 bg-emerald-500/[0.06] px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/90">
                        <CheckCircle2 size={11} />
                        Ont fait leurs pronos · {summary.complete}
                      </div>
                    )}
                  <div
                    /* Sous 1024px, cette ligne empilait CINQ blocs les uns
                       sous les autres : ~190px par joueur, soit 4400px a
                       faire defiler pour retrouver les retardataires parmi 23.
                       Elle se replie desormais en deux lignes — le joueur et
                       son bouton, puis ses trois etats cote a cote — avec
                       `flex-wrap` et `order`. La grille des grands ecrans, et
                       donc son affichage en colonnes, ne bouge pas : chaque
                       bloc retrouve sa place d'origine via `lg:order-*`. */
                    className={`flex flex-wrap items-center gap-x-2.5 gap-y-1.5 lg:grid lg:grid-cols-[minmax(0,1fr)_100px_110px_170px_auto] lg:items-center lg:gap-3 lg:p-4 ${
                      complet ? "px-3.5 py-2" : "p-3.5"
                    } ${
                      row.status === "none"
                        ? "bg-red-500/[0.035]"
                        : row.status === "incomplete"
                          ? "bg-amber-500/[0.025]"
                          : ""
                    }`}
                  >
                    {/* Colonne JOUEUR */}
                    <div className="order-1 flex min-w-0 flex-1 items-center gap-3 lg:order-1 lg:flex-none">
                      <div
                        className={`relative shrink-0 overflow-hidden rounded-full border border-slate-700 bg-slate-800 ${
                          complet ? "size-7 sm:size-8 lg:size-10" : "size-9 sm:size-10"
                        }`}
                      >
                        {row.player.avatar_url ? (
                          <img
                            src={row.player.avatar_url}
                            alt={row.player.pseudo ?? ""}
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center font-display text-sm font-black text-slate-400">
                            {(row.player.pseudo ?? "?").slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 truncate font-semibold text-white">
                        {row.player.pseudo ?? "Sans pseudo"}
                      </div>
                    </div>

                    {/* saut de ligne (telephone seulement) — inutile pour un
                        joueur a jour : sans bouton d'action, sa ligne tient
                        deja sur une seule, et c'est autant de defilement en
                        moins avant d'atteindre le suivant. */}
                    {!complet && <div aria-hidden className="order-3 h-0 basis-full lg:hidden" />}

                    {/* Colonne LIGUE 1 — X/Y matches pronostiqués */}
                    <div className="order-4 flex items-center gap-2 lg:order-2 lg:justify-center">
                      <span
                        className={`font-display text-sm font-black ${
                          row.l1Completed === row.l1Expected && row.l1Expected > 0
                            ? "text-emerald-400"
                            : row.l1Completed === 0
                              ? "text-red-400"
                              : "text-amber-400"
                        }`}
                      >
                        {/* « L1 » explicite : sans lui, « 9/9 » suivi de
                            « Non fait » se lit comme une contradiction, alors
                            que les deux ne parlent pas de la meme chose. */}
                        <span className="mr-1 text-[9px] text-slate-500">L1</span>
                        {row.l1Completed}/{row.l1Expected}
                      </span>
                    </div>

                    {/* Colonne BONUS — sélectionné ou non (le cas "aucun bonus configuré
                        pour la journée" reste un simple tiret, pas un statut manquant). */}
                    <div className="order-5 flex items-center gap-2 lg:order-3 lg:justify-center">
                      {row.bonusExpected ? (
                        <span
                          className={`font-mono text-[11px] font-bold ${
                            row.bonusSelected ? "text-emerald-400" : "text-amber-400"
                          }`}
                        >
                          🎁 Bonus {row.bonusSelected ? "fait" : "non fait"}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-slate-600">—</span>
                      )}
                    </div>

                    {/* Colonne STATUT */}
                    <div className="order-6 lg:order-4">
                      {row.status === "complete" ? (
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-emerald-400">
                          <CheckCircle2 size={12} />
                          🟢 COMPLET
                        </span>
                      ) : row.status === "incomplete" ? (
                        <span className="font-mono text-[11px] font-bold text-amber-400">
                          🟠 INCOMPLET
                          {row.l1Missing > 0
                            ? ` · ${row.l1Missing} match${row.l1Missing > 1 ? "s" : ""} L1`
                            : row.bonusExpected && !row.bonusSelected
                              ? " · bonus manquant"
                              : ""}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] font-bold text-red-400">🔴 AUCUN PRONO</span>
                      )}
                    </div>

                    {/* Colonne ACTION — Rappeler (Push) + Partager (copier/partager
                        un texte avec le lien du site), uniquement pour les joueurs
                        qui n'ont pas terminé. */}
                    {row.status !== "complete" && (
                      <div className="order-2 flex shrink-0 flex-wrap items-center gap-1.5 lg:order-5 lg:justify-end lg:gap-2">
                        <button
                          type="button"
                          onClick={() => void remind(row)}
                          disabled={isReminding}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            wasReminded
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                          }`}
                        >
                          {isReminding ? (
                            <RefreshCw size={13} className="animate-spin" />
                          ) : wasReminded ? (
                            <Check size={13} />
                          ) : (
                            <Bell size={13} />
                          )}
                          {isReminding ? "Envoi…" : wasReminded ? "Envoyé" : "Rappeler"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void shareReminder(row)}
                          title="Copier / partager un rappel avec le lien du site"
                          className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide transition ${
                            wasCopied
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-slate-700 bg-[#0d1322] text-slate-400 hover:text-white"
                          }`}
                        >
                          {wasCopied ? <Check size={13} /> : <Share2 size={13} />}
                        </button>
                      </div>
                    )}
                  </div>
                  </Fragment>
                );
              })
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex gap-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
          <div className="text-xs leading-relaxed text-slate-400">
            Le suivi utilise les lignes enregistrées dans <span className="font-semibold text-slate-200">predictions</span>.
            Le bouton <span className="font-semibold text-slate-200">Rappeler</span> envoie une notification Push réelle au joueur ciblé (via l'Edge Function Supabase <span className="font-semibold text-slate-200">send-prono-reminders</span>) — s'il n'a jamais activé les notifications, tu seras prévenu au lieu d'un faux succès.
            Le bouton <Share2 size={11} className="inline -mt-0.5" /> <span className="font-semibold text-slate-200">Partager</span> prépare un message avec le lien du site (ouvre le partage natif sur mobile, sinon le copie dans le presse-papiers) — utile pour relancer un joueur qui n'a pas activé le Push.
            <span className="block mt-1 text-slate-500">
              Les clés VAPID et la clé service_role restent côté Edge Function : le navigateur ne transporte que ta session admin, jamais de secret serveur.
            </span>
          </div>
        </div>
      </Card>

      {/* Dégagement réel (mesuré, pas deviné) au-dessus de la nav flottante
          d'AppShell — voir --app-nav-h dans AppShell.tsx (ResizeObserver sur
          la nav réelle). S'ajoute au pb-32 déjà présent sur tout l'onglet
          Admin : celui-ci reste un filet générique pour tous les onglets,
          celui-ci garantit spécifiquement que le dernier joueur et son
          bouton "Rappeler" ne finissent jamais sous la nav, quelle que soit
          sa hauteur réelle (safe-area comprise). Mobile uniquement — le
          rendu desktop n'a pas de nav flottante à dégager de cette façon. */}
      <div
        aria-hidden
        className="sm:hidden"
        style={{ height: "calc(var(--app-nav-h, 72px) + env(safe-area-inset-bottom) + 16px)" }}
      />
    </div>
  );
}

// ============================================================
// 👥 ONGLET JOUEURS (Mis à jour avec Équipe favorite et Dérogation admin - Phases 2, 3, 4)
// ============================================================
function PlayersTab({
  players,
  teams,
  setPlayers,
  error,
  onChanged,
  notify,
}: {
  players: Player[];
  teams: Team[];
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  error?: string;
  onChanged: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Player | null>(null);
  // Adresses e-mail : l'identifiant technique affiche sous chaque pseudo
  // (657b97dc-c1ae-4e5b...) n'aide personne a reconnaitre un joueur.
  // Les e-mails vivent dans auth.users, illisible depuis le navigateur :
  // ils passent par api/emails-joueurs.ts, reserve aux admins.
  const [emailsById, setEmailsById] = useState<Record<string, string>>({});

  useEffect(() => {
    let annule = false;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const jeton = data.session?.access_token;
        if (!jeton) return;

        const reponse = await fetch("/api/emails-joueurs", {
          method: "POST",
          headers: { Authorization: `Bearer ${jeton}` },
        });
        if (!reponse.ok) return;

        const corps = await reponse.json().catch(() => ({}));
        if (!annule && corps?.emails) setEmailsById(corps.emails);
      } catch {
        // Sans e-mails, on retombe sur l'identifiant : jamais bloquant.
      }
    })();

    return () => {
      annule = true;
    };
  }, []);
  const [editing, setEditing] = useState<Player | null>(null);
  const [editForm, setEditForm] = useState({ pseudo: "", favorite_team_id: "" });
  const [saving, setSaving] = useState(false);

  function openEdit(player: Player) {
    setEditing(player);
    setEditForm({ pseudo: player.pseudo ?? "", favorite_team_id: player.favorite_team_id ?? "" });
  }

  async function submitEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      await updatePlayer(editing.id, {
        pseudo: editForm.pseudo.trim() || null,
        favorite_team_id: editForm.favorite_team_id || null,
        favorite_team_override: true, // Phase 4 : Dérogation admin active lors de la modification admin
      });
      setEditing(null);
      await onChanged();
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de la modification du joueur.");
    } finally {
      setSaving(false);
    }
  }

  // Mise à jour optimiste : le rôle change à l'écran immédiatement, sans
  // attendre Supabase. On ne resynchronise (refetch complet) qu'en cas
  // d'erreur, pour revenir à un état garanti cohérent.
  async function toggleAdmin(player: Player) {
    setBusyId(player.id);
    const nextIsAdmin = !player.is_admin;
    setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, is_admin: nextIsAdmin } : p)));
    try {
      await setPlayerAdmin(player.id, nextIsAdmin);
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de la mise à jour.");
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  // Idem : le joueur disparaît du tableau tout de suite. En cas d'échec de
  // la suppression côté Supabase, on resynchronise pour le faire réapparaître.
  async function confirmAndDelete() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setBusyId(target.id);
    setPlayers((prev) => prev.filter((p) => p.id !== target.id));
    setConfirmDelete(null);
    try {
      await apiDeletePlayer(target.id);
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de la suppression.");
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
          <Users size={18} className="text-emerald-400" />
          Joueurs ({players.length})
        </h2>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {players.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Aucun joueur pour le moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-left font-mono text-[10px] uppercase tracking-widest text-slate-500">
                <th className="pb-2 pr-3">Joueur</th>
                <th className="pb-2 pr-3">Équipe favorite</th>
                <th className="pb-2 pr-3">Statut</th>
                <th className="pb-2 pr-3">Rôle</th>
                <th className="pb-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const favoriteTeam = teams.find((team) => team.id === player.favorite_team_id);
                return (
                <tr key={player.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/40 transition-colors">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-3">
                      <span className="relative size-9 shrink-0 overflow-hidden rounded-full border border-slate-700 bg-slate-800">
                        {player.avatar_url ? (
                          <img src={player.avatar_url} alt={player.pseudo ?? ""} className="size-full object-cover" />
                        ) : (
                          <span className="flex size-full items-center justify-center font-display text-sm font-bold text-slate-400">
                            {(player.pseudo ?? "?").slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-100">{player.pseudo ?? "Sans pseudo"}</div>
                        <div
                          className="truncate font-mono text-[10px] text-slate-500"
                          title={emailsById[player.id] ? player.id : undefined}
                        >
                          {emailsById[player.id] ?? player.id}
                        </div>
                        {/* VISITE REELLE uniquement (profiles.last_seen_at,
                            ecrite a chaque ouverture du site). La date
                            d'authentification de Supabase a ete retiree : elle
                            ne bougeait qu'a la saisie du mot de passe et
                            laissait croire qu'un joueur n'etait jamais revenu. */}
                        <div className="mt-1 truncate font-mono text-[11px] font-semibold text-emerald-300/90">
                          {player.last_seen_at
                            ? `Vu ${formatDerniereConnexion(player.last_seen_at)}`
                            : "Jamais venu depuis la mise en place"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <ClubBadge value={favoriteTeam?.name ?? ""} />
                  </td>
                  <td className="py-3 pr-3">
                    {favoriteTeam ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-mono">
                        <Check size={14} /> {player.favorite_team_override ? "Modifié (Admin)" : "OK"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-mono">
                        <AlertTriangle size={14} /> En attente
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    {player.is_admin ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-mono text-[10px] font-bold text-gold">
                        <Crown size={11} />
                        ADMIN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-400">
                        JOUEUR
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-0 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <GhostButton onClick={() => openEdit(player)} title="Modifier">
                        <Pencil size={12} />
                        Modifier
                      </GhostButton>
                      <GhostButton onClick={() => toggleAdmin(player)} title="Basculer le rôle">
                        {busyId === player.id ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : player.is_admin ? (
                          <ShieldOff size={12} />
                        ) : (
                          <Shield size={12} />
                        )}
                        {player.is_admin ? "Rétrograder" : "Promouvoir"}
                      </GhostButton>
                      <GhostButton
                        danger
                        onClick={() => setConfirmDelete(player)}
                        title="Supprimer"
                        ariaLabel={`Supprimer le joueur ${player.pseudo ?? player.id}`}
                      >
                        <Trash2 size={12} />
                      </GhostButton>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title="Modifier le joueur" onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                Pseudo
              </label>
              <TextInput
                value={editForm.pseudo}
                onChange={(e) => setEditForm((f) => ({ ...f, pseudo: e.target.value }))}
                placeholder="Pseudo du joueur"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                Équipe favorite
              </label>
              <select
                value={editForm.favorite_team_id}
                onChange={(e) => setEditForm((f) => ({ ...f, favorite_team_id: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
              >
                <option value="">— Aucune —</option>
                {teams.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <GhostButton onClick={() => setEditing(null)}>Annuler</GhostButton>
              <PrimaryButton onClick={submitEdit} disabled={saving}>
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                Enregistrer
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer ce joueur ?"
          description={`${confirmDelete.pseudo ?? "Ce joueur"} sera définitivement supprimé, ainsi que ses pronostics et paiements associés.`}
          confirmLabel="Supprimer"
          busy={busyId === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={confirmAndDelete}
        />
      )}
    </Card>
  );
}

// ============================================================
// 💳 ONGLET PAIEMENTS
// ============================================================
function PaymentsTab({
  players,
  payments,
  setPayments,
  entryFee,
  paidCount,
  totalCollected,
  totalExpected,
  error,
  onChanged,
  notify,
}: {
  players: Player[];
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  entryFee: number;
  paidCount: number;
  totalCollected: number;
  totalExpected: number;
  error?: string;
  onChanged: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState("");
  // La cagnotte est automatiquement liée au nombre de joueurs inscrits.
  // Chaque joueur verse 10 €.
  const prizePlayerCount = players.length;
  const prizePoolTotal = prizePlayerCount * 10;

  // Répartition automatique 50 % / 30 % / 20 %.
  // Le 1er et le 2e sont arrondis à la dizaine supérieure.
  // Le 3e reçoit automatiquement le reste pour que les 3 gains
  // correspondent toujours exactement à la cagnotte.
  const prizeFirst = Math.ceil((prizePoolTotal * 0.50) / 10) * 10;
  const prizeSecond = Math.ceil((prizePoolTotal * 0.30) / 10) * 10;
  const prizeThird = Math.max(0, prizePoolTotal - prizeFirst - prizeSecond);


  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    players.forEach((p) => map.set(p.id, p));
    return map;
  }, [players]);

  /**
   * Une seule ligne affichée par joueur.
   *
   * Si plusieurs lignes existent pour le même user_id (ancien doublon),
   * on conserve en priorité :
   * 1. une ligne PAYÉE ;
   * 2. la ligne la plus récente.
   *
   * Cela protège l'interface même avant le nettoyage définitif en base.
   */
  const uniquePayments = useMemo(() => {
    const byUser = new Map<string, Payment>();

    for (const payment of payments) {
      const userId = String(payment.user_id ?? "");
      if (!userId || !playerById.has(userId)) continue;

      const existing = byUser.get(userId);
      if (!existing) {
        byUser.set(userId, payment);
        continue;
      }

      const existingDate = existing.payment_date ? new Date(existing.payment_date).getTime() : 0;
      const currentDate = payment.payment_date ? new Date(payment.payment_date).getTime() : 0;

      if (
        (!existing.paid && payment.paid) ||
        (existing.paid === payment.paid && currentDate > existingDate)
      ) {
        byUser.set(userId, payment);
      }
    }

    return players
      .map((player) => byUser.get(player.id))
      .filter((payment): payment is Payment => Boolean(payment));
  }, [payments, players, playerById]);

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return uniquePayments;

    return uniquePayments.filter((payment) => {
      const pseudo = playerById.get(payment.user_id)?.pseudo ?? "";
      return pseudo.toLowerCase().includes(query);
    });
  }, [uniquePayments, playerById, search]);

  const missingCount = Math.max(players.length - uniquePayments.length, 0);

  // Nommer les joueurs sans ligne de paiement : "1 joueur sans paiement"
  // obligeait a comparer 23 lignes a la main pour trouver lequel.
  const missingPlayers = useMemo(() => {
    const avecPaiement = new Set(uniquePayments.map((payment) => String(payment.user_id)));
    return players.filter((player) => !avecPaiement.has(String(player.id)));
  }, [players, uniquePayments]);

  async function togglePaid(payment: Payment) {
    setBusyId(payment.id);
    const nextPaid = !payment.paid;

    setPayments((prev) =>
      prev.map((p) => (p.id === payment.id ? { ...p, paid: nextPaid } : p)),
    );

    try {
      await setPaymentPaid(payment.id, nextPaid);
      await onChanged();
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de la mise à jour.");
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function saveAmount(payment: Payment) {
    const raw = editingAmount[payment.id];
    if (raw === undefined) return;

    const amount = Number(raw.replace(",", "."));
    if (Number.isNaN(amount) || amount < 0) {
      notify("Montant invalide.");
      return;
    }

    setBusyId(payment.id);

    try {
      await setPaymentAmount(payment.id, amount);
      await onChanged();

      setEditingAmount((prev) => {
        const next = { ...prev };
        delete next[payment.id];
        return next;
      });
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de la mise à jour du montant.");
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Régénération complète :
   * - crée les paiements des nouveaux joueurs ;
   * - ne modifie pas les paiements existants ;
   * - permet au service de nettoyer les doublons si sa fonction
   *   de synchronisation complète est disponible.
   *
   * Le bouton reste disponible même quand aucun paiement ne manque,
   * car il sert également à resynchroniser la liste.
   */
  async function handleRegenerate() {
    setGenerating(true);

    try {
      const result = await regeneratePayments(players, entryFee);
      await onChanged();
      const details = [];
      if (result.removedDuplicates > 0) {
        details.push(`${result.removedDuplicates} doublon${result.removedDuplicates > 1 ? "s" : ""} supprimé${result.removedDuplicates > 1 ? "s" : ""}`);
      }
      if (result.created > 0) {
        details.push(`${result.created} paiement${result.created > 1 ? "s" : ""} créé${result.created > 1 ? "s" : ""}`);
      }
      notify(details.length ? `✅ ${details.join(" • ")}.` : "✅ Paiements déjà synchronisés.");
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de la régénération des paiements.");
    } finally {
      setGenerating(false);
    }
  }

  const displayedPaidCount = uniquePayments.filter((p) => p.paid).length;
  const displayedTotalCollected = uniquePayments
    .filter((p) => p.paid)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill label="Payé" value={`${displayedPaidCount} / ${players.length}`} />
        <StatPill label="Collecté" value={`${displayedTotalCollected}€`} tone="text-gold" />
        <StatPill label="Attendu" value={`${totalExpected}€`} tone="text-sky-400" />
        <StatPill
          label="Restant"
          value={`${Math.max(totalExpected - displayedTotalCollected, 0)}€`}
          tone="text-red-400"
        />
      </div>

      <Card className="overflow-hidden border-amber-500/20 bg-gradient-to-br from-[#10182a] via-[#0b1325] to-[#0a1020] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
              <Trophy size={18} className="text-amber-400" />
              Gains de la saison
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Répartition basée sur 50 % / 30 % / 20 %, ajustée aux dizaines pour garder des montants ronds.
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-2 text-right">
            <div className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
              {prizePlayerCount} joueur{prizePlayerCount > 1 ? "s" : ""} × 10 €
            </div>
            <div className="font-display text-lg font-black text-white">
              {prizePoolTotal} €
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-amber-300">🥇 1er · 50 %</div>
            <div className="mt-1 font-display text-2xl font-black text-white">{prizeFirst}€</div>
          </div>
          <div className="rounded-2xl border border-slate-500/30 bg-slate-500/10 p-4">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300">🥈 2e · 30 %</div>
            <div className="mt-1 font-display text-2xl font-black text-white">{prizeSecond}€</div>
          </div>
          <div className="rounded-2xl border border-orange-500/25 bg-orange-500/10 p-4">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-orange-300">🥉 3e · 20 %</div>
            <div className="mt-1 font-display text-2xl font-black text-white">{prizeThird}€</div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
          <span>Total réparti : {prizeFirst + prizeSecond + prizeThird}€</span>
          <span>Chaque gain finit par 0</span>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
            <Wallet size={18} className="text-emerald-400" />
            Paiements
            <span className="ml-1 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-0.5 font-mono text-[11px] font-bold text-slate-300">
              {displayedPaidCount} payé{displayedPaidCount > 1 ? "s" : ""} / {players.length} inscrit
              {players.length > 1 ? "s" : ""}
            </span>
          </h2>

          {/* Le bouton s'appelait "Regenerer", ce qui laissait craindre une
              remise a zero des paiements. Il ne fait que deux choses : creer
              une ligne (non payee) pour les joueurs qui n'en ont pas encore,
              et supprimer les doublons en gardant la ligne payee. Aucun
              paiement deja enregistre n'est efface. */}
          <div className="flex flex-col items-end gap-1">
            <GhostButton
              onClick={() => void handleRegenerate()}
              disabled={generating}
              ariaLabel="Ajouter les joueurs manquants a la liste des paiements"
            >
              <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
              {generating ? "Synchronisation…" : "Ajouter les joueurs manquants"}
            </GhostButton>
            <span className="text-[10px] text-slate-500">
              N'efface aucun paiement déjà enregistré
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} />
          </div>
        )}

        {!error && uniquePayments.length > 0 && (
          <div className="mb-4">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un joueur…"
              className="!max-w-xs"
            />
          </div>
        )}

        {!error && uniquePayments.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            Aucun paiement enregistré. Clique sur « Régénérer » pour synchroniser les joueurs.
          </p>
        ) : !error && filteredPayments.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            Aucun joueur ne correspond à « {search} ».
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-left font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  <th className="pb-2 pr-3">Joueur</th>
                  <th className="pb-2 pr-3">Montant</th>
                  <th className="pb-2 pr-3">Statut</th>
                  <th className="pb-2 pr-3">Date de paiement</th>
                  <th className="pb-2 pr-0 text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredPayments.map((payment) => {
                  const player = playerById.get(payment.user_id);
                  const editValue = editingAmount[payment.id];

                  return (
                    <tr key={payment.id} className="border-b border-slate-800/60 last:border-0">
                      <td className="py-3 pr-3 font-semibold text-slate-100">
                        {player?.pseudo ?? "Joueur inconnu"}
                      </td>

                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <TextInput
                            inputMode="decimal"
                            className="!w-24 !py-1.5"
                            value={editValue ?? String(payment.amount)}
                            onChange={(e) =>
                              setEditingAmount((prev) => ({
                                ...prev,
                                [payment.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveAmount(payment);
                            }}
                          />
                          <span className="text-xs text-slate-500">€</span>

                          {editValue !== undefined && editValue !== String(payment.amount) && (
                            <GhostButton
                              onClick={() => void saveAmount(payment)}
                              title="Enregistrer le montant"
                              ariaLabel={`Enregistrer le montant de ${player?.pseudo ?? "ce joueur"}`}
                            >
                              {busyId === payment.id ? (
                                <RefreshCw size={12} className="animate-spin" />
                              ) : (
                                <Save size={12} />
                              )}
                            </GhostButton>
                          )}
                        </div>
                      </td>

                      <td className="py-3 pr-3">
                        {payment.paid ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint/10 px-2.5 py-1 font-mono text-[10px] font-bold text-mint">
                            <CheckCircle2 size={11} />
                            PAYÉ
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-red-400">
                            <AlertTriangle size={11} />
                            NON PAYÉ
                          </span>
                        )}
                      </td>

                      <td className="py-3 pr-3 font-mono text-xs text-slate-400">
                        {payment.payment_date
                          ? new Date(payment.payment_date).toLocaleDateString("fr-FR", {
                              dateStyle: "medium",
                            })
                          : "—"}
                      </td>

                      <td className="py-3 pr-0 text-right">
                        <GhostButton
                          onClick={() => void togglePaid(payment)}
                          disabled={busyId === payment.id}
                          title={payment.paid ? "Marquer non payé" : "Marquer payé"}
                          ariaLabel={`${payment.paid ? "Marquer non payé" : "Marquer payé"} pour ${player?.pseudo ?? "ce joueur"}`}
                        >
                          {busyId === payment.id ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={12} />
                          )}
                          {payment.paid ? "Marquer non payé" : "Marquer payé"}
                        </GhostButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4 text-xs text-slate-500">
          <span>
            {uniquePayments.length} paiement{uniquePayments.length > 1 ? "s" : ""} affiché
            {uniquePayments.length > 1 ? "s" : ""} pour {players.length} joueur
            {players.length > 1 ? "s" : ""}.
          </span>

          {missingCount > 0 && (
            <span className="font-semibold text-amber-400">
              {missingPlayers.length > 0
                ? `Sans ligne de paiement : ${missingPlayers
                    .map((player) => player.pseudo || "Joueur")
                    .join(", ")}`
                : `${missingCount} joueur${missingCount > 1 ? "s" : ""} sans paiement`}
              {" — utilise « Ajouter les joueurs manquants » en haut."}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}


// ============================================================
// ⚽ ONGLET MATCHS
// ============================================================
const emptyMatchForm = {
  matchday_id: "",
  home_team_id: "",
  away_team_id: "",
  kickoff: "",
  finished: false,
};

/** Statut d'affichage dérivé (il n'existe pas de colonne "status" en base). */
function matchDisplayStatus(match: Pick<Match, "finished" | "kickoff">): "scheduled" | "live" | "finished" {
  if (match.finished) return "finished";
  if (match.kickoff && new Date(match.kickoff).getTime() <= Date.now()) return "live";
  return "scheduled";
}

function matchdayLabel(md: Matchday | null | undefined) {
  if (!md) return "—";
  return `J${md.number}`;
}

/** Détermine la journée à afficher par défaut à l'ouverture de l'onglet :
 * la journée "en cours" (aujourd'hui tombe dans sa plage de coups d'envoi,
 * + 3h de tolérance pour couvrir un match encore en jeu), sinon la
 * prochaine journée à venir, sinon la dernière journée jouée, sinon la
 * première journée connue. */
function computeDefaultMatchdayId(matchdays: Matchday[], matches: Match[]): string | null {
  const sorted = [...matchdays].sort((a, b) => a.number - b.number);
  if (sorted.length === 0) return null;

  const rangeByMatchday = new Map<string, { min: number; max: number }>();
  matches.forEach((m) => {
    if (!m.matchday_id || !m.kickoff) return;
    const t = new Date(m.kickoff).getTime();
    if (Number.isNaN(t)) return;
    const range = rangeByMatchday.get(m.matchday_id);
    if (range) {
      range.min = Math.min(range.min, t);
      range.max = Math.max(range.max, t);
    } else {
      rangeByMatchday.set(m.matchday_id, { min: t, max: t });
    }
  });

  const now = Date.now();
  const THREE_HOURS = 3 * 60 * 60 * 1000;

  const ongoing = sorted.find((md) => {
    const range = rangeByMatchday.get(md.id);
    return range && now >= range.min && now <= range.max + THREE_HOURS;
  });
  if (ongoing) return ongoing.id;

  let next: Matchday | null = null;
  for (const md of sorted) {
    const range = rangeByMatchday.get(md.id);
    if (range && range.min > now) {
      if (!next || range.min < rangeByMatchday.get(next.id)!.min) next = md;
    }
  }
  if (next) return next.id;

  const withMatches = sorted.filter((md) => rangeByMatchday.has(md.id));
  if (withMatches.length > 0) return withMatches[withMatches.length - 1].id;

  return sorted[0].id;
}

function MatchesTab({
  matches,
  setMatches,
  matchdays,
  teams,
  error,
  teamsError,
  onChanged,
  refreshMatchdays,
  notify,
  clearErrors,
}: {
  matches: Match[];
  setMatches: React.Dispatch<React.SetStateAction<Match[]>>;
  matchdays: Matchday[];
  teams: Team[];
  error?: string;
  teamsError?: string;
  onChanged: () => Promise<void>;
  refreshMatchdays: () => Promise<void>;
  notify: (message: string) => void;
  clearErrors: (keys: string[]) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Match | null>(null);
  const [form, setForm] = useState(emptyMatchForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Match | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncingApi, setSyncingApi] = useState(false);

  // Sélecteur de journée : "all" affiche tout, sinon l'id de la journée
  // choisie. `null` = pas encore initialisé (le premier effet ci-dessous
  // pose la journée courante/prochaine dès que les données sont là), pour
  // ne pas écraser un choix déjà fait par l'admin lors d'un simple refetch.
  const [selectedMatchdayId, setSelectedMatchdayId] = useState<string | "all" | null>(null);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, { home: string; away: string }>>({});
  const [savingScoreId, setSavingScoreId] = useState<string | null>(null);

  const matchdaysById = useMemo(() => new Map(matchdays.map((md) => [md.id, md])), [matchdays]);

  // Cet onglet ne montre que la Ligue 1 : les autres championnats européens
  // (synchronisés depuis l'onglet Bonus) portent un match_type distinct de
  // "LIGUE1" et vivent dans leur propre liste là-bas.
  const ligue1Matches = useMemo(
    () => matches.filter((m) => (m.match_type ?? "LIGUE1") === "LIGUE1"),
    [matches],
  );
  const ligue1MatchdayIds = useMemo(
    () => new Set(ligue1Matches.map((m) => m.matchday_id).filter((id): id is string => !!id)),
    [ligue1Matches],
  );
  const sortedMatchdays = useMemo(
    () => matchdays.filter((md) => ligue1MatchdayIds.has(md.id)).sort((a, b) => a.number - b.number),
    [matchdays, ligue1MatchdayIds],
  );

  useEffect(() => {
    if (selectedMatchdayId !== null || sortedMatchdays.length === 0) return;
    setSelectedMatchdayId(computeDefaultMatchdayId(sortedMatchdays, ligue1Matches) ?? "all");
  }, [sortedMatchdays, ligue1Matches, selectedMatchdayId]);

  const visibleMatches = useMemo(() => {
    if (selectedMatchdayId === null || selectedMatchdayId === "all") return ligue1Matches;
    return ligue1Matches.filter((m) => m.matchday_id === selectedMatchdayId);
  }, [ligue1Matches, selectedMatchdayId]);

  function scoreDraftFor(match: Match) {
    return (
      scoreDrafts[match.id] ?? {
        home: match.home_score === null || match.home_score === undefined ? "" : String(match.home_score),
        away: match.away_score === null || match.away_score === undefined ? "" : String(match.away_score),
      }
    );
  }

  function setScoreDraft(match: Match, patch: Partial<{ home: string; away: string }>) {
    setScoreDrafts((prev) => ({ ...prev, [match.id]: { ...scoreDraftFor(match), ...patch } }));
  }

  // Sauvegarde manuelle du score, y compris sur un match "à venir" : les
  // deux champs présents et numériques font basculer `finished` à true
  // automatiquement (seul signal de statut porté par le modèle actuel,
  // voir matchDisplayStatus) ; un score partiel n'y touche pas.
  async function saveScore(match: Match) {
    const draft = scoreDraftFor(match);
    const homeRaw = draft.home.trim();
    const awayRaw = draft.away.trim();
    const home = homeRaw === "" ? null : Number(homeRaw);
    const away = awayRaw === "" ? null : Number(awayRaw);
    if ((home !== null && Number.isNaN(home)) || (away !== null && Number.isNaN(away))) {
      notify("Le score doit être un nombre.");
      return;
    }
    if (home !== null && home < 0) return notify("Le score domicile ne peut pas être négatif.");
    if (away !== null && away < 0) return notify("Le score extérieur ne peut pas être négatif.");

    setSavingScoreId(match.id);
    try {
      const bothPresent = home !== null && away !== null;
      await updateMatch(match.id, {
        home_score: home,
        away_score: away,
        finished: bothPresent ? true : match.finished,
      });
      setScoreDrafts((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
      await onChanged();
    } catch (e) {
      notify(errorMessage(e, "Erreur lors de l'enregistrement du score."));
    } finally {
      setSavingScoreId(null);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyMatchForm);
    setFormOpen(true);
  }

  function openEdit(match: Match) {
    setEditing(match);
    setForm({
      matchday_id: match.matchday_id ?? "",
      home_team_id: match.home_team_id ?? "",
      away_team_id: match.away_team_id ?? "",
      kickoff: match.kickoff ? match.kickoff.slice(0, 16) : "",
      finished: match.finished,
    });
    setFormOpen(true);
  }

  async function submitForm() {
    if (!form.home_team_id || !form.away_team_id || !form.kickoff) {
      notify("Renseigne les deux équipes et la date/heure du match.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        matchday_id: form.matchday_id || null,
        home_team_id: form.home_team_id,
        away_team_id: form.away_team_id,
        kickoff: new Date(form.kickoff).toISOString(),
        finished: form.finished,
        home_score: editing?.home_score ?? null,
        away_score: editing?.away_score ?? null,
      };

      if (editing) {
        await updateMatch(editing.id, payload);
      } else {
        await createMatch(payload);
      }

      setFormOpen(false);
      await onChanged();
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de l'enregistrement du match.");
    } finally {
      setSaving(false);
    }
  }

  // Optimiste : le match quitte la liste immédiatement : on ne resynchronise
  // depuis Supabase que si la suppression échoue réellement côté serveur.
  async function confirmAndDelete() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setBusyId(target.id);
    setMatches((prev) => prev.filter((m) => m.id !== target.id));
    setConfirmDelete(null);
    try {
      await apiDeleteMatch(target.id);
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de la suppression.");
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  // Synchronise via l'API Vercel /api/ligue1/matchs, puis rafraîchit les
  // matchs et journées. Aucune Edge Function Supabase n'est utilisée ici.
  async function handleSyncFromApi() {
    setSyncingApi(true);
    try {
      const summary = await syncLigue1Matches();
      await Promise.all([onChanged(), refreshMatchdays()]);
      // Une ancienne erreur de chargement ne doit pas rester affichée après
      // une synchronisation réussie.
      clearErrors(["matchs", "bonus", "equipes"]);

      const parts = [`${summary.created} créé(s)`, `${summary.updated} mis à jour`];
      if (summary.skipped > 0) parts.push(`${summary.skipped} ignoré(s)`);
      if (summary.matchdaysCreated > 0) parts.push(`${summary.matchdaysCreated} journée(s) créée(s)`);
      notify(`Synchronisation terminée : ${parts.join(", ")}.`);

      if (summary.warnings.length > 0) {
        summary.warnings.forEach((w) => console.warn("[sync-ligue1-matches]", w));
        notify(
          `${summary.warnings.length} équipe(s)/match(s) ignoré(s) faute de correspondance dans team_api_mapping (détail dans la console).`,
        );
      }
      if (summary.errors.length > 0) {
        summary.errors.forEach((err) => console.error("[sync-ligue1-matches]", err));
        notify(`${summary.errors.length} erreur(s) pendant la synchronisation (détail dans la console).`);
      }
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de la synchronisation football-data.org.");
    } finally {
      setSyncingApi(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
          <Calendar size={18} className="text-emerald-400" />
          Matchs Ligue 1
          <span className="ml-1 font-mono text-xs font-normal normal-case tracking-normal text-slate-400">
            {visibleMatches.length} affiché{visibleMatches.length > 1 ? "s" : ""} sur{" "}
            {ligue1Matches.length}
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton
            onClick={handleSyncFromApi}
            disabled={syncingApi}
            ariaLabel="Synchroniser les matchs depuis football-data.org"
          >
            {syncingApi ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
            {syncingApi ? "Synchronisation…" : "Synchroniser depuis football-data.org"}
          </GhostButton>
          <PrimaryButton onClick={openCreate}>
            <Plus size={14} />
            Ajouter un match
          </PrimaryButton>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* Erreur distincte : les équipes ne se chargent pas forcément en
          même temps que les matchs (bug corrigé — voir addError côté page). */}
      {teamsError && (
        <div className="mb-4">
          <ErrorBanner message={teamsError} />
        </div>
      )}

      {sortedMatchdays.length > 0 && (() => {
        const index = sortedMatchdays.findIndex((md) => md.id === selectedMatchdayId);
        const courante = index >= 0 ? sortedMatchdays[index] : null;
        const precedente = index > 0 ? sortedMatchdays[index - 1] : null;
        const suivante =
          index >= 0 && index < sortedMatchdays.length - 1 ? sortedMatchdays[index + 1] : null;

        return (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-[#0d1322]/90 p-2">
            <GhostButton
              onClick={() => precedente && setSelectedMatchdayId(precedente.id)}
              disabled={!precedente}
              ariaLabel="Journée précédente"
            >
              <ChevronLeft size={14} />
            </GhostButton>

            <div className="min-w-[92px] text-center font-display text-lg font-black text-white">
              {courante ? `J${courante.number}` : "Toutes"}
            </div>

            <GhostButton
              onClick={() => suivante && setSelectedMatchdayId(suivante.id)}
              disabled={!suivante}
              ariaLabel="Journée suivante"
            >
              <ChevronRight size={14} />
            </GhostButton>

            <select
              value={selectedMatchdayId ?? "all"}
              onChange={(e) => setSelectedMatchdayId(e.target.value)}
              aria-label="Aller à une journée"
              className="rounded-xl border border-slate-700 bg-[#060b16] px-3 py-2 text-xs font-semibold text-slate-100 outline-none focus:border-emerald-500/60"
            >
              <option value="all">Toutes les journées</option>
              {sortedMatchdays.map((md) => (
                <option key={md.id} value={md.id}>
                  Journée {md.number}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setSelectedMatchdayId("all")}
              className={`ml-auto rounded-xl px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide transition-all ${
                selectedMatchdayId === "all"
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
              }`}
            >
              Toutes
            </button>
          </div>
        );
      })()}

      {!error && visibleMatches.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          {ligue1Matches.length === 0 ? "Aucun match enregistré pour le moment." : "Aucun match pour cette journée."}
        </p>
      ) : (
        <div className="space-y-2">
          {visibleMatches.map((match) => {
            const draft = scoreDraftFor(match);
            const hasDraftEdit = scoreDrafts[match.id] !== undefined;
            return (
            <div
              key={match.id}
              className="rounded-xl border border-slate-800 bg-[#0d1322] p-3.5 sm:px-4 sm:py-3"
            >
              {/* Ligne méta — journée / statut / horaire. Toujours en haut,
                  compacte, avant le duel (repère rapide sur mobile où tout
                  ne peut plus tenir sur une seule ligne comme avant). */}
              <div className="mb-2.5 flex flex-wrap items-center gap-2 sm:mb-2">
                <span className="rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1 font-mono text-[10px] font-bold text-slate-400">
                  {matchdayLabel(matchdaysById.get(match.matchday_id ?? ""))}
                </span>
                <StatusBadge status={matchDisplayStatus(match)} />
                <span className="font-mono text-[10px] text-slate-500 sm:text-xs sm:text-slate-400">
                  {match.kickoff ? new Date(match.kickoff).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                </span>
              </div>

              {/* Duel + actions — empilés sur mobile (le duel centré d'abord,
                  les actions ensuite, pleine largeur), côte à côte dès sm. */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center justify-center gap-2 sm:justify-start">
                  <TeamBadge teams={teams} teamId={match.home_team_id} />
                  <span className="text-slate-600">vs</span>
                  <TeamBadge teams={teams} teamId={match.away_team_id} />
                </div>

                <div className="flex items-center justify-center gap-1.5 sm:justify-end">
                  {/* Score inline : éditable même sur un match "à venir" — la
                      sauvegarde bascule automatiquement `finished` à true dès
                      que les deux scores sont renseignés (voir saveScore). */}
                  <div
                    className={`flex items-center gap-1 rounded-xl border px-2 py-1 transition-colors ${
                      hasDraftEdit
                        ? "border-amber-400/50 bg-amber-400/[0.06]"
                        : "border-slate-800 bg-transparent"
                    }`}
                  >
                    <span className="mr-0.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
                      Score
                    </span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="–"
                      value={draft.home}
                      onChange={(e) => setScoreDraft(match, { home: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && saveScore(match)}
                      aria-label={`Score domicile ${teamOf(teams, match.home_team_id)?.name ?? "?"}`}
                      className="w-11 rounded-lg border border-slate-700 bg-[#060b16] px-1.5 py-1 text-center text-xs font-bold text-slate-100 outline-none placeholder:text-slate-700 focus:border-emerald-500/60"
                    />
                    <span className="text-slate-600">-</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="–"
                      value={draft.away}
                      onChange={(e) => setScoreDraft(match, { away: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && saveScore(match)}
                      aria-label={`Score extérieur ${teamOf(teams, match.away_team_id)?.name ?? "?"}`}
                      className="w-11 rounded-lg border border-slate-700 bg-[#060b16] px-1.5 py-1 text-center text-xs font-bold text-slate-100 outline-none placeholder:text-slate-700 focus:border-emerald-500/60"
                    />

                    {/* L'enregistrement ne se declenche plus tout seul quand on
                        clique ailleurs : deux chiffres marquent le match
                        TERMINE et distribuent les points a toute la ligue.
                        Il faut donc le demander — bouton ou touche Entree. */}
                    {hasDraftEdit ? (
                      <button
                        type="button"
                        onClick={() => saveScore(match)}
                        title="Enregistrer le score (ou touche Entrée)"
                        aria-label={`Enregistrer le score de ${teamOf(teams, match.home_team_id)?.name ?? "?"} vs ${
                          teamOf(teams, match.away_team_id)?.name ?? "?"
                        }`}
                        className="ml-1 flex items-center gap-1 rounded-lg bg-amber-400 px-2 py-1 font-mono text-[10px] font-black uppercase text-slate-950 transition hover:bg-amber-300"
                      >
                        {savingScoreId === match.id ? (
                          <RefreshCw size={11} className="animate-spin" />
                        ) : (
                          <Save size={11} />
                        )}
                        Enregistrer
                      </button>
                    ) : (
                      <span className="ml-1 w-[86px]" aria-hidden />
                    )}
                  </div>

                  <GhostButton
                    onClick={() => openEdit(match)}
                    title="Modifier"
                    ariaLabel={`Modifier le match ${teamOf(teams, match.home_team_id)?.name ?? "?"} vs ${
                      teamOf(teams, match.away_team_id)?.name ?? "?"
                    }`}
                  >
                    <Pencil size={12} />
                  </GhostButton>
                  <GhostButton
                    danger
                    onClick={() => setConfirmDelete(match)}
                    title="Supprimer"
                    ariaLabel={`Supprimer le match ${teamOf(teams, match.home_team_id)?.name ?? "?"} vs ${
                      teamOf(teams, match.away_team_id)?.name ?? "?"
                    }`}
                  >
                    {busyId === match.id ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </GhostButton>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <Modal title={editing ? "Modifier le match" : "Ajouter un match"} onClose={() => setFormOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                Journée
              </label>
              <select
                value={form.matchday_id}
                onChange={(e) => setForm((f) => ({ ...f, matchday_id: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
              >
                <option value="">— Aucune —</option>
                {matchdays.map((md) => (
                  <option key={md.id} value={md.id}>
                    {matchdayLabel(md)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Équipe à domicile
                </label>
                <select
                  value={form.home_team_id}
                  onChange={(e) => setForm((f) => ({ ...f, home_team_id: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
                >
                  <option value="">Choisir…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Équipe à l'extérieur
                </label>
                <select
                  value={form.away_team_id}
                  onChange={(e) => setForm((f) => ({ ...f, away_team_id: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
                >
                  <option value="">Choisir…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Date et heure
                </label>
                <TextInput
                  type="datetime-local"
                  value={form.kickoff}
                  onChange={(e) => setForm((f) => ({ ...f, kickoff: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Statut
                </label>
                <select
                  value={form.finished ? "finished" : "scheduled"}
                  onChange={(e) => setForm((f) => ({ ...f, finished: e.target.value === "finished" }))}
                  className="w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
                >
                  <option value="scheduled">À venir / en cours</option>
                  <option value="finished">Terminé</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <GhostButton onClick={() => setFormOpen(false)}>Annuler</GhostButton>
              <PrimaryButton onClick={submitForm} disabled={saving}>
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {editing ? "Enregistrer" : "Ajouter"}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (() => {
        const affiche = `${teamOf(teams, confirmDelete.home_team_id)?.name ?? "?"} vs ${
          teamOf(teams, confirmDelete.away_team_id)?.name ?? "?"
        }`;
        // Un match a venir n'a rien a perdre. Un match commence ou termine
        // porte les pronostics de toute la ligue : la suppression efface
        // aussi les points gagnes dessus, chez tout le monde.
        const dejaJoue = matchDisplayStatus(confirmDelete) !== "scheduled";
        const score =
          confirmDelete.home_score != null && confirmDelete.away_score != null
            ? ` (${confirmDelete.home_score} – ${confirmDelete.away_score})`
            : "";

        return (
        <ConfirmDialog
          title={dejaJoue ? "Supprimer un match DÉJÀ JOUÉ ?" : "Supprimer ce match ?"}
          description={
            dejaJoue
              ? `${affiche}${score} est déjà joué. Le supprimer effacera aussi TOUS les pronostics des joueurs sur ce match, et les points qu'ils ont rapportés — leurs totaux et le classement changeront. Action irréversible.`
              : `Le match ${affiche} sera définitivement supprimé.`
          }
          confirmLabel={dejaJoue ? "Supprimer quand même" : "Supprimer"}
          busy={busyId === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={confirmAndDelete}
        />
        );
      })()}
    </Card>
  );
}

/** Derniere connexion : "24/08 a 14:32", ou "aujourd'hui a 14:32" / "hier a
 *  14:32" pour les deux cas ou la date exacte n'apporte rien. */
function formatDerniereConnexion(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const jour = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const maintenant = new Date();
  const aujourdhui = new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    maintenant.getDate(),
  ).getTime();
  const ecartJours = Math.round((aujourdhui - jour) / 86_400_000);

  if (ecartJours === 0) return `aujourd'hui à ${heure}`;
  if (ecartJours === 1) return `hier à ${heure}`;

  return `${date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} à ${heure}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    scheduled: { label: "À venir", className: "border-sky-500/30 bg-sky-500/10 text-sky-400" },
    live: { label: "En direct", className: "border-red-500/30 bg-red-500/10 text-red-400 animate-pulse" },
    finished: { label: "Terminé", className: "border-slate-700 bg-slate-800/60 text-slate-400" },
  };
  const conf = map[status] ?? map.scheduled;
  return (
    <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold ${conf.className}`}>
      {conf.label.toUpperCase()}
    </span>
  );
}

// ============================================================
// 🎁 ONGLET BONUS
// ============================================================
// Remplace l'ancien onglet "Journées" : point d'entrée unique pour tout ce
// qui touche au bonus (tirage de la sélection premium) et aux championnats
// hors Ligue 1 (activation, synchronisation football-data.org). Le
// verrouillage des journées (deadline/is_finished) a depuis été extrait
// dans son propre onglet, voir MatchdayLockTab.
/** Convertit un timestamp ISO en UTC (tel que renvoyé par Supabase pour un
 * `timestamptz`, ex. "2026-08-21T04:00:00+00:00") vers le format attendu
 * par <input type="datetime-local"> — en heure locale Europe/Paris.
 *
 * BUG corrigé ici (historique) : un `.slice(0, 16)` naïf sur la chaîne UTC
 * ("2026-08-21T04:00") réutilisait telles quelles les heures UTC comme si
 * elles étaient déjà en heure locale. `<input type="datetime-local">` n'a
 * aucune notion de fuseau — il affiche/interprète toujours sa valeur comme
 * de l'heure locale.
 *
 * Le fix suivant utilisait `new Date(iso).getHours()`, donc l'heure LOCALE
 * DU NAVIGATEUR — correct uniquement si l'admin est physiquement/OS réglé
 * sur Europe/Paris. Remplacé par `utcIsoToParisLocalInput`
 * (bonusSelectionService.ts), qui calcule l'heure de Paris via Intl quel
 * que soit le fuseau de la machine qui exécute le code — cohérent avec
 * `isWithinBonusPeriod`, qui compare désormais aussi en Europe/Paris
 * explicite (voir isMatchInWindow / parisLocalToUtcIso). */
const toDatetimeLocalInput = utcIsoToParisLocalInput;

const BONUS_COMPETITION_LABELS: Record<BonusCompetitionCode, string> = {
  PL: "Premier League",
  PD: "Liga",
  SA: "Serie A",
  BL1: "Bundesliga",
};

/** Pays + drapeau des 4 championnats bonus — fixes (PL/PD/SA/BL1 ne changent
 * jamais), donc codés en dur plutôt que dépendants du chargement encore
 * possiblement pas terminé de `availableCompetitions` (football-data.org).
 * Le logo, lui, reste pris depuis `availableCompetitions` quand disponible
 * (voir rendu de la sélection bonus) — jamais fabriqué. */
const BONUS_COMPETITION_META: Record<BonusCompetitionCode, { country: string; flag: string }> = {
  PL: { country: "Angleterre", flag: "🇬🇧" },
  PD: { country: "Espagne", flag: "🇪🇸" },
  SA: { country: "Italie", flag: "🇮🇹" },
  BL1: { country: "Allemagne", flag: "🇩🇪" },
};

/** "sam. 23 août" + "16:00" (Europe/Paris) pour l'affiche d'un match bonus
 * sélectionné — pur affichage, aucune conversion de fuseau écrite ici (voir
 * parisLocalToUtcIso/utcIsoToParisLocalInput pour la partie formulaire). */
function formatBonusKickoff(iso: string | null | undefined): { day: string; time: string } {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return { day: "Date à confirmer", time: "" };
  const day = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return { day, time };
}

/** "Aujourd'hui à 18:10" / "Hier à 09:40" / "23/08/26 à 18:10", toujours en
 * heure de Paris — pour "Dernière modification" dans la sélection bonus. */
function formatLastModified(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";

  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(date);

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);

  if (dayKey(date) === dayKey(now)) return `Aujourd'hui à ${time}`;
  if (dayKey(date) === dayKey(yesterday)) return `Hier à ${time}`;

  const shortDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "2-digit" }).format(date);
  return `${shortDate} à ${time}`;
}

// ============================================================
// Sélection bonus actuelle — composants de présentation purs (aucun état,
// aucun appel Supabase, aucune logique métier : uniquement le rendu). Toute
// la donnée et les handlers restent calculés dans BonusTab, ces composants
// se contentent de l'afficher.
// ============================================================

/** Résout le logo d'un club de match bonus : d'abord les vrais fichiers
 * livrés dans public/logos/<championnat>/ (resolveBonusClubLogo — la
 * source prévue pour ça, les clubs étrangers n'ont quasiment jamais de
 * ligne dans `teams`), puis `teams.logo_url` en repli si jamais renseigné,
 * jamais un chemin inventé. */
function resolveBonusTeamLogo(
  match: Match | null | undefined,
  side: "home" | "away",
  code: BonusCompetitionCode,
  teams: Team[],
): string | null {
  if (!match) return null;
  const name = side === "home" ? match.home_team : match.away_team;
  const teamId = side === "home" ? match.home_team_id : match.away_team_id;
  return resolveBonusClubLogo(name, code) ?? teamOf(teams, teamId)?.logo_url ?? null;
}

/** Logo d'un championnat — vrai fichier de public/logos/ (BONUS_LEAGUE_LOGO,
 * bonusClubLogoService.ts), jamais le code interne brut "PL"/"PD"/"SA"/"BL1"
 * affiché comme s'il s'agissait d'un élément de design. Repli propre en
 * initiales uniquement si le fichier est réellement introuvable (onError). */
function CompetitionLogo({ code, label, size = "size-12 sm:size-14" }: { code: BonusCompetitionCode; label: string; size?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = label
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`relative flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-sky-500/15 bg-gradient-to-br from-white/[0.07] to-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_6px_16px_rgba(0,0,0,.35)]`}
    >
      {broken ? (
        <span className="font-display text-sm font-black tracking-tight text-sky-300">{initials}</span>
      ) : (
        <img src={BONUS_LEAGUE_LOGO[code]} alt="" className="h-full w-full object-contain p-2" onError={() => setBroken(true)} />
      )}
    </div>
  );
}

/** Logo + nom d'un club — vrai logo (resolveBonusTeamLogo), repli initiales
 * uniquement si le fichier est réellement introuvable (onError) ou si
 * aucune source n'a pu être résolue. */
function BonusTeamBadge({ logoUrl, name, size = "size-12 sm:size-14" }: { logoUrl: string | null; name: string; size?: string }) {
  const [broken, setBroken] = useState(false);
  const showFallback = broken || !logoUrl;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      {showFallback ? (
        <span
          className={`flex ${size} items-center justify-center rounded-full border border-slate-700 bg-slate-900 font-display text-xs font-black text-slate-400`}
          title="Logo introuvable"
        >
          {name.slice(0, 2).toUpperCase()}
        </span>
      ) : (
        <img
          src={logoUrl}
          alt=""
          className={`${size} object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,.5)]`}
          onError={() => setBroken(true)}
        />
      )}
      <span className="max-w-[130px] truncate font-display text-sm font-black text-white sm:text-base">{name}</span>
    </div>
  );
}

/** Zone centrale "MATCH SÉLECTIONNÉ" — dominante visuellement, ou état
 * d'attente (⚽ + "En attente du tirage") si aucun candidat pour ce
 * championnat. */
function BonusMatchDisplay({
  candidate,
  homeLogoUrl,
  awayLogoUrl,
  kickoff,
}: {
  candidate: BonusCandidate | undefined;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  kickoff: { day: string; time: string };
}) {
  if (!candidate) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-6 text-center">
        <span className="text-2xl opacity-40">⚽</span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">En attente du tirage</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center justify-center gap-4 sm:gap-8">
        <BonusTeamBadge logoUrl={homeLogoUrl} name={candidate.match.home_team ?? "?"} />
        <span className="shrink-0 font-display text-[11px] font-black uppercase tracking-[0.2em] text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,.5)]">
          VS
        </span>
        <BonusTeamBadge logoUrl={awayLogoUrl} name={candidate.match.away_team ?? "?"} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 font-mono text-[10px] uppercase tracking-wide text-sky-200/60">
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={11} className="text-sky-400/70" />
          {kickoff.day}
        </span>
        {kickoff.time && (
          <>
            <span className="text-slate-700">•</span>
            <span className="inline-flex items-center gap-1.5">
              <Timer size={11} className="text-sky-400/70" />
              {kickoff.time}
            </span>
          </>
        )}
      </div>

      {candidate.match.finished && candidate.match.home_score != null && candidate.match.away_score != null && (
        <div className="mt-2.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 font-mono text-[11px] font-bold text-emerald-300">
          Score enregistré : {candidate.match.home_score} – {candidate.match.away_score}
        </div>
      )}
    </div>
  );
}

/** Zone droite "GESTION" — score, dernière modification, statut, bouton
 *  Modifier. Le score se saisit ICI, sur la carte : il fallait auparavant
 *  passer par l'onglet Matchs, qui n'affiche pas les championnats bonus.
 *  Même règle que l'onglet Matchs : rien ne part tant qu'on n'a pas
 *  appuyé sur Entrée ou sur Enregistrer. */
function BonusManagement({
  lastModified,
  onEdit,
  disabled,
  scoreDraft,
  onScoreChange,
  onSaveScore,
  saving,
  scoreModifie,
}: {
  lastModified: string;
  onEdit: () => void;
  disabled: boolean;
  scoreDraft: { home: string; away: string } | null;
  onScoreChange: (patch: Partial<{ home: string; away: string }>) => void;
  onSaveScore: () => void;
  saving: boolean;
  scoreModifie: boolean;
}) {
  return (
    <div className="flex flex-col justify-center gap-3.5">
      {scoreDraft && (
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Score</div>
          <div
            className={`mt-1 flex items-center gap-1.5 rounded-xl border px-2 py-1.5 transition-colors ${
              scoreModifie ? "border-amber-400/50 bg-amber-400/[0.06]" : "border-slate-800"
            }`}
          >
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="–"
              value={scoreDraft.home}
              onChange={(e) => onScoreChange({ home: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && onSaveScore()}
              aria-label="Score domicile du match bonus"
              className="w-11 rounded-lg border border-slate-700 bg-[#060b16] px-1.5 py-1 text-center text-xs font-bold text-slate-100 outline-none placeholder:text-slate-700 focus:border-emerald-500/60"
            />
            <span className="text-slate-600">-</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="–"
              value={scoreDraft.away}
              onChange={(e) => onScoreChange({ away: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && onSaveScore()}
              aria-label="Score extérieur du match bonus"
              className="w-11 rounded-lg border border-slate-700 bg-[#060b16] px-1.5 py-1 text-center text-xs font-bold text-slate-100 outline-none placeholder:text-slate-700 focus:border-emerald-500/60"
            />
            {scoreModifie && (
              <button
                type="button"
                onClick={onSaveScore}
                title="Enregistrer le score (ou touche Entrée)"
                className="ml-auto flex items-center gap-1 rounded-lg bg-amber-400 px-2 py-1 font-mono text-[10px] font-black uppercase text-slate-950 transition hover:bg-amber-300"
              >
                {saving ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                OK
              </button>
            )}
          </div>
        </div>
      )}
      <div>
        <div className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Dernière modification</div>
        <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-sky-100/80">
          <Timer size={11} className="text-slate-500" />
          {lastModified}
        </div>
      </div>
      <div>
        <div className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Statut</div>
        <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.7)]" />
          </span>
          Actif
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/[0.08] px-3 py-2.5 font-display text-xs font-bold uppercase tracking-wide text-sky-300 transition-all duration-300 hover:border-sky-300/70 hover:bg-sky-400/15 hover:text-sky-200 hover:shadow-[0_0_24px_rgba(56,189,248,.25)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none disabled:hover:border-sky-400/40"
      >
        <Pencil size={12} />
        Modifier
      </button>
    </div>
  );
}

/** Une ligne premium complète (3 zones) pour un championnat bonus — desktop
 * en ligne horizontale (grid 3 colonnes), mobile en carte verticale
 * empilée (le grid retombe naturellement sur 1 colonne, `divide-y` au lieu
 * de `divide-x`). */
function BonusCompetitionRow({
  code,
  candidate,
  discovered,
  homeLogoUrl,
  awayLogoUrl,
  kickoff,
  lastModified,
  onEdit,
  scoreDraft,
  onScoreChange,
  onSaveScore,
  saving,
  scoreModifie,
}: {
  code: BonusCompetitionCode;
  candidate: BonusCandidate | undefined;
  discovered: DiscoveredCompetition | undefined;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  kickoff: { day: string; time: string };
  lastModified: string;
  onEdit: () => void;
  scoreDraft: { home: string; away: string } | null;
  onScoreChange: (patch: Partial<{ home: string; away: string }>) => void;
  onSaveScore: () => void;
  saving: boolean;
  scoreModifie: boolean;
}) {
  const meta = BONUS_COMPETITION_META[code];
  const label = BONUS_COMPETITION_LABELS[code];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-sky-500/[0.08] bg-gradient-to-br from-[#0b1526]/95 via-[#0a1420]/90 to-[#060c16]/95 shadow-[0_18px_40px_rgba(0,0,0,.35)] backdrop-blur-xl transition-all duration-300 hover:border-sky-400/25 hover:shadow-[0_18px_50px_rgba(14,165,233,.08)]">
      {/* Liseré supérieur cyan discret */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />
      {/* Léger halo intérieur pour la profondeur (glassmorphism) */}
      <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-sky-500/[0.05] blur-3xl" />
      {/* Très léger accent doré dans le coin, à peine perceptible */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-300/[0.04] blur-2xl" />

      <div className="relative grid grid-cols-1 divide-y divide-white/[0.05] lg:grid-cols-[260px_minmax(0,1fr)_230px] lg:divide-x lg:divide-y-0">
        {/* ZONE GAUCHE — championnat */}
        <div className="flex items-center gap-3.5 p-4 sm:p-5">
          <CompetitionLogo code={code} label={label} />
          <div className="min-w-0">
            <div className="font-display text-base font-black text-white sm:text-lg">{label}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <span>{meta.flag}</span>
              <span>{discovered?.country ?? meta.country}</span>
            </div>
          </div>
        </div>

        {/* ZONE CENTRALE — match sélectionné (dominante) */}
        <div className="flex items-center justify-center p-4 sm:p-5">
          <BonusMatchDisplay candidate={candidate} homeLogoUrl={homeLogoUrl} awayLogoUrl={awayLogoUrl} kickoff={kickoff} />
        </div>

        {/* ZONE DROITE — gestion */}
        <div className="p-4 sm:p-5">
          <BonusManagement
            lastModified={lastModified}
            onEdit={onEdit}
            disabled={!candidate}
            scoreDraft={scoreDraft}
            onScoreChange={onScoreChange}
            onSaveScore={onSaveScore}
            saving={saving}
            scoreModifie={scoreModifie}
          />
        </div>
      </div>
    </div>
  );
}

/** Stepper de score premium pour la modal "Modifier le bonus" — grand
 * chiffre central, boutons +/- larges (confortables au tactile), saisie
 * clavier directe toujours possible. `value` reste la même chaîne brute que
 * gère déjà le formulaire (editingBonus.home/away) : ce composant ne fait
 * qu'afficher/normaliser, submitBonusEdit/saveBonusScore restent
 * inchangés. Entier, jamais négatif — mêmes contraintes qu'avant. */
function BonusScoreStepper({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  const numeric = value.trim() === "" ? 0 : Math.max(0, Math.trunc(Number(value) || 0));

  function commit(next: number) {
    onChange(String(Math.max(0, Math.trunc(next))));
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => commit(numeric + 1)}
        aria-label={`Augmenter le score ${label}`}
        className="flex size-11 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-sky-300 transition-all hover:border-sky-300/60 hover:bg-sky-400/20 active:scale-95"
      >
        <Plus size={18} strokeWidth={2.5} />
      </button>

      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange("");
            return;
          }
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          onChange(String(Math.max(0, Math.trunc(n))));
        }}
        placeholder="0"
        aria-label={`Score ${label}`}
        className="h-16 w-16 rounded-2xl border border-slate-700 bg-[#050913] text-center font-display text-3xl font-black text-white outline-none focus:border-sky-400/60 sm:h-20 sm:w-20 sm:text-4xl"
      />

      <button
        type="button"
        onClick={() => commit(Math.max(0, numeric - 1))}
        aria-label={`Diminuer le score ${label}`}
        className="flex size-11 items-center justify-center rounded-xl border border-slate-700 bg-white/[0.03] text-slate-300 transition-all hover:border-slate-500 hover:bg-white/[0.08] active:scale-95"
      >
        <Minus size={18} strokeWidth={2.5} />
      </button>
    </div>
  );
}

function BonusTab({
  matchdays,
  matches,
  teams,
  seasons,
  competitions,
  settings,
  error,
  onChanged,
  onCompetitionsChanged,
  onSettingsChanged,
  notify,
}: {
  matchdays: Matchday[];
  matches: Match[];
  teams: Team[];
  seasons: Season[];
  competitions: Competition[];
  settings: AppSettings | null;
  error?: string;
  onChanged: () => Promise<void>;
  onCompetitionsChanged: () => Promise<void>;
  onSettingsChanged: () => Promise<void>;
  notify: (message: string) => void;
}) {
  // Sélection bonus : état local pour cette première étape.
  // La persistance Supabase sera branchée dans adminService après validation de l'UI.
  const [bonusSelections, setBonusSelections] = useState<Record<string, Partial<Record<BonusCompetitionCode, BonusCandidate>>>>({});
  // Dernière date de modification (bonus_options.updated_at) par journée+championnat
  // — uniquement pour l'affichage "Dernière modification" de la sélection bonus,
  // hydraté dans le même effet que bonusSelections ci-dessous.
  const [bonusMetaByKey, setBonusMetaByKey] = useState<Record<string, Partial<Record<BonusCompetitionCode, { updatedAt: string }>>>>({});
  const [generatingBonus, setGeneratingBonus] = useState(false);

  // Classement en direct des 4 championnats bonus — barème dynamique : la
  // sélection juge l'équilibre d'un match sur la position RÉELLE des deux
  // équipes au moment de la génération, pas sur une réputation figée (voir
  // bonusSelectionService.ts). Rechargé à chaque montage de l'onglet et à
  // chaque clic sur "Générer" (le classement peut avoir changé entre deux
  // générations), jamais mis en cache au-delà de la session admin.
  const [standingsByCompetition, setStandingsByCompetition] = useState<Partial<Record<BonusCompetitionCode, CompetitionStandings>>>({});
  const [loadingStandings, setLoadingStandings] = useState(false);

  // "2026-2027" -> "2026" (année de saison attendue par football-data.org).
  const bonusSeasonYear = (settings?.season ?? "2026-2027").split(/[-–]/)[0]?.trim() || "2026";

  // Retourne le classement fraîchement chargé (pas seulement mis en state) :
  // generateBonusForDay a besoin d'une valeur garantie à jour au moment
  // précis de la génération, pas de la valeur (potentiellement en retard
  // d'un rendu) lue depuis le state React.
  async function loadBonusStandings(): Promise<Partial<Record<BonusCompetitionCode, CompetitionStandings>>> {
    setLoadingStandings(true);
    try {
      const result = await getAllBonusStandings(bonusSeasonYear);
      setStandingsByCompetition(result);
      return result;
    } catch (e) {
      console.error("Erreur chargement du classement pour la sélection bonus :", e);
      return standingsByCompetition;
    } finally {
      setLoadingStandings(false);
    }
  }

  useEffect(() => {
    void loadBonusStandings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bonusSeasonYear]);

  // Championnats (grandes ligues européennes hors Ligue 1) : la liste
  // disponible vient de football-data.org, pas d'une constante codée en dur.
  const [availableCompetitions, setAvailableCompetitions] = useState<DiscoveredCompetition[]>([]);
  const [competitionsLoaded, setCompetitionsLoaded] = useState(false);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [togglingCode, setTogglingCode] = useState<string | null>(null);
  const [syncingCode, setSyncingCode] = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  // Période d'éligibilité des matchs au tirage bonus (app_settings —
  // persistée pour survivre entre sessions, voir generateBonusForDay).
  // Sauvegarde au blur, comme les autres champs éditables inline de
  // l'admin (score de match, montant de paiement) — pas de bouton dédié.
  const [periodStart, setPeriodStart] = useState(toDatetimeLocalInput(settings?.bonus_period_start));
  const [periodEnd, setPeriodEnd] = useState(toDatetimeLocalInput(settings?.bonus_period_end));

  useEffect(() => {
    setPeriodStart(toDatetimeLocalInput(settings?.bonus_period_start));
    setPeriodEnd(toDatetimeLocalInput(settings?.bonus_period_end));
  }, [settings]);

  // periodStart/periodEnd sont saisis en heure locale Europe/Paris (inputs
  // datetime-local) ; on les convertit explicitement en ISO UTC via
  // parisLocalToUtcIso (Intl, indépendant du fuseau de la machine) — jamais
  // via `new Date(periodStart).toISOString()`, qui utiliserait le fuseau du
  // navigateur exécutant le code.
  const periodStartIso = useMemo(() => parisLocalToUtcIso(periodStart), [periodStart]);
  const periodEndIso = useMemo(() => parisLocalToUtcIso(periodEnd), [periodEnd]);

  async function handleSavePeriod(requireBothDates = false): Promise<boolean> {
    if (requireBothDates && (!periodStart || !periodEnd)) {
      notify("Choisis une date de début ET une date de fin avant de générer les matchs bonus.");
      return false;
    }

    if (periodStart && !periodStartIso) {
      notify("La date de début bonus est invalide.");
      return false;
    }

    if (periodEnd && !periodEndIso) {
      notify("La date de fin bonus est invalide.");
      return false;
    }

    if (periodStartIso && periodEndIso && new Date(periodStartIso) >= new Date(periodEndIso)) {
      notify("La fin de la période doit être après le début.");
      return false;
    }

    if (periodStartIso === (settings?.bonus_period_start ?? null) && periodEndIso === (settings?.bonus_period_end ?? null)) {
      return true;
    }

    try {
      await updateSettings({ bonus_period_start: periodStartIso, bonus_period_end: periodEndIso });
      await onSettingsChanged();
      return true;
    } catch (e) {
      notify(errorMessage(e, "Erreur lors de l'enregistrement de la période."));
      return false;
    }
  }

  /** Un match est éligible au tirage s'il n'y a pas de période définie, ou
   * si son coup d'envoi (UTC, football-data.org) tombe dans la fenêtre
   * [periodStartIso, periodEndIso] (bornes incluses, comparaison de vrais
   * timestamps via isMatchInWindow — jamais une comparaison de chaînes).
   * Pas de coup d'envoi connu = exclu dès qu'une période est active (on ne
   * peut pas vérifier). */
  function isWithinBonusPeriod(match: Match): boolean {
    return isMatchInWindow(match.kickoff, periodStartIso, periodEndIso);
  }

  async function loadAvailableCompetitions() {
    setLoadingCompetitions(true);
    try {
      const list = await getAvailableCompetitions();
      setAvailableCompetitions(list);
      setCompetitionsLoaded(true);
    } catch (e) {
      notify(errorMessage(e, "Erreur lors du chargement des championnats football-data.org."));
    } finally {
      setLoadingCompetitions(false);
    }
  }

  function competitionRowFor(code: string): Competition | null {
    return competitions.find((c) => c.external_code === code || c.code === code) ?? null;
  }

  async function toggleCompetitionActive(discovered: DiscoveredCompetition) {
    const row = competitionRowFor(discovered.code);
    const nextActive = !(row?.is_active ?? false);
    setTogglingCode(discovered.code);
    try {
      await setCompetitionActive(discovered, row?.id ?? null, nextActive);
      await onCompetitionsChanged();
      notify(`${discovered.name} ${nextActive ? "activé" : "désactivé"}.`);
    } catch (e) {
      notify(errorMessage(e, "Erreur lors de l'activation du championnat."));
    } finally {
      setTogglingCode(null);
    }
  }

  async function handleSyncCompetition(discovered: DiscoveredCompetition) {
    setSyncingCode(discovered.code);
    try {
      const summary = await syncCompetitionMatches(discovered.code);
      await Promise.all([onChanged(), onCompetitionsChanged()]);
      const parts = [`${summary.created} créé(s)`, `${summary.updated} mis à jour`];
      if (summary.skipped > 0) parts.push(`${summary.skipped} ignoré(s)`);
      if (summary.matchdaysCreated > 0) parts.push(`${summary.matchdaysCreated} journée(s) créée(s)`);
      notify(`${discovered.name} : ${parts.join(", ")}.`);
      if (summary.errors.length > 0) {
        summary.errors.forEach((err) => console.error(`[sync-${discovered.code}]`, err));
        notify(`${summary.errors.length} erreur(s) pendant la synchronisation de ${discovered.name} (détail dans la console).`);
      }
    } catch (e) {
      notify(errorMessage(e, `Erreur lors de la synchronisation de ${discovered.name}.`));
    } finally {
      setSyncingCode(null);
    }
  }

  const matchCountByCompetitionCode = useMemo(() => {
    const map = new Map<string, number>();
    matches.forEach((m) => {
      const code = m.match_type ?? "LIGUE1";
      if (code === "LIGUE1") return;
      map.set(code, (map.get(code) ?? 0) + 1);
    });
    return map;
  }, [matches]);

  /** Tous les matchs synchronisés d'un championnat, indépendamment de son
   * propre numéro de journée : les calendriers ne sont pas alignés entre
   * pays (le "matchday 1" anglais ne tombe pas la même semaine que le
   * "J1" français, voire le même mois selon le championnat). BUG corrigé
   * ici — l'ancienne version filtrait par `candidateDay.number ===
   * md.number` (le numéro de la journée Ligue 1 sélectionnée), ce qui ne
   * pouvait retourner un résultat que si les deux championnats avaient
   * par coïncidence la même numérotation. Seule la période choisie
   * (isWithinBonusPeriod, ci-dessous) doit délimiter les matchs
   * éligibles au tirage, jamais un numéro de journée étranger. */
  function bonusMatchesForCompetition(code: BonusCompetitionCode): Match[] {
    return matches.filter((match) => match.match_type === code);
  }

  function toBonusMatch(match: Match): Match {
    // BUG corrigé ici — `teams` ne contient que les clubs de Ligue 1
    // (OFFICIAL_L1_CLUBS) : pour un match étranger (PL/PD/SA/BL1), la
    // recherche par home_team_id/away_team_id échoue toujours et retombait
    // sur "", écrasant le nom déjà correct enregistré lors de la synchro
    // football-data.org (adminService.ts, syncCompetitionMatches). Résultat
    // : scoreBonusCandidate rejetait chaque match étranger (home_team/
    // away_team vides), donc aucun candidat n'était jamais retenu. On garde
    // désormais la valeur déjà présente sur le match en repli.
    const home = teams.find((team) => team.id === match.home_team_id)?.name ?? match.home_team ?? "";
    const away = teams.find((team) => team.id === match.away_team_id)?.name ?? match.away_team ?? "";
    return { ...match, home_team: home, away_team: away };
  }

  async function generateBonusForDay(md: Matchday) {
    // Les dates choisies par l'admin sont la source de vérité du tirage.
    // On les enregistre AVANT de lancer la sélection pour éviter qu'un clic
    // sur Générer avec des dates fraîchement modifiées utilise encore les
    // anciennes valeurs de Supabase.
    const periodSaved = await handleSavePeriod(true);
    if (!periodSaved) return;

    setGeneratingBonus(true);
    try {
      // Classement recalculé à CHAQUE génération, jamais un score de
      // sélection qui daterait d'une journée précédente (consigne barème
      // dynamique) — on ne réutilise pas standingsByCompetition tel quel,
      // on le recharge et on travaille sur la valeur fraîche retournée.
      const freshStandings = await loadBonusStandings();

      const key = `${md.season_id}:${md.number}`;
      // BUG corrigé ici — une génération partielle (ex. BL1 sans candidat
      // éligible cette fois) écrasait toute la sélection de la journée par
      // un objet ne contenant que les championnats retrouvés, et
      // saveBonusSelections désactivait AUSSI en base les championnats
      // absents de cet objet avant de ne réinsérer que les autres : un
      // championnat sans nouveau candidat disparaissait purement et
      // simplement, alors qu'il avait déjà une sélection valide. `next`
      // part maintenant de la sélection déjà en place pour cette journée
      // (bonusSelections[key]) et ne la modifie que championnat par
      // championnat, uniquement quand un nouveau candidat est réellement
      // trouvé — jamais un remplacement en bloc.
      const existing = bonusSelections[key] ?? {};
      const next: Partial<Record<BonusCompetitionCode, BonusCandidate>> = { ...existing };
      // Championnats pour lesquels un NOUVEAU candidat a été trouvé cette
      // fois — seuls ceux-là sont réellement (ré)écrits en base, via
      // replaceBonusSelection (même fonction déjà utilisée par la modal
      // "Modifier le bonus"), qui ne touche que la ligne
      // (matchday_id, competition_code) concernée et laisse les autres
      // championnats de la journée strictement intacts en base.
      const toPersist: BonusCandidate[] = [];
      // Un message par championnat sans NOUVEAU candidat, pour diagnostiquer
      // sans repartir en chasse en base à chaque fois : absence totale de
      // synchronisation vs matchs existants mais hors de la période choisie
      // (avec le prochain match connu dans ce dernier cas), et précise si
      // l'ancienne sélection de ce championnat a été conservée telle quelle.
      const misses: string[] = [];

      (["PL", "PD", "SA", "BL1"] as BonusCompetitionCode[]).forEach((code) => {
        const allForCompetition = bonusMatchesForCompetition(code);
        const eligible = allForCompetition.filter(isWithinBonusPeriod).map(toBonusMatch);
        const best = selectBestBonusMatch(eligible, code, freshStandings[code]);
        if (best) {
          next[code] = best;
          toPersist.push(best);
          return;
        }

        const label = BONUS_COMPETITION_LABELS[code];
        const kept = existing[code] ? " — sélection existante conservée" : "";
        if (allForCompetition.length === 0) {
          misses.push(`${label} : aucun match synchronisé (onglet Bonus → Championnats)${kept}`);
          return;
        }
        const nextKickoff = allForCompetition
          .map((m) => m.kickoff)
          .filter((k): k is string => !!k && new Date(k).getTime() > Date.now())
          .sort()[0];
        const nextKickoffLabel = nextKickoff
          ? new Intl.DateTimeFormat("fr-FR", {
              timeZone: "Europe/Paris",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(nextKickoff))
          : null;
        misses.push(
          `${label} : ${allForCompetition.length} match(s) synchronisé(s), aucun dans la période` +
            (nextKickoffLabel ? ` (prochain : ${nextKickoffLabel} heure de Paris)` : "") +
            kept,
        );
      });

      if (Object.keys(next).length === 0) {
        const windowLabel = formatParisWindow(periodStartIso, periodEndIso);
        notify(
          `Aucun match éligible pour J${md.number} — fenêtre demandée${windowLabel ? ` ${windowLabel}` : ""} — ${misses.join(" · ")}`,
        );
        return;
      }

      // La base est la source de vérité : on sauvegarde d'abord (uniquement
      // les championnats avec un nouveau candidat), puis on met à jour
      // l'état local une fois Supabase confirmé.
      if (toPersist.length > 0) {
        await Promise.all(toPersist.map((candidate) => replaceBonusSelection(md.id, candidate)));
      }

      setBonusSelections((prev) => ({ ...prev, [key]: next }));
      const generatedAt = new Date().toISOString();
      setBonusMetaByKey((prev) => {
        const previousMeta = prev[key] ?? {};
        const nextMeta = { ...previousMeta };
        toPersist.forEach((candidate) => {
          nextMeta[candidate.competitionCode] = { updatedAt: generatedAt };
        });
        return { ...prev, [key]: nextMeta };
      });

      if (misses.length > 0) {
        notify(
          `${Object.keys(next).length}/4 en place pour J${md.number} (${toPersist.length} nouveau${toPersist.length > 1 ? "x" : ""}). ${misses.join(" · ")}`,
        );
      } else {
        notify(`${Object.keys(next).length}/4 Matchs bonus sélectionnés pour J${md.number}.`);
      }
    } finally {
      setGeneratingBonus(false);
    }
  }

  // Remplace le match retenu pour un championnat. Ne notifie PAS elle-même
  // et laisse l'erreur remonter : appelée à la fois par submitBonusEdit
  // (modal "Modifier le bonus", qui gère son propre message de succès/échec
  // unique pour tout le formulaire) — plus de caller indépendant à ce jour.
  async function replaceBonusForDay(md: Matchday, code: BonusCompetitionCode, match: Match) {
    const candidate = scoreBonusCandidateForAdmin(match, code, standingsByCompetition[code]);
    if (!candidate) throw new Error("Ce match n'est pas éligible pour ce championnat bonus.");

    const key = `${md.season_id}:${md.number}`;
    await replaceBonusSelection(md.id, candidate);
    setBonusSelections((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? {}), [code]: candidate },
    }));
    setBonusMetaByKey((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? {}), [code]: { updatedAt: new Date().toISOString() } },
    }));
  }

  async function removeBonusDraw(md: Matchday) {
    const key = `${md.season_id}:${md.number}`;
    try {
      await clearBonusSelections(md.id);
      setBonusSelections((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      notify(`Tirage bonus de J${md.number} retiré.`);
    } catch (e) {
      notify(errorMessage(e, "Erreur lors du retrait du tirage bonus."));
    }
  }

  function scoreCandidateForMatch(match: Match, code: BonusCompetitionCode): BonusCandidate | null {
    return scoreBonusCandidateForAdmin(match, code);
  }

  // Saisie du résultat (score réel du match, "2-1"...) pour le match bonus
  // retenu de chaque championnat. Ne PAS confondre avec `candidate.score`
  // (le score de PERTINENCE 0-100 de l'algorithme de sélection) — c'était
  // l'ambiguïté de fond du bug signalé : l'onglet Matchs n'affiche que la
  // Ligue 1 (`match_type === "LIGUE1"`), donc les matchs PL/PD/SA/BL1
  // sélectionnés ici n'avaient tout simplement AUCUNE UI pour saisir leur
  // résultat nulle part dans l'admin. Réutilise updateMatch et le même
  // schéma que MatchesTab.saveScore (finished bascule à true seulement
  // quand les deux scores sont renseignés).
  //
  // Éditée exclusivement depuis la modal "Modifier le bonus" (voir
  // submitBonusEdit) — plus de saisie inline dans la ligne, donc plus de
  // draft à suivre par match_id : les valeurs viennent directement du
  // formulaire de la modal.
  async function saveBonusScore(code: BonusCompetitionCode, match: Match, draft: { home: string; away: string }) {
    const homeRaw = draft.home.trim();
    const awayRaw = draft.away.trim();
    const home = homeRaw === "" ? null : Number(homeRaw);
    const away = awayRaw === "" ? null : Number(awayRaw);
    if ((home !== null && Number.isNaN(home)) || (away !== null && Number.isNaN(away))) {
      throw new Error("Le score doit être un nombre.");
    }
    if (home !== null && home < 0) throw new Error("Le score domicile ne peut pas être négatif.");
    if (away !== null && away < 0) throw new Error("Le score extérieur ne peut pas être négatif.");

    const bothPresent = home !== null && away !== null;
    await updateMatch(match.id, {
      home_score: home,
      away_score: away,
      finished: bothPresent ? true : match.finished,
    });

    // Reflète immédiatement le nouveau score dans l'état local de
    // sélection (bonusSelections) — sinon la ligne resterait affichée
    // avec l'ancien score jusqu'à une régénération complète du tirage,
    // puisque ce state n'est ré-hydraté depuis Supabase qu'une fois par
    // journée (voir l'effet plus haut).
    if (selectedBonusKey) {
      setBonusSelections((prev) => {
        const sel = prev[selectedBonusKey];
        const existing = sel?.[code];
        if (!sel || !existing) return prev;
        return {
          ...prev,
          [selectedBonusKey]: {
            ...sel,
            [code]: {
              ...existing,
              match: { ...existing.match, home_score: home, away_score: away, finished: bothPresent ? true : existing.match.finished },
            },
          },
        };
      });
      setBonusMetaByKey((prev) => ({
        ...prev,
        [selectedBonusKey]: { ...(prev[selectedBonusKey] ?? {}), [code]: { updatedAt: new Date().toISOString() } },
      }));
    }

    // Source de vérité Supabase : recharge matches (et donc, via l'effet
    // de ré-hydratation ci-dessus, bonusSelections) pour que la page Pronos
    // et un futur rechargement de l'Admin lisent exactement la même valeur.
    await onChanged();
  }

  function scoreBonusCandidateForAdmin(match: Match, code: BonusCompetitionCode, standings?: CompetitionStandings): BonusCandidate | null {
    return selectBestBonusMatch([toBonusMatch(match)], code, standings);
  }

  // ============================================================
  // Modal "Modifier le bonus" — championnat, match sélectionné (avec
  // possibilité de changer de match parmi les alternatives éligibles),
  // date/heure du coup d'envoi, et surtout le score exact. Un seul point
  // d'entrée pour toutes les modifications d'un bonus, appelé par le
  // bouton "Modifier" de chaque ligne.
  // ============================================================
  const [editingBonus, setEditingBonus] = useState<{
    code: BonusCompetitionCode;
    matchId: string;
    kickoff: string;
    home: string;
    away: string;
  } | null>(null);
  const [savingBonusEdit, setSavingBonusEdit] = useState(false);

  function openBonusEditor(code: BonusCompetitionCode) {
    const candidate = selectedBonusSelection[code];
    if (!candidate) return;
    setEditingBonus({
      code,
      matchId: candidate.match.id,
      kickoff: toDatetimeLocalInput(candidate.match.kickoff),
      home: candidate.match.home_score == null ? "" : String(candidate.match.home_score),
      away: candidate.match.away_score == null ? "" : String(candidate.match.away_score),
    });
  }

  /** Change le match sélectionné DANS le formulaire (pas encore enregistré
   * en base) — réinitialise date/heure et score sur ceux du nouveau match. */
  function bonusEditorSelectMatch(match: Match) {
    setEditingBonus((prev) =>
      prev
        ? {
            ...prev,
            matchId: match.id,
            kickoff: toDatetimeLocalInput(match.kickoff),
            home: match.home_score == null ? "" : String(match.home_score),
            away: match.away_score == null ? "" : String(match.away_score),
          }
        : prev,
    );
  }

  async function submitBonusEdit() {
    if (!editingBonus || !selectedBonusMatchday) return;
    const { code, matchId } = editingBonus;
    const targetMatch = matches.find((m) => m.id === matchId);
    if (!targetMatch) {
      notify("Match introuvable.");
      return;
    }

    setSavingBonusEdit(true);
    try {
      // 1) Changement de match sélectionné, si l'admin en a choisi un autre.
      const currentCandidate = selectedBonusSelection[code];
      if (!currentCandidate || currentCandidate.match.id !== matchId) {
        await replaceBonusForDay(selectedBonusMatchday, code, targetMatch);
      }

      // 2) Date/heure du coup d'envoi, si modifiée.
      const kickoffIso = parisLocalToUtcIso(editingBonus.kickoff);
      if (kickoffIso && kickoffIso !== targetMatch.kickoff) {
        await updateMatch(targetMatch.id, { kickoff: kickoffIso });
      }

      // 3) Score exact — la partie la plus importante de cette modal.
      await saveBonusScore(code, targetMatch, { home: editingBonus.home, away: editingBonus.away });

      setEditingBonus(null);
      notify("Bonus modifié avec succès");
    } catch (e) {
      console.error("Erreur lors de la modification du bonus :", e);
      notify(errorMessage(e, "Impossible de modifier le bonus"));
    } finally {
      setSavingBonusEdit(false);
    }
  }

  // Sélection bonus : une seule journée Ligue 1 à la fois (dropdown),
  // plutôt qu'une carte par journée — sert uniquement à nommer/stocker le
  // tirage (clé season_id:number) ; les matchs éligibles de chaque
  // championnat sont eux déterminés par la période (bonusMatchesForCompetition
  // + isWithinBonusPeriod), pas par le numéro de journée de la Ligue 1.
  const ligue1CompetitionId = useMemo(
    () => competitions.find((c) => c.external_code === "FL1" || c.code === "FL1")?.id ?? null,
    [competitions],
  );
  const ligue1Matchdays = useMemo(
    () =>
      matchdays
        .filter((md) => md.competition_id != null && md.competition_id === ligue1CompetitionId)
        .sort((a, b) => a.number - b.number),
    [matchdays, ligue1CompetitionId],
  );
  const [selectedBonusMatchdayId, setSelectedBonusMatchdayId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedBonusMatchdayId !== null || ligue1Matchdays.length === 0) return;
    const ligue1MatchdayIds = new Set(ligue1Matchdays.map((md) => md.id));
    const ligue1Matches = matches.filter((m) => m.matchday_id && ligue1MatchdayIds.has(m.matchday_id));
    setSelectedBonusMatchdayId(computeDefaultMatchdayId(ligue1Matchdays, ligue1Matches) ?? ligue1Matchdays[0].id);
  }, [ligue1Matchdays, matches, selectedBonusMatchdayId]);

  const selectedBonusMatchday = ligue1Matchdays.find((md) => md.id === selectedBonusMatchdayId) ?? null;
  const selectedBonusKey = selectedBonusMatchday ? `${selectedBonusMatchday.season_id}:${selectedBonusMatchday.number}` : null;
  const selectedBonusSelection = selectedBonusKey ? bonusSelections[selectedBonusKey] ?? {} : {};
  const selectedBonusMeta = selectedBonusKey ? bonusMetaByKey[selectedBonusKey] ?? {} : {};

  // Recharge toutes les sélections bonus actives depuis Supabase dès que
  // les journées Ligue 1 et les matchs sont disponibles. Ainsi, un simple
  // refresh de l'Admin ne remet jamais les cartes bonus à zéro.
  useEffect(() => {
    if (ligue1Matchdays.length === 0 || matches.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const entries = await Promise.all(
          ligue1Matchdays.map(async (md) => {
            const rows = await getBonusOptions(md.id);
            const hydrated: Partial<Record<BonusCompetitionCode, BonusCandidate>> = {};
            const meta: Partial<Record<BonusCompetitionCode, { updatedAt: string }>> = {};

            for (const row of rows) {
              const rawMatch = matches.find((m) => m.id === row.match_id);
              if (!rawMatch) continue;

              const candidate = scoreCandidateForMatch(rawMatch, row.competition_code);
              if (!candidate) continue;

              hydrated[row.competition_code] = {
                ...candidate,
                score: {
                  total: row.selection_score,
                  // standings_balance_score/form_score peuvent être absentes
                  // tant que la migration 20260815120000 n'a pas été
                  // appliquée (voir bonusOptionsService.ts) — 0 par défaut,
                  // jamais une valeur fabriquée.
                  standingsBalance: row.standings_balance_score ?? 0,
                  levelGap: row.balance_score,
                  form: row.form_score ?? 0,
                  prestige: row.prestige_score,
                  rivalry: row.rivalry_score,
                  schedule: row.schedule_score,
                },
                reasons: row.reasons ?? candidate.reasons,
              };
              meta[row.competition_code] = { updatedAt: row.updated_at };
            }

            return [`${md.season_id}:${md.number}`, hydrated, meta] as const;
          }),
        );

        if (!cancelled) {
          setBonusSelections(Object.fromEntries(entries.map(([key, hydrated]) => [key, hydrated])));
          setBonusMetaByKey(Object.fromEntries(entries.map(([key, , meta]) => [key, meta])));
        }
      } catch (e) {
        console.error("Erreur chargement des sélections bonus persistées :", e);
        if (!cancelled) {
          notify(errorMessage(e, "Impossible de charger les matchs bonus enregistrés."));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ligue1Matchdays, matches]);

  // Validation explicite de la journée avant tirage : le dropdown reste
  // librement modifiable, mais "Générer" ne doit consommer que la journée
  // que l'admin a confirmée en cliquant "Valider" — jamais la valeur brute
  // du dropdown au moment du clic. isBonusMatchdayValidated est dérivé (pas
  // un state séparé) : il retombe à false automatiquement dès que le
  // dropdown change, sans effet supplémentaire.
  const [validatedBonusMatchdayId, setValidatedBonusMatchdayId] = useState<string | null>(null);

  // Saisie du score directement sur la carte du championnat bonus. Jusqu'ici
  // il fallait passer par l'onglet Matchs, qui n'affiche que la Ligue 1 :
  // corriger le score d'un bonus etait donc impossible depuis l'interface.
  const [bonusScoreDrafts, setBonusScoreDrafts] = useState<
    Record<string, { home: string; away: string }>
  >({});
  const [savingBonusScoreId, setSavingBonusScoreId] = useState<string | null>(null);

  function bonusScoreDraftFor(match: Match) {
    return (
      bonusScoreDrafts[match.id] ?? {
        home: match.home_score == null ? "" : String(match.home_score),
        away: match.away_score == null ? "" : String(match.away_score),
      }
    );
  }

  // Enregistrement depuis la carte. On reutilise saveBonusScore ci-dessus
  // (deja utilisee par la fenetre "Modifier") plutot que d'ecrire un second
  // chemin : elle rafraichit aussi l'affichage de la ligne, sinon l'ancien
  // score resterait a l'ecran jusqu'a une regeneration du tirage.
  async function enregistrerScoreBonusEnLigne(code: BonusCompetitionCode, match: Match) {
    setSavingBonusScoreId(match.id);
    try {
      await saveBonusScore(code, match, bonusScoreDraftFor(match));
      setBonusScoreDrafts((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
      notify("Score du bonus enregistré.");
    } catch (e) {
      notify(errorMessage(e, "Erreur lors de l'enregistrement du score."));
    } finally {
      setSavingBonusScoreId(null);
    }
  }
  const validatedBonusMatchday = ligue1Matchdays.find((md) => md.id === validatedBonusMatchdayId) ?? null;
  const isBonusMatchdayValidated =
    selectedBonusMatchdayId !== null && selectedBonusMatchdayId === validatedBonusMatchdayId;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
              <Globe size={18} className="text-emerald-400" />
              Championnats
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Championnats disponibles sur ton compte football-data.org — active ceux à synchroniser pour la sélection bonus.
            </p>
          </div>
          <GhostButton onClick={loadAvailableCompetitions} disabled={loadingCompetitions}>
            <RefreshCw size={12} className={loadingCompetitions ? "animate-spin" : ""} />
            {competitionsLoaded ? "Actualiser la liste" : "Charger les championnats"}
          </GhostButton>
        </div>

        {!competitionsLoaded && !loadingCompetitions && (
          <p className="py-6 text-center text-sm text-slate-500">
            Charge la liste pour voir les championnats disponibles et les activer.
          </p>
        )}

        {competitionsLoaded && availableCompetitions.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">Aucun championnat renvoyé par football-data.org.</p>
        )}

        <div className="space-y-2">
          {availableCompetitions.map((discovered) => {
            const row = competitionRowFor(discovered.code);
            const isActive = row?.is_active ?? false;
            const count = matchCountByCompetitionCode.get(discovered.code) ?? 0;
            const expanded = expandedCode === discovered.code;
            return (
              <div key={discovered.code} className="rounded-xl border border-slate-800 bg-[#0d1322] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {discovered.emblem ? (
                      <img src={discovered.emblem} alt="" className="size-6 shrink-0 object-contain" />
                    ) : (
                      <span className="size-6 shrink-0 rounded-md border border-slate-700 bg-slate-800" />
                    )}
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{discovered.name}</div>
                      <div className="font-mono text-[10px] text-slate-500">
                        {discovered.code}
                        {discovered.country ? ` · ${discovered.country}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-300">
                      {count} match{count > 1 ? "s" : ""} synchronisé{count > 1 ? "s" : ""}
                    </span>
                    <GhostButton
                      onClick={() => toggleCompetitionActive(discovered)}
                      disabled={togglingCode === discovered.code}
                      title={isActive ? "Désactiver ce championnat" : "Activer ce championnat"}
                    >
                      {togglingCode === discovered.code ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : isActive ? (
                        <CheckCircle2 size={12} className="text-emerald-400" />
                      ) : (
                        <X size={12} />
                      )}
                      {isActive ? "Activé" : "Désactivé"}
                    </GhostButton>
                    <GhostButton
                      onClick={() => handleSyncCompetition(discovered)}
                      disabled={!isActive || syncingCode === discovered.code}
                      title={isActive ? "Synchroniser depuis football-data.org" : "Active le championnat pour pouvoir synchroniser"}
                    >
                      {syncingCode === discovered.code ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <Download size={12} />
                      )}
                      Synchroniser
                    </GhostButton>
                    {count > 0 && (
                      <GhostButton onClick={() => setExpandedCode(expanded ? null : discovered.code)}>
                        {expanded ? "Masquer" : "Voir les matchs"}
                      </GhostButton>
                    )}
                  </div>
                </div>

                {expanded && (
                  <div className="mt-3 border-t border-slate-800 pt-3">
                    <CompetitionMatchesList
                      matches={matches.filter((m) => (m.match_type ?? "LIGUE1") === discovered.code)}
                      matchdays={row ? matchdays.filter((md) => md.competition_id === row.id) : []}
                      onChanged={onChanged}
                      notify={notify}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* =====================================================
          GÉNÉRER LA SÉLECTION PREMIUM — remonté AVANT la sélection
          actuelle : on choisit la journée et la période, on génère, puis on
          regarde le résultat en dessous. L'inverse obligeait à faire défiler
          la page vers le bas pour agir, puis à remonter pour vérifier.
          Même donnée/handlers
          qu'avant (selectedBonusMatchdayId, periodStart/End,
          generateBonusForDay, removeBonusDraw...), seule la mise en
          page change : 3 colonnes dédiées (Générer / Journée / Période)
          au lieu d'une grille combinée, plus proches des maquettes.
         ===================================================== */}
      <Card className="p-5 border-sky-500/20">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest text-sky-400">
              <Sparkles size={13} />
              Générer la sélection premium
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Génère automatiquement 4 matches premium (1 par championnat).
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => isBonusMatchdayValidated && validatedBonusMatchday && void generateBonusForDay(validatedBonusMatchday)}
                disabled={!isBonusMatchdayValidated || !validatedBonusMatchday || generatingBonus || !periodStart || !periodEnd}
                title={!isBonusMatchdayValidated ? "Valide la journée choisie avant de générer." : undefined}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 font-display text-xs font-bold uppercase tracking-wide text-slate-950 shadow-[0_0_20px_rgba(14,165,233,0.3)] transition-all hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {generatingBonus ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Générer la sélection
              </button>
              <GhostButton
                danger
                onClick={() => selectedBonusMatchday && void removeBonusDraw(selectedBonusMatchday)}
                disabled={!selectedBonusMatchday || Object.keys(selectedBonusSelection).length === 0}
              >
                <Trash2 size={12} />
                Retirer le tirage
              </GhostButton>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest text-sky-400">
              <Calendar size={13} />
              Journée
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Sélectionne la journée pour laquelle les bonus seront affichés aux joueurs.
            </p>
            <select
              value={selectedBonusMatchdayId ?? ""}
              onChange={(e) => setSelectedBonusMatchdayId(e.target.value)}
              disabled={ligue1Matchdays.length === 0}
              className="mt-4 w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500/60 disabled:opacity-50"
            >
              {ligue1Matchdays.length === 0 && <option value="">Aucune journée synchronisée</option>}
              {ligue1Matchdays.map((md) => (
                <option key={md.id} value={md.id}>
                  Journée {md.number}
                </option>
              ))}
            </select>
            <div className="mt-2">
              {isBonusMatchdayValidated ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-300">
                  <CheckCircle2 size={12} />
                  Journée {selectedBonusMatchday?.number} validée ✓
                </span>
              ) : (
                <GhostButton
                  onClick={() => setValidatedBonusMatchdayId(selectedBonusMatchdayId)}
                  disabled={!selectedBonusMatchday}
                >
                  <CheckCircle2 size={12} />
                  Valider journée {selectedBonusMatchday?.number ?? ""}
                </GhostButton>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest text-sky-400">
              <Timer size={13} />
              Période de sélection
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Définit la période durant laquelle les bonus sont modifiables.
            </p>
            <div className="mt-4 space-y-2.5">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">Début</label>
                <input
                  type="datetime-local"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/60"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">Fin</label>
                <input
                  type="datetime-local"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/60"
                />
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-sky-300">
                {periodStart && periodEnd ? "Période active" : "Dates obligatoires"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 border-t border-slate-800 pt-5 lg:grid-cols-2">
          <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/15 bg-sky-500/[0.04] p-3">
            <Globe size={14} className="mt-0.5 shrink-0 text-sky-400" />
            <p className="text-[11px] text-slate-400">
              <span className="font-bold uppercase tracking-wide text-sky-300">Informations · </span>
              Les bonus sont automatiquement affichés aux joueurs dès leur génération ou modification.
            </p>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
            <p className="text-[11px] text-slate-400">
              <span className="font-bold uppercase tracking-wide text-amber-300">Important · </span>
              Le tirage prend uniquement en compte TOUS les matchs synchronisés dont le coup d'envoi est compris entre les
              deux dates. Les 4 bonus doivent obligatoirement provenir de 4 championnats différents.
            </p>
          </div>
        </div>
      </Card>

      {editingBonus && (() => {
        const currentMatch = matches.find((m) => m.id === editingBonus.matchId) ?? null;
        const alternatives = selectedBonusMatchday
          ? bonusMatchesForCompetition(editingBonus.code)
              .filter(isWithinBonusPeriod)
              .filter((match): match is Match & { kickoff: string } => !!match.kickoff)
              .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
          : [];
        const options =
          currentMatch && !alternatives.some((m) => m.id === currentMatch.id) ? [currentMatch, ...alternatives] : alternatives;
        const editingMeta = BONUS_COMPETITION_META[editingBonus.code];
        const editHomeLogoUrl = resolveBonusTeamLogo(currentMatch, "home", editingBonus.code, teams);
        const editAwayLogoUrl = resolveBonusTeamLogo(currentMatch, "away", editingBonus.code, teams);

        return (
          <Modal
            title="Modifier le bonus"
            onClose={() => !savingBonusEdit && setEditingBonus(null)}
            maxWidthClassName="max-w-xl"
            footer={
              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <GhostButton onClick={() => setEditingBonus(null)} disabled={savingBonusEdit} className="w-full sm:w-auto">
                  Annuler
                </GhostButton>
                <button
                  type="button"
                  onClick={submitBonusEdit}
                  disabled={savingBonusEdit}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-6 py-3 font-display text-xs font-bold uppercase tracking-wide text-white shadow-[0_0_20px_rgba(14,165,233,0.25)] transition-all hover:bg-sky-400 hover:shadow-[0_0_30px_rgba(14,165,233,0.45)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-[0_0_20px_rgba(14,165,233,0.25)] sm:w-auto"
                >
                  {savingBonusEdit ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                  Enregistrer les modifications
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">Championnat</div>
                <div className="flex items-center gap-2.5">
                  <CompetitionLogo code={editingBonus.code} label={BONUS_COMPETITION_LABELS[editingBonus.code]} size="size-9" />
                  <span className="text-sm font-bold text-white">
                    {editingMeta.flag} {BONUS_COMPETITION_LABELS[editingBonus.code]}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">Match</label>
                <select
                  value={editingBonus.matchId}
                  onChange={(e) => {
                    const match = matches.find((m) => m.id === e.target.value);
                    if (match) bonusEditorSelectMatch(match);
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/60"
                >
                  {options.map((m) => {
                    const k = formatBonusKickoff(m.kickoff);
                    return (
                      <option key={m.id} value={m.id}>
                        {m.home_team} VS {m.away_team} {m.kickoff ? `· ${k.day} ${k.time}` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* "Pourquoi ce match ?" — détail du barème dynamique qui a
                  mené à cette sélection (classement en direct en premier,
                  prestige seulement en critère secondaire). */}
              {(() => {
                const score = selectedBonusSelection[editingBonus.code]?.score;
                if (!score) return null;
                const rows: Array<[string, number, number]> = [
                  ["Équilibre", score.standingsBalance, BONUS_SELECTION_WEIGHTS.standingsBalance],
                  ["Écart au classement", score.levelGap, BONUS_SELECTION_WEIGHTS.levelGap],
                  ["Forme", score.form, BONUS_SELECTION_WEIGHTS.form],
                  ["Prestige", score.prestige, BONUS_SELECTION_WEIGHTS.prestige],
                  ["Affiche", score.rivalry, BONUS_SELECTION_WEIGHTS.rivalry],
                  ["Horaire", score.schedule, BONUS_SELECTION_WEIGHTS.schedule],
                ];
                return (
                  <div className="rounded-xl border border-sky-500/15 bg-sky-500/[0.03] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Pourquoi ce match ?
                      </span>
                      <span className="font-mono text-xs font-bold text-sky-300">Score de sélection {score.total} / 100</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                      {rows.map(([label, value, max]) => (
                        <div key={label} className="flex items-center justify-between gap-2 font-mono text-[10px] text-slate-400">
                          <span className="uppercase tracking-wider">{label}</span>
                          <span className="font-bold text-slate-200">
                            {value} / {max}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Date &amp; heure du coup d'envoi
                  </label>
                  <input
                    type="datetime-local"
                    value={editingBonus.kickoff}
                    onChange={(e) => setEditingBonus((prev) => (prev ? { ...prev, kickoff: e.target.value } : prev))}
                    className="w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/60"
                  />
                </div>
              </div>

              {/* SCORE EXACT — vraie interface premium : gros logos, gros
                  chiffres, boutons +/- larges (confortables au tactile),
                  saisie clavier toujours possible. Mêmes bornes qu'avant
                  (entier, jamais négatif) — voir BonusScoreStepper. */}
              <div className="rounded-2xl border border-sky-500/15 bg-gradient-to-b from-[#0d1826]/80 to-[#070d16]/80 p-4 sm:p-6">
                <div className="mb-4 text-center font-mono text-[10px] font-black uppercase tracking-[0.3em] text-sky-400">
                  Score exact
                </div>

                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:justify-center sm:gap-5">
                  <div className="flex flex-col items-center gap-3">
                    <BonusTeamBadge logoUrl={editHomeLogoUrl} name={currentMatch?.home_team ?? "?"} size="size-14" />
                    <BonusScoreStepper
                      value={editingBonus.home}
                      onChange={(v) => setEditingBonus((prev) => (prev ? { ...prev, home: v } : prev))}
                      label={currentMatch?.home_team ?? "domicile"}
                    />
                  </div>

                  <div className="flex shrink-0 flex-col items-center gap-2 pt-2 sm:pt-16">
                    <span className="font-display text-xs font-black uppercase tracking-[0.3em] text-sky-300 drop-shadow-[0_0_10px_rgba(56,189,248,.6)]">
                      VS
                    </span>
                    <span className="font-mono text-lg font-bold text-slate-400">
                      {editingBonus.home || "0"} — {editingBonus.away || "0"}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    <BonusTeamBadge logoUrl={editAwayLogoUrl} name={currentMatch?.away_team ?? "?"} size="size-14" />
                    <BonusScoreStepper
                      value={editingBonus.away}
                      onChange={(v) => setEditingBonus((prev) => (prev ? { ...prev, away: v } : prev))}
                      label={currentMatch?.away_team ?? "extérieure"}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* =====================================================
          SÉLECTION BONUS ACTUELLE — le résultat, affiché sous les
          contrôles qui le produisent. Une ligne premium par championnat (zone
          championnat / zone match / zone gestion), desktop en ligne
          horizontale, mobile en carte verticale empilée. Rendu délégué à
          BonusCompetitionRow (composants de présentation purs définis
          juste au-dessus de BonusTab) — la donnée et les handlers
          restent inchangés, seul l'emplacement dans la page bouge.
         ===================================================== */}
      <Card className="p-5 border-sky-500/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest text-sky-400">
              <Gift size={13} />
              Sélection bonus actuelle
            </div>
            <p className="text-xs text-slate-500">
              Les 4 bonus sélectionnés sont affichés aux joueurs sur la page Pronos.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.7)]" />
            Actif · Affiché aux joueurs
          </span>
        </div>

        {/* En-têtes de colonnes — desktop uniquement, alignés sur la même
            grille que chaque ligne. */}
        <div className="mb-2 mt-5 hidden px-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400/60 lg:grid lg:grid-cols-[260px_minmax(0,1fr)_230px]">
          <span>Championnat</span>
          <span className="text-center">Match sélectionné</span>
          <span>Gestion</span>
        </div>

        <div className="mt-3 space-y-3.5 lg:mt-0">
          {(["PL", "PD", "SA", "BL1"] as BonusCompetitionCode[]).map((code) => {
            const candidate = selectedBonusSelection[code];
            const discovered = availableCompetitions.find((d) => d.code === code);
            const kickoff = formatBonusKickoff(candidate?.match.kickoff);
            const lastModified = formatLastModified(selectedBonusMeta[code]?.updatedAt);
            const homeLogoUrl = candidate ? resolveBonusTeamLogo(candidate.match, "home", code, teams) : null;
            const awayLogoUrl = candidate ? resolveBonusTeamLogo(candidate.match, "away", code, teams) : null;

            return (
              <BonusCompetitionRow
                key={code}
                code={code}
                candidate={candidate}
                discovered={discovered}
                homeLogoUrl={homeLogoUrl}
                awayLogoUrl={awayLogoUrl}
                kickoff={kickoff}
                lastModified={lastModified}
                onEdit={() => openBonusEditor(code)}
                scoreDraft={candidate?.match ? bonusScoreDraftFor(candidate.match) : null}
                onScoreChange={(patch) => {
                  const match = candidate?.match;
                  if (!match) return;
                  setBonusScoreDrafts((prev) => ({
                    ...prev,
                    [match.id]: { ...bonusScoreDraftFor(match), ...patch },
                  }));
                }}
                onSaveScore={() => {
                  if (candidate?.match) void enregistrerScoreBonusEnLigne(code, candidate.match);
                }}
                saving={savingBonusScoreId === candidate?.match?.id}
                scoreModifie={Boolean(candidate?.match && bonusScoreDrafts[candidate.match.id])}
              />
            );
          })}
        </div>
      </Card>

    </div>
  );
}

// ============================================================
// 🔐 ONGLET VERROUILLAGE
// ============================================================
// Extrait de BonusTab : seul endroit qui écrit matchdays.deadline /
// deadline_mode / is_finished, lu par src/routes/pronostics.tsx pour
// bloquer les pronostics côté joueur — logique inchangée, uniquement
// déplacée dans son propre onglet.
function MatchdayLockTab({
  matchdays,
  setMatchdays,
  matches,
  seasons,
  competitions,
  error,
  onChanged,
  notify,
}: {
  matchdays: Matchday[];
  setMatchdays: React.Dispatch<React.SetStateAction<Matchday[]>>;
  matches: Match[];
  seasons: Season[];
  competitions: Competition[];
  error?: string;
  onChanged: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lockBusyId, setLockBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Matchday | null>(null);
  const [editing, setEditing] = useState<Matchday | null>(null);
  const [editForm, setEditForm] = useState({ number: "", seasonId: "", competitionId: "", deadline: "", deadlineMode: "manual" as "manual" | "auto_minus_1" });
  const [saving, setSaving] = useState(false);

  const seasonsById = useMemo(() => new Map(seasons.map((s) => [s.id, s])), [seasons]);
  const competitionsById = useMemo(() => new Map(competitions.map((c) => [c.id, c])), [competitions]);

  const matchCountByMatchdayId = useMemo(() => {
    const map = new Map<string, number>();
    matches.forEach((m) => {
      if (!m.matchday_id) return;
      map.set(m.matchday_id, (map.get(m.matchday_id) ?? 0) + 1);
    });
    return map;
  }, [matches]);

  // L'onglet listait les 182 journees des CINQ championnats. Or seules
  // celles de Ligue 1 se verrouillent : un match bonus suit le reglage de la
  // journee de Ligue 1 en cours, pas celui de sa propre competition. Les 148
  // autres lignes ne servaient donc a rien — et noyaient les seules qui
  // comptent.
  const ligue1Matchdays = useMemo(() => {
    const ligue1Ids = new Set(
      competitions
        .filter((c) => c.code === "FL1" || c.external_code === "FL1")
        .map((c) => String(c.id)),
    );
    const liste = ligue1Ids.size
      ? matchdays.filter((md) => md.competition_id && ligue1Ids.has(String(md.competition_id)))
      : matchdays;
    return [...liste].sort((a, b) => a.number - b.number);
  }, [matchdays, competitions]);

  // Journees sans aucun blocage : deadline_mode "manual" SANS date limite
  // laisse les pronostics ouverts apres le coup d'envoi.
  const nonProtegees = useMemo(
    () => ligue1Matchdays.filter((md) => md.deadline_mode !== "auto_minus_1" && !md.deadline),
    [ligue1Matchdays],
  );

  function openEdit(md: Matchday) {
    setEditing(md);
    setEditForm({
      number: String(md.number),
      seasonId: md.season_id ?? "",
      competitionId: md.competition_id ?? "",
      deadline: md.deadline ? md.deadline.slice(0, 16) : "",
      deadlineMode: md.deadline_mode ?? "manual",
    });
  }

  async function submitEdit() {
    if (!editing) return;
    const parsedNumber = parseInt(editForm.number, 10);
    if (Number.isNaN(parsedNumber)) {
      notify("Le numéro de la journée doit être un nombre.");
      return;
    }
    setSaving(true);
    try {
      await updateMatchday(editing.id, {
        number: parsedNumber,
        season_id: editForm.seasonId || editing.season_id,
        competition_id: editForm.competitionId || editing.competition_id,
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : null,
        deadline_mode: editForm.deadlineMode,
      });
      setEditing(null);
      await onChanged();
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de la modification de la journée.");
    } finally {
      setSaving(false);
    }
  }

  async function handleManualLock(md: Matchday) {
    const value = window.prompt(
      `Date/heure limite pour J${md.number} (format : 2026-08-22T18:59)`,
      md.deadline ? md.deadline.slice(0, 16) : "",
    );
    if (value === null) return;

    if (!value.trim()) {
      notify("Date/heure invalide.");
      return;
    }

    setLockBusyId(md.id);
    try {
      await setMatchdayDeadline(md.id, new Date(value).toISOString());
      await onChanged();
      notify(`🔐 J${md.number} verrouillée en mode manuel.`);
    } catch (e: any) {
      notify(e.message ?? "Erreur lors du verrouillage manuel.");
    } finally {
      setLockBusyId(null);
    }
  }

  async function handleAutoMinusOne(md: Matchday) {
    setLockBusyId(md.id);
    try {
      await setMatchdayAutoMinusOne(md.id);
      await onChanged();
      notify(`⚡ J${md.number} : verrouillage automatique -1 min activé.`);
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de l'activation du verrouillage automatique.");
    } finally {
      setLockBusyId(null);
    }
  }

  async function handleClearLock(md: Matchday) {
    setLockBusyId(md.id);
    try {
      await clearMatchdayDeadline(md.id);
      await onChanged();
      notify(`🔓 Verrouillage retiré pour J${md.number}.`);
    } catch (e: any) {
      notify(e.message ?? "Erreur lors du retrait du verrouillage.");
    } finally {
      setLockBusyId(null);
    }
  }

  // Optimiste comme les autres bascules de statut (toggleAdmin, togglePaid) :
  // le badge EN COURS/TERMINÉE change tout de suite.
  async function toggleFinished(md: Matchday) {
    setBusyId(md.id);
    const nextFinished = !md.is_finished;
    setMatchdays((prev) => prev.map((m) => (m.id === md.id ? { ...m, is_finished: nextFinished } : m)));
    try {
      await setMatchdayFinished(md.id, nextFinished);
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de la mise à jour.");
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  // Optimiste : la journée disparaît de la liste immédiatement, on ne
  // resynchronise que si Supabase renvoie une erreur.
  async function confirmAndDelete() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setBusyId(target.id);
    setMatchdays((prev) => prev.filter((m) => m.id !== target.id));
    setConfirmDelete(null);
    try {
      await apiDeleteMatchday(target.id);
    } catch (e: any) {
      notify(e.message ?? "Erreur lors de la suppression.");
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-4">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
            <Calendar size={18} className="text-emerald-400" />
            Journées Ligue 1
            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-0.5 font-mono text-[11px] font-bold text-slate-300">
              {ligue1Matchdays.length}
            </span>
          </h2>

          {nonProtegees.length === 0 ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <Lock size={12} />
              Toutes verrouillées 1 minute avant le coup d'envoi. Rien à faire.
            </p>
          ) : (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-red-300">
              <Unlock size={12} />
              {nonProtegees.length} journée{nonProtegees.length > 1 ? "s" : ""} sans verrouillage
              {" "}(J{nonProtegees.map((md) => md.number).join(", J")}) — les pronostics y restent
              ouverts après le coup d'envoi.
            </p>
          )}
        </div>

        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} />
          </div>
        )}

        {!error && ligue1Matchdays.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Aucune journée créée pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {ligue1Matchdays.map((md) => (
              <div
                key={md.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0d1322] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 font-display text-sm font-black text-white">
                    J{md.number}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">
                      {(md.competition_id ? competitionsById.get(md.competition_id) : undefined)?.name ?? "Compétition inconnue"}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-slate-500">
                      <span>
                        {matchCountByMatchdayId.get(md.id) ?? 0} match(s) · saison{" "}
                        {(md.season_id ? seasonsById.get(md.season_id) : undefined)?.name ?? "?"}
                      </span>
                      {md.deadline_mode === "auto_minus_1" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-bold text-emerald-300">
                          <Lock size={11} />
                          Verrouillée
                        </span>
                      ) : md.deadline ? (
                        <span className="inline-flex items-center gap-1 text-amber-400/80">
                          <CalendarClock size={11} />
                          Limite : {new Date(md.deadline).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/15 px-2 py-0.5 font-bold text-red-300">
                          <Unlock size={11} />
                          Sans verrouillage
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <GhostButton
                    onClick={() => handleManualLock(md)}
                    disabled={lockBusyId === md.id}
                    title="Définir une date/heure limite"
                    ariaLabel={`Définir une limite manuelle pour J${md.number}`}
                  >
                    {lockBusyId === md.id ? "…" : "🔐"}
                    Manuel
                  </GhostButton>

                  <GhostButton
                    onClick={() => handleAutoMinusOne(md)}
                    disabled={lockBusyId === md.id}
                    title="Verrouiller chaque match 1 minute avant son coup d'envoi"
                    ariaLabel={`Activer le verrouillage automatique moins une minute pour J${md.number}`}
                  >
                    <Timer size={12} />
                    Auto -1 min
                  </GhostButton>

                  {(md.deadline || md.deadline_mode === "auto_minus_1") && (
                    <GhostButton
                      danger
                      onClick={() => handleClearLock(md)}
                      disabled={lockBusyId === md.id}
                      title="Retirer le verrouillage"
                      ariaLabel={`Retirer le verrouillage de J${md.number}`}
                    >
                      <Unlock size={12} />
                      Retirer
                    </GhostButton>
                  )}

                  {!md.is_finished ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint/10 px-2.5 py-1 font-mono text-[10px] font-bold text-mint">
                      <Unlock size={11} />
                      EN COURS
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-400">
                      <Lock size={11} />
                      TERMINÉE
                    </span>
                  )}
                  <GhostButton onClick={() => toggleFinished(md)}>
                    {busyId === md.id ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : md.is_finished ? (
                      <Unlock size={12} />
                    ) : (
                      <Lock size={12} />
                    )}
                    {md.is_finished ? "Rouvrir" : "Clôturer"}
                  </GhostButton>
                  <GhostButton onClick={() => openEdit(md)} title="Modifier" ariaLabel={`Modifier la journée J${md.number}`}>
                    <Pencil size={12} />
                  </GhostButton>
                  <GhostButton
                    danger
                    onClick={() => setConfirmDelete(md)}
                    title="Supprimer"
                    ariaLabel={`Supprimer la journée J${md.number}`}
                  >
                    <Trash2 size={12} />
                  </GhostButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && (
        <Modal title={`Modifier J${editing.number}`} onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Numéro
                </label>
                <TextInput value={editForm.number} onChange={(e) => setEditForm((f) => ({ ...f, number: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Compétition
                </label>
                <select
                  value={editForm.competitionId}
                  onChange={(e) => setEditForm((f) => ({ ...f, competitionId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
                >
                  {competitions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Saison
                </label>
                <select
                  value={editForm.seasonId}
                  onChange={(e) => setEditForm((f) => ({ ...f, seasonId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Date limite
                </label>
                <TextInput
                  type="datetime-local"
                  value={editForm.deadline}
                  onChange={(e) => setEditForm((f) => ({ ...f, deadline: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <GhostButton onClick={() => setEditing(null)}>Annuler</GhostButton>
              <PrimaryButton onClick={submitEdit} disabled={saving}>
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                Enregistrer
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer cette journée ?"
          description={`La journée J${confirmDelete.number} sera supprimée. Les matchs déjà rattachés perdront leur journée.`}
          confirmLabel="Supprimer"
          busy={busyId === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={confirmAndDelete}
        />
      )}
    </div>
  );
}

/** Liste compacte, triée par journée, des matchs synchronisés pour un
 * championnat de l'onglet Bonus — équivalent allégé du tableau de l'onglet
 * Matchs (mêmes scores éditables inline), sans création/suppression : ces
 * matchs n'existent que via la synchronisation football-data.org. Pas de
 * badge logo (aucune équipe hors Ligue 1 n'est en base, voir
 * syncCompetitionMatches) : le nom brut renvoyé par l'API suffit ici. */
function CompetitionMatchesList({
  matches,
  matchdays,
  onChanged,
  notify,
}: {
  matches: Match[];
  matchdays: Matchday[];
  onChanged: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, { home: string; away: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const matchdaysById = useMemo(() => new Map(matchdays.map((md) => [md.id, md])), [matchdays]);

  // Sélecteur de journée scopé à ce championnat (pas de J1-J34 fixe : le
  // numéro vient tel quel du champ `matchday` renvoyé par football-data.org
  // pour CE championnat, voir syncCompetitionMatches). Si plusieurs
  // championnats sont développés en même temps dans l'onglet Bonus, chaque
  // instance de CompetitionMatchesList a son propre state — le filtre ne
  // s'applique donc qu'au championnat affiché ici, jamais globalement.
  const sortedMatchdays = useMemo(() => [...matchdays].sort((a, b) => a.number - b.number), [matchdays]);
  const [selectedMatchdayId, setSelectedMatchdayId] = useState<string | "all" | null>(null);

  useEffect(() => {
    if (selectedMatchdayId !== null || sortedMatchdays.length === 0) return;
    setSelectedMatchdayId(computeDefaultMatchdayId(sortedMatchdays, matches) ?? "all");
  }, [sortedMatchdays, matches, selectedMatchdayId]);

  function draftFor(match: Match) {
    return (
      scoreDrafts[match.id] ?? {
        home: match.home_score === null || match.home_score === undefined ? "" : String(match.home_score),
        away: match.away_score === null || match.away_score === undefined ? "" : String(match.away_score),
      }
    );
  }

  async function saveScore(match: Match) {
    const draft = draftFor(match);
    const homeRaw = draft.home.trim();
    const awayRaw = draft.away.trim();
    const home = homeRaw === "" ? null : Number(homeRaw);
    const away = awayRaw === "" ? null : Number(awayRaw);
    if ((home !== null && Number.isNaN(home)) || (away !== null && Number.isNaN(away))) {
      notify("Le score doit être un nombre.");
      return;
    }
    setSavingId(match.id);
    try {
      await updateMatch(match.id, {
        home_score: home,
        away_score: away,
        finished: home !== null && away !== null ? true : match.finished,
      });
      setScoreDrafts((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
      await onChanged();
    } catch (e) {
      notify(errorMessage(e, "Erreur lors de l'enregistrement du score."));
    } finally {
      setSavingId(null);
    }
  }

  const sorted = useMemo(
    () =>
      [...matches].sort((a, b) => {
        const an = matchdaysById.get(a.matchday_id ?? "")?.number ?? 0;
        const bn = matchdaysById.get(b.matchday_id ?? "")?.number ?? 0;
        if (an !== bn) return an - bn;
        return (a.kickoff ?? "").localeCompare(b.kickoff ?? "");
      }),
    [matches, matchdaysById],
  );

  const visible = useMemo(() => {
    if (selectedMatchdayId === null || selectedMatchdayId === "all") return sorted;
    return sorted.filter((m) => m.matchday_id === selectedMatchdayId);
  }, [sorted, selectedMatchdayId]);

  const currentMatchdayIndex =
    selectedMatchdayId && selectedMatchdayId !== "all"
      ? sortedMatchdays.findIndex((md) => md.id === selectedMatchdayId)
      : -1;

  if (sorted.length === 0) {
    return <p className="py-4 text-center text-xs text-slate-500">Aucun match synchronisé pour ce championnat.</p>;
  }

  return (
    <div>
      {sortedMatchdays.length > 1 && (
        <div className="mb-2 flex items-center gap-1">
          <GhostButton
            onClick={() => setSelectedMatchdayId(sortedMatchdays[currentMatchdayIndex - 1].id)}
            disabled={currentMatchdayIndex <= 0}
            title="Journée précédente"
            ariaLabel="Journée précédente"
            className="!px-1.5 !py-1"
          >
            <ChevronLeft size={12} />
          </GhostButton>

          <select
            value={selectedMatchdayId ?? "all"}
            onChange={(e) => setSelectedMatchdayId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-[#0d1322] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-200 outline-none focus:border-emerald-500/60"
          >
            <option value="all">Toutes les journées</option>
            {sortedMatchdays.map((md) => (
              <option key={md.id} value={md.id}>
                {matchdayLabel(md)}
              </option>
            ))}
          </select>

          <GhostButton
            onClick={() => setSelectedMatchdayId(sortedMatchdays[currentMatchdayIndex + 1].id)}
            disabled={currentMatchdayIndex === -1 || currentMatchdayIndex >= sortedMatchdays.length - 1}
            title="Journée suivante"
            ariaLabel="Journée suivante"
            className="!px-1.5 !py-1"
          >
            <ChevronRight size={12} />
          </GhostButton>
        </div>
      )}
      <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
      {visible.map((match) => {
        const draft = draftFor(match);
        const hasDraftEdit = scoreDrafts[match.id] !== undefined;
        const md = matchdaysById.get(match.matchday_id ?? "");
        return (
          <div
            key={match.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#060b16] px-3 py-2"
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-400">
                {md ? `J${md.number}` : "—"}
              </span>
              <span className="font-semibold text-slate-200">{match.home_team || "?"}</span>
              <span className="text-slate-600">vs</span>
              <span className="font-semibold text-slate-200">{match.away_team || "?"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-slate-500">
                {match.kickoff ? new Date(match.kickoff).toLocaleDateString("fr-FR", { dateStyle: "short" }) : "—"}
              </span>
              <StatusBadge status={matchDisplayStatus(match)} />
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={draft.home}
                onChange={(e) => setScoreDrafts((prev) => ({ ...prev, [match.id]: { ...draftFor(match), home: e.target.value } }))}
                onBlur={() => hasDraftEdit && saveScore(match)}
                onKeyDown={(e) => e.key === "Enter" && saveScore(match)}
                aria-label={`Score domicile ${match.home_team ?? "?"}`}
                className="w-10 rounded border border-slate-700 bg-[#0d1322] px-1 py-0.5 text-center text-xs font-bold text-slate-100 outline-none focus:border-emerald-500/60"
              />
              <span className="text-slate-600">-</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={draft.away}
                onChange={(e) => setScoreDrafts((prev) => ({ ...prev, [match.id]: { ...draftFor(match), away: e.target.value } }))}
                onBlur={() => hasDraftEdit && saveScore(match)}
                onKeyDown={(e) => e.key === "Enter" && saveScore(match)}
                aria-label={`Score extérieur ${match.away_team ?? "?"}`}
                className="w-10 rounded border border-slate-700 bg-[#0d1322] px-1 py-0.5 text-center text-xs font-bold text-slate-100 outline-none focus:border-emerald-500/60"
              />
              {hasDraftEdit && (
                <GhostButton onClick={() => saveScore(match)} title="Enregistrer le score">
                  {savingId === match.id ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                </GhostButton>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ============================================================
// ⚙️ ONGLET RÉGLAGES
// ============================================================
/** Champ numérique générique : on garde la saisie en texte tant que le
 * champ est édité (comme le reste de l'admin — voir montant de paiement,
 * score de match) pour ne pas gêner la frappe d'un nombre décimal ou d'un
 * champ vidé temporairement ; la conversion en nombre a lieu à
 * l'enregistrement. */
function NumberField({
  label,
  value,
  onChange,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon?: typeof Users;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        {Icon && <Icon size={11} />}
        {label}
      </label>
      <TextInput inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="mt-1 text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

function toNumber(raw: string, fallback = 0): number {
  const n = Number(raw.replace(",", "."));
  return Number.isNaN(n) ? fallback : n;
}

function SettingsTab({
  settings,
  error,
  onChanged,
  notify,
}: {
  settings: AppSettings | null;
  error?: string;
  onChanged: () => Promise<void>;
  notify: (message: string) => void;
}) {
  // Général
  const [season, setSeason] = useState(settings?.season ?? "");
  const [entryFee, setEntryFee] = useState(String(settings?.entry_fee ?? 10));
  const [timezone, setTimezone] = useState(settings?.timezone ?? "Europe/Paris");
  const [registrationDeadline, setRegistrationDeadline] = useState(settings?.registration_deadline?.slice(0, 16) ?? "");

  // Blocage des pronostics — règle réelle : 1 minute avant le coup d'envoi
  // (voir setMatchdayAutoMinusOne, qui applique déjà ce calcul indépendamment
  // de ce réglage). Repli à 1 (et non 0) pour refléter cette valeur réelle
  // tant que settings n'est pas chargé.
  const [closingDelay, setClosingDelay] = useState(String(settings?.closing_delay_minutes ?? 1));

  // Équipe de cœur
  const [favoriteTeamDeadline, setFavoriteTeamDeadline] = useState(settings?.favorite_team_deadline?.slice(0, 16) ?? "");
  const [favoriteTeamAutoLock, setFavoriteTeamAutoLock] = useState(settings?.favorite_team_auto_lock ?? true);

  // Bonus — période de disponibilité (mêmes colonnes bonus_period_start/end
  // et mêmes helpers de conversion Paris<->UTC que l'onglet Bonus, pour
  // rester la même source de vérité qu'il s'agisse de generateBonusForDay
  // ou de ce formulaire ; réutilisé ici, pas dupliqué).
  const [periodStart, setPeriodStart] = useState(toDatetimeLocalInput(settings?.bonus_period_start));
  const [periodEnd, setPeriodEnd] = useState(toDatetimeLocalInput(settings?.bonus_period_end));

  // Mode maintenance
  const [maintenanceMode, setMaintenanceMode] = useState(settings?.maintenance_mode ?? false);
  const [maintenanceMessage, setMaintenanceMessage] = useState(settings?.maintenance_message ?? "");

  // Gazette — bascule Mercato / Rubrique du moment (voir migration
  // 20260817090000). Pas de date de fenêtre mercato inventée : c'est
  // l'admin qui active/désactive, comme le mode maintenance.
  const [mercatoActive, setMercatoActive] = useState(settings?.mercato_active ?? false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testingApi, setTestingApi] = useState(false);

  // Code d'invitation exige a l'inscription (table app_invite). Regenerable
  // a volonte : l'ancien code cesse aussitot de fonctionner.
  const [inviteCode, setInviteCode] = useState("");
  const [inviteUpdatedAt, setInviteUpdatedAt] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const courant = await lireCodeInvitation();
        if (cancelled) return;
        setInviteCode(courant?.code ?? "");
        setInviteUpdatedAt(courant?.updatedAt ?? null);
        setInviteError(courant ? null : "Aucun code enregistre : genere-en un.");
      } catch (e) {
        if (!cancelled) {
          setInviteError(
            "Table app_invite introuvable. Execute supabase/migrations/20260824090000_invite_code.sql.",
          );
        }
      } finally {
        if (!cancelled) setInviteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveInvite(code: string) {
    setInviteSaving(true);
    try {
      await enregistrerCodeInvitation(code);
      setInviteCode(code);
      setInviteUpdatedAt(new Date().toISOString());
      setInviteError(null);
      notify("Nouveau code d'invitation actif. L'ancien ne fonctionne plus.");
    } catch (e) {
      notify(errorMessage(e, "Erreur lors de l'enregistrement du code."));
    } finally {
      setInviteSaving(false);
    }
  }

  useEffect(() => {
    if (!settings) return;
    setSeason(settings.season);
    setEntryFee(String(settings.entry_fee));
    setTimezone(settings.timezone);
    setRegistrationDeadline(settings.registration_deadline?.slice(0, 16) ?? "");
    setClosingDelay(String(settings.closing_delay_minutes ?? 1));
    setFavoriteTeamDeadline(settings.favorite_team_deadline?.slice(0, 16) ?? "");
    setFavoriteTeamAutoLock(settings.favorite_team_auto_lock);
    setPeriodStart(toDatetimeLocalInput(settings.bonus_period_start));
    setPeriodEnd(toDatetimeLocalInput(settings.bonus_period_end));
    setMaintenanceMode(settings.maintenance_mode);
    setMaintenanceMessage(settings.maintenance_message ?? "");
    setMercatoActive(settings.mercato_active ?? false);
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateSettings({
        season,
        entry_fee: toNumber(entryFee, 0),
        timezone: timezone.trim() || "Europe/Paris",
        registration_deadline: registrationDeadline ? new Date(registrationDeadline).toISOString() : null,
        closing_delay_minutes: Math.max(0, Math.round(toNumber(closingDelay, 1))),
        favorite_team_deadline: favoriteTeamDeadline ? new Date(favoriteTeamDeadline).toISOString() : null,
        favorite_team_auto_lock: favoriteTeamAutoLock,
        bonus_period_start: parisLocalToUtcIso(periodStart),
        bonus_period_end: parisLocalToUtcIso(periodEnd),
        maintenance_mode: maintenanceMode,
        maintenance_message: maintenanceMessage.trim() || null,
        mercato_active: mercatoActive,
      });
      await onChanged();
      setSaved(true);
      notify("Réglages enregistrés.");
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      notify(errorMessage(e, "Erreur lors de l'enregistrement des réglages."));
    } finally {
      setSaving(false);
    }
  }

  async function handleResync() {
    setSyncing(true);
    await onChanged();
    setSyncing(false);
  }

  async function handleTestApiConnection() {
    setTestingApi(true);
    try {
      const list = await getAvailableCompetitions();
      notify(`✅ Connexion football-data.org OK — ${list.length} championnat(s) disponible(s) sur ce compte.`);
    } catch (e) {
      notify(errorMessage(e, "❌ Connexion à football-data.org impossible."));
    } finally {
      setTestingApi(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}

      {/* ================= CODE D'INVITATION ================= */}
      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
          <KeyRound size={18} className="text-amber-400" />
          Code d'invitation
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Exigé pour créer un compte. Les joueurs déjà inscrits ne sont pas concernés : ils se
          connectent comme avant. Régénère-le dès qu'il a trop circulé — l'ancien cesse aussitôt
          de fonctionner.
        </p>

        {inviteError && (
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            {inviteError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[190px] items-center gap-3 rounded-xl border border-slate-700 bg-[#0d1322] px-4 py-3">
            <span className="font-mono text-xl font-black tracking-[0.28em] text-amber-200">
              {inviteLoading ? "…" : inviteCode || "—"}
            </span>
          </div>

          <GhostButton
            onClick={() => {
              navigator.clipboard?.writeText(inviteCode).then(
                () => notify("Code copié."),
                () => notify("Copie impossible : note-le à la main."),
              );
            }}
            disabled={!inviteCode || inviteLoading}
            ariaLabel="Copier le code d'invitation"
          >
            <Copy size={12} />
            Copier le code
          </GhostButton>

          <GhostButton
            onClick={() => {
              // Lien pret a coller dans un message : il ouvre l'inscription
              // avec le code deja rempli.
              const base =
                String(import.meta.env.VITE_SITE_URL ?? "").trim().replace(/\/$/, "") ||
                window.location.origin;
              const lien = `${base}/auth?code=${encodeURIComponent(inviteCode)}`;
              navigator.clipboard?.writeText(lien).then(
                () => notify("Lien d'invitation copié."),
                () => notify("Copie impossible : envoie le code seul."),
              );
            }}
            disabled={!inviteCode || inviteLoading}
            ariaLabel="Copier le lien d'invitation"
          >
            <Share2 size={12} />
            Copier le lien
          </GhostButton>

          <PrimaryButton
            onClick={() => {
              if (
                inviteCode &&
                !window.confirm(
                  "Générer un nouveau code ? L'ancien ne permettra plus aucune inscription.",
                )
              ) {
                return;
              }
              void handleSaveInvite(genererCodeInvitation());
            }}
            disabled={inviteSaving || inviteLoading}
          >
            {inviteSaving ? <RefreshCw size={14} className="animate-spin" /> : <KeyRound size={14} />}
            Générer un nouveau code
          </PrimaryButton>
        </div>

        {inviteCode && !inviteLoading && (() => {
          // Adresse STABLE du site, si elle est configuree (VITE_SITE_URL).
          // Sans elle, on retombe sur l'adresse courante — qui peut etre celle
          // d'une prevoyalisation, d'ou l'avertissement plus bas.
          const siteConfigure = String(import.meta.env.VITE_SITE_URL ?? "").trim().replace(/\/$/, "");
          const origine = siteConfigure || (typeof window === "undefined" ? "" : window.location.origin);
          // Vercel donne une adresse unique a chaque deploiement et a chaque
          // branche (…-git-…, …-projects.vercel.app). Un lien construit
          // depuis une de ces adresses meurt au deploiement suivant : le
          // joueur invite tomberait sur une page introuvable.
          const previsualisation =
            !siteConfigure && /-git-|-[a-z0-9]{9,}-.*\.vercel\.app$/i.test(origine);

          return (
            <>
              <p className="mt-3 break-all rounded-xl border border-slate-800 bg-[#0b1120] px-3 py-2 font-mono text-[11px] text-slate-400">
                {`${origine}/auth?code=${inviteCode}`}
              </p>
              {previsualisation && (
                <p className="mt-2 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-300">
                  ⚠️ Cette adresse est celle d'une prévisualisation, pas celle de ton site.
                  Le lien cessera de fonctionner au prochain déploiement. Ouvre ton site depuis
                  son adresse habituelle avant de copier le lien.
                </p>
              )}
            </>
          );
        })()}

        {inviteUpdatedAt && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Modifié le {new Date(inviteUpdatedAt).toLocaleString("fr-FR")}
          </p>
        )}
      </Card>

      {/* ================= SAISON & PARAMÈTRES GÉNÉRAUX ================= */}
      <Card className="p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
          <SettingsIcon size={18} className="text-emerald-400" />
          Saison &amp; paramètres généraux
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Saison en cours
            </label>
            <TextInput value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2026-2027" />
          </div>
          <NumberField label="Droit d'entrée (€ / joueur)" value={entryFee} onChange={setEntryFee} />
          {/* Le champ "Fuseau horaire d'affichage" a ete retire : il etait
              enregistre mais n'etait branche nulle part, et son propre texte
              d'aide l'avouait. Un reglage qui ne regle rien est pire que pas
              de reglage — il fait croire qu'on maitrise quelque chose. Les
              heures suivent le fuseau du navigateur de chaque joueur, ce qui
              est le bon comportement pour une ligue entre amis en France.
              La colonne app_settings.timezone reste en base, intacte. */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Date limite d'inscription / modification du profil
            </label>
            <input
              type="datetime-local"
              value={registrationDeadline}
              onChange={(e) => setRegistrationDeadline(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-[#0d1322] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : saved ? (
              <CheckCircle2 size={14} />
            ) : (
              <Save size={14} />
            )}
            {saved ? "Enregistré" : "Enregistrer"}
          </PrimaryButton>
        </div>
      </Card>

      {/* ================= ÉQUIPE DE CÅ’UR ================= */}
      <Card className="p-5 border-amber-500/30 bg-[#0d1322]">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-400">
            ⭐
          </span>
          <div>
            <h2 className="font-display text-lg font-bold uppercase tracking-wide text-white">Équipe de cœur</h2>
            <p className="text-xs text-slate-400">
              Date limite et verrouillage automatique du choix d'équipe favorite (onglet Joueurs).
          Rappel : les pronostics, eux, se verrouillent automatiquement 1 minute avant chaque
          coup d'envoi — voir l'onglet Verrouillage.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
              <Calendar size={11} className="text-emerald-400" /> Date limite de choix
            </label>
            <input
              type="datetime-local"
              value={favoriteTeamDeadline}
              onChange={(e) => setFavoriteTeamDeadline(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-[#060b16] px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/60"
            />
          </div>
          <div className="flex flex-col justify-end">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-[#060b16] p-2.5 transition-colors hover:border-slate-700">
              <input
                type="checkbox"
                checked={favoriteTeamAutoLock}
                onChange={(e) => setFavoriteTeamAutoLock(e.target.checked)}
                className="size-4 rounded border-slate-800 bg-slate-900 text-emerald-500 focus:ring-0"
              />
              <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                <Lock size={14} className="text-amber-400" /> Verrouillage automatique à la date limite
              </span>
            </label>
          </div>
        </div>
      </Card>

      {/* Le bloc "Blocage des pronostics" a ete retire. Son champ "minutes
          avant le coup d'envoi" affichait 5 alors que le site verrouille a
          1 minute, en dur (voir getMatchLockDate dans pronostics.tsx) : la
          valeur n'etait branchee nulle part. Un reglage qui annonce une regle
          du jeu differente de la vraie est pire qu'absent — surtout dans une
          ligue avec une cagnotte. La regle est rappelee ci-dessous, la ou
          l'admin la cherche vraiment (onglet Verrouillage).
          La colonne app_settings.closing_delay_minutes reste en base. */}

      {/* Le bloc "Bonus" (periode de disponibilite) a ete retire d'ici : ce
          sont exactement les memes dates que dans l'onglet Bonus, ou elles se
          modifient a cote du tirage qu'elles commandent. Deux endroits pour
          un meme reglage, c'est deux occasions de se contredire. */}


      {/* ================= MODE MAINTENANCE ================= */}
      <Card className={`p-5 ${maintenanceMode ? "border-red-500/40 bg-red-500/[0.03]" : ""}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
            <AlertTriangle size={18} className={maintenanceMode ? "text-red-400" : "text-emerald-400"} />
            Mode maintenance
          </h2>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-[#060b16] px-3 py-2 transition-colors hover:border-slate-700">
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={(e) => setMaintenanceMode(e.target.checked)}
              className="size-4 rounded border-slate-800 bg-slate-900 text-red-500 focus:ring-0"
            />
            <span className="text-sm font-medium text-white">Geler les pronostics</span>
          </label>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Coché, il bloque réellement l'enregistrement des pronostics et affiche ton message aux
          joueurs sur la page Pronos. À n'utiliser que le temps d'une correction : personne ne peut
          plus jouer pendant ce temps.
        </p>
        <TextInput
          value={maintenanceMessage}
          onChange={(e) => setMaintenanceMessage(e.target.value)}
          placeholder="Message affiché aux joueurs pendant la maintenance (optionnel)"
        />
      </Card>

      {/* Le bloc "Gazette — Mercato" a ete retire de l'Admin a la demande de
          l'organisateur : la bascule ne servait qu'a forcer une rubrique de la
          Gazette pendant le mercato, ce qu'il ne fait pas. La Gazette continue
          d'afficher sa "Rubrique du moment", calculee sur les donnees reelles
          de la saison. La colonne app_settings.mercato_active reste en base et
          continue d'etre enregistree : rien n'est perdu si la bascule revient
          un jour. */}

      {/* ================= FOOTBALL-DATA.ORG ================= */}
      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
          <Globe size={18} className="text-emerald-400" />
          Intégration football-data.org
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Clé API stockée côté serveur (variable d'environnement <code className="text-slate-400">FOOTBALL_DATA_API_TOKEN</code>),
          jamais exposée ici. Ce bouton vérifie juste que la connexion fonctionne.
        </p>
        <GhostButton onClick={handleTestApiConnection} disabled={testingApi}>
          <RefreshCw size={12} className={testingApi ? "animate-spin" : ""} />
          Tester la connexion
        </GhostButton>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-white">
          <RefreshCw size={18} className="text-emerald-400" />
          Synchronisation
        </h2>
        <p className="mb-4 text-sm text-slate-400">
          Recharge l'ensemble des données admin (joueurs, paiements, matchs, bonus, réglages) depuis Supabase.
        </p>
        <GhostButton onClick={handleResync}>
          <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
          Resynchroniser maintenant
        </GhostButton>
      </Card>
    </div>
  );
}

// ============================================================
// Composants génériques : Modal & confirmation
// ============================================================
function Modal({
  title,
  children,
  onClose,
  maxWidthClassName = "max-w-lg",
  footer,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  /** Largeur max de la modal — "max-w-lg" par défaut (comportement inchangé
   * pour tous les appelants existants). Optionnel, pour les modals qui ont
   * besoin de plus de place (ex. la saisie de score bonus premium). */
  maxWidthClassName?: string;
  /** Pied de modal optionnel (ex. Annuler / Enregistrer), rendu HORS de la
   * zone de contenu défilable — reste toujours visible en bas, séparé par
   * une bordure fine. Absent par défaut : les modals existantes qui posent
   * déjà leurs propres boutons dans `children` gardent un rendu identique,
   * seule la hauteur globale est maintenant plafonnée (max-h-[85vh]) avec
   * défilement interne du contenu si besoin — filet de sécurité qui ne
   * change rien tant que le contenu tient déjà à l'écran. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`flex max-h-[85vh] w-full ${maxWidthClassName} flex-col rounded-2xl border border-slate-800 bg-[#0b1325] shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between p-6 pb-5">
          <h3 className="font-display text-lg font-bold uppercase tracking-wide text-white">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer && <div className="shrink-0 border-t border-slate-800 p-4 sm:p-5">{footer}</div>}
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
  tone = "danger",
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** "danger" (défaut, inchangé) pour les suppressions ; "primary" pour une
   * confirmation d'action non destructive (ex. génération en masse), qui
   * reprend alors le vert émeraude du reste de l'app au lieu du rouge. */
  tone?: "danger" | "primary";
}) {
  const isDanger = tone === "danger";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        className={`w-full max-w-sm rounded-2xl border bg-[#0b1325] p-6 shadow-2xl ${
          isDanger ? "border-red-500/20" : "border-emerald-500/20"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`mb-3 flex items-center gap-2 ${isDanger ? "text-red-400" : "text-emerald-400"}`}>
          <AlertTriangle size={18} />
          <h3 className="font-display text-lg font-bold uppercase tracking-wide">{title}</h3>
        </div>
        <p className="mb-5 text-sm text-slate-400">{description}</p>
        <div className="flex justify-end gap-2">
          <GhostButton onClick={onCancel}>Annuler</GhostButton>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-display text-xs font-bold uppercase tracking-wide transition-all disabled:opacity-50 ${
              isDanger
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            }`}
          >
            {busy ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : isDanger ? (
              <Trash2 size={14} />
            ) : (
              <Check size={14} />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}




/* ============================================================
   AUDIENCE — QUELLES PAGES LES JOUEURS UTILISENT
   ============================================================
   Répond à deux questions différentes, et c'est la seconde qui sert vraiment
   à décider : « quelle page est la plus consultée » (le tableau du haut) et
   « qui la consulte » (la colonne joueurs, puis le détail par joueur).

   Un compteur anonyme dirait « la Gazette : 41 vues ». Ce tableau dit « 41
   vues, par 3 joueurs sur 23 » — et c'est cette phrase-là qui permet de
   trancher si on la coupe pour un groupe.

   La base renvoie des totaux DÉJÀ agrégés (fonctions audience_par_page /
   audience_par_joueur) : une dizaine de lignes au lieu de plusieurs milliers.
   Voir supabase/migrations/20260827100000_audience_pages.sql.
   ============================================================ */

const AUDIENCE_PERIODES = [
  { id: "7", label: "7 jours", jours: 7 },
  { id: "30", label: "30 jours", jours: 30 },
  { id: "90", label: "3 mois", jours: 90 },
] as const;

const AUDIENCE_NOMS: Record<string, string> = {
  "/": "Accueil",
  "/pronostics": "Pronostics",
  "/classement": "Classement",
  "/trophees": "Vestiaire",
  "/gazette": "Gazette",
  "/stats": "Stats",
  "/profil": "Profil",
  "/admin": "Admin",
};

type LigneAudience = { page: string; vues: number; joueurs: number };
type LigneJoueur = { user_id: string; page: string; vues: number };

function AudienceTab({ players }: { players: Player[] }) {
  const [periode, setPeriode] = useState<(typeof AUDIENCE_PERIODES)[number]["id"]>("30");
  const [pages, setPages] = useState<LigneAudience[]>([]);
  const [parJoueur, setParJoueur] = useState<LigneJoueur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const jours = AUDIENCE_PERIODES.find((p) => p.id === periode)?.jours ?? 30;

  useEffect(() => {
    let annule = false;

    async function charger() {
      setChargement(true);
      setErreur(null);

      const depuis = new Date();
      depuis.setDate(depuis.getDate() - jours);
      const depuisTexte = depuis.toISOString().slice(0, 10);

      const [resume, detail] = await Promise.all([
        supabase.rpc("audience_par_page", { p_depuis: depuisTexte }),
        supabase.rpc("audience_par_joueur", { p_depuis: depuisTexte }),
      ]);

      if (annule) return;

      if (resume.error || detail.error) {
        // Message explicite : le cas le plus probable est que la migration
        // n'a pas encore été passée dans Supabase.
        setErreur(
          "Impossible de lire l'audience. Si c'est la première fois : la migration " +
            "20260827100000_audience_pages.sql doit être exécutée dans Supabase.",
        );
        setChargement(false);
        return;
      }

      setPages((resume.data ?? []) as LigneAudience[]);
      setParJoueur((detail.data ?? []) as LigneJoueur[]);
      setChargement(false);
    }

    void charger();
    return () => {
      annule = true;
    };
  }, [jours]);

  const totalVues = useMemo(() => pages.reduce((somme, l) => somme + Number(l.vues), 0), [pages]);
  const maxVues = useMemo(
    () => pages.reduce((max, l) => Math.max(max, Number(l.vues)), 0),
    [pages],
  );

  // Les joueurs qui n'ouvrent JAMAIS une page donnée : c'est l'information
  // qu'un compteur de vues ne donne pas, et celle qui permet de décider.
  const jamais = useMemo(() => {
    const vusParPage = new Map<string, Set<string>>();
    for (const ligne of parJoueur) {
      const set = vusParPage.get(ligne.page) ?? new Set<string>();
      set.add(String(ligne.user_id));
      vusParPage.set(ligne.page, set);
    }
    return vusParPage;
  }, [parJoueur]);

  const pseudoParId = useMemo(() => {
    const map = new Map<string, string>();
    for (const joueur of players) map.set(String(joueur.id), joueur.pseudo ?? "Sans pseudo");
    return map;
  }, [players]);

  const [pageOuverte, setPageOuverte] = useState<string | null>(null);

  const detailPage = useMemo(() => {
    if (!pageOuverte) return null;
    const vus = jamais.get(pageOuverte) ?? new Set<string>();
    const parId = new Map<string, number>();
    for (const ligne of parJoueur) {
      if (ligne.page !== pageOuverte) continue;
      parId.set(String(ligne.user_id), Number(ligne.vues));
    }
    const lecteurs = [...parId.entries()]
      .map(([id, vues]) => ({ id, pseudo: pseudoParId.get(id) ?? "Joueur parti", vues }))
      .sort((a, b) => b.vues - a.vues);
    const absents = players
      .filter((joueur) => !vus.has(String(joueur.id)))
      .map((joueur) => joueur.pseudo ?? "Sans pseudo")
      .sort((a, b) => a.localeCompare(b, "fr"));
    return { lecteurs, absents };
  }, [pageOuverte, parJoueur, jamais, players, pseudoParId]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4 sm:p-5">
        <div>
          <div className="font-display text-lg font-black text-white">Audience</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            {totalVues} visite{totalVues > 1 ? "s" : ""} sur {jours} jours
          </div>
        </div>

        <div className="flex gap-1.5">
          {AUDIENCE_PERIODES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriode(p.id)}
              className={`rounded-xl border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide transition ${
                periode === p.id
                  ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                  : "border-slate-800 bg-[#0d1322] text-slate-400 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {erreur && (
        <div className="p-4 sm:p-5">
          <ErrorBanner message={erreur} />
        </div>
      )}

      {chargement ? (
        <p className="p-10 text-center font-mono text-xs text-slate-500">Chargement…</p>
      ) : pages.length === 0 && !erreur ? (
        <div className="p-10 text-center">
          <p className="font-display text-base font-bold text-white">Rien à afficher pour l'instant.</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">
            Le comptage démarre au premier passage des joueurs après la mise en ligne.
            Reviens dans un jour ou deux.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/70">
          {pages.map((ligne) => {
            const vues = Number(ligne.vues);
            const joueurs = Number(ligne.joueurs);
            const part = maxVues > 0 ? Math.round((vues / maxVues) * 100) : 0;
            const ouverte = pageOuverte === ligne.page;

            return (
              <div key={ligne.page}>
                <button
                  type="button"
                  onClick={() => setPageOuverte(ouverte ? null : ligne.page)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 p-3.5 text-left transition hover:bg-white/[0.02] sm:p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-sm font-black text-white">
                      {AUDIENCE_NOMS[ligne.page] ?? ligne.page}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-600">{ligne.page}</div>
                  </div>

                  <div className="text-right">
                    <div className="font-display text-base font-black text-sky-300">{vues}</div>
                    <div className="font-mono text-[9px] uppercase tracking-widest text-slate-600">
                      visites
                    </div>
                  </div>

                  <div className="w-[92px] text-right">
                    <div
                      className={`font-display text-base font-black ${
                        joueurs === players.length
                          ? "text-emerald-400"
                          : joueurs <= Math.max(1, Math.round(players.length / 4))
                            ? "text-amber-400"
                            : "text-slate-300"
                      }`}
                    >
                      {joueurs}/{players.length}
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-widest text-slate-600">
                      joueurs
                    </div>
                  </div>

                  {/* Barre de comparaison, relative a la page la plus consultee. */}
                  <div className="h-1.5 basis-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500/70 to-sky-400"
                      style={{ width: `${part}%` }}
                    />
                  </div>
                </button>

                {ouverte && detailPage && (
                  <div className="border-t border-slate-800/70 bg-[#070d18] p-4 sm:p-5">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">
                      Qui la consulte
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {detailPage.lecteurs.map((lecteur) => (
                        <span
                          key={lecteur.id}
                          className="rounded-lg border border-slate-700 bg-[#0d1322] px-2 py-1 font-mono text-[11px] text-slate-300"
                        >
                          {lecteur.pseudo}{" "}
                          <span className="font-bold text-sky-300">{lecteur.vues}</span>
                        </span>
                      ))}
                    </div>

                    {detailPage.absents.length > 0 && (
                      <>
                        <div className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
                          N'y vont jamais · {detailPage.absents.length}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {detailPage.absents.map((pseudo) => (
                            <span
                              key={pseudo}
                              className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2 py-1 font-mono text-[11px] text-amber-100/80"
                            >
                              {pseudo}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-slate-800 p-4 text-xs leading-relaxed text-slate-500 sm:p-5">
        Une visite est comptée une fois par page et par demi-heure, jamais quand
        l'application est en arrière-plan. Aucune adresse IP, aucun paramètre d'URL :
        un joueur, une page, un jour. Les données sont gardées 90 jours.
      </div>
    </Card>
  );
}

/* ============================================================
   ANNONCE À TOUS LES JOUEURS
   ============================================================
   Les règles (message vide, trop long, résumé honnête de l'envoi) sont dans
   src/lib/annonce.ts — npm run verif-annonce.

   Aucune Edge Function à redéployer : le mode `manual_reminder` accepte déjà
   un titre et un corps libres pour UN joueur, l'annonce est le même appel
   répété. Plus de requêtes qu'un envoi groupé, mais cela évite de redéployer
   500 lignes de fonction depuis un téléphone.
   ============================================================ */

function AnnonceATous({
  players,
  joignables,
  notify,
}: {
  players: Player[];
  joignables: Set<string> | null;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);

  // Le nombre annoncé est celui des joueurs qui recevront VRAIMENT quelque
  // chose. Écrire « 23 joueurs » quand huit n'ont pas activé les
  // notifications ne servirait personne.
  const cibles = useMemo(
    () => (joignables ? players.filter((joueur) => joignables.has(String(joueur.id))) : players),
    [players, joignables],
  );
  const injoignables = players.length - cibles.length;

  const restants = LONGUEUR_MAX - message.replace(/\s+/g, " ").trim().length;

  async function envoyer() {
    const preparee = preparerAnnonce(message);
    if (!preparee.ok) {
      notify(preparee.erreur, "error");
      return;
    }

    if (cibles.length === 0) {
      notify("Aucun joueur n'a activé les notifications.", "error");
      return;
    }

    const avertissement =
      injoignables > 0
        ? `\n\n${injoignables} joueur(s) ne recevront rien : notifications désactivées.`
        : "";

    if (
      !window.confirm(
        `Envoyer cette notification à ${cibles.length} joueur(s) ?\n\n« ${preparee.corps} »${avertissement}`,
      )
    ) {
      return;
    }

    setEnvoi(true);
    try {
      const resultats = await Promise.allSettled(
        cibles.map((joueur) =>
          sendManualReminder({
            userId: joueur.id,
            title: preparee.titre,
            body: preparee.corps,
          }),
        ),
      );

      const reussis = resultats.filter(
        (r) => r.status === "fulfilled" && r.value.ok && r.value.sent > 0,
      ).length;

      notify(
        resumerEnvoi({
          demandes: cibles.length,
          reussis,
          echoues: players.length - reussis,
        }),
        reussis > 0 ? "success" : "error",
      );

      if (reussis > 0) {
        setMessage("");
        setOuvert(false);
      }
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-white/[0.02] sm:p-5"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300">
          <Megaphone size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-black text-white">Annonce à tous</div>
          <div className="mt-0.5 text-xs text-slate-400">
            Un message libre, envoyé à tout le monde — pas seulement aux retardataires.
          </div>
        </div>
        <ChevronRight
          size={16}
          className={`shrink-0 text-slate-500 transition-transform ${ouvert ? "rotate-90" : ""}`}
        />
      </button>

      {ouvert && (
        <div className="border-t border-slate-800 p-4 sm:p-5">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="La J2 est ouverte, pensez à vos pronos avant vendredi 20h45 !"
            className="w-full resize-none rounded-xl border border-slate-700 bg-[#080e1a] p-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-500/50"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span
              className={`font-mono text-[10px] uppercase tracking-widest ${
                restants < 0 ? "text-red-400" : "text-slate-500"
              }`}
            >
              {restants} caractère{Math.abs(restants) > 1 ? "s" : ""} restant
              {Math.abs(restants) > 1 ? "s" : ""}
            </span>

            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
              {cibles.length} destinataire{cibles.length > 1 ? "s" : ""}
              {injoignables > 0 && (
                <span className="text-amber-400/80"> · {injoignables} injoignable{injoignables > 1 ? "s" : ""}</span>
              )}
            </span>
          </div>

          <PrimaryButton onClick={() => void envoyer()} disabled={envoi} className="mt-3 w-full">
            {envoi ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
            {envoi ? "Envoi en cours…" : "Envoyer l'annonce"}
          </PrimaryButton>

          <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
            La notification s'affiche sur l'écran verrouillé : court et clair. Elle part
            immédiatement, il n'y a pas d'annulation possible.
          </p>
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   EXPORT DU CLASSEMENT
   ============================================================
   Le classement affiché à l'écran ne prouve rien six mois plus tard. Ce
   bouton en sort un tableau daté, ouvrable dans Excel — utile à la remise des
   gains, et indispensable côté Leroy Merlin où il faudra montrer noir sur
   blanc qui termine où pour attribuer les lots.

   POINT IMPORTANT : les points ne sont PAS recalculés ici avec une formule
   maison. C'est computeLeagueStats + rankPlayers, exactement le moteur du
   Classement (24 vérifications, npm run verif-points). Le fichier exporté ne
   peut donc pas contredire ce que les joueurs voient.

   Les tirages bonus ne sont chargés qu'au clic : tant que personne n'exporte,
   cet écran ne coûte rien.
   ============================================================ */

function ExportClassement({
  players,
  matches,
  predictions,
  teams,
  saison,
  notify,
}: {
  players: Player[];
  matches: Match[];
  predictions: AdminPredictionRow[];
  teams: Team[];
  saison: string | null;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const [enCours, setEnCours] = useState(false);

  async function exporter() {
    setEnCours(true);
    try {
      const { data: options, error } = await supabase
        .from("bonus_options")
        .select("matchday_id, match_id, is_active, created_at");

      if (error) {
        notify("Impossible de lire les matchs bonus. Export annulé.", "error");
        return;
      }

      const nomEquipeParId: Record<string, string | undefined> = {};
      for (const equipe of teams) nomEquipeParId[String(equipe.id)] = equipe.name;

      // Même partage que le Classement : Ligue 1 d'un côté, matchs bonus de
      // l'autre, et seulement ceux dont le résultat est connu.
      const joues = (match: Match) =>
        match.finished && match.home_score != null && match.away_score != null;

      const idsBonus = new Set((options ?? []).map((o: any) => String(o.match_id)));
      const ligue1 = matches.filter((m) => joues(m) && !idsBonus.has(String(m.id)) && !m.is_bonus);
      const bonus = matches.filter((m) => joues(m) && idsBonus.has(String(m.id)));

      const stats = computeLeagueStats(
        ligue1 as any,
        bonus as any,
        (options ?? []) as any,
        predictions as any,
        players as any,
        nomEquipeParId,
      );

      const classes = rankPlayers(
        players.map((joueur) => ({
          id: joueur.id,
          points: stats.pointsByUser[joueur.id] ?? 0,
          exactScores: stats.exactScoresByUser[joueur.id] ?? 0,
          regularitySuccess: stats.regularitySuccessByUser[joueur.id] ?? 0,
        })) as any,
      );

      const lignes: LigneClassement[] = classes.map((classe: any) => {
        const joueur = players.find((j) => String(j.id) === String(classe.id));
        return {
          rang: classe.rank,
          pseudo: joueur?.pseudo ?? null,
          points: classe.points,
          scoresExacts: classe.exactScores,
          pronosticsJoues: stats.participationByUser[classe.id] ?? 0,
          pronosticsAttendus: stats.participationTotalByUser[classe.id] ?? 0,
          equipeCoeur: joueur?.favorite_team_id
            ? (nomEquipeParId[String(joueur.favorite_team_id)] ?? null)
            : null,
        };
      });

      const contenu = versCSV(lignes);
      const fichier = nomFichier(saison);

      const lien = document.createElement("a");
      lien.href = URL.createObjectURL(new Blob([contenu], { type: "text/csv;charset=utf-8" }));
      lien.download = fichier;
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      // Le navigateur garde l'objet en mémoire tant qu'on ne le libère pas.
      setTimeout(() => URL.revokeObjectURL(lien.href), 1000);

      notify(`Classement exporté — ${lignes.length} joueur(s).`);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
          <FileDown size={17} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-black text-white">Exporter le classement</div>
          <div className="mt-0.5 text-xs leading-relaxed text-slate-400">
            Rang, points, scores exacts et participation de chaque joueur, dans un tableau
            ouvrable avec Excel. Calculé avec le moteur du Classement : les chiffres ne
            peuvent pas différer de ce que voient les joueurs.
          </div>
        </div>

        <button
          type="button"
          onClick={() => void exporter()}
          disabled={enCours}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-60"
        >
          {enCours ? <RefreshCw size={14} className="animate-spin" /> : <FileDown size={14} />}
          {enCours ? "Préparation…" : "Exporter"}
        </button>
      </div>
    </Card>
  );
}
