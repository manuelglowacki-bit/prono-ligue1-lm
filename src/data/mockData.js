export const players = ['Laurent','Quentin','Jo B','Jonathan','Eric L','Yannis','Giovani','Manu','David J','Samuel'];

export const teams = ['RC Lens','OM','PSG','LOSC','OL','Monaco','Nantes','Rennes','Strasbourg','Nice'];

export const ranking = players.map((p, i) => ({
  p,
  pts: [52, 50, 48, 46, 45, 44, 43, 41, 40, 39][i],
  exact: [3, 2, 1, 2, 1, 1, 0, 1, 0, 1][i],
  evo: [2, -1, 0, 4, -1, -1, 0, 1, -1, 0][i],
  club: teams[i],
}));

export const nextMatches = [
  { a: 'PSG', b: 'Nantes' },
  { a: 'OM', b: 'RC Lens' },
  { a: 'OL', b: 'Monaco' },
];

export const pronosMatches = [
  ['PSG', 'Nantes'],
  ['OM', 'Rennes'],
  ['Lens', 'Lille'],
  ['Nice', 'Monaco'],
  ['OL', 'Toulouse'],
];

export const bonusMatches = [
  ['Premier League', 'Man City - Liverpool'],
  ['La Liga', 'Real Madrid - BarÃ§a'],
  ['Serie A', 'Juventus - Milan'],
];

export const trophies = [
  'Champion',
  'Vice-champion',
  '3e place',
  'Record points',
  'Record 1N2',
  'Record cÅ“ur',
  'Record bonus',
];

export const badges = [
  'Leader Laurent',
  'Roi du 1N2 Samuel',
  'Roi Ã©quipe de cÅ“ur Manu',
  'Roi bonus Jonathan',
  'Roi scores exacts Eric L',
];

export const trophyProgressions = [
  '10 scores exacts',
  '20 points Ã©quipe de cÅ“ur',
  '30 points bonus',
  'Leader 10 journÃ©es',
];

export const hallOfFame = players.slice(0, 8).map((p, i) => ({
  name: p,
  count: 18 - i,
}));

export const adminMatches = [
  ['Lille', 'Monaco'],
  ['Marseille', 'Lyon'],
  ['Lens', 'Nantes'],
];

export const adminBonusMatches = [
  'Man City - Arsenal',
  'Real Madrid - BarÃ§a',
  'Inter - Juventus',
];

export const days = ['J1', 'J2', 'J3', 'J4', 'J5'];
