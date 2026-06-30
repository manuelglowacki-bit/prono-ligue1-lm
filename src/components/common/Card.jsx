export default function Card({ children, cls = '' }) {
  return <section className={'card ' + cls}>{children}</section>;
}
