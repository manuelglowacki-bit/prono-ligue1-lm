import { CalendarDays, Clock3 } from 'lucide-react';

export default function MatchPredictionCard({ match }) {
  return (
    <article key={`${match.home}-${match.away}`} className={`match-card ${match.selected ? 'selected' : ''}`}>
      <div className="match-card-top">
        <span className="match-competition">{match.competition}</span>
        <span className="match-points">{match.points}</span>
      </div>

      <div className="match-meta">
        <span>
          <CalendarDays size={14} />
          {match.date}
        </span>
        <span>
          <Clock3 size={14} />
          {match.time}
        </span>
      </div>

      <div className="match-teams">
        <div className="team-pill">
          <div className="team-logo">R</div>
          <span>{match.home}</span>
        </div>
        <div className="vs-pill">VS</div>
        <div className="team-pill">
          <div className="team-logo">P</div>
          <span>{match.away}</span>
        </div>
      </div>

      <div className="prediction-buttons">
        <button className="prediction-btn">1</button>
        <button className="prediction-btn neutral">N</button>
        <button className="prediction-btn">2</button>
      </div>
    </article>
  );
}
