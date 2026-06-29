export default function handler(req, res) {
  const matches = [
    { id: "bonus-1", championnat: "Premier League", domicile: "Liverpool", exterieur: "Arsenal", date: "2026-08-15", heure: "18:30", type: "BONUS" },
    { id: "bonus-2", championnat: "Liga", domicile: "Real Madrid", exterieur: "Atlético Madrid", date: "2026-08-15", heure: "21:00", type: "BONUS" },
    { id: "bonus-3", championnat: "Serie A", domicile: "Inter Milan", exterieur: "Juventus", date: "2026-08-15", heure: "20:45", type: "BONUS" }
  ];

  res.status(200).json({ ok: true, matches, suggestions: matches, bonus: matches });
}
