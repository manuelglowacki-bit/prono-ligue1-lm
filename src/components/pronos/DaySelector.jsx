export default function DaySelector({ days, activeDay = 0, onSelectDay }) {
  return (
    <section className="rounds-strip card">
      <div className="rounds-label">JournÃ©es</div>
      <div className="rounds-scroll">
        {days.map((day, index) => (
          <button
            key={day}
            type="button"
            className={`round-pill ${index === activeDay ? 'active' : ''}`}
            onClick={() => onSelectDay(index)}
          >
            {day}
          </button>
        ))}
      </div>
    </section>
  );
}
