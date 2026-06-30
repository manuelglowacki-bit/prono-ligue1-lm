export default function StickySummary({ filledCount, totalCount, isComplete, pointsMax, pointsEarned }) {
  return (
    <aside className="pronos-summary card">
      <div className="summary-top">
        <p className="eyebrow">Résumé</p>
        <h3>Ma journée</h3>
      </div>

      <div className="summary-stats">
        <div>
          <span>Pronos remplis</span>
          <strong>{filledCount} / {totalCount}</strong>
        </div>
        <div>
          <span>Points</span>
          <strong>{pointsEarned} / {pointsMax} pts</strong>
        </div>
        <div>
          <span>Équipe de cÅ“ur</span>
          <strong>RC Lens</strong>
        </div>
        <div>
          <span>Bonus</span>
          <strong>Liverpool - Arsenal</strong>
        </div>
      </div>

      <button className="primary-btn full" disabled={!isComplete}>
        Valider mes pronos
      </button>
      <p className="summary-hint">Les pronos restent cachés jusqu'Ã  la clôture.</p>
    </aside>
  );
}
