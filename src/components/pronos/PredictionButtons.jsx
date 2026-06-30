export default function PredictionButtons({ selectedValue, onSelect }) {
  const options = [
    { value: '1', label: '1' },
    { value: 'N', label: 'N', neutral: true },
    { value: '2', label: '2' },
  ];

  return (
    <div className="prediction-buttons">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`prediction-btn ${option.neutral ? 'neutral' : ''} ${selectedValue === option.value ? 'selected' : ''}`}
          onClick={() => onSelect(option.value)}
          aria-pressed={selectedValue === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
