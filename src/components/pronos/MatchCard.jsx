import { CalendarDays, Clock3 } from 'lucide-react';
import PredictionButtons from './PredictionButtons';

export default function MatchCard({ match, selectedValue, onSelect }) {
  return (
    <article className={`match-card ${selectedValue ? 'selected' : ''}`}>
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
          <div className="team-logo">{match.homeLabel || 'R'}</div>
          <span>{match.home}</span>
        </div>
        <div className="vs-pill">VS</div>
        <div className="team-pill">
          <div className="team-logo">{match.awayLabel || 'P'}</div>
          <span>{match.away}</span>
        </div>
      </div>

      <PredictionButtons selectedValue={selectedValue} onSelect={onSelect} />
    </article>
  );
}

