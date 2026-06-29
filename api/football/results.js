export default async function handler(req, res) {
  try {
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "FOOTBALL_DATA_API_KEY manquante dans Vercel",
      });
    }

    const season = req.query.season || "2025";
    const matchday = req.query.matchday || "1";

    const url =
      `https://api.football-data.org/v4/competitions/FL1/matches` +
      `?season=${season}&matchday=${matchday}`;

    const response = await fetch(url, {
      headers: {
        "X-Auth-Token": apiKey,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: data?.message || "Erreur API football-data",
        details: data,
      });
    }

    const matches = (data.matches || []).map((match) => ({
      officialId: match.id,
      championnat: "Ligue 1",
      saison: season,
      journee: Number(matchday),
      date: match.utcDate?.slice(0, 10),
      heure: match.utcDate?.slice(11, 16),
      domicile:
        match.homeTeam?.shortName ||
        match.homeTeam?.name ||
        match.homeTeam?.tla ||
        "",
      exterieur:
        match.awayTeam?.shortName ||
        match.awayTeam?.name ||
        match.awayTeam?.tla ||
        "",
      scoreDom: match.score?.fullTime?.home,
      scoreExt: match.score?.fullTime?.away,
      status: match.status,
      termine:
        match.status === "FINISHED" ||
        match.status === "AWARDED" ||
        match.status === "IN_PLAY" ||
        match.status === "PAUSED",
    }));

    const finished = matches.filter(
      (m) =>
        m.scoreDom !== null &&
        m.scoreDom !== undefined &&
        m.scoreExt !== null &&
        m.scoreExt !== undefined
    );

    return res.status(200).json({
      ok: true,
      source: "football-data.org",
      competition: "FL1",
      season,
      matchday,
      total: matches.length,
      finished: finished.length,
      matches,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Erreur serveur football",
    });
  }
}
