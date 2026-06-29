import BonusMatchCard from './BonusMatchCard';

export default function FavoriteTeamCard({
  bonusChoices = [],
  selectedBonus,
  onSelectBonus,
  bonusScore,
  onBonusScoreChange,
  heartScore,
  onHeartScoreChange,
}) {
  return (
    <div className="lower-grid">
      <section className="card heart-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Ã‰quipe de cÅ“ur</p>
            <h2>Ton Ã©quipe de cÅ“ur : RC Lens</h2>
          </div>
        </div>

        <div className="heart-match">
          <div className="team-pill">
            <div className="team-logo">R</div>
            <span>RC Lens</span>
          </div>
          <div className="vs-pill">VS</div>
          <div className="team-pill">
            <div className="team-logo">P</div>
            <span>PSG</span>
          </div>
        </div>

        <div className="score-inputs">
          <label>
            <span>RC Lens</span>
            <input value={heartScore.home} onChange={(event) => onHeartScoreChange('home', event.target.value)} placeholder="0" />
          </label>
          <label>
            <span>PSG</span>
            <input value={heartScore.away} onChange={(event) => onHeartScoreChange('away', event.target.value)} placeholder="0" />
          </label>
        </div>

        <p className="helper-text">Score exact = 2 pts Â· Bon rÃ©sultat = 1 pt</p>
      </section>

      <BonusMatchCard
        bonusChoices={bonusChoices}
        selectedBonus={selectedBonus}
        onSelectBonus={onSelectBonus}
        bonusScore={bonusScore}
        onBonusScoreChange={onBonusScoreChange}
      />
    </div>
  );
}
