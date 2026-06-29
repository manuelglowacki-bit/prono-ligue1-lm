const CLUB_ALIASES = {
  psg: ["psg", "paris", "paris sg", "paris saint germain", "paris saint-germain"],
  marseille: ["marseille", "om", "olympique de marseille"],
  lyon: ["lyon", "ol", "olympique lyonnais"],
  monaco: ["monaco", "as monaco"],
  lens: ["lens", "rc lens", "rcl", "racing club de lens"],
  lille: ["lille", "losc", "losc lille"],
  rennes: ["rennes", "stade rennais"],
  nice: ["nice", "ogc nice"],
  nantes: ["nantes", "fc nantes"],
  strasbourg: ["strasbourg", "rc strasbourg", "rc strasbourg alsace"],
  toulouse: ["toulouse", "toulouse fc", "tfc"],
  brest: ["brest", "stade brestois", "stade brestois 29"],
  lorient: ["lorient", "fc lorient"],
  auxerre: ["auxerre", "aj auxerre", "aja"],
  metz: ["metz", "fc metz"],
  angers: ["angers", "angers sco", "sco angers"],
  lehavre: ["le havre", "havre", "le havre ac", "hac"],
  parisfc: ["paris fc", "pfc"],
  saintetienne: ["saint etienne", "saint-étienne", "saint-etienne", "asse", "as saint etienne"],
  montpellier: ["montpellier", "mhsc", "montpellier hsc"],
  reims: ["reims", "stade de reims"],
  clermont: ["clermont", "clermont foot", "clermont foot 63"],
  ajaccio: ["ajaccio", "ac ajaccio"],
  troyes: ["troyes", "estac", "estac troyes"],
  dijon: ["dijon", "dfco", "dijon fco"],
  caen: ["caen", "sm caen"],
  guingamp: ["guingamp", "ea guingamp"],
  sochaux: ["sochaux", "fc sochaux"],
  bordeaux: ["bordeaux", "girondins", "girondins de bordeaux"]
};

export const CLUB_OPTIONS = [
  "PSG",
  "Marseille",
  "Lyon",
  "Monaco",
  "RC Lens",
  "Lille",
  "Rennes",
  "Nice",
  "Nantes",
  "Strasbourg",
  "Toulouse",
  "Brest",
  "Lorient",
  "Auxerre",
  "Metz",
  "Angers",
  "Le Havre",
  "Paris FC",
  "Saint-Étienne",
  "Montpellier",
  "Reims",
  "Clermont",
  "Ajaccio",
  "Troyes",
  "Dijon",
  "Caen",
  "Guingamp",
  "Sochaux",
  "Bordeaux"
];

function cleanClubName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/-/g, " ")
    .replace(/\bfootball club\b/g, "")
    .replace(/\bfc\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeClubName(value) {
  const clean = cleanClubName(value);

  if (!clean) return "";

  for (const [mainName, aliases] of Object.entries(CLUB_ALIASES)) {
    if (aliases.map(cleanClubName).includes(clean)) {
      return mainName;
    }
  }

  return clean;
}

export function getMatchHomeName(match) {
  return (
    match?.domicile ||
    match?.home ||
    match?.equipeDomicile ||
    match?.équipeDomicile ||
    match?.teamHome ||
    match?.homeTeam ||
    match?.clubDomicile ||
    ""
  );
}

export function getMatchAwayName(match) {
  return (
    match?.exterieur ||
    match?.extérieur ||
    match?.away ||
    match?.equipeExterieur ||
    match?.equipeExtérieur ||
    match?.teamAway ||
    match?.awayTeam ||
    match?.clubExterieur ||
    match?.clubExtérieur ||
    ""
  );
}

export function isFavoriteClubMatch(match, favoriteClub) {
  const fav = normalizeClubName(favoriteClub);
  const home = normalizeClubName(getMatchHomeName(match));
  const away = normalizeClubName(getMatchAwayName(match));

  if (!fav) return false;

  return home === fav || away === fav;
}
