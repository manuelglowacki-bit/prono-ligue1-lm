const teams = [
  "PSG",
  "OM",
  "OL",
  "LOSC",
  "Monaco",
  "RC Lens",
  "Rennes",
  "Nice",
  "Nantes",
  "Strasbourg",
  "Toulouse",
  "Montpellier",
  "Reims",
  "Brest",
  "Le Havre",
  "Auxerre",
  "Angers",
  "Saint-Étienne"
];

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function buildCalendar() {
  const list = [];
  const firstDate = new Date("2026-08-15T12:00:00Z");
  const hours = ["21:00", "17:00", "15:00", "19:00", "20:45", "17:05", "13:00", "18:00", "20:00"];

  let rotation = [...teams];

  for (let round = 0; round < 17; round++) {
    const journeeDate = addDays(firstDate, round * 7);

    for (let i = 0; i < teams.length / 2; i++) {
      const home = rotation[i];
      const away = rotation[rotation.length - 1 - i];

      list.push({
        id: `l1-j${round + 1}-${i + 1}`,
        journee: round + 1,
        date: toDateInput(addDays(journeeDate, i % 3)),
        heure: hours[i % hours.length],
        domicile: round % 2 === 0 ? home : away,
        exterieur: round % 2 === 0 ? away : home,
        type: "L1",
        scoreDomicile: null,
        scoreExterieur: null,
        blocageDate: toDateInput(addDays(journeeDate, i % 3)),
        blocageHeure: hours[i % hours.length]
      });
    }

    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop());
    rotation = [fixed, ...rest];
  }

  const firstLeg = [...list];

  firstLeg.forEach((match) => {
    list.push({
      ...match,
      id: match.id.replace("j" + match.journee, "j" + (match.journee + 17)),
      journee: match.journee + 17,
      date: toDateInput(addDays(new Date(match.date + "T12:00:00Z"), 17 * 7)),
      domicile: match.exterieur,
      exterieur: match.domicile,
      blocageDate: toDateInput(addDays(new Date(match.date + "T12:00:00Z"), 17 * 7))
    });
  });

  return list;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const matches = buildCalendar();

  return res.status(200).json({
    ok: true,
    matches,
    matchs: matches
  });
}
