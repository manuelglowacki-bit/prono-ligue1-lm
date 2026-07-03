import React, { useEffect, useMemo, useState } from 'react';

import { getApiUrl } from '../utils/apiUrl';
const MATCHS_KEY = 'prono_ligue1_lm_matchs_admin';

function emptyBonus(index) {
  return {
    id: `manual-bonus-${Date.now()}-${index}`,
    championnat: '',
    domicile: '',
    exterieur: '',
    date: '',
    heure: '',
    type: 'BONUS',
    scoreDomicile: null,
    scoreExterieur: null,
  };
}

export default function AdminBonusAI() {
  const [journee, setJournee] = useState('1');
  const [journees, setJournees] = useState(['1']);
  const [bonus, setBonus] = useState([emptyBonus(1), emptyBonus(2), emptyBonus(3)]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const matchs = JSON.parse(localStorage.getItem(MATCHS_KEY) || '[]');
    const foundJournees = [...new Set(matchs.map((m) => String(m.journee || '').trim()).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b));

    if (foundJournees.length > 0) {
      setJournees(foundJournees);
      setJournee(foundJournees[0]);
    }
  }, []);

  const hasCompleteBonus = useMemo(() => {
    return bonus.every((m) => m.domicile && m.exterieur && m.date && m.heure);
  }, [bonus]);

  async function proposerBonusIA() {
    setLoading(true);

    try {
      const response = await fetch(getApiUrl('/api/bonus/suggestions'));
      const text = await response.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('La route bonus IA ne rÃ©pond pas en JSON. VÃ©rifie que npm run api est bien relancÃ©.');
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Impossible de rÃ©cupÃ©rer les bonus IA.');
      }

      const suggestions = data.suggestions || [];

      const next = [0, 1, 2].map((index) => {
        const match = suggestions[index];

        if (!match) return emptyBonus(index);

        return {
          ...match,
          journee,
          type: 'BONUS',
        };
      });

      setBonus(next);
    } catch (error) {
      alert(`Erreur bonus IA : ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function updateBonus(index, field, value) {
    setBonus((old) =>
      old.map((match, i) =>
        i === index
          ? {
              ...match,
              [field]: value,
            }
          : match
      )
    );
  }

  function sauvegarderBonus() {
    if (!hasCompleteBonus) {
      alert('Il faut remplir les 3 matchs bonus avant de sauvegarder.');
      return;
    }

    const oldMatches = JSON.parse(localStorage.getItem(MATCHS_KEY) || '[]');

    const withoutOldBonusForDay = oldMatches.filter(
      (match) => !(match.type === 'BONUS' && String(match.journee) === String(journee))
    );

    const preparedBonus = bonus.map((match, index) => ({
      ...match,
      id: match.id || `bonus-${journee}-${Date.now()}-${index}`,
      journee: String(journee),
      type: 'BONUS',
      blocageDate: match.date,
      blocageHeure: match.heure,
      scoreDomicile: match.scoreDomicile ?? null,
      scoreExterieur: match.scoreExterieur ?? null,
    }));

    localStorage.setItem(
      MATCHS_KEY,
      JSON.stringify([...withoutOldBonusForDay, ...preparedBonus])
    );

    alert(`3 matchs bonus enregistrÃ©s pour la journÃ©e ${journee}.`);
  }

  return (
    <section
      style={{
        padding: '18px',
        borderRadius: '22px',
        background: 'linear-gradient(135deg, #111827, #1f2937)',
        color: 'white',
        marginBottom: '18px',
        boxShadow: '0 16px 38px rgba(15, 23, 42, 0.20)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '14px',
          alignItems: 'center',
          marginBottom: '14px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p
            style={{
              margin: '0 0 5px',
              color: '#22c55e',
              fontSize: '11px',
              fontWeight: 950,
              letterSpacing: '0.14em',
            }}
          >
            BONUS IA
          </p>

          <h2 style={{ margin: 0, fontSize: '24px' }}>
            Grosses affiches du week-end
          </h2>

          <p
            style={{
              margin: '6px 0 0',
              color: 'rgba(255,255,255,0.65)',
              fontWeight: 700,
              fontSize: '13px',
            }}
          >
            Angleterre Â· Italie Â· Espagne Â· Allemagne. Tu peux modifier les choix avant validation.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select
            value={journee}
            onChange={(e) => setJournee(e.target.value)}
            style={{
              padding: '11px 12px',
              borderRadius: '13px',
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(255,255,255,0.10)',
              color: 'white',
              fontWeight: 900,
              outline: 'none',
            }}
          >
            {journees.map((j) => (
              <option key={j} value={j} style={{ color: '#111827' }}>
                JournÃ©e {j}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={proposerBonusIA}
            disabled={loading}
            style={{
              border: 0,
              borderRadius: '13px',
              padding: '11px 14px',
              background: '#22c55e',
              color: '#052e16',
              fontWeight: 950,
              cursor: 'pointer',
            }}
          >
            {loading ? 'Recherche...' : 'Choix IA'}
          </button>

          <button
            type="button"
            onClick={sauvegarderBonus}
            style={{
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: '13px',
              padding: '11px 14px',
              background: 'rgba(255,255,255,0.10)',
              color: 'white',
              fontWeight: 950,
              cursor: 'pointer',
            }}
          >
            Enregistrer bonus
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '12px',
        }}
      >
        {bonus.map((match, index) => (
          <div
            key={index}
            style={{
              padding: '13px',
              borderRadius: '18px',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <div
              style={{
                marginBottom: '10px',
                fontSize: '12px',
                fontWeight: 950,
                color: '#22c55e',
              }}
            >
              Match bonus {index + 1}
            </div>

            <input
              value={match.championnat || ''}
              onChange={(e) => updateBonus(index, 'championnat', e.target.value)}
              placeholder="Championnat"
              style={inputStyle}
            />

            <input
              value={match.domicile || ''}
              onChange={(e) => updateBonus(index, 'domicile', e.target.value)}
              placeholder="Ã‰quipe domicile"
              style={inputStyle}
            />

            <input
              value={match.exterieur || ''}
              onChange={(e) => updateBonus(index, 'exterieur', e.target.value)}
              placeholder="Ã‰quipe extÃ©rieur"
              style={inputStyle}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input
                type="date"
                value={match.date || ''}
                onChange={(e) => updateBonus(index, 'date', e.target.value)}
                style={inputStyle}
              />

              <input
                type="time"
                value={match.heure || ''}
                onChange={(e) => updateBonus(index, 'heure', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  marginBottom: '8px',
  padding: '10px 11px',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.10)',
  color: 'white',
  fontWeight: 800,
  outline: 'none',
};



