export default function PronosSummary() {
  return (
    <aside className="pronos-summary card">
      <div className="summary-top">
        <p className="eyebrow">Résumé</p>
        <h3>Ma journée</h3>
      </div>

      <div className="summary-stats">
        <div>
          <span>Pronos remplis</span>
          <strong>6 / 9</strong>
        </div>
        <div>
          <span>Points max</span>
          <strong>18 pts</strong>
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

      <button className="primary-btn full">Valider mes pronos</button>
      <p className="summary-hint">Les pronos restent cachés jusqu'Ã  la clôture.</p>
    </aside>
  );
}
