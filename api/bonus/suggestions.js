const fallbackBonus = () => {
  const now = new Date();
  const nextSaturday = new Date(now);
  const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;
  nextSaturday.setDate(now.getDate() + daysUntilSaturday);
  const date = nextSaturday.toISOString().slice(0, 10);

  return [
    { championnat: "Premier League", domicile: "Liverpool", exterieur: "Arsenal", date, heure: "18:30" },
    { championnat: "Liga", domicile: "Real Madrid", exterieur: "Atlético Madrid", date, heure: "21:00" },
    { championnat: "Serie A", domicile: "Inter Milan", exterieur: "Juventus", date, heure: "20:45" }
  ];
};

function extractJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) return null;
  return JSON.parse(cleaned.slice(start, end + 1));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  try {
    if (!apiKey) {
      const matches = fallbackBonus();
      return res.status(200).json({ ok: true, matches, suggestions: matches, bonus: matches });
    }

    const prompt = `
Propose 3 matchs bonus football intéressants pour un concours de pronostics.
Choisis uniquement parmi Premier League, Liga, Serie A, Bundesliga.
Réponds uniquement avec un tableau JSON, sans texte autour.
Format exact :
[
  {"championnat":"Premier League","domicile":"Equipe A","exterieur":"Equipe B","date":"YYYY-MM-DD","heure":"HH:mm"}
]
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    if (!response.ok) {
      const matches = fallbackBonus();
      return res.status(200).json({ ok: true, matches, suggestions: matches, bonus: matches });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";
    const parsed = extractJson(text);

    const matches = Array.isArray(parsed) && parsed.length >= 3 ? parsed.slice(0, 3) : fallbackBonus();

    return res.status(200).json({ ok: true, matches, suggestions: matches, bonus: matches });
  } catch (error) {
    const matches = fallbackBonus();
    return res.status(200).json({ ok: true, matches, suggestions: matches, bonus: matches });
  }
}
