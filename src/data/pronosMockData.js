const teamPairs = [
  ['RC Lens', 'PSG'],
  ['OM', 'Lyon'],
  ['Lille', 'Monaco'],
  ['Nantes', 'Rennes'],
  ['Strasbourg', 'Nice'],
  ['Toulouse', 'Brest'],
  ['Le Havre', 'Auxerre'],
  ['Angers', 'Montpellier'],
  ['Reims', 'Saint-Ã‰tienne'],
  ['Marseille', 'Clermont'],
];

const buildDayMatches = (dayNumber) =>
  Array.from({ length: 6 }, (_, index) => {
    const [home, away] = teamPairs[(dayNumber + index) % teamPairs.length];
    const homeLabel = home.split(' ').map((part) => part[0]).join('').slice(0, 2);
    const awayLabel = away.split(' ').map((part) => part[0]).join('').slice(0, 2);
    const resultSequence = ['1', 'N', '2'];
    const correctResult = resultSequence[(dayNumber + index) % resultSequence.length];

    return {
      home,
      away,
      homeLabel,
      awayLabel,
      date: `J${dayNumber}`,
      time: `${17 + ((dayNumber + index) % 5)}:00`,
      competition: 'Ligue 1',
      points: '1 pt',
      correctResult,
    };
  });

const buildBonusChoices = () => [
  {
    label: 'Real Madrid vs AtlÃ©tico',
    value: 'Real Madrid - AtlÃ©tico',
    home: 'Real Madrid',
    away: 'AtlÃ©tico',
    correctResult: '1',
    correctScore: { home: 2, away: 1 },
  },
  {
    label: 'Liverpool vs Arsenal',
    value: 'Liverpool - Arsenal',
    home: 'Liverpool',
    away: 'Arsenal',
    correctResult: '2',
    correctScore: { home: 0, away: 2 },
    selected: true,
  },
  {
    label: 'Bayern vs Dortmund',
    value: 'Bayern - Dortmund',
    home: 'Bayern',
    away: 'Dortmund',
    correctResult: 'N',
    correctScore: { home: 1, away: 1 },
  },
];

export const heartMatchData = {
  home: 'RC Lens',
  away: 'PSG',
  correctResult: '1',
  correctScore: { home: 2, away: 1 },
};

export const pronosDaysData = Array.from({ length: 34 }, (_, index) => ({
  day: index + 1,
  matches: buildDayMatches(index + 1),
  bonusChoices: buildBonusChoices(),
}));

export const pronosRounds = pronosDaysData.map(({ day }) => `J${day}`);
export const pronosMatches = pronosDaysData[0].matches;
export const pronosBonusChoices = pronosDaysData[0].bonusChoices;
