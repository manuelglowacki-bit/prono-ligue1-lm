export default function handler(req, res) {
  const teams = ["PSG","OM","OL","LOSC","Monaco","RC Lens","Rennes","Nice","Nantes","Strasbourg","Toulouse","Brest","Reims","Auxerre","Angers","Le Havre","Metz","Paris FC"];
  const matches = [];
  for (let j = 1; j <= 34; j++) {
    for (let i = 0; i < 9; i++) {
      matches.push({
        id: `l1-j${j}-${i}`,
        journee: j,
        domicile: teams[(i + j) % teams.length],
        exterieur: teams[(teams.length - 1 - i + j) % teams.length],
        date: "2026-08-15",
        heure: "20:00",
        type: "L1"
      });
    }
  }
  res.status(200).json({ ok: true, matches, matchs: matches });
}
