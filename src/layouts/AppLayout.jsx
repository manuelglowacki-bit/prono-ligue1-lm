import { isAdminSession } from '../utils/authSecurity';
import React from 'react';

const menuItems = [
  { label: 'Accueil', short: 'ACC' },
  { label: 'Pronos', short: 'PRO' },
  { label: 'Classement', short: 'CLS' },
  { label: 'Stats', short: 'STA' },
  { label: 'La Gazette', short: 'GAZ' },
  { label: 'TrophÃ©es', short: 'TRP' },
  { label: 'Profil', short: 'PRF' },
  { label: 'Admin', short: 'ADM' },
];

  const visibleMenuItems = menuItems.filter((item) => {
    const label = item.label || item.key || '';
    return label !== 'Admin' || isAdminSession();
  });

export default function AppLayout({ page, setPage, children }) {
  return (
    <div className="fc-app">
      <aside className="fc-sidebar">
        <div className="fc-brand">
          <div className="fc-logo">LM</div>

          <div>
            <strong>PRONO LM</strong>
            <span>SAISON 26/27</span>
          </div>
        </div>

        <nav className="fc-nav">
          {visibleMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={page === item.label ? 'active' : ''}
              onClick={() => setPage(item.label)}
            >
              <small>{item.short}</small>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="fc-footer-card">
          <span>STATUS</span>
          <strong>ONLINE</strong>
        </div>
      </aside>

      <main className="fc-main">
        <header className="fc-topbar">
          <div>
            <span className="fc-kicker">PRONO LIGUE 1 LM</span>
            <h1>{page}</h1>
          </div>

          <div className="fc-profile">
            <div className="fc-avatar">M</div>

            <div>
              <strong>Manu</strong>
              <span>Manager</span>
            </div>
          </div>
        </header>

        <section className="fc-content">{children}</section>
      </main>

      <style>
        {`
          :root {
            --bg-main: #060a10;
            --bg-soft: #0b111a;
            --bg-card: #101823;
            --bg-card-light: #141e2b;
            --border: rgba(255, 255, 255, 0.07);
            --text-main: #eef3f8;
            --text-muted: #8b97a6;
            --accent: #b8ff2c;
            --accent-soft: rgba(184, 255, 44, 0.12);
            --danger: #ff4d5e;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body,
          #root {
            min-height: 100%;
          }

          body {
            margin: 0;
            background: var(--bg-main);
            color: var(--text-main);
            font-family: Bahnschrift, "Segoe UI Variable", "Segoe UI", Arial, sans-serif;
            font-size: 12px;
            letter-spacing: 0.01em;
          }

          button,
          input,
          select,
          textarea {
            font-family: inherit;
          }

          button {
            transition: 0.16s ease;
          }

          button:hover {
            transform: translateY(-1px);
          }

          .fc-app {
            min-height: 100vh;
            display: flex;
            background:
              radial-gradient(circle at 12% 8%, rgba(184, 255, 44, 0.08), transparent 26%),
              radial-gradient(circle at 88% 92%, rgba(255, 255, 255, 0.04), transparent 30%),
              linear-gradient(135deg, #060a10 0%, #0b111a 52%, #05070b 100%);
          }

          .fc-sidebar {
            width: 220px;
            min-height: 100vh;
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 14px;
            background: rgba(8, 13, 20, 0.92);
            border-right: 1px solid var(--border);
          }

          .fc-brand {
            height: 58px;
            padding: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
            border-radius: 18px;
            background: var(--bg-card);
            border: 1px solid var(--border);
          }

          .fc-logo {
            width: 38px;
            height: 38px;
            border-radius: 13px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--accent);
            color: #05070b;
            font-size: 13px;
            font-weight: 1000;
            letter-spacing: -0.04em;
          }

          .fc-brand strong {
            display: block;
            font-size: 12px;
            line-height: 1;
            font-weight: 1000;
            letter-spacing: 0.08em;
          }

          .fc-brand span {
            display: block;
            margin-top: 5px;
            font-size: 10px;
            font-weight: 900;
            color: var(--text-muted);
          }

          .fc-nav {
            display: flex;
            flex-direction: column;
            gap: 5px;
          }

          .fc-nav button {
            width: 100%;
            height: 38px;
            border: 0;
            border-radius: 13px;
            padding: 0 10px;
            display: grid;
            grid-template-columns: 34px 1fr;
            align-items: center;
            text-align: left;
            background: transparent;
            color: var(--text-muted);
            cursor: pointer;
          }

          .fc-nav button small {
            width: 28px;
            height: 22px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.055);
            color: #778292;
            font-size: 9px;
            font-weight: 1000;
          }

          .fc-nav button span {
            font-size: 12px;
            font-weight: 900;
          }

          .fc-nav button:hover {
            background: rgba(255, 255, 255, 0.055);
            color: var(--text-main);
          }

          .fc-nav button.active {
            background: var(--accent);
            color: #05070b;
          }

          .fc-nav button.active small {
            background: rgba(0, 0, 0, 0.12);
            color: #05070b;
          }

          .fc-footer-card {
            margin-top: auto;
            padding: 12px;
            border-radius: 16px;
            background: var(--accent-soft);
            border: 1px solid rgba(184, 255, 44, 0.18);
          }

          .fc-footer-card span {
            display: block;
            margin-bottom: 5px;
            font-size: 10px;
            font-weight: 1000;
            color: rgba(184, 255, 44, 0.7);
            letter-spacing: 0.1em;
          }

          .fc-footer-card strong {
            display: block;
            font-size: 12px;
            color: var(--accent);
          }

          .fc-main {
            flex: 1;
            min-width: 0;
            padding: 14px;
          }

          .fc-topbar {
            height: 68px;
            margin-bottom: 14px;
            padding: 12px 14px;
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            background: rgba(16, 24, 35, 0.86);
            border: 1px solid var(--border);
          }

          .fc-kicker {
            display: block;
            margin-bottom: 5px;
            font-size: 10px;
            font-weight: 1000;
            letter-spacing: 0.13em;
            color: var(--text-muted);
          }

          .fc-topbar h1 {
            margin: 0;
            font-size: 22px;
            line-height: 1;
            font-weight: 1000;
            letter-spacing: -0.035em;
            color: var(--text-main);
          }

          .fc-profile {
            height: 42px;
            padding: 5px 9px 5px 5px;
            display: flex;
            align-items: center;
            gap: 8px;
            border-radius: 15px;
            background: rgba(255, 255, 255, 0.045);
            border: 1px solid var(--border);
          }

          .fc-avatar {
            width: 32px;
            height: 32px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--accent-soft);
            color: var(--accent);
            font-size: 12px;
            font-weight: 1000;
          }

          .fc-profile strong {
            display: block;
            font-size: 11px;
            line-height: 1;
          }

          .fc-profile span {
            display: block;
            margin-top: 4px;
            font-size: 10px;
            font-weight: 800;
            color: var(--text-muted);
          }

          .fc-content {
            width: 100%;
          }

          /* Harmonisation globale */
          .hm-page,
          .pp-page,
          .aj-page {
            font-size: 12px !important;
            color: var(--text-main) !important;
          }

          .hm-hero,
          .hm-card,
          .hm-stat,
          .pp-section,
          .pp-card,
          .pp-stats div,
          .aj-card,
          .aj-section,
          .aj-stats div,
          .aj-control-card {
            background: var(--bg-card) !important;
            border: 1px solid var(--border) !important;
            box-shadow: none !important;
          }

          .hm-hero,
          .aj-card {
            border-radius: 20px !important;
            padding: 18px !important;
          }

          .pp-card,
          .hm-card,
          .hm-stat,
          .aj-section,
          .pp-section {
            border-radius: 18px !important;
          }

          .hm-hero h1,
          .pp-header h1,
          .aj-header h1 {
            font-size: 24px !important;
            color: var(--text-main) !important;
            letter-spacing: -0.04em !important;
          }

          .hm-hero p,
          .pp-header p,
          .aj-header p,
          .hm-card p,
          .pp-section-head p,
          .aj-section-head p {
            font-size: 12px !important;
            color: var(--text-muted) !important;
          }

          .hm-card h2,
          .pp-section-head h2,
          .aj-section-head h2 {
            font-size: 16px !important;
            color: var(--text-main) !important;
          }

          .hm-stat strong,
          .pp-stats strong,
          .aj-stats strong {
            font-size: 22px !important;
            color: var(--text-main) !important;
          }

          .hm-primary,
          .pp-actions button,
          .aj-button,
          .aj-small-button,
          .aj-small-danger,
          .pp-filters button,
          .aj-tabs button {
            min-height: 34px !important;
            border-radius: 12px !important;
            font-size: 11px !important;
            font-weight: 1000 !important;
          }

          .hm-primary,
          .pp-actions .pp-validate,
          .aj-button,
          .pp-filters button.active,
          .aj-tabs button.active,
          .pp-result-buttons button.active,
          .pp-versus {
            background: var(--accent) !important;
            color: #05070b !important;
          }

          .pp-actions .pp-danger,
          .aj-danger,
          .aj-mini-danger {
            background: var(--danger) !important;
            color: #fff !important;
          }

          .pp-type,
          .pp-journee,
          .pp-status,
          .aj-badge {
            font-size: 10px !important;
            padding: 5px 8px !important;
          }

          .pp-team {
            background: var(--bg-card-light) !important;
          }

          .pp-team span {
            font-size: 13px !important;
          }

          .pp-result-buttons button,
          .pp-score input,
          .aj-table input,
          .aj-table select,
          .aj-control-card input,
          .aj-control-card select {
            background: #0b111a !important;
            color: var(--text-main) !important;
            border: 1px solid var(--border) !important;
            font-size: 11px !important;
            border-radius: 10px !important;
          }

          .aj-table th {
            font-size: 9px !important;
            color: var(--text-muted) !important;
          }

          .aj-table td {
            font-size: 11px !important;
          }

          @media (max-width: 900px) {
            .fc-app {
              flex-direction: column;
            }

            .fc-sidebar {
              width: 100%;
              min-height: auto;
              border-right: 0;
              border-bottom: 1px solid var(--border);
            }

            .fc-brand {
              height: 50px;
            }

            .fc-nav {
              flex-direction: row;
              overflow-x: auto;
              padding-bottom: 3px;
            }

            .fc-nav button {
              width: auto;
              min-width: 112px;
            }

            .fc-footer-card {
              display: none;
            }
          }

          @media (max-width: 600px) {
            .fc-main {
              padding: 10px;
            }

            .fc-topbar {
              height: auto;
              align-items: flex-start;
              flex-direction: column;
            }

            .fc-profile {
              width: 100%;
            }
          }
        `}
      </style>
    </div>
  );
}








