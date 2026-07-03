export function getResult1N2(home, away) {
  const h = Number(home);
  const a = Number(away);

  if (Number.isNaN(h) || Number.isNaN(a)) return null;

  if (h > a) return "1";
  if (h < a) return "2";
  return "N";
}

export function computeMatchPoints({
  realHome,
  realAway,
  pronoHome,
  pronoAway,
  type = "normal",
}) {
  const rh = Number(realHome);
  const ra = Number(realAway);
  const ph = Number(pronoHome);
  const pa = Number(pronoAway);

  if ([rh, ra, ph, pa].some(Number.isNaN)) {
    return {
      points: 0,
      exact: false,
      good1N2: false,
      type,
    };
  }

  const exact = rh === ph && ra === pa;
  const good1N2 = getResult1N2(rh, ra) === getResult1N2(ph, pa);

  // Match bonus : exact 3 pts, bon 1N2 2 pts, faux 0
  if (type === "bonus") {
    return {
      points: exact ? 3 : good1N2 ? 2 : 0,
      exact,
      good1N2,
      type,
    };
  }

  // Équipe favorite : exact 2 pts, bon 1N2 1 pt, faux 0
  if (type === "favorite") {
    return {
      points: exact ? 2 : good1N2 ? 1 : 0,
      exact,
      good1N2,
      type,
    };
  }

  // Match normal 1N2 : bon 1N2 1 pt, faux 0
  return {
    points: good1N2 ? 1 : 0,
    exact: false,
    good1N2,
    type: "normal",
  };
}

export function sortRanking(a, b) {
  // 1. Total points
  if (b.points !== a.points) return b.points - a.points;

  // 2. Scores exacts spéciaux = exact équipe favorite + exact match bonus
  const bSpecialExact =
    (b.favoriteExact || 0) + (b.bonusExact || 0);

  const aSpecialExact =
    (a.favoriteExact || 0) + (a.bonusExact || 0);

  if (bSpecialExact !== aSpecialExact) {
    return bSpecialExact - aSpecialExact;
  }

  // 3. Ordre alphabétique
  return String(a.playerName || "").localeCompare(String(b.playerName || ""));
}
