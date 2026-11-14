import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface Props {
  date: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function DateNavigation({ date, onPrev, onNext, onToday }: Props) {
  const isToday = new Date().toDateString() === date.toDateString();
  return (
    <div className="date-controls">
      <button className="btn-date" onClick={onPrev} aria-label="Vorheriger Tag">
        <span>←</span> Vorheriger Tag
      </button>
      <span className="date-display">
        {date.toLocaleDateString('de-DE', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </span>
      <button className="btn-date" onClick={onNext} aria-label="Nächster Tag">
        Nächster Tag <span>→</span>
      </button>
      <button className={`btn-date ${isToday ? 'active' : ''}`} onClick={onToday}>
        Heute
      </button>
    </div>
  );
}
