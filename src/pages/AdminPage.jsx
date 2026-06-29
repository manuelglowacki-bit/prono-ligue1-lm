import Card from '../components/common/Card';
import Match from '../components/common/Match';
import { adminBonusMatches, adminMatches } from '../data/mockData';

export default function AdminPage() {
  const fake = {
    currentRound: 'J8',
    players: 28,
    pronosReceived: '24/28',
    leader: 'Laurent',
    aiCenter: [
      'Proposer bonus',
      'Analyse journÃ©e',
      'Badges',
      'TrophÃ©es',
      'Records',
    ],
  };

  return (
    <div className="premium-page">
      <div className="premium-hero">
        <div>
          <div className="premium-badge">
            <i /> Admin â€¢ Centre de contrÃ´le
          </div>
          <h1 className="premium-title">Tableau de bord admin</h1>
          <p className="premium-subtitle">Gestion premium des journÃ©es & de la partie IA (fictif)</p>
        </div>
        <div className="premium-cta-row" aria-label="Actions">
          <button className="premium-btn ghost" type="button">Historique</button>
          <button className="premium-btn" type="button">Sync IA</button>
        </div>
      </div>

      <div className="premium-grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginTop: 16 }}>
        <div className="premium-kpi gold">
          <small>Joueurs inscrits</small>
          <b>{fake.players}</b>
        </div>
        <div className="premium-kpi blue">
          <small>JournÃ©e en cours</small>
          <b>{fake.currentRound}</b>
        </div>
        <div className="premium-kpi cyan">
          <small>Pronos reÃ§us</small>
          <b>{fake.pronosReceived}</b>
        </div>
        <div className="premium-kpi">
          <small>Leader actuel</small>
          <b>{fake.leader}</b>
        </div>
      </div>

      <div className="premium-grid admin" style={{ marginTop: 16 }}>
        <div className="premium-card">
          <div className="premium-section-title">
            <h2 style={{ margin: 0 }}>Gestion des journÃ©es</h2>
            <span>{fake.currentRound}</span>
          </div>
          <div className="premium-cta-row" style={{ marginTop: 8 }}>
            <select
              style={{
                background: 'rgba(255,255,255,.05)',
                color: 'var(--text)',
                border: '1px solid rgba(255,255,255,.10)',
                borderRadius: 999,
                padding: '10px 14px',
                fontWeight: 900,
              }}
              defaultValue={fake.currentRound}
            >
              <option>{fake.currentRound}</option>
              <option>J7</option>
              <option>J9</option>
            </select>
            <button className="premium-btn ghost" type="button">Modifier dates et horaires</button>
          </div>
          <div style={{ height: 10 }} />
          <button className="premium-btn danger" type="button">Fermer les pronos</button>

          <div style={{ height: 18 }} />

          <div className="premium-section-title">
            <h2 style={{ margin: 0 }}>Gestion des matchs</h2>
            <span>Fixture</span>
          </div>

          <div className="premium-list">
            {adminMatches.map((m) => (
              <div key={`${m[0]}-${m[1]}`} className="premium-rowline">
                <b style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ color: '#2d7cff', fontWeight: 1000 }}>âš¡</span>
                  <span style={{ flex: 1 }}>{m[0]} vs {m[1]}</span>
                </b>
                <span style={{ color: '#ffd400', fontWeight: 1000 }}>â€º</span>
              </div>
            ))}
          </div>
        </div>

        <div className="premium-card flat">
          <div className="premium-section-title">
            <h2 style={{ margin: 0 }}>Matchs bonus</h2>
            <span>Curated</span>
          </div>
          <div className="premium-cta-row" style={{ marginTop: 10 }}>
            <button className="premium-btn ghost" type="button">Choisir manuellement</button>
            <button className="premium-btn" type="button">Proposer par IA</button>
          </div>

          <div style={{ height: 14 }} />

          <div className="premium-list">
            {adminBonusMatches.map((x) => (
              <div key={x} className="premium-rowline">
                <b>{x}</b>
                <span style={{ color: '#2d7cff', fontWeight: 1000, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  âœ“
                </span>
              </div>
            ))}
          </div>

          <div style={{ height: 18 }} />

          <div className="premium-section-title">
            <h2 style={{ margin: 0 }}>Centre IA</h2>
            <span>Machine</span>
          </div>
          <div className="premium-chart" style={{ height: 120 }}>
            <span>Proposer bonus â€¢ Analyse journÃ©e â€¢ Badges â€¢ TrophÃ©es â€¢ Records</span>
          </div>
          <div style={{ height: 12 }} />
          <button className="premium-btn" type="button" style={{ width: '100%' }}>
            ClÃ´turer la journÃ©e J8
          </button>
        </div>
      </div>

      {/* keep existing component import usage for bundle safety */}
      <div style={{ display: 'none' }}>
        <Card>
          <Match a="A" b="B" />
        </Card>
      </div>
    </div>
  );
}

