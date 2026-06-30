export default function BonusMatchCard({ bonusChoices, selectedBonus, onSelectBonus, bonusScore, onBonusScoreChange }) {
  const activeBonus = bonusChoices.find((option) => option.label === selectedBonus) || bonusChoices[0] || {};

  return (
    <section className="card bonus-card">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Bonus</p>
          <h2>Match bonus de la journée</h2>
        </div>
        <span className="bonus-badge">Score exact = 3 pts</span>
      </div>

      <div className="bonus-options">
        {bonusChoices.map((option) => (
          <button
            key={option.label}
            type="button"
            className={`bonus-option ${selectedBonus === option.label ? 'selected' : ''}`}
            onClick={() => onSelectBonus(option.label)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="score-inputs bonus-score-inputs">
        <label>
          <span>{activeBonus.home || 'Équipe 1'}</span>
          <input value={bonusScore.home} onChange={(event) => onBonusScoreChange('home', event.target.value)} />
        </label>
        <label>
          <span>{activeBonus.away || 'Équipe 2'}</span>
          <input value={bonusScore.away} onChange={(event) => onBonusScoreChange('away', event.target.value)} />
        </label>
      </div>
    </section>
  );
}
