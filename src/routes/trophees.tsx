import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import {
  Bell,
  Camera,
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  Hash,
  Image as ImageIcon,
  MessageCircle,
  Mic,
  MicOff,
  MoreVertical,
  Paperclip,
  Pin,
  PhoneOff,
  Plus,
  Reply,
  Search,
  Send,
  Shield,
  Smile,
  Trash2,
  Trophy,
  UserRound,
  Users,
  Volume2,
  X,
  Film,
  Search as SearchIcon,
} from "lucide-react";
import { AppShell } from "@/components/prono/AppShell";
import { supabase } from "@/lib/supabase";
import { resizeImageToJpegFile } from "@/lib/resizeImage";
import { useKeyboardOpen } from "@/hooks/useKeyboardOpen";
import {
  VESTIAIRE_UNREAD_KEY,
  getVestiaireUnreadCount,
  markVestiaireRead,
} from "@/lib/vestiaireUnread";

export const Route = createFileRoute("/trophees")({
  head: () => ({
    meta: [
      { title: "Le Vestiaire — Prono Ligue 1" },
      {
        name: "description",
        content: "Le chat privé du groupe Prono Ligue 1 LM.",
      },
    ],
  }),
  component: VestiairePage,
});

type Profile = {
  id: string;
  pseudo?: string | null;
  avatar_url?: string | null;
  favorite_team?: string | null;
  is_admin?: boolean | null;
  favorite_team_override?: boolean | null;
  favorite_team_id?: string | null;
};

type ChatMessageRow = {
  id: string;
  user_id: string | null;
  content: string;
  created_at: string;
};

type ReactionRow = {
  message_id: string;
  user_id: string;
  emoji: string;
};

type ChatMessage = ChatMessageRow & {
  profile?: Profile | null;
  reactions: Record<string, number>;
  reactedByMe: Set<string>;
};

type OnlinePlayer = {
  user_id: string;
  display_name: string;
};

type GiphyGif = {
  id: string;
  title?: string;
  images?: {
    fixed_width?: { url?: string };
    fixed_width_small?: { url?: string };
    original?: { url?: string };
  };
};

const REACTIONS = ["❤️", "🔥", "😂", "⚽", "👏"] as const;

function displayName(profile?: Profile | null) {
  return profile?.pseudo || "Joueur";
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "J"
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

// Deux messages du meme jour ? Sert a inserer un separateur de date dans le
// fil, comme le font les messageries : sans lui, une conversation d'hier et
// une d'aujourd'hui se suivent sans la moindre rupture visuelle.
function isSameDay(a: string, b: string) {
  const first = new Date(a);
  const second = new Date(b);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function formatDayLabel(value: string) {
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(value, now.toISOString())) return "Aujourd'hui";
  if (isSameDay(value, yesterday.toISOString())) return "Hier";

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function minutesBetween(a: string, b: string) {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

// Classement d'un message par salon. Extrait de `visibleMessages`, ou les
// expressions etaient ecrites en dur : la barre laterale peut desormais
// afficher le nombre de messages de chaque salon en reutilisant EXACTEMENT
// le meme filtre que le fil, sans risque de divergence.
const SECTION_PATTERNS = {
  matches: /\b(match|prono|pronostic|pronostics|score|ligue|football|équipe|résultat|résultats|but|buts)\b/i,
  trophies: /\b(trophée|trophées|badge|badges|podium|champion|victoire|classement|exploit)\b/i,
  offtopic: /\b(hors sujet|hs|vacances|musique|film|cinéma|jeu|jeux|blague|anniversaire|apéro|week-end)\b/i,
} as const;

function buildReactionState(rows: ReactionRow[], currentUserId: string | null) {
  const counts = new Map<string, Record<string, number>>();
  const mine = new Map<string, Set<string>>();

  for (const row of rows) {
    const countMap = counts.get(row.message_id) || {};
    countMap[row.emoji] = (countMap[row.emoji] || 0) + 1;
    counts.set(row.message_id, countMap);

    if (currentUserId && row.user_id === currentUserId) {
      const mineSet = mine.get(row.message_id) || new Set<string>();
      mineSet.add(row.emoji);
      mine.set(row.message_id, mineSet);
    }
  }

  return { counts, mine };
}


type GifData = {
  url: string;
  preview?: string;
  title?: string;
  provider?: string;
  id?: string;
};

type ParsedChatContent = {
  text: string;
  images: string[];
  gif?: GifData;
  replyTo?: {
    name: string;
    text: string;
  };
};

function parseChatContent(content: string): ParsedChatContent {
  try {
    const parsed = JSON.parse(content);
    if (parsed && parsed.v === 1) {
      return {
        text: typeof parsed.text === "string" ? parsed.text : "",
        images: Array.isArray(parsed.images)
          ? parsed.images.filter((item: unknown): item is string => typeof item === "string")
          : [],
        gif:
          parsed.gif && typeof parsed.gif.url === "string"
            ? {
                url: parsed.gif.url,
                preview: typeof parsed.gif.preview === "string" ? parsed.gif.preview : undefined,
                title: typeof parsed.gif.title === "string" ? parsed.gif.title : undefined,
                provider: typeof parsed.gif.provider === "string" ? parsed.gif.provider : undefined,
                id: typeof parsed.gif.id === "string" ? parsed.gif.id : undefined,
              }
            : undefined,
        replyTo:
          parsed.replyTo &&
          typeof parsed.replyTo.name === "string" &&
          typeof parsed.replyTo.text === "string"
            ? parsed.replyTo
            : undefined,
      };
    }
  } catch {
    // Ancien message texte classique.
  }

  // Compatibilité avec les anciens GIF envoyés depuis le floating
  // avant l'utilisation du format commun v1.
  if (content.startsWith("__GIF__")) {
    try {
      const legacy = JSON.parse(content.slice("__GIF__".length));
      if (legacy && typeof legacy.url === "string") {
        return {
          text: "",
          images: [],
          gif: {
            url: legacy.url,
            preview: typeof legacy.preview === "string" ? legacy.preview : undefined,
            title: typeof legacy.title === "string" ? legacy.title : undefined,
            provider: typeof legacy.provider === "string" ? legacy.provider : "giphy",
            id: typeof legacy.id === "string" ? legacy.id : undefined,
          },
        };
      }
    } catch {
      // Si le contenu legacy est corrompu, on le laisse comme texte classique.
    }
  }

  return { text: content, images: [] };
}

// ---------- Médias (photos + vidéos) ----------
// Limites raisonnables côté client, en plus du plafond posé sur le bucket
// Supabase Storage lui-même (voir migration chat-images) — deux niveaux de
// vérification plutôt qu'un seul, la limite client évite surtout un upload
// pour rien (échec côté serveur après avoir attendu inutilement).
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
// Formats photo que le bucket n'accepte pas et que la plupart des navigateurs
// n'affichent pas, mais que les iPhone produisent par défaut : on les accepte
// à l'import et on les convertit en JPEG avant l'upload (voir prepareMedia).
const CONVERTIBLE_IMAGE_TYPES = ["image/heic", "image/heif", "image/avif", "image/bmp", "image/tiff"];
// Longueur max d'un message. La colonne `content` stocke déjà des charges
// bien plus longues (le JSON d'un message photo : texte + jusqu'à 6 URLs de
// médias), l'ancienne limite de 1000 était donc purement cosmétique — et trop
// basse pour une annonce de classement.
const MAX_MESSAGE_LENGTH = 2000;
// Hauteur max de la zone de saisie avant de faire défiler (~6 lignes).
const COMPOSER_MAX_HEIGHT = 132;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 Mo
const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 Mo

const IMAGE_EXTENSIONS: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

const VIDEO_EXTENSIONS_BY_NAME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

function fileExtension(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

/** Type MIME réel d'un fichier choisi par l'utilisateur.
 *
 * `file.type` n'est PAS fiable : selon le sélecteur de fichiers (Android, un
 * gestionnaire de fichiers tiers, un partage depuis une autre app), il arrive
 * vide ou en `application/octet-stream`. On retombe alors sur l'extension du
 * nom, sinon une photo parfaitement valide était refusée avec « Format non
 * supporté ». */
function resolveMediaType(file: File) {
  const declared = file.type.toLowerCase();
  if (declared.startsWith("image/") || declared.startsWith("video/")) return declared;

  const extension = fileExtension(file.name);
  return IMAGE_EXTENSIONS[extension] || VIDEO_EXTENSIONS_BY_NAME[extension] || declared;
}

function mediaKind(type: string): "image" | "video" | null {
  if (ALLOWED_IMAGE_TYPES.includes(type) || CONVERTIBLE_IMAGE_TYPES.includes(type)) return "image";
  if (ALLOWED_VIDEO_TYPES.includes(type)) return "video";
  return null;
}

const MEDIA_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"];

/** Une URL de média envoyé est-elle une vidéo ? Basé sur l'extension du
 * fichier dans le chemin de stockage (voir uploadChatImages) — pas de champ
 * "type" séparé stocké en base, pour rester compatible avec les messages
 * déjà envoyés sans tout migrer. */
function isVideoUrl(url: string): boolean {
  const path = url.split("?")[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function messagePreview(content: string) {
  const parsed = parseChatContent(content);
  if (parsed.text) return parsed.text;
  if (parsed.images.length) return "📷 Photo";
  if (parsed.gif) return "🎞️ GIF";
  return "Message";
}

const VESTIAIRE_EMOJIS = [
  "😀", "😂", "🤣", "😍", "🥰", "😎", "🤔", "😅",
  "🔥", "❤️", "💚", "💙", "💜", "👏", "🙌", "💪",
  "⚽", "🏆", "🥳", "🎉", "😱", "😭", "🤯", "👀",
  "👍", "👎", "🙏", "🤝", "💯", "🚀", "🍻", "🫶",
];

// Repère de dernière lecture : désormais partagé avec la barre de
// navigation (src/lib/vestiaireUnread.ts), qui affiche le badge.
const UNREAD_STORAGE_KEY = VESTIAIRE_UNREAD_KEY;

function canUseBrowserNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

async function requestVestiaireNotificationPermission() {
  if (!canUseBrowserNotifications()) return "unsupported" as const;

  if (Notification.permission === "granted") return "granted" as const;
  if (Notification.permission === "denied") return "denied" as const;

  return Notification.requestPermission();
}

function notifyVestiaireMessage(profile: Profile | null, content: string) {
  if (!canUseBrowserNotifications() || Notification.permission !== "granted") return;

  const name = displayName(profile);
  const preview = messagePreview(content);

  try {
    const notification = new Notification(`Nouveau message de ${name}`, {
      body: preview,
      tag: "vestiaire-message",
      renotify: true,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    console.error("Vestiaire — notification navigateur :", error);
  }
}

function VestiairePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [draft, setDraft] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [openReactionFor, setOpenReactionFor] = useState<string | null>(null);
  // Menu "..." par message (Répondre/Épingler/Modifier/Supprimer/Bloquer) —
  // remplace l'ancienne rangée d'icônes révélée uniquement au survol
  // (group-hover), invisible et donc inutilisable au tactile sur mobile.
  // Mêmes handlers existants (setReplyTo, togglePin, startEditing,
  // deleteMessage, banUser), seul le déclencheur change (tap sur "...").
  const [actionsMenuFor, setActionsMenuFor] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<OnlinePlayer | null>(null);
  const [activeSection, setActiveSection] = useState<
    "general" | "pinned" | "matches" | "trophies" | "offtopic"
  >("general");
  const [gifOpen, setGifOpen] = useState(false);
  // Menu compact "+" (photo/vidéo, GIF) — l'ancien bouton "+" ouvrait
  // directement le sélecteur de fichiers ; regroupé ici pour rester
  // compact sur téléphone (voir bouton Plus dans le composer).
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<GiphyGif[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  // Salon vocal WebRTC (signalisation via Supabase Realtime)
  const [voiceRoom, setVoiceRoom] = useState<string | null>(null);
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState<Record<string, string>>({});
  const [voiceError, setVoiceError] = useState("");
  const [remoteVoiceStreams, setRemoteVoiceStreams] = useState<Record<string, MediaStream>>({});
  const voiceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const voicePeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceRoomRef = useRef<string | null>(null);
  const voiceUserIdRef = useRef<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  // Seul usage restant : recaler le scroll de la page au changement de
  // clavier (voir plus bas) — la hauteur elle-même vient de --app-vh
  // (AppShell.tsx), plus d'un calcul dupliqué ici.
  const keyboardOpen = useKeyboardOpen();

  const onlineCount = onlinePlayers.length;

  const messageList = useMemo(
    () =>
      messages.map((message) => ({
        ...message,
        profile:
          message.profile ||
          (message.user_id ? profiles[message.user_id] : undefined) ||
          null,
      })),
    [messages, profiles]
  );

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported"
  );

  useEffect(() => {
    // La zone de saisie grandit avec le texte (jusqu'à ~6 lignes) puis
    // défile, pour ne pas manger tout l'écran sur un long message.
    const textarea = draftInputRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
    textarea.style.overflowY = textarea.scrollHeight > COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    // L'ouverture du Vestiaire signifie que les messages visibles sont lus.
    markVestiaireRead();
    setUnreadCount(0);

    const onStorage = (event: StorageEvent) => {
      if (event.key === UNREAD_STORAGE_KEY) {
        setUnreadCount(0);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markVestiaireRead();
        setUnreadCount(0);
      }
    };

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let messagesChannel: ReturnType<typeof supabase.channel> | null = null;
    let reactionsChannel: ReturnType<typeof supabase.channel> | null = null;
    let presenceChannel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      setLoading(true);
      setErrorMessage("");

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!user) {
          setCurrentUserId(null);
          setLoading(false);
          return;
        }

        setCurrentUserId(user.id);

        const unread = await getVestiaireUnreadCount(user.id);
        setUnreadCount(unread);

        const { data: me, error: meError } = await supabase
          .from("profiles")
          .select("id, pseudo, avatar_url, favorite_team, is_admin, favorite_team_override, favorite_team_id")
          .eq("id", user.id)
          .maybeSingle();

        if (meError) throw meError;

        const meProfile = (me as Profile | null) || null;
        setCurrentProfile(meProfile);
        setIsAdmin(
          (user.email || "").trim().toLowerCase() ===
            "manuelglowacki@gmail.com"
        );

        const { data: ban } = await supabase
          .from("chat_bans")
          .select("id, expires_at")
          .eq("user_id", user.id)
          .gt("expires_at", new Date().toISOString())
          .limit(1)
          .maybeSingle();

        setIsBanned(Boolean(ban));

        const { data: rawMessages, error: messagesError } = await supabase
          .from("chat_messages")
          .select("id, user_id, content, created_at")
          .order("created_at", { ascending: true })
          .limit(150);

        if (messagesError) throw messagesError;

        const rows = (rawMessages || []) as ChatMessageRow[];
        const userIds = Array.from(
          new Set(
            rows
              .map((row) => row.user_id)
              .filter((id): id is string => Boolean(id))
          )
        );

        const profileMap: Record<string, Profile> = {};
        if (userIds.length) {
          const { data: profileRows, error: profilesError } = await supabase
            .from("profiles")
            .select("id, pseudo, avatar_url, favorite_team, is_admin, favorite_team_override, favorite_team_id")
            .in("id", userIds);

          if (profilesError) throw profilesError;

          for (const profile of (profileRows || []) as Profile[]) {
            profileMap[profile.id] = profile;
          }
        }

        setProfiles(profileMap);

        const messageIds = rows.map((row) => row.id);
        let reactionRows: ReactionRow[] = [];

        if (messageIds.length) {
          const { data: reactions, error: reactionError } = await supabase
            .from("chat_reactions")
            .select("message_id, user_id, emoji")
            .in("message_id", messageIds);

          if (reactionError) throw reactionError;
          reactionRows = (reactions || []) as ReactionRow[];
        }

        const reactionState = buildReactionState(reactionRows, user.id);

        setMessages(
          rows.map((row) => ({
            ...row,
            profile: row.user_id ? profileMap[row.user_id] || null : null,
            reactions: reactionState.counts.get(row.id) || {},
            reactedByMe: reactionState.mine.get(row.id) || new Set<string>(),
          }))
        );


        const channelSuffix =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        messagesChannel = supabase
          .channel(`vestiaire-messages-${channelSuffix}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "chat_messages",
            },
            async (payload) => {
              if (payload.eventType === "DELETE") {
                const deletedId = String(
                  (payload.old as { id?: string })?.id || ""
                );
                if (deletedId) {
                  setMessages((current) =>
                    current.filter((message) => message.id !== deletedId)
                  );
                }
                return;
              }

              const row = payload.new as ChatMessageRow;
              if (!row?.id) return;

              const isIncomingMessage = Boolean(row.user_id && row.user_id !== user.id);
              const shouldNotify =
                isIncomingMessage &&
                (document.visibilityState !== "visible" || !stickToBottom.current);

              let profile: Profile | null = null;
              if (row.user_id) {
                const response = await supabase
                  .from("profiles")
                  .select(
                    "id, pseudo, avatar_url, favorite_team, is_admin, favorite_team_override, favorite_team_id"
                  )
                  .eq("id", row.user_id)
                  .maybeSingle();

                if (!response.error) {
                  profile = (response.data as Profile | null) || null;
                }
              }

              if (isIncomingMessage && shouldNotify) {
                setUnreadCount((current) => current + 1);
                notifyVestiaireMessage(profile, row.content);
              }

              setMessages((current) => {
                if (current.some((message) => message.id === row.id)) {
                  return current;
                }

                return [
                  ...current,
                  {
                    ...row,
                    profile,
                    reactions: {},
                    reactedByMe: new Set<string>(),
                  },
                ];
              });
            }
          )
          .subscribe((status, error) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.error("Vestiaire Realtime messages:", error || status);
            }
          });

        reactionsChannel = supabase
          .channel(`vestiaire-reactions-${channelSuffix}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "chat_reactions",
            },
            (payload) => {
              const changedMessageId = String(
                (payload.new as { message_id?: string })?.message_id ||
                  (payload.old as { message_id?: string })?.message_id ||
                  ""
              );

              if (!changedMessageId) return;

              void (async () => {
                const { data } = await supabase
                  .from("chat_reactions")
                  .select("message_id, user_id, emoji")
                  .eq("message_id", changedMessageId);

                const reactionState = buildReactionState(
                  (data || []) as ReactionRow[],
                  user.id
                );

                setMessages((current) =>
                  current.map((message) =>
                    message.id === changedMessageId
                      ? {
                          ...message,
                          reactions:
                            reactionState.counts.get(changedMessageId) || {},
                          reactedByMe:
                            reactionState.mine.get(changedMessageId) ||
                            new Set<string>(),
                        }
                      : message
                  )
                );
              })();
            }
          )
          .subscribe();

        presenceChannel = supabase
          .channel(`vestiaire-presence-${channelSuffix}`, {
            config: { presence: { key: user.id } },
          })
          .on("presence", { event: "sync" }, () => {
            const state = presenceChannel?.presenceState<OnlinePlayer>() || {};
            const players: OnlinePlayer[] = [];

            for (const entries of Object.values(state)) {
              for (const entry of entries) {
                if (entry?.user_id) {
                  players.push({
                    user_id: entry.user_id,
                    display_name: entry.display_name || "Joueur",
                  });
                }
              }
            }

            const unique = Array.from(
              new Map(
                players.map((player) => [player.user_id, player])
              ).values()
            );

            setOnlinePlayers(unique);
          })
          .subscribe(async (status) => {
            if (status !== "SUBSCRIBED") return;

            await presenceChannel?.track({
              user_id: user.id,
              display_name: displayName(meProfile),
            });
          });
      } catch (error) {
        console.error("Vestiaire — erreur Supabase :", error);
        const message =
          error && typeof error === "object"
            ? String((error as { message?: string }).message || JSON.stringify(error))
            : error instanceof Error
              ? error.message
              : "Erreur Supabase inconnue";
        setErrorMessage(`Impossible de charger le Vestiaire : ${message}`);
      } finally {
        setLoading(false);
      }
    }

    void load();

    return () => {
      if (messagesChannel) void supabase.removeChannel(messagesChannel);
      if (reactionsChannel) void supabase.removeChannel(reactionsChannel);
      if (presenceChannel) void supabase.removeChannel(presenceChannel);
    };
  }, []);


  useEffect(() => {
    return () => cleanupVoiceConnections();
  }, []);

  useEffect(() => {
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messageList.length]);

  // Le Vestiaire ne calcule plus lui-même sa hauteur (voir AppShell.tsx :
  // --app-vh, dérivé de window.visualViewport, est la SEULE source pour tout
  // le clavier virtuel — appliquée une fois au conteneur racine de l'appli).
  // Ici .vestiaire-root n'a plus qu'à faire height: 100% et laisser le fil
  // flex (main → vestiaire-root → vestiaire-panel → messages/composer)
  // distribuer l'espace normalement. Seule chose encore utile localement :
  // recaler le scroll de la PAGE à 0 quand le clavier bascule — le Vestiaire
  // ne dépend jamais du scroll de la page (seule la zone messages scrolle,
  // voir .vestiaire-scroll), donc la page n'a jamais de raison légitime
  // d'être scrollée, et un focus peut déclencher un scroll natif indésirable
  // sur Android Chrome le temps que --app-vh se mette à jour.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [keyboardOpen]);

  function onScroll() {
    const element = scrollRef.current;
    if (!element) return;

    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    stickToBottom.current = distance < 120;
  }

  async function searchGifs(query = gifQuery) {
    const apiKey = import.meta.env.VITE_GIPHY_API_KEY as string | undefined;
    if (!apiKey) {
      setGifError("Ajoute VITE_GIPHY_API_KEY dans ton .env.local pour activer les GIF.");
      setGifResults([]);
      return;
    }

    setGifLoading(true);
    setGifError("");
    try {
      const trimmed = query.trim();
      const endpoint = trimmed
        ? "https://api.giphy.com/v1/gifs/search"
        : "https://api.giphy.com/v1/gifs/trending";
      const params = new URLSearchParams({
        api_key: apiKey,
        limit: "24",
        rating: "pg-13",
        lang: "fr",
      });
      if (trimmed) params.set("q", trimmed);
      const response = await fetch(`${endpoint}?${params.toString()}`);
      if (!response.ok) throw new Error(`GIPHY ${response.status}`);
      const json = await response.json();
      setGifResults(Array.isArray(json.data) ? json.data : []);
    } catch (error) {
      console.error("Vestiaire — GIPHY :", error);
      setGifResults([]);
      setGifError("Impossible de charger les GIF pour le moment.");
    } finally {
      setGifLoading(false);
    }
  }

  function toggleGifPicker() {
    const next = !gifOpen;
    setGifOpen(next);
    setEmojiOpen(false);
    if (next && gifResults.length === 0) void searchGifs("");
  }

  async function sendGif(gif: GiphyGif) {
    const url = gif.images?.original?.url ?? gif.images?.fixed_width?.url ?? gif.images?.fixed_width_small?.url;
    const preview = gif.images?.fixed_width?.url ?? gif.images?.fixed_width_small?.url ?? url;
    if (!url || !currentUserId || sending || isBanned) return;

    setSending(true);
    setErrorMessage("");
    try {
      const payload = JSON.stringify({
        v: 1,
        text: "",
        images: [],
        gif: { url, preview, title: gif.title || "GIF", provider: "giphy", id: gif.id },
      });
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({ user_id: currentUserId, content: payload })
        .select("id, user_id, content, created_at")
        .single();
      if (error) throw error;
      setMessages((current) => [...current, {
        ...(data as ChatMessageRow),
        profile: currentProfile,
        reactions: {},
        reactedByMe: new Set<string>(),
      }]);
      setGifOpen(false);
      setGifQuery("");
    } catch (error) {
      console.error("Vestiaire — envoi GIF :", error);
      setErrorMessage("Le GIF n'a pas pu être envoyé. Vérifie ta connexion Supabase.");
    } finally {
      setSending(false);
    }
  }

  async function sendMessage() {
    const content = draft.trim();

    if ((!content && !pendingFiles.length) || !currentUserId || sending || isBanned) return;

    setSending(true);
    setErrorMessage("");

    try {
      const imageUrls = pendingFiles.length
        ? await uploadChatImages(pendingFiles)
        : [];

      const payload =
        imageUrls.length || replyTo
          ? JSON.stringify({
              v: 1,
              text: content,
              images: imageUrls,
              replyTo: replyTo
                ? {
                    name: displayName(replyTo.profile),
                    text: messagePreview(replyTo.content),
                  }
                : undefined,
            })
          : content;

      const tempId = `temp-${Date.now()}`;

      setMessages((current) => [
        ...current,
        {
          id: tempId,
          user_id: currentUserId,
          content: payload,
          created_at: new Date().toISOString(),
          profile: currentProfile,
          reactions: {},
          reactedByMe: new Set<string>(),
        },
      ]);

      setDraft("");
      setPendingFiles([]);
      setReplyTo(null);
      setEmojiOpen(false);
      setGifOpen(false);

      const { data, error } = await supabase
        .from("chat_messages")
        .insert({
          user_id: currentUserId,
          content: payload,
        })
        .select("id, user_id, content, created_at")
        .single();

      if (error) {
        throw error;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === tempId
            ? {
                ...(data as ChatMessageRow),
                profile: currentProfile,
                reactions: {},
                reactedByMe: new Set<string>(),
              }
            : message
        )
      );
    } catch (error) {
      console.error("Vestiaire — envoi :", error);
      setMessages((current) =>
        current.filter((message) => !message.id.startsWith("temp-"))
      );
      // On affiche la vraie cause : « Bucket not found », « new row violates
      // row-level security policy », « Payload too large »… sinon impossible
      // de savoir si le problème vient du fichier, du bucket ou des droits.
      const reason =
        error instanceof Error && error.message
          ? error.message
          : typeof error === "object" && error && "message" in error
            ? String((error as { message: unknown }).message)
            : "";
      setErrorMessage(
        reason
          ? `Envoi impossible : ${reason}`
          : "Le message ou la photo n'a pas pu être envoyé. Vérifie le bucket Supabase chat-images."
      );
    } finally {
      setSending(false);
    }
  }

  async function toggleReaction(message: ChatMessage, emoji: string) {
    if (!currentUserId || message.id.startsWith("temp-")) return;

    const alreadyReacted = message.reactedByMe.has(emoji);

    if (alreadyReacted) {
      const { error } = await supabase
        .from("chat_reactions")
        .delete()
        .eq("message_id", message.id)
        .eq("user_id", currentUserId)
        .eq("emoji", emoji);

      if (error) {
        console.error("Vestiaire — retrait réaction :", error);
        return;
      }
    } else {
      const { error } = await supabase.from("chat_reactions").insert({
        message_id: message.id,
        user_id: currentUserId,
        emoji,
      });

      if (error && error.code !== "23505") {
        console.error("Vestiaire — réaction :", error);
        return;
      }
    }

    // Mise à jour immédiate; le Realtime resynchronise ensuite.
    setMessages((current) =>
      current.map((item) => {
        if (item.id !== message.id) return item;

        const nextCounts = { ...item.reactions };
        const nextMine = new Set(item.reactedByMe);

        if (alreadyReacted) {
          nextCounts[emoji] = Math.max((nextCounts[emoji] || 1) - 1, 0);
          if (nextCounts[emoji] === 0) delete nextCounts[emoji];
          nextMine.delete(emoji);
        } else {
          nextCounts[emoji] = (nextCounts[emoji] || 0) + 1;
          nextMine.add(emoji);
        }

        return {
          ...item,
          reactions: nextCounts,
          reactedByMe: nextMine,
        };
      })
    );

    setOpenReactionFor(null);
  }

  async function deleteMessage(messageId: string) {
    if (!isAdmin) return;

    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("id", messageId);

    if (error) {
      console.error("Vestiaire — suppression :", error);
      setErrorMessage("Tu n'as pas les droits pour supprimer ce message.");
    }
  }

  async function banUser(userId: string) {
    if (!isAdmin || userId === currentUserId) return;

    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("chat_bans").upsert(
      {
        user_id: userId,
        expires_at: expires,
        banned_by: currentUserId,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Vestiaire — bannissement :", error);
      setErrorMessage("Impossible de bloquer ce joueur.");
      return;
    }

    setMessages((current) => current);
  }

  function cleanupVoiceConnections() {
    voicePeersRef.current.forEach((peer) => peer.close());
    voicePeersRef.current.clear();
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    if (voiceChannelRef.current) {
      void supabase.removeChannel(voiceChannelRef.current);
      voiceChannelRef.current = null;
    }
    setVoiceParticipants({});
    setVoiceJoined(false);
    setVoiceMuted(false);
    voiceRoomRef.current = null;
  }

  async function leaveVoiceRoom() {
    const channel = voiceChannelRef.current;
    const room = voiceRoomRef.current;
    if (channel && currentUserId) {
      await channel.send({
        type: "broadcast",
        event: "voice-signal",
        payload: { type: "leave", from: currentUserId, room },
      }).catch(() => undefined);
    }
    cleanupVoiceConnections();
    setVoiceRoom(null);
    setVoiceError("");
  }

  async function createVoicePeer(remoteId: string, initiator: boolean, channel: ReturnType<typeof supabase.channel>) {
    if (!currentUserId || voicePeersRef.current.has(remoteId)) return;
    const stream = voiceStreamRef.current;
    if (!stream) return;

    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void channel.send({
        type: "broadcast",
        event: "voice-signal",
        payload: {
          type: "ice",
          from: currentUserId,
          to: remoteId,
          candidate: event.candidate.toJSON(),
        },
      });
    };

    peer.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;
      setRemoteVoiceStreams((current) => ({ ...current, [remoteId]: remoteStream }));
    };

    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
        peer.close();
        voicePeersRef.current.delete(remoteId);
        setRemoteVoiceStreams((current) => {
          const next = { ...current };
          delete next[remoteId];
          return next;
        });
      }
    };

    voicePeersRef.current.set(remoteId, peer);

    if (initiator) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await channel.send({
        type: "broadcast",
        event: "voice-signal",
        payload: { type: "offer", from: currentUserId, to: remoteId, sdp: offer },
      });
    }
  }

  async function joinVoiceRoom(room: string) {
    if (!currentUserId) {
      setVoiceError("Connecte-toi pour rejoindre un salon vocal.");
      return;
    }

    if (voiceRoomRef.current === room && voiceJoined) return;
    if (voiceJoined) await leaveVoiceRoom();

    setVoiceError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Le navigateur ne permet pas l’accès au microphone.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });

      voiceStreamRef.current = stream;
      voiceRoomRef.current = room;
      setVoiceRoom(room);
      setVoiceJoined(true);
      setVoiceParticipants({ [currentUserId]: currentUserName });

      const channel = supabase.channel(`vestiaire-voice-${room.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, {
        config: { broadcast: { self: false } },
      });
      voiceChannelRef.current = channel;

      channel.on("broadcast", { event: "voice-signal" }, async ({ payload }) => {
        if (!payload || payload.room && payload.room !== room || payload.to && payload.to !== currentUserId) return;
        const from = String(payload.from || "");
        if (!from || from === currentUserId) return;

        if (payload.type === "join") {
          setVoiceParticipants((current) => ({ ...current, [from]: payload.name || "Joueur" }));
          // Pour chaque paire, le plus petit ID initie la connexion.
          if (currentUserId < from) {
            await createVoicePeer(from, true, channel);
          }
          await channel.send({
            type: "broadcast",
            event: "voice-signal",
            payload: { type: "state", from: currentUserId, to: from, room, name: currentUserName },
          });
          return;
        }

        if (payload.type === "state") {
          setVoiceParticipants((current) => ({ ...current, [from]: payload.name || "Joueur" }));
          if (currentUserId < from) await createVoicePeer(from, true, channel);
          return;
        }

        if (payload.type === "offer") {
          let peer = voicePeersRef.current.get(from);
          if (!peer) {
            await createVoicePeer(from, false, channel);
            peer = voicePeersRef.current.get(from);
          }
          if (!peer) return;
          await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await channel.send({
            type: "broadcast",
            event: "voice-signal",
            payload: { type: "answer", from: currentUserId, to: from, sdp: answer },
          });
          return;
        }

        if (payload.type === "answer") {
          const peer = voicePeersRef.current.get(from);
          if (peer) await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          return;
        }

        if (payload.type === "ice") {
          const peer = voicePeersRef.current.get(from);
          if (peer && payload.candidate) {
            await peer.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => undefined);
          }
          return;
        }

        if (payload.type === "leave") {
          voicePeersRef.current.get(from)?.close();
          voicePeersRef.current.delete(from);
          setRemoteVoiceStreams((current) => {
            const next = { ...current };
            delete next[from];
            return next;
          });
          setVoiceParticipants((current) => {
            const next = { ...current };
            delete next[from];
            return next;
          });
        }
      }).subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.send({
          type: "broadcast",
          event: "voice-signal",
          payload: { type: "join", from: currentUserId, room, name: currentUserName },
        });
      });
    } catch (error) {
      console.error("Vestiaire — vocal :", error);
      cleanupVoiceConnections();
      setVoiceRoom(null);
      setVoiceError(error instanceof Error ? error.message : "Impossible d’activer le micro.");
    }
  }

  function toggleVoiceMute() {
    const track = voiceStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setVoiceMuted(!track.enabled);
  }

  function scrollToMessage(messageId: string) {
    messageRefs.current[messageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const currentUserName = displayName(currentProfile);

  const sectionMeta = useMemo(() => {
    switch (activeSection) {
      case "pinned":
        return {
          title: "Épinglés",
          subtitle: "Les messages importants du Vestiaire",
          empty: "Aucun message épinglé pour le moment.",
        };
      case "matches":
        return {
          title: "Matchs & Pronos",
          subtitle: "Discute des matchs, résultats et pronostics",
          empty: "Aucun message lié aux matchs ou aux pronostics.",
        };
      case "trophies":
        return {
          title: "Trophées",
          subtitle: "Performances, badges et exploits du groupe",
          empty: "Aucun message sur les trophées pour le moment.",
        };
      case "offtopic":
        return {
          title: "Hors sujet",
          subtitle: "Le coin détente pour parler de tout et de rien",
          empty: "Aucun message hors sujet pour le moment.",
        };
      default:
        return {
          title: "Le Vestiaire",
          subtitle: "Discussion générale du groupe",
          empty: "Le Vestiaire est vide.",
        };
    }
  }, [activeSection]);

  const visibleMessages = useMemo(() => {
    let result = messageList;

    if (activeSection === "pinned") {
      const pinnedSet = new Set(pinnedIds);
      result = result.filter((message) => pinnedSet.has(message.id));
    } else if (activeSection in SECTION_PATTERNS) {
      const pattern = SECTION_PATTERNS[activeSection as keyof typeof SECTION_PATTERNS];
      result = result.filter((message) => pattern.test(messagePreview(message.content)));
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) return result;

    return result.filter((message) => {
      const name = displayName(message.profile).toLowerCase();
      const content = messagePreview(message.content).toLowerCase();
      return name.includes(query) || content.includes(query);
    });
  }, [messageList, searchQuery, activeSection, pinnedIds]);

  // Nombre de messages par salon, avec le meme filtre que le fil : la barre
  // laterale indique enfin ou il se passe quelque chose, au lieu d'aligner
  // cinq entrees identiques.
  const sectionCounts = useMemo(() => {
    const previews = messageList.map((message) => messagePreview(message.content));
    return {
      general: messageList.length,
      pinned: pinnedIds.length,
      matches: previews.filter((preview) => SECTION_PATTERNS.matches.test(preview)).length,
      trophies: previews.filter((preview) => SECTION_PATTERNS.trophies.test(preview)).length,
      offtopic: previews.filter((preview) => SECTION_PATTERNS.offtopic.test(preview)).length,
    } as Record<string, number>;
  }, [messageList, pinnedIds]);

  // Le reste du groupe, en sourdine sous les joueurs connectes. Avec un seul
  // joueur en ligne, le panneau affichait une carte isolee dans le vide : il
  // montre desormais l'effectif complet, ce qui donne sa mesure au groupe.
  const offlinePlayers = useMemo(() => {
    const onlineIds = new Set(onlinePlayers.map((player) => player.user_id));
    return Object.values(profiles)
      .filter((profile) => profile?.id && !onlineIds.has(profile.id))
      .sort((a, b) => displayName(a).localeCompare(displayName(b), "fr"));
  }, [profiles, onlinePlayers]);

  function selectSection(section: typeof activeSection) {
    setActiveSection(section);
    setSearchQuery("");
    setSearchOpen(false);
    setSelectedPlayer(null);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const topContributors = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number; avatar?: string | null }>();

    for (const message of messageList) {
      if (!message.user_id) continue;
      const name = displayName(message.profile);
      const existing = counts.get(message.user_id);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(message.user_id, {
          id: message.user_id,
          name,
          count: 1,
          avatar: message.profile?.avatar_url,
        });
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [messageList]);

  const pinnedMessages = useMemo(
    () => messageList.filter((message) => pinnedIds.includes(message.id)),
    [messageList, pinnedIds]
  );

  function addEmoji(emoji: string) {
    setDraft((current) => `${current}${emoji}`);
  }

  function addFiles(files: File[]) {
    const accepted: File[] = [];
    let rejectedType = false;
    let rejectedSize = false;

    for (const file of files) {
      const kind = mediaKind(resolveMediaType(file));
      if (!kind) {
        rejectedType = true;
        continue;
      }
      // Une photo trop lourde n'est plus refusée : elle sera recompressée
      // juste avant l'upload (voir prepareMedia). Seules les vidéos, qu'on ne
      // sait pas ré-encoder dans le navigateur, restent bloquées ici.
      if (kind === "video" && file.size > MAX_VIDEO_BYTES) {
        rejectedSize = true;
        continue;
      }
      accepted.push(file);
    }

    if (rejectedType) {
      setErrorMessage("Format non supporté (photos JPEG/PNG/WebP/GIF/HEIC ou vidéos MP4/WebM/MOV uniquement).");
    } else if (rejectedSize) {
      setErrorMessage("Vidéo trop volumineuse (25 Mo maximum).");
    } else if (accepted.length) {
      setErrorMessage("");
    }

    if (!accepted.length) return;

    setPendingFiles((current) => {
      const next = [...current, ...accepted].slice(0, 6);
      return next;
    });
  }

  function removePendingFile(index: number) {
    setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedMedia = Array.from(event.clipboardData.files).filter((file) =>
      mediaKind(resolveMediaType(file))
    );
    if (pastedMedia.length) {
      event.preventDefault();
      addFiles(pastedMedia);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  /** Prépare une photo pour l'upload : conversion en JPEG quand le bucket ne
   * sait pas stocker le format d'origine (HEIC d'iPhone…) et recompression
   * quand elle dépasse la limite, plutôt que de refuser l'envoi. Les vidéos
   * passent telles quelles (pas de ré-encodage possible côté navigateur). */
  async function prepareMedia(file: File) {
    const type = resolveMediaType(file);

    if (mediaKind(type) !== "image") return { file, type };

    const needsConversion = !ALLOWED_IMAGE_TYPES.includes(type);
    const tooBig = file.size > MAX_IMAGE_BYTES;

    // Un GIF perdrait son animation en passant par le canvas : on le laisse
    // intact tant que sa taille reste acceptable.
    if (type === "image/gif" && !tooBig) return { file, type };

    if (!needsConversion && !tooBig) return { file, type };

    let converted: File;
    try {
      converted = await resizeImageToJpegFile(file);
      if (converted.size > MAX_IMAGE_BYTES) {
        converted = await resizeImageToJpegFile(file, 1280, 0.72);
      }
    } catch (error) {
      console.error("Vestiaire — conversion photo :", error);
      throw new Error(
        needsConversion
          ? `Ce format de photo (${type || "inconnu"}) n'est pas lisible par ce navigateur. Réessaie en JPEG ou PNG.`
          : "Cette photo n'a pas pu être compressée. Réessaie avec une version plus légère."
      );
    }

    if (converted.size > MAX_IMAGE_BYTES) {
      throw new Error("Cette photo reste au-dessus de 8 Mo même compressée.");
    }

    return { file: converted, type: "image/jpeg" };
  }

  function randomFileId() {
    // `crypto.randomUUID` n'existe pas hors contexte sécurisé ni sur les
    // Safari un peu anciens : sans repli, tout l'envoi de photo échouait.
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }

  async function uploadChatImages(files: File[]) {
    const urls: string[] = [];

    for (const original of files) {
      const { file, type } = await prepareMedia(original);

      // L'extension vient du type MIME réel (et non du nom du fichier, qui
      // peut être trompeur ou absent) : `isVideoUrl` s'appuie dessus pour
      // afficher une vidéo comme une vidéo.
      const extension =
        MEDIA_EXTENSION_BY_TYPE[type] || fileExtension(file.name) || "jpg";
      const path = `${currentUserId}/${Date.now()}-${randomFileId()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-images")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: type,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("chat-images").getPublicUrl(path);
      if (data.publicUrl) urls.push(data.publicUrl);
    }

    return urls;
  }

  async function editMessage(message: ChatMessage) {
    if (!currentUserId || message.user_id !== currentUserId || !editDraft.trim()) return;

    const parsed = parseChatContent(message.content);
    const nextContent =
      parsed.images.length || parsed.replyTo
        ? JSON.stringify({
            v: 1,
            text: editDraft.trim(),
            images: parsed.images,
            gif: parsed.gif,
            replyTo: parsed.replyTo,
          })
        : editDraft.trim();

    const { error } = await supabase
      .from("chat_messages")
      .update({ content: nextContent })
      .eq("id", message.id)
      .eq("user_id", currentUserId);

    if (error) {
      setErrorMessage("Impossible de modifier ce message.");
      return;
    }

    setMessages((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, content: nextContent } : item
      )
    );
    setEditingMessage(null);
    setEditDraft("");
  }

  function startEditing(message: ChatMessage) {
    setEditingMessage(message.id);
    setEditDraft(parseChatContent(message.content).text);
  }

  function togglePin(messageId: string) {
    setPinnedIds((current) =>
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId]
    );
  }


  return (
    <AppShell>
      <style>{`
        /* Chaîne flex de bout en bout — AUCUNE hauteur calculée ici (ni JS,
           ni calc(100dvh - Npx)) : chaque maillon dit juste "je prends
           l'espace disponible de mon parent flex" (flex: 1 1 auto) et
           "j'ai le droit de descendre sous ma taille de contenu"
           (min-height: 0, sinon un flex-item ne rétrécit jamais sous son
           contenu par défaut — c'est ce détail, pas une histoire de px,
           qui cassait la mise en page). La chaîne complète :
           html/body/#root (height:100%, voir index.css)
             → AppShell (height: var(--app-vh), display:flex column)
               → main (flex:1 + min-height:0, display:flex column)
                 → .vestiaire-root (flex:1 + min-height:0, display:flex column)
                   → .vestiaire-panel (flex:1 + min-height:0, display:flex column)
                     → .vestiaire-scroll (flex:1 + min-height:0 + overflow-y:auto)
                     → composer (flex-shrink:0, flux normal, pas de sticky/fixed)
           --app-vh (AppShell.tsx, via window.visualViewport) est la SEULE
           chose qui bouge quand le clavier Android apparaît : tout le reste
           suit automatiquement parce que c'est un vrai calcul flex, pas une
           valeur devinée. */
        .vestiaire-root {
          flex: 1 1 auto;
          min-height: 0;
          color: #fff;
        }

        .vestiaire-panel {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-height: 0;
          background:
            radial-gradient(circle at 18% 12%, rgba(168,85,247,.14), transparent 24%),
            radial-gradient(circle at 84% 20%, rgba(16,185,129,.12), transparent 24%),
            linear-gradient(145deg, rgba(3,13,24,.92), rgba(2,8,18,.82));
          border: 1px solid rgba(255,255,255,.09);
          box-shadow:
            0 30px 100px rgba(0,0,0,.46),
            0 0 60px rgba(16,185,129,.04),
            inset 0 1px 0 rgba(255,255,255,.04);
          backdrop-filter: blur(22px);
        }

        .vestiaire-message {
          background: linear-gradient(90deg, rgba(255,255,255,.018), rgba(255,255,255,.008));
          border-bottom: 1px solid rgba(255,255,255,.055);
          transition: background .2s ease, transform .2s ease;
        }

        .vestiaire-message:hover {
          background: linear-gradient(90deg, rgba(16,185,129,.045), rgba(168,85,247,.025));
        }

        .vestiaire-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(16,185,129,.38) transparent;
          /* Seule zone qui doit scroller dans le Vestiaire — contain
             empêche le scroll de "déborder" sur la page entière une fois
             qu'on atteint le haut/bas des messages (comportement natif
             d'une app de messagerie, évite que la page saute derrière). */
          overscroll-behavior: contain;
        }

        .vestiaire-scroll::-webkit-scrollbar { width: 7px; }
        .vestiaire-scroll::-webkit-scrollbar-track { background: transparent; }
        .vestiaire-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(16,185,129,.45), rgba(168,85,247,.35));
          border-radius: 999px;
        }

        .vestiaire-online-dot {
          box-shadow: 0 0 14px rgba(16,185,129,.95);
        }

        .vestiaire-glow {
          box-shadow:
            0 0 40px rgba(16,185,129,.07),
            0 0 80px rgba(168,85,247,.045),
            0 28px 100px rgba(0,0,0,.38);
        }

        .vestiaire-neon-border {
          box-shadow:
            0 0 0 1px rgba(16,185,129,.18),
            0 0 24px rgba(16,185,129,.09);
        }

      `}</style>

      <div
        className="vestiaire-root flex flex-col"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(2,8,18,.68), rgba(2,8,18,.86)), url('/arriere%20plan%20general.png')",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundAttachment: "fixed",
        }}
      >
        {/* pb-32 : même convention que le reste de l'appli (voir
            pronostics.tsx notamment) pour dégager la nav flottante
            d'AppShell — pas une valeur inventée pour ce correctif, la
            valeur déjà utilisée partout ailleurs pour la même raison.
            Uniquement quand la nav est visible : une fois masquée pendant
            la saisie (voir useKeyboardOpen dans AppShell.tsx), réserver
            encore cet espace reviendrait à recréer le même grand vide
            inutile qu'on corrige ici, juste avec un autre nombre. */}
        <div
          className={`mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col px-2 pt-2 sm:px-4 sm:pt-4 ${
            keyboardOpen ? "pb-2" : "pb-32"
          }`}
        >

          {/* TOP BAR */}
          <section className="vestiaire-panel vestiaire-glow min-h-0 flex-1 overflow-hidden rounded-[26px]">

            <header className="flex items-center justify-between gap-3 border-b border-white/[.07] px-3 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400/20 to-purple-500/15 text-emerald-300 shadow-[0_0_25px_rgba(16,185,129,.10)]">
                  <MessageCircle size={20} />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-lg font-black uppercase tracking-tight text-white sm:text-xl">
                    Le Vestiaire
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Le chat privé du groupe
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const permission = await requestVestiaireNotificationPermission();
                    setNotificationPermission(permission);
                  }}
                  className={`relative grid size-9 place-items-center rounded-xl border transition ${
                    notificationPermission === "granted"
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : notificationPermission === "denied"
                        ? "border-red-400/20 bg-red-400/5 text-red-300"
                        : "border-white/10 bg-white/[.03] text-slate-400 hover:text-white"
                  }`}
                  aria-label={
                    notificationPermission === "granted"
                      ? "Notifications activées"
                      : "Activer les notifications du Vestiaire"
                  }
                  title={
                    notificationPermission === "granted"
                      ? "Notifications activées"
                      : notificationPermission === "denied"
                        ? "Notifications bloquées par le navigateur"
                        : "Activer les notifications du Vestiaire"
                  }
                >
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 grid min-w-4 h-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white shadow-[0_0_12px_rgba(239,68,68,.55)]">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSearchOpen((value) => !value)}
                  className={`grid size-9 place-items-center rounded-xl border transition ${
                    searchOpen
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : "border-white/10 bg-white/[.03] text-slate-400 hover:text-white"
                  }`}
                  aria-label="Rechercher"
                >
                  <Search size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => setShowPlayers((value) => !value)}
                  className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[.08] px-3 py-1.5 transition hover:bg-emerald-400/[.14]"
                >
                  <span className="vestiaire-online-dot size-2 rounded-full bg-emerald-400" />
                  <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-emerald-300">
                    {onlineCount} en ligne
                  </span>
                  <ChevronDown
                    size={12}
                    className={`text-emerald-300 transition-transform ${showPlayers ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
            </header>

            {searchOpen && (
              <div className="border-b border-white/[.06] bg-black/15 px-3 py-3 sm:px-5">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.035] px-3 py-2">
                  <Search size={14} className="text-slate-500" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Rechercher un joueur ou un message..."
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-slate-500 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* [grid-template-rows:minmax(0,1fr)] : sans ça, la ligne
                implicite unique de cette grille se dimensionne à son
                contenu (comportement "auto" de CSS Grid) et NE PROFITE PAS
                automatiquement de la hauteur restante donnée par flex-1,
                contrairement à Flexbox — la colonne CHAT resterait alors
                aussi haute que son contenu au lieu de remplir l'espace
                dispo, recréant le vide qu'on cherche justement à corriger. */}
            <div className="grid min-h-0 flex-1 [grid-template-rows:minmax(0,1fr)] lg:grid-cols-[230px_minmax(0,1fr)_275px]">

              {/* LEFT SIDEBAR */}
              <aside className="hidden overflow-y-auto border-r border-white/[.07] bg-black/10 p-4 lg:block">
                <button
                  type="button"
                  onClick={() => selectSection("general")}
                  className="group w-full rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 via-transparent to-emerald-400/[.06] p-3 text-left transition-all hover:border-emerald-400/35 hover:from-purple-500/15 hover:to-emerald-400/[.10]"
                >
                  <div className="flex items-center gap-2">
                    <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-purple-500 to-emerald-400 text-white shadow-[0_0_22px_rgba(168,85,247,.25)] transition-transform group-hover:scale-105">
                      <MessageCircle size={17} />
                    </div>
                    <div>
                      <div className="font-display text-xs font-black uppercase text-white">Le Vestiaire</div>
                      <div className="text-[9px] text-slate-500">Le chat privé du groupe</div>
                    </div>
                  </div>
                </button>

                <div className="mt-4 space-y-1.5">
                  {[
                    { icon: MessageCircle, label: "Discussion générale", section: "general" as const },
                    { icon: Pin, label: "Épinglés", section: "pinned" as const },
                    { icon: Hash, label: "Matchs & Pronos", section: "matches" as const },
                    { icon: Trophy, label: "Trophées", section: "trophies" as const },
                    { icon: Bell, label: "Hors sujet", section: "offtopic" as const },
                  ].map(({ icon: Icon, label, section }) => {
                    const active = activeSection === section;
                    const badge = sectionCounts[section] || undefined;

                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => selectSection(section)}
                        className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
                          active
                            ? "border-emerald-400/30 bg-gradient-to-r from-emerald-400/15 to-purple-500/10 text-white shadow-[0_0_22px_rgba(16,185,129,.08)]"
                            : "border-transparent text-slate-400 hover:border-purple-400/15 hover:bg-white/[.035] hover:text-white"
                        }`}
                      >
                        <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${
                          active ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[.025] text-slate-500 group-hover:text-emerald-300"
                        }`}>
                          <Icon size={15} />
                        </span>
                        <span className="flex-1 text-xs font-semibold">{label}</span>
                        {badge ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                              active
                                ? "bg-emerald-400/15 text-emerald-300"
                                : "bg-white/[.05] text-slate-500 group-hover:text-slate-300"
                            }`}
                          >
                            {badge}
                          </span>
                        ) : null}
                        {active ? <ChevronRight size={13} className="text-emerald-300" /> : null}
                      </button>
                    );
                  })}
                </div>

                <div className="my-5 border-t border-white/[.06]" />

                <div className="flex items-center gap-2 px-2 text-slate-500">
                  <Volume2 size={14} />
                  <span className="font-mono text-[9px] font-bold uppercase tracking-widest">
                    Salons vocaux
                  </span>
                  <span className="ml-auto size-1.5 rounded-full bg-emerald-400" />
                </div>

                <div className="mt-3 space-y-1.5">
                  {[{ name: "Général", room: "general" }, { name: "Pronos Live", room: "pronos-live" }].map(({ name, room }) => {
                    const active = voiceRoom === room && voiceJoined;
                    const count = active ? Object.keys(voiceParticipants).length : 0;
                    return (
                      <button
                        key={room}
                        type="button"
                        onClick={() => active ? void leaveVoiceRoom() : void joinVoiceRoom(room)}
                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs transition ${
                          active
                            ? "border border-emerald-400/30 bg-emerald-400/[.10] text-emerald-200"
                            : "text-slate-400 hover:bg-white/[.04] hover:text-white"
                        }`}
                      >
                        <span className={`size-1.5 rounded-full ${active ? "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,.9)]" : "bg-slate-600"}`} />
                        <span className="flex-1">{name}</span>
                        {active ? (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-bold text-emerald-300">
                            <Mic size={9} /> {count}
                          </span>
                        ) : (
                          <span className="rounded-full bg-white/[.05] px-1.5 py-0.5 text-[9px]">Rejoindre</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {voiceError && (
                  <div className="mt-3 rounded-xl border border-red-400/15 bg-red-500/[.05] px-3 py-2 text-[9px] leading-relaxed text-red-200">
                    {voiceError}
                  </div>
                )}

                {voiceJoined && (
                  <div className="mt-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[.06] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-300">
                          Vocal actif
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          {voiceRoom === "general" ? "Général" : "Pronos Live"} · {Object.keys(voiceParticipants).length} participant(s)
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={toggleVoiceMute} className="grid size-8 place-items-center rounded-lg bg-white/[.06] text-white hover:bg-white/[.10]" aria-label={voiceMuted ? "Activer le micro" : "Couper le micro"}>
                          {voiceMuted ? <MicOff size={13} /> : <Mic size={13} />}
                        </button>
                        <button type="button" onClick={() => void leaveVoiceRoom()} className="grid size-8 place-items-center rounded-lg bg-red-400/10 text-red-300 hover:bg-red-400/20" aria-label="Quitter le vocal">
                          <PhoneOff size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => selectSection("general")}
                  className="group mt-6 w-full rounded-2xl border border-emerald-400/35 bg-gradient-to-br from-emerald-400/[.08] via-transparent to-purple-500/[.08] p-4 text-left shadow-[0_0_35px_rgba(16,185,129,.08)] transition-all hover:border-emerald-300/55 hover:shadow-[0_0_35px_rgba(16,185,129,.15)]"
                >
                  <div className="flex items-center gap-2 text-emerald-300">
                    <Shield size={15} className="transition-transform group-hover:scale-110" />
                    <span className="font-mono text-[9px] font-black uppercase tracking-widest">
                      Respect & Fair-Play
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                    Le Vestiaire est un espace de partage et de bonne humeur. Respectons-nous !
                  </p>
                  <span className="mt-3 inline-flex text-[9px] font-bold uppercase tracking-wider text-emerald-300 opacity-70 transition-opacity group-hover:opacity-100">
                    Revenir à la discussion →
                  </span>
                </button>
              </aside>

              {/* CHAT */}
              <section className="flex min-h-0 min-w-0 flex-col">

                {/* Message épinglé — toujours visible (y compris mobile,
                    contrairement à l'ancien "hidden sm:block"), fond stade
                    de nuit discret en arrière-plan, cohérent avec le reste
                    du site (même image /arriere plan general.png). Contenu
                    piloté par sectionMeta, inchangé selon l'onglet actif. */}
                <div
                  className="relative shrink-0 overflow-hidden border-b border-white/[.07] px-4 py-3.5 sm:px-6"
                  style={{
                    backgroundImage:
                      "linear-gradient(120deg, rgba(4,10,20,.94), rgba(4,22,18,.78)), url('/arriere%20plan%20general.png')",
                    backgroundSize: "cover",
                    backgroundPosition: "center 28%",
                  }}
                >
                  <div className="relative flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-amber-300/30 bg-amber-300/10 text-amber-300 shadow-[0_0_16px_rgba(252,211,77,.10)]">
                        <Pin size={14} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-mono text-[8px] font-bold uppercase tracking-[.2em] text-amber-300/80">
                          Message épinglé
                        </div>
                        <div className="mt-0.5 truncate font-display text-sm font-black text-white">
                          {activeSection === "general" ? "Bienvenue dans le Vestiaire ! 👋" : sectionMeta.title}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-slate-400">
                          {activeSection === "general"
                            ? "Partage, échange et vis ta passion du foot tous ensemble 🔥"
                            : sectionMeta.subtitle}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[.08] px-2.5 py-1 text-xs text-slate-200">
                      <span className="vestiaire-online-dot size-2 rounded-full bg-emerald-400" />
                      <span className="font-mono text-[10px] font-bold text-emerald-300">
                        {onlineCount} en ligne
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  ref={scrollRef}
                  onScroll={onScroll}
                  className="vestiaire-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2 sm:px-5"
                >
                  {!currentUserId && !loading && (
                    <div className="mb-4 shrink-0 rounded-2xl border border-amber-300/15 bg-amber-300/[.04] px-4 py-3 text-sm text-amber-100">
                      Connecte-toi pour participer au Vestiaire.
                    </div>
                  )}

                  {errorMessage && (
                    <div className="mb-4 shrink-0 rounded-2xl border border-red-400/20 bg-red-500/[.05] px-4 py-3 text-xs text-red-200">
                      {errorMessage}
                    </div>
                  )}

                  {loading && (
                    <div className="flex flex-1 items-center justify-center text-center font-mono text-xs text-slate-600">
                      Chargement du Vestiaire...
                    </div>
                  )}

                  {!loading && !visibleMessages.length && (
                    // flex-1 + centrage : l'état vide occupe et se centre dans
                    // l'espace RÉELLEMENT disponible de la zone messages, pas
                    // dans toute la page — plus de grand vide entre le message
                    // et le composer, quelle que soit la hauteur réelle ici.
                    <div className="flex flex-1 flex-col items-center justify-center text-center">
                      <div className="mx-auto grid size-16 place-items-center rounded-3xl border border-emerald-400/15 bg-emerald-400/[.04] text-emerald-300/40">
                        <MessageCircle size={30} />
                      </div>
                      <div className="mt-4 font-display text-sm font-bold uppercase text-slate-500">
                        {searchQuery ? "Aucun résultat" : sectionMeta.empty}
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {searchQuery
                          ? "Essaie une autre recherche."
                          : activeSection === "general"
                            ? "Le premier message sera celui d'un vrai joueur du groupe."
                            : "Les nouveaux messages de cette rubrique apparaîtront ici."}
                      </p>
                    </div>
                  )}

                  <div className="space-y-0">
                    {visibleMessages.map((message, messageIndex) => {
                      const profile = message.profile;
                      const name = displayName(profile);
                      const mine = message.user_id === currentUserId;
                      const parsed = parseChatContent(message.content);
                      const isEditing = editingMessage === message.id;
                      const isPinned = pinnedIds.includes(message.id);

                      // --- Mise en page conversationnelle ---
                      // Un separateur de date ouvre chaque nouvelle journee, et
                      // les messages consecutifs d'un meme joueur sont regroupes
                      // sous un seul en-tete. Avant, chaque message repetait
                      // avatar + pseudo + badge + heure : le fil se lisait comme
                      // une liste administrative plutot que comme une discussion.
                      const previous = messageIndex > 0 ? visibleMessages[messageIndex - 1] : null;
                      const dayLabel =
                        !previous || !isSameDay(previous.created_at, message.created_at)
                          ? formatDayLabel(message.created_at)
                          : null;
                      // On ne regroupe jamais une reponse ni un message epingle :
                      // tous deux ont besoin de leur en-tete pour rester lisibles.
                      const grouped = Boolean(
                        previous &&
                          !dayLabel &&
                          !parsed.replyTo &&
                          !isPinned &&
                          previous.user_id === message.user_id &&
                          minutesBetween(previous.created_at, message.created_at) < 5,
                      );

                      return (
                        <Fragment key={message.id}>
                          {dayLabel && (
                            <div className="flex items-center gap-3 px-1 py-4 sm:px-2">
                              <span className="h-px flex-1 bg-white/[.07]" />
                              <span className="rounded-full border border-white/[.08] bg-white/[.03] px-3 py-1 font-mono text-[9px] font-black uppercase tracking-[.15em] text-slate-500">
                                {dayLabel}
                              </span>
                              <span className="h-px flex-1 bg-white/[.07]" />
                            </div>
                          )}
                        <article
                          ref={(element) => { messageRefs.current[message.id] = element; }}
                          className={`vestiaire-message group relative rounded-xl px-1 transition-colors sm:px-2 ${
                            grouped ? "py-1" : "py-4"
                          } ${mine ? "bg-emerald-400/[.018]" : ""} hover:bg-white/[.025]`}
                        >
                          <div className="flex items-start gap-3">
                            {grouped ? (
                              // Gouttiere de la largeur de l'avatar : l'heure n'y
                              // apparait qu'au survol, pour garder le fil aere.
                              <div className="w-10 shrink-0 pt-0.5 text-right">
                                <span className="font-mono text-[9px] text-slate-600 opacity-0 transition group-hover:opacity-100">
                                  {formatTime(message.created_at)}
                                </span>
                              </div>
                            ) : (
                            <div className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-emerald-400/25 via-purple-500/15 to-slate-900 transition group-hover:border-emerald-400/30">
                              {profile?.avatar_url ? (
                                <img
                                  src={profile.avatar_url}
                                  alt=""
                                  className="size-full object-cover"
                                />
                              ) : (
                                <span className="text-[10px] font-black text-white">
                                  {initials(name)}
                                </span>
                              )}
                              <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-[#06101a] bg-emerald-400" />
                            </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className={grouped ? "" : "flex items-center gap-2"}>
                                {!grouped && (
                                  <>
                                <span className="text-xs font-black text-emerald-300">
                                  {name}
                                </span>

                                <span
                                  className={`rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase ${
                                    profile?.is_admin
                                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                      : "border-white/10 bg-white/[.04] text-slate-500"
                                  }`}
                                >
                                  {profile?.is_admin ? "Admin" : "Membre"}
                                </span>

                                {isPinned && (
                                  <Pin size={11} className="text-amber-300" />
                                )}

                                <span className="font-mono text-[9px] text-slate-600">
                                  {formatTime(message.created_at)}
                                </span>
                                  </>
                                )}

                                {/* Menu "..." — toujours visible et tactile (remplace l'ancienne
                                    rangée d'icônes en group-hover, inaccessible sur mobile).
                                    Sur un message regroupé il n'y a plus d'en-tête où le poser :
                                    il passe alors en position absolue, coin haut droit. */}
                                <div className={grouped ? "absolute right-2 top-1 z-20" : "relative ml-auto"}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActionsMenuFor((current) =>
                                        current === message.id ? null : message.id
                                      )
                                    }
                                    className={`grid size-7 place-items-center rounded-full transition ${
                                      actionsMenuFor === message.id
                                        ? "bg-white/[.08] text-white"
                                        : "text-slate-500 hover:bg-white/[.05] hover:text-white"
                                    }`}
                                    title="Actions"
                                    aria-label="Actions du message"
                                  >
                                    <MoreVertical size={14} />
                                  </button>

                                  {actionsMenuFor === message.id && (
                                    <div className="absolute right-0 top-full z-30 mt-1 min-w-[168px] overflow-hidden rounded-xl border border-white/10 bg-[#08111d]/98 py-1 shadow-2xl backdrop-blur-xl">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setReplyTo(message);
                                          setActionsMenuFor(null);
                                        }}
                                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-300 transition hover:bg-white/[.06] hover:text-white"
                                      >
                                        <Reply size={13} /> Répondre
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          togglePin(message.id);
                                          setActionsMenuFor(null);
                                        }}
                                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-300 transition hover:bg-amber-400/10 hover:text-amber-300"
                                      >
                                        <Pin size={13} /> {isPinned ? "Désépingler" : "Épingler"}
                                      </button>

                                      {mine && !message.id.startsWith("temp-") && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            startEditing(message);
                                            setActionsMenuFor(null);
                                          }}
                                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-300 transition hover:bg-white/[.06] hover:text-white"
                                        >
                                          <Edit3 size={13} /> Modifier
                                        </button>
                                      )}

                                      {isAdmin && !message.id.startsWith("temp-") && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            void deleteMessage(message.id);
                                            setActionsMenuFor(null);
                                          }}
                                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-red-300 transition hover:bg-red-400/10"
                                        >
                                          <Trash2 size={13} /> Supprimer
                                        </button>
                                      )}

                                      {isAdmin && message.user_id && message.user_id !== currentUserId && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            void banUser(message.user_id as string);
                                            setActionsMenuFor(null);
                                          }}
                                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-amber-200 transition hover:bg-amber-400/10"
                                        >
                                          <Shield size={13} /> Bloquer 1 heure
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {parsed.replyTo && (
                                <div className="mt-2 rounded-r-xl border-l-2 border-emerald-400/50 bg-emerald-400/[.045] px-3 py-2">
                                  <div className="text-[10px] font-bold text-emerald-300">
                                    Réponse à {parsed.replyTo.name}
                                  </div>
                                  <div className="mt-0.5 truncate text-[10px] text-slate-500">
                                    {parsed.replyTo.text}
                                  </div>
                                </div>
                              )}

                              {isEditing ? (
                                <div className="mt-2 flex gap-2">
                                  <input
                                    autoFocus
                                    value={editDraft}
                                    onChange={(event) => setEditDraft(event.target.value)}
                                    className="min-w-0 flex-1 rounded-xl border border-emerald-400/25 bg-black/25 px-3 py-2 text-sm text-white outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void editMessage(message)}
                                    className="rounded-xl bg-emerald-400 px-3 text-xs font-bold text-slate-950"
                                  >
                                    OK
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingMessage(null);
                                      setEditDraft("");
                                    }}
                                    className="rounded-xl border border-white/10 px-3 text-xs text-slate-400"
                                  >
                                    Annuler
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {parsed.text && (
                                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
                                      {parsed.text}
                                      {message.id.startsWith("temp-") ? (
                                        <span className="ml-2 text-[9px] text-slate-600">Envoi…</span>
                                      ) : null}
                                    </p>
                                  )}

                                  {parsed.images.length > 0 && (
                                    <div
                                      className={`mt-3 grid gap-2 ${
                                        parsed.images.length === 1
                                          ? "max-w-[520px] grid-cols-1"
                                          : "max-w-[620px] grid-cols-2"
                                      }`}
                                    >
                                      {parsed.images.map((image, imageIndex) =>
                                        isVideoUrl(image) ? (
                                          <div
                                            key={`${image}-${imageIndex}`}
                                            className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30"
                                          >
                                            <video
                                              src={image}
                                              controls
                                              playsInline
                                              className="max-h-[360px] w-full bg-black object-contain"
                                            />
                                          </div>
                                        ) : (
                                          <button
                                            key={`${image}-${imageIndex}`}
                                            type="button"
                                            onClick={() => setLightboxImage(image)}
                                            className="group/image relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left"
                                          >
                                            <img
                                              src={image}
                                              alt={`Photo partagée ${imageIndex + 1}`}
                                              className="max-h-[360px] w-full object-cover transition duration-300 group-hover/image:scale-[1.02]"
                                            />
                                            <span className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition group-hover/image:opacity-100" />
                                          </button>
                                        )
                                      )}
                                    </div>
                                  )}
                                  {parsed.gif && (
                                    <div className="mt-3 max-w-[520px] overflow-hidden rounded-2xl border border-purple-400/20 bg-black/20">
                                      <img
                                        src={parsed.gif.url}
                                        alt={parsed.gif.title || "GIF partagé"}
                                        className="max-h-[360px] w-auto max-w-full object-contain"
                                        loading="lazy"
                                      />
                                      <div className="flex items-center gap-1.5 border-t border-white/[.06] px-2.5 py-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-600">
                                        <Film size={10} /> GIF • GIPHY
                                      </div>
                                    </div>
                                  )}

                                </>
                              )}

                              <div className="relative mt-2.5 flex flex-wrap items-center gap-1.5">
                                {Object.entries(message.reactions).map(([emoji, count]) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => void toggleReaction(message, emoji)}
                                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition hover:scale-105 active:scale-95 ${
                                      message.reactedByMe.has(emoji)
                                        ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200 shadow-[0_0_12px_-4px_rgba(52,211,153,.6)]"
                                        : "border-white/[.09] bg-white/[.04] text-slate-300 hover:border-white/20 hover:bg-white/[.07]"
                                    }`}
                                  >
                                    <span className="leading-none">{emoji}</span>
                                    <span className="font-mono text-[10px] font-bold leading-none">{count}</span>
                                  </button>
                                ))}

                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenReactionFor((current) =>
                                      current === message.id ? null : message.id
                                    )
                                  }
                                  className="grid size-7 place-items-center rounded-full text-slate-500 transition hover:bg-white/[.06] hover:text-white"
                                  aria-label="Ajouter une réaction"
                                >
                                  <Smile size={13} />
                                </button>

                                {openReactionFor === message.id && (
                                  <div className="absolute bottom-8 left-0 z-30 flex items-center gap-1 rounded-xl border border-white/10 bg-[#08111d]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                                    {REACTIONS.map((emoji) => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => void toggleReaction(message, emoji)}
                                        className="grid size-7 place-items-center rounded-lg text-sm transition hover:bg-white/[.07]"
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                )}

                              </div>
                            </div>
                          </div>
                        </article>
                        </Fragment>
                      );
                    })}
                  </div>

                  <div ref={bottomRef} />
                </div>

                {/* COMPOSER — flex-shrink-0 : dernier élément du flux flex
                    normal de la colonne (pinned banner → messages(flex-1)
                    → composer), plus de position:sticky. Le composer était
                    déjà visuellement à la bonne place (rien après lui dans
                    le flux), sticky ne servait donc à rien ici et pouvait
                    en plus interagir bizarrement avec le backdrop-filter du
                    panneau parent (nouveau containing block) — un des
                    "anciens correctifs" à nettoyer plutôt qu'à empiler. */}
                <div className="shrink-0 border-t border-white/[.07] bg-[#04101a]/90 p-3 backdrop-blur-2xl sm:p-4">
                  {isBanned ? (
                    <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.04] px-4 py-3 text-xs text-amber-100">
                      Ton accès au Vestiaire est temporairement bloqué par l'Admin.
                    </div>
                  ) : (
                    <div
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={handleDrop}
                      className={`relative rounded-[22px] border p-2 transition ${
                        dragActive
                          ? "border-emerald-300 bg-emerald-400/[.08] shadow-[0_0_30px_rgba(16,185,129,.12)]"
                          : "border-emerald-400/20 bg-gradient-to-r from-white/[.035] via-white/[.025] to-purple-400/[.035]"
                      }`}
                    >
                      {replyTo && (
                        <div className="mb-2 flex items-center gap-2 rounded-xl border-l-2 border-emerald-400 bg-emerald-400/[.045] px-3 py-2">
                          <Reply size={13} className="text-emerald-300" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-bold text-emerald-300">
                              Réponse à {displayName(replyTo.profile)}
                            </div>
                            <div className="truncate text-[10px] text-slate-500">
                              {messagePreview(replyTo.content)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReplyTo(null)}
                            className="text-slate-500 hover:text-white"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}

                      {pendingFiles.length > 0 && (
                        <div className="mb-2 grid grid-cols-3 gap-2 px-1 sm:grid-cols-6">
                          {pendingFiles.map((file, index) => (
                            <div key={`${file.name}-${index}`} className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30">
                              {file.type.startsWith("video/") ? (
                                <video
                                  src={URL.createObjectURL(file)}
                                  className="size-full object-cover"
                                  muted
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={URL.createObjectURL(file)}
                                  alt=""
                                  className="size-full object-cover"
                                />
                              )}
                              {file.type.startsWith("video/") && (
                                <span className="absolute bottom-1 left-1 rounded-full bg-black/70 p-1 text-white">
                                  <Film size={10} />
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => removePendingFile(index)}
                                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/70 text-white"
                                aria-label="Retirer le média"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void sendMessage();
                        }}
                        className="flex items-end gap-1.5"
                      >
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setAttachMenuOpen((value) => !value);
                              setGifOpen(false);
                              setEmojiOpen(false);
                            }}
                            className={`grid size-10 shrink-0 place-items-center rounded-xl transition ${
                              attachMenuOpen
                                ? "bg-emerald-400/20 text-emerald-300"
                                : "bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                            }`}
                            aria-label="Ajouter un média"
                            aria-expanded={attachMenuOpen}
                          >
                            <Plus
                              size={19}
                              className={`transition-transform ${attachMenuOpen ? "rotate-45" : ""}`}
                            />
                          </button>

                          {/* Menu compact "+" — regroupe Photo/vidéo et GIF sur
                              mobile (ImageIcon/Camera/GIF restent en plus
                              visibles directement dès sm: pour le desktop,
                              inchangé, voir plus bas). */}
                          {attachMenuOpen && (
                            <div className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-44 overflow-hidden rounded-2xl border border-white/10 bg-[#0a1420]/98 shadow-[0_20px_50px_rgba(0,0,0,.6)] backdrop-blur-2xl">
                              <button
                                type="button"
                                onClick={() => {
                                  setAttachMenuOpen(false);
                                  fileInputRef.current?.click();
                                }}
                                className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-xs font-bold text-slate-200 transition hover:bg-white/[.06]"
                              >
                                <span className="text-base leading-none">📷</span> Photo / vidéo
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAttachMenuOpen(false);
                                  toggleGifPicker();
                                }}
                                className="flex w-full items-center gap-2.5 border-t border-white/[.06] px-3.5 py-3 text-left text-xs font-bold text-slate-200 transition hover:bg-white/[.06]"
                              >
                                <span className="text-base leading-none">🎞️</span> GIF
                              </button>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="hidden size-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-white/[.06] hover:text-white sm:grid"
                          aria-label="Joindre une photo"
                        >
                          <ImageIcon size={18} />
                        </button>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="hidden size-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-white/[.06] hover:text-white sm:grid"
                          aria-label="Appareil photo"
                        >
                          <Camera size={18} />
                        </button>

                        <button
                          type="button"
                          onClick={() => { setEmojiOpen((value) => !value); setGifOpen(false); setAttachMenuOpen(false); }}
                          className={`grid size-9 shrink-0 place-items-center rounded-xl transition ${
                            emojiOpen
                              ? "bg-emerald-400/10 text-emerald-300"
                              : "text-slate-400 hover:bg-white/[.06] hover:text-white"
                          }`}
                          aria-label="Emojis"
                        >
                          <Smile size={18} />
                        </button>

                        {/* GIF : gardé visible directement dès sm: (accès rapide
                            desktop, inchangé) — sur mobile, accessible via le
                            menu "+" ci-dessus pour rester compact. */}
                        <button
                          type="button"
                          onClick={toggleGifPicker}
                          className={`hidden h-9 min-w-10 shrink-0 place-items-center rounded-xl px-2 text-[10px] font-black transition sm:grid ${
                            gifOpen
                              ? "bg-purple-400/10 text-purple-300"
                              : "text-slate-400 hover:bg-white/[.06] hover:text-purple-300"
                          }`}
                          aria-label="GIF"
                        >
                          GIF
                        </button>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept={[
                            ...ALLOWED_IMAGE_TYPES,
                            ...CONVERTIBLE_IMAGE_TYPES,
                            ...ALLOWED_VIDEO_TYPES,
                          ].join(",")}
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            addFiles(Array.from(event.target.files || []));
                            event.currentTarget.value = "";
                          }}
                        />

                        {/* Zone de saisie multi-ligne : un <input> simple
                            écrasait les retours à la ligne (un texte collé
                            depuis ailleurs arrivait en un seul bloc) et
                            coupait à 1000 caractères, ce qui rendait
                            impossible la publication d'une annonce mise en
                            forme (classement, récap de journée…).
                            Entrée envoie, Maj+Entrée saute une ligne. */}
                        <textarea
                          ref={draftInputRef}
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onPaste={handlePaste}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void sendMessage();
                            }
                          }}
                          rows={1}
                          maxLength={MAX_MESSAGE_LENGTH}
                          disabled={!currentUserId || sending}
                          placeholder={
                            currentUserId ? "Écris ton message..." : "Connecte-toi pour écrire..."
                          }
                          className="min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed text-white outline-none placeholder:text-slate-600"
                        />

                        <button
                          type="submit"
                          disabled={
                            (!draft.trim() && !pendingFiles.length) ||
                            !currentUserId ||
                            sending
                          }
                          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-500 text-[#03100a] shadow-[0_0_28px_rgba(16,185,129,.22)] transition hover:scale-[1.03] hover:from-emerald-300 hover:to-green-400 disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="Envoyer le message"
                        >
                          <Send size={17} />
                        </button>
                      </form>

                      {gifOpen && (
                        <div className="absolute bottom-[calc(100%+10px)] left-2 z-50 w-[340px] rounded-2xl border border-purple-400/20 bg-[#07121e]/98 p-3 shadow-[0_25px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl sm:w-[390px]">
                          <div className="mb-2 flex items-center gap-2">
                            <div className="grid size-8 place-items-center rounded-lg bg-purple-500/10 text-purple-300">
                              <Film size={14} />
                            </div>
                            <div className="relative flex-1">
                              <SearchIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
                              <input
                                value={gifQuery}
                                onChange={(event) => setGifQuery(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void searchGifs();
                                  }
                                }}
                                placeholder="Rechercher un GIF..."
                                className="h-8 w-full rounded-lg border border-white/[.07] bg-white/[.025] pl-8 pr-2 text-[10px] text-white outline-none placeholder:text-slate-600 focus:border-purple-400/30"
                              />
                            </div>
                            <button type="button" onClick={() => void searchGifs()} className="h-8 rounded-lg bg-purple-500/15 px-2 text-[9px] font-black uppercase text-purple-300">OK</button>
                            <button type="button" onClick={() => setGifOpen(false)} className="grid size-8 place-items-center rounded-lg text-slate-600 hover:text-white"><X size={13} /></button>
                          </div>
                          {gifError ? (
                            <div className="rounded-xl border border-amber-400/10 bg-amber-400/[.04] p-3 text-[9px] leading-relaxed text-amber-300">{gifError}</div>
                          ) : gifLoading ? (
                            <div className="grid h-40 place-items-center text-[10px] text-slate-500">Recherche des GIF...</div>
                          ) : (
                            <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
                              {gifResults.map((gif) => {
                                const url = gif.images?.fixed_width_small?.url ?? gif.images?.fixed_width?.url ?? gif.images?.original?.url;
                                if (!url) return null;
                                return (
                                  <button key={gif.id} type="button" disabled={sending} onClick={() => void sendGif(gif)} className="group relative aspect-square overflow-hidden rounded-lg bg-black/20 disabled:opacity-40" title={gif.title || "Envoyer ce GIF"}>
                                    <img src={url} alt={gif.title || "GIF"} className="size-full object-cover transition group-hover:scale-105" loading="lazy" />
                                    <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-1 text-[7px] font-bold text-white opacity-0 transition group-hover:opacity-100">ENVOYER</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          <div className="mt-2 border-t border-white/[.06] pt-1.5 text-[7px] font-semibold uppercase tracking-wider text-slate-600">Powered by GIPHY</div>
                        </div>
                      )}

                      {emojiOpen && (
                        <div className="absolute bottom-[calc(100%+10px)] left-2 z-50 w-[320px] rounded-2xl border border-white/10 bg-[#07121e]/98 p-3 shadow-[0_25px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl sm:w-[360px]">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-400">
                              Émotions
                            </span>
                            <button
                              type="button"
                              onClick={() => setEmojiOpen(false)}
                              className="text-slate-600 hover:text-white"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <div className="grid grid-cols-8 gap-1">
                            {VESTIAIRE_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => addEmoji(emoji)}
                                className="grid size-8 place-items-center rounded-lg text-lg transition hover:bg-white/[.07] hover:scale-110"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-1.5 flex items-center justify-between px-2">
                        <div className="flex items-center gap-2 text-[9px] text-slate-600">
                          <Paperclip size={11} />
                          {/* Une photo de téléphone est recompressée avant
                              l'envoi, ce qui peut prendre quelques secondes :
                              sans ce retour, l'attente ressemble à un bug. */}
                          {sending && pendingFiles.length > 0 ? (
                            <span className="text-emerald-300">
                              Préparation et envoi {pendingFiles.length > 1 ? "des photos" : "de la photo"}…
                            </span>
                          ) : (
                            <span>Photos · emojis · glisser-déposer · Maj+Entrée = saut de ligne</span>
                          )}
                        </div>
                        <span className="text-[9px] text-slate-700">
                          {draft.length}/{MAX_MESSAGE_LENGTH}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* RIGHT SIDEBAR */}
              <aside className="hidden overflow-y-auto border-l border-white/[.07] bg-black/10 p-4 xl:block">

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-display text-sm font-bold uppercase text-white">
                      Joueurs en ligne
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-600">
                      Présence en temps réel
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-emerald-300" />
                    <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
                      {onlineCount}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {!onlinePlayers.length && (
                    <div className="rounded-xl border border-white/[.06] bg-white/[.02] px-3 py-3 text-[10px] text-slate-600">
                      Aucun autre joueur en ligne.
                    </div>
                  )}

                  {onlinePlayers.slice(0, 8).map((player) => {
                    const playerProfile = profiles[player.user_id];

                    return (
                      <button
                        key={player.user_id}
                        type="button"
                        onClick={() => setSelectedPlayer(player)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-emerald-400/[.06]"
                      >
                        <div className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-emerald-400/20 bg-gradient-to-br from-purple-500/20 to-emerald-400/15">
                          {playerProfile?.avatar_url ? (
                            <img src={playerProfile.avatar_url} alt="" className="size-full object-cover" />
                          ) : (
                            <span className="text-[9px] font-black text-white">
                              {initials(player.display_name)}
                            </span>
                          )}
                          <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-[#06101a] bg-emerald-400" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-slate-200">
                            {player.display_name}
                            {player.user_id === currentUserId ? " (toi)" : ""}
                          </div>
                          <div className="text-[9px] text-emerald-400">
                            En ligne · voir le profil
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {offlinePlayers.length > 0 && (
                    <div className="pt-3">
                      <div className="flex items-center gap-2 px-2">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-600">
                          Hors ligne
                        </span>
                        <span className="h-px flex-1 bg-white/[.06]" />
                        <span className="font-mono text-[9px] text-slate-600">{offlinePlayers.length}</span>
                      </div>

                      <div className="mt-2 space-y-0.5">
                        {offlinePlayers.slice(0, 6).map((playerProfile) => (
                          <div
                            key={playerProfile.id}
                            className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 opacity-45 transition hover:opacity-80"
                          >
                            <div className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-full border border-white/[.08] bg-white/[.03] grayscale">
                              {playerProfile.avatar_url ? (
                                <img src={playerProfile.avatar_url} alt="" className="size-full object-cover" />
                              ) : (
                                <span className="text-[8px] font-black text-slate-400">
                                  {initials(displayName(playerProfile))}
                                </span>
                              )}
                            </div>
                            <span className="truncate text-[11px] text-slate-400">
                              {displayName(playerProfile)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {onlinePlayers.length > 8 && (
                    <button
                      type="button"
                      onClick={() => setShowPlayers(true)}
                      className="flex w-full items-center justify-between rounded-xl border border-white/[.08] bg-white/[.025] px-3 py-2 text-xs text-slate-400 hover:text-white"
                    >
                      Voir tous ({onlinePlayers.length})
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>

                {selectedPlayer && (
                  <div className="mt-5 rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-500/[.08] to-emerald-400/[.04] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <UserRound size={13} className="text-purple-300" />
                        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-purple-200">Profil en ligne</span>
                      </div>
                      <button type="button" onClick={() => setSelectedPlayer(null)} className="text-slate-500 hover:text-white"><X size={13} /></button>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="grid size-11 place-items-center overflow-hidden rounded-full border border-emerald-400/30 bg-emerald-400/10">
                        {profiles[selectedPlayer.user_id]?.avatar_url ? (
                          <img src={profiles[selectedPlayer.user_id]?.avatar_url || ""} alt="" className="size-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-black text-white">{initials(selectedPlayer.display_name)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">{selectedPlayer.display_name}</div>
                        <div className="mt-0.5 text-[9px] font-semibold text-emerald-400">● En ligne</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const target = messageList.find((message) => message.user_id === selectedPlayer.user_id);
                        setSelectedPlayer(null);
                        if (target) scrollToMessage(target.id);
                      }}
                      className="mt-3 w-full rounded-xl border border-white/[.08] bg-white/[.03] px-3 py-2 text-[10px] font-semibold text-slate-300 transition hover:border-emerald-400/25 hover:text-white"
                    >
                      Voir ses messages
                    </button>
                  </div>
                )}

                {/* PINNED */}
                <div className="mt-5 rounded-2xl border border-amber-300/15 bg-gradient-to-br from-amber-300/[.05] to-transparent p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Pin size={13} className="text-amber-300" />
                      <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-amber-200">
                        Épinglés
                      </span>
                    </div>
                    <span className="text-[9px] text-emerald-300">
                      {pinnedMessages.length}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {!pinnedMessages.length ? (
                      <div className="text-[10px] leading-relaxed text-slate-600">
                        Épingle un message avec l’icône 📌 pour le retrouver ici.
                      </div>
                    ) : (
                      pinnedMessages.slice(0, 3).map((message) => (
                        <button
                          key={message.id}
                          type="button"
                          onClick={() => scrollToMessage(message.id)}
                          className="w-full rounded-xl border border-white/[.06] bg-white/[.02] p-2 text-left hover:bg-white/[.04]"
                        >
                          <div className="text-[10px] font-bold text-white">
                            {displayName(message.profile)}
                          </div>
                          <div className="mt-1 truncate text-[9px] text-slate-500">
                            {messagePreview(message.content)}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* TOP CONTRIBUTORS */}
                <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[.06] to-transparent p-4">
                  <div className="flex items-center gap-2">
                    <Trophy size={14} className="text-amber-300" />
                    <span className="font-display text-xs font-bold uppercase text-white">
                      Top contributeurs
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {topContributors.map((player, index) => (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => {
                          const target = messageList.find((message) => message.user_id === player.id);
                          if (target) scrollToMessage(target.id);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl bg-white/[.02] px-2 py-2 text-left transition hover:bg-emerald-400/[.06]"
                      >
                        <span className="grid size-6 place-items-center rounded-full bg-white/[.06] text-[9px] font-black text-slate-300">
                          {index + 1}
                        </span>

                        <div className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-800">
                          {player.avatar ? (
                            <img src={player.avatar} alt="" className="size-full object-cover" />
                          ) : (
                            <span className="text-[8px] font-bold text-white">
                              {initials(player.name)}
                            </span>
                          )}
                        </div>

                        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-300">
                          {player.name}
                        </span>

                        <span className="text-[9px] text-slate-600">
                          {player.count} msg
                        </span>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="mt-3 w-full text-right text-[9px] font-semibold text-emerald-300 hover:text-emerald-200"
                  >
                    Voir les messages →
                  </button>
                </div>

              </aside>
            </div>

            {/* MOBILE ONLINE LIST */}
            {showPlayers && (
              <div className="border-t border-white/[.07] bg-black/20 px-4 py-4 xl:hidden">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {onlinePlayers.map((player) => (
                    <div
                      key={player.user_id}
                      className="flex items-center gap-2.5 rounded-xl border border-white/[.06] bg-white/[.02] px-3 py-2"
                    >
                      <span className="vestiaire-online-dot size-2 rounded-full bg-emerald-400" />
                      <span className="text-xs text-slate-300">
                        {player.display_name}
                      </span>
                      {player.user_id === currentUserId && (
                        <span className="text-[9px] text-emerald-300">(toi)</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {currentUserId && (
            <div className="sr-only" aria-live="polite">
              Connecté en tant que {currentUserName}.
            </div>
          )}
        </div>
      </div>

      {/* LIGHTBOX PHOTO */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute right-5 top-5 grid size-10 place-items-center rounded-full border border-white/10 bg-white/[.06] text-white hover:bg-white/[.12]"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>

          <a
            href={lightboxImage}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="absolute bottom-5 right-5 grid size-10 place-items-center rounded-full border border-white/10 bg-white/[.06] text-white hover:bg-white/[.12]"
            title="Ouvrir / télécharger"
          >
            <Download size={17} />
          </a>

          <img
            src={lightboxImage}
            alt="Photo du Vestiaire"
            className="max-h-[88vh] max-w-[94vw] rounded-2xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </AppShell>
  );
}