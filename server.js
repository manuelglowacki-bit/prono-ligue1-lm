import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  return next();
});
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const API_KEY = process.env.FOOTBALL_DATA_KEY;
const COMPETITION = process.env.FOOTBALL_DATA_COMPETITION || 'FL1';
const SEASON = process.env.FOOTBALL_DATA_SEASON || '';
const API_BASE_URL = 'https://api.football-data.org/v4';

const BONUS_COMPETITIONS = [
  { code: 'PL', name: 'Premier League' },
  { code: 'SA', name: 'Serie A' },
  { code: 'PD', name: 'Liga' },
  { code: 'BL1', name: 'Bundesliga' },
];

const BIG_TEAMS = {
  PL: [
    'Arsenal FC',
    'Chelsea FC',
    'Liverpool FC',
    'Manchester City FC',
    'Manchester United FC',
    'Tottenham Hotspur FC',
    'Newcastle United FC',
  ],
  SA: [
    'FC Internazionale Milano',
    'Juventus FC',
    'AC Milan',
    'SSC Napoli',
    'AS Roma',
    'SS Lazio',
    'Atalanta BC',
  ],
  PD: [
    'Real Madrid CF',
    'FC Barcelona',
    'Club Atlético de Madrid',
    'Athletic Club',
    'Real Betis Balompié',
    'Sevilla FC',
    'Real Sociedad de Fútbol',
  ],
  BL1: [
    'FC Bayern München',
    'Borussia Dortmund',
    'Bayer 04 Leverkusen',
    'RB Leipzig',
    'VfB Stuttgart',
    'Eintracht Frankfurt',
  ],
};

async function footballDataFetch(endpoint) {
  if (!API_KEY || API_KEY === 'COLLE_TA_CLE_FOOTBALL_DATA_ICI') {
    throw new Error('Clé football-data manquante dans le fichier .env');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: {
      'X-Auth-Token': API_KEY,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Erreur football-data : ${response.status}`);
  }

  return data;
}

function formatMatch(item) {
  const utcDate = new Date(item.utcDate);

  return {
    id: `fd-${item.id}`,
    apiFixtureId: item.id,
    journee: String(item.matchday || ''),
    date: utcDate.toISOString().slice(0, 10),
    heure: utcDate.toTimeString().slice(0, 5),
    domicile: item.homeTeam?.name || '',
    exterieur: item.awayTeam?.name || '',
    logoDomicile: item.homeTeam?.crest || '',
    logoExterieur: item.awayTeam?.crest || '',
    type: 'L1',
    statut: item.status,
    statutLong: item.status,
    scoreDomicile: item.score?.fullTime?.home ?? null,
    scoreExterieur: item.score?.fullTime?.away ?? null,
    blocageDate: utcDate.toISOString().slice(0, 10),
    blocageHeure: utcDate.toTimeString().slice(0, 5),
  };
}

function formatBonusMatch(item, competition) {
  const utcDate = new Date(item.utcDate);

  return {
    id: `bonus-ai-${competition.code}-${item.id}`,
    apiFixtureId: item.id,
    journee: '',
    date: utcDate.toISOString().slice(0, 10),
    heure: utcDate.toTimeString().slice(0, 5),
    domicile: item.homeTeam?.name || '',
    exterieur: item.awayTeam?.name || '',
    logoDomicile: item.homeTeam?.crest || '',
    logoExterieur: item.awayTeam?.crest || '',
    championnat: competition.name,
    competitionCode: competition.code,
    type: 'BONUS',
    statut: item.status,
    statutLong: item.status,
    scoreDomicile: item.score?.fullTime?.home ?? null,
    scoreExterieur: item.score?.fullTime?.away ?? null,
    blocageDate: utcDate.toISOString().slice(0, 10),
    blocageHeure: utcDate.toTimeString().slice(0, 5),
  };
}

function seasonQuery() {
  return SEASON ? `?season=${SEASON}` : '';
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function bonusScore(match) {
  const bigTeams = BIG_TEAMS[match.competitionCode] || [];

  const homeBig = bigTeams.includes(match.domicile);
  const awayBig = bigTeams.includes(match.exterieur);

  let score = 0;

  if (homeBig) score += 50;
  if (awayBig) score += 50;
  if (homeBig && awayBig) score += 80;

  if (match.statut === 'SCHEDULED' || match.statut === 'TIMED') score += 20;

  const hour = Number(String(match.heure || '00:00').slice(0, 2));
  if (hour >= 18) score += 10;

  return score;
}

app.get('/api/test', (req, res) => {
  res.json({
    ok: true,
    message: 'API locale football-data OK',
  });
});

app.get('/api/ligue1/matchs', async (req, res) => {
  try {
    const data = await footballDataFetch(
      `/competitions/${COMPETITION}/matches${seasonQuery()}`
    );

    const matchs = data.matches.map(formatMatch);

    res.json({
      ok: true,
      competition: COMPETITION,
      total: matchs.length,
      matchs,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
});

app.get('/api/ligue1/scores', async (req, res) => {
  try {
    const data = await footballDataFetch(
      `/competitions/${COMPETITION}/matches${seasonQuery()}`
    );

    const matchs = data.matches
      .map(formatMatch)
      .filter((match) => match.scoreDomicile !== null && match.scoreExterieur !== null);

    res.json({
      ok: true,
      competition: COMPETITION,
      total: matchs.length,
      matchs,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
});

app.get('/api/ligue1/classement', async (req, res) => {
  try {
    const data = await footballDataFetch(
      `/competitions/${COMPETITION}/standings`
    );

    res.json({
      ok: true,
      competition: COMPETITION,
      classement: data.standings,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
});

app.get('/api/bonus/suggestions', async (req, res) => {
  try {
    let allMatches = [];

    for (const competition of BONUS_COMPETITIONS) {
      try {
        const data = await footballDataFetch(
          `/competitions/${competition.code}/matches?season=${SEASON}`
        );

        const matchs = (data.matches || []).map((item) =>
          formatBonusMatch(item, competition)
        );

        allMatches = [...allMatches, ...matchs];
      } catch (error) {
        console.log(`Bonus ignoré ${competition.name} : ${error.message}`);
      }
    }

    const suggestions = allMatches
      .sort((a, b) => {
        const scoreDiff = bonusScore(b) - bonusScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        return `${a.date} ${a.heure}`.localeCompare(`${b.date} ${b.heure}`);
      })
      .slice(0, 3);

    res.json({
      ok: true,
      total: suggestions.length,
      suggestions,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API locale football-data lancée : http://localhost:${PORT}`);
});


