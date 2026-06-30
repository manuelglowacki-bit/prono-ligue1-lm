import MatchCard from './MatchCard';

export default function PredictionProgress({ value = 0, label = '0 / 0 pronos remplis', matches = [], selections = [], onSelect = () => {} }) {
  return (
    <>
      <section className="progress-card card">
        <div className="progress-copy">
          <div>
            <p className="eyebrow">Progression</p>
            <h2>{label}</h2>
          </div>
          <span className="progress-value">{value}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${value}%` }} />
        </div>
      </section>

      <section className="matches-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ligue 1</p>
            <h2>Matchs Ã  pronostiquer</h2>
          </div>
        </div>

        <div className="matches-grid">
          {matches.map((match, index) => (
            <MatchCard
              key={`${match.home}-${match.away}`}
              match={match}
              selectedValue={selections[index]}
              onSelect={(value) => onSelect(index, value)}
            />
          ))}
        </div>
      </section>
    </>
  );
}
