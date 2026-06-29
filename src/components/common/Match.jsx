export default function Match({ a, b }) {
  return (
    <div className="match">
      <span className="crest">âš½</span>
      <b>{a}</b>
      <strong>VS</strong>
      <b>{b}</b>
      <span className="crest">âš½</span>
    </div>
  );
}
