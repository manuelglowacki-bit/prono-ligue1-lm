import { Sparkles } from 'lucide-react';

export default function PronosHeader({ isComplete, selectedDay, onValidate }) {
  return (
    <section className="pronos-hero card">
      <div>
        <div className="page-badge">
          <Sparkles size={14} />
          Clôture dans 2j 04h
        </div>
        <h1>Mes pronos</h1>
        <p>{`Journée ${selectedDay} · Ligue 1 2026/2027`}</p>
      </div>
      <button className="primary-btn" disabled={!isComplete} onClick={onValidate}>
        Valider mes pronos
      </button>
    </section>
  );
}
