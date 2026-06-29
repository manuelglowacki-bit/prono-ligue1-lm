import React, { useEffect, useMemo, useState } from 'react';
import '../styles/adminAutoReminder.css';

const ACCOUNTS_KEY = 'prono_ligue1_lm_accounts';
const MATCHS_KEY = 'prono_ligue1_lm_matchs_admin';
const PRONOS_KEY = 'prono_ligue1_lm_pronos_joueurs';
const VALIDATIONS_KEY = 'prono_ligue1_lm_validations_journees';
const AUTO_REMINDER_SENT_KEY = 'prono_ligue1_lm_auto_reminders_sent';
const AUTO_ENABLED_KEY = 'prono_ligue1_lm_auto_reminder_enabled';

function safeJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function normalizeDate(date) {
  const value = String(date || '').trim();

  if (!value) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/');
    return `${year}-${month}-${day}`;
  }

  return value;
}

function parseMatchDate(match) {
  const date = normalizeDate(match.date);
  const heure = String(match.heure || match.time || '00:00').trim();

  if (!date) return null;

  const parsed = new Date(`${date}T${heure}`);

  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

function getPlayerValidated(validations, player, journee) {
  const keys = [
    `${player}-J${journee}`,
    `${player}_${journee}`,
    `${player}-${journee}`,
    `J${journee}-${player}`,
  ];

  return keys.some((key) => Boolean(validations?.[key]));
}

function getPlayerHasPronos(pronos, player, matches) {
  const playerPronos = pronos?.[player] || {};

  return matches.some((match) => {
    const prono = playerPronos[match.id];

    if (!prono) return false;

    const hasResult =
      prono.value !== undefined &&
      prono.value !== null &&
      prono.value !== '';

    const hasScore =
      prono.home !== undefined &&
      prono.home !== null &&
      prono.home !== '' &&
      prono.away !== undefined &&
      prono.away !== null &&
      prono.away !== '';

    return hasResult || hasScore;
  });
}

function getFirstMatchByJournee(matches, journee) {
  return matches
    .filter((match) => String(match.journee) === String(journee))
    .map((match) => ({
      ...match,
      startDate: parseMatchDate(match),
    }))
    .filter((match) => match.startDate)
    .sort((a, b) => a.startDate - b.startDate)[0];
}

function shouldSendAIReminder(firstMatchDate, alreadySent, force = false) {
  if (force) return true;
  if (!firstMatchDate) return false;
  if (alreadySent) return false;

  const now = new Date();
  const diff = firstMatchDate.getTime() - now.getTime();
  const sixHoursMs = 6 * 60 * 60 * 1000;

  return diff > 0 && diff <= sixHoursMs;
}

function buildAIReminderText(journee, firstMatch, missingPlayers) {
  const names = missingPlayers
    .map((account) => account.displayName || account.player)
    .join(', ');

  const matchLabel = firstMatch
    ? `${firstMatch.domicile || 'Équipe A'} - ${firstMatch.exterieur || 'Équipe B'}`
    : `Journée ${journee}`;

  if (missingPlayers.length === 1) {
    return `IA Rappel : la journée ${journee} approche. ${names} n’a pas encore validé ses pronos. Premier match : ${matchLabel}. Pense à le relancer avant le blocage.`;
  }

  return `IA Rappel : la journée ${journee} approche. ${missingPlayers.length} joueurs n’ont pas encore validé leurs pronos : ${names}. Premier match : ${matchLabel}. Il faut les relancer avant le blocage.`;
}

export default function AdminAutoReminder() {
  const [lastAlert, setLastAlert] = useState('');
  const [nextCheck, setNextCheck] = useState('');
  const [autoEnabled, setAutoEnabled] = useState(
    localStorage.getItem(AUTO_ENABLED_KEY) !== 'false'
  );

  function sendAlert(message) {
    if ('vibrate' in navigator) {
      navigator.vibrate([250, 100, 250]);
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('IA Rappel pronos', {
        body: message,
      });
    }

    setLastAlert(message);
  }

  async function activateNotifications() {
    if (!('Notification' in window)) {
      setLastAlert('Notifications non disponibles sur ce navigateur.');
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      setLastAlert('Notifications autorisées.');
    } else {
      setLastAlert('Notifications refusées par le navigateur.');
    }
  }

  function toggleAuto() {
    const next = !autoEnabled;

    setAutoEnabled(next);
    localStorage.setItem(AUTO_ENABLED_KEY, String(next));
  }

  function checkReminders(force = false) {
    if (!autoEnabled && !force) return;

    const accounts = safeJson(ACCOUNTS_KEY, []);
    const matches = safeJson(MATCHS_KEY, []);
    const pronos = safeJson(PRONOS_KEY, {});
    const validations = safeJson(VALIDATIONS_KEY, {});
    const alreadySent = safeJson(AUTO_REMINDER_SENT_KEY, {});

    const safeAccounts = Array.isArray(accounts) ? accounts : [];
    const safeMatches = Array.isArray(matches) ? matches : [];

    const journees = [...new Set(
      safeMatches
        .map((match) => Number(match.journee || 0))
        .filter(Boolean)
    )].sort((a, b) => a - b);

    let found = false;

    journees.forEach((journee) => {
      const firstMatch = getFirstMatchByJournee(safeMatches, journee);

      if (!firstMatch) return;

      const sentKey = `J${journee}-${firstMatch.id || firstMatch.startDate.toISOString()}`;

      const isReady = shouldSendAIReminder(
        firstMatch.startDate,
        alreadySent[sentKey],
        force
      );

      if (!isReady) return;

      const matchesForDay = safeMatches.filter(
        (match) => String(match.journee) === String(journee)
      );

      const missingPlayers = safeAccounts.filter((account) => {
        const validated = getPlayerValidated(validations, account.player, journee);
        const hasPronos = getPlayerHasPronos(pronos, account.player, matchesForDay);

        return !validated || !hasPronos;
      });

      if (missingPlayers.length === 0) return;

      const message = buildAIReminderText(journee, firstMatch, missingPlayers);

      sendAlert(message);

      alreadySent[sentKey] = {
        journee,
        sentAt: new Date().toISOString(),
        missingPlayers: missingPlayers.map((account) => account.player),
      };

      localStorage.setItem(AUTO_REMINDER_SENT_KEY, JSON.stringify(alreadySent));

      found = true;
    });

    if (!found && force) {
      setLastAlert('IA : aucun rappel à envoyer maintenant.');
    }

    setNextCheck(new Date().toLocaleTimeString());
  }

  useEffect(() => {
    checkReminders();

    const interval = setInterval(() => {
      checkReminders();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [autoEnabled]);

  const statusText = useMemo(() => {
    return autoEnabled ? 'ON' : 'OFF';
  }, [autoEnabled]);

  return (
    <section className="admin-auto-reminder">
      <div>
        <p>IA RAPPEL AUTO</p>
        <h2>IA automatique 6h avant match</h2>
        <span>
          L’IA contrôle les validations et prévient l’admin automatiquement.
        </span>
      </div>

      <div className="admin-auto-reminder-actions">
        <button
          type="button"
          className={autoEnabled ? 'auto-on' : 'auto-off'}
          onClick={toggleAuto}
        >
          IA {statusText}
        </button>

        <button type="button" onClick={activateNotifications}>
          Autoriser notifications
        </button>

        <button type="button" className="test" onClick={() => checkReminders(true)}>
          Tester l’IA
        </button>
      </div>

      {nextCheck && (
        <small>Dernier contrôle : {nextCheck}</small>
      )}

      {lastAlert && (
        <div className="admin-auto-reminder-alert">
          {lastAlert}
        </div>
      )}
    </section>
  );
}
