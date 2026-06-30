import React, { useEffect, useState } from 'react';
import '../styles/adminAccounts.css';

const ACCOUNTS_KEY = 'prono_ligue1_lm_accounts';
const SESSION_KEY = 'prono_ligue1_lm_session';

function safeJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export default function AdminAccounts() {
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    setAccounts(safeJson(ACCOUNTS_KEY, []));
  }, []);

  function deleteAccount(targetPlayer) {
    const nextAccounts = accounts.filter((account) => account.player !== targetPlayer);

    setAccounts(nextAccounts);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(nextAccounts));

    const session = safeJson(SESSION_KEY, null);

    if (session?.player === targetPlayer) {
      localStorage.removeItem(SESSION_KEY);
      window.location.reload();
    }
  }

  function makeAdmin(targetPlayer) {
    const nextAccounts = accounts.map((account) => ({
      ...account,
      role: account.player === targetPlayer ? 'admin' : account.role,
    }));

    setAccounts(nextAccounts);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(nextAccounts));
  }

  return (
    <section className="admin-accounts-panel">
      <div className="admin-accounts-header">
        <div>
          <p>COMPTES JOUEURS</p>
          <h2>Joueurs inscrits</h2>
          <span>Les joueurs sont ajoutés automatiquement après inscription.</span>
        </div>
      </div>

      <div className="admin-accounts-list">
        {accounts.length === 0 ? (
          <div className="admin-account-empty">
            Aucun compte inscrit pour le moment.
          </div>
        ) : (
          accounts.map((account) => (
            <article key={account.player}>
              <div>
                <strong>
                  {account.displayName || account.player}
                  {account.role === 'admin' ? ' · Admin' : ''}
                </strong>
                <span>{account.email}</span>
              </div>

              <div className="admin-account-actions">
                {account.role !== 'admin' && (
                  <button type="button" className="admin" onClick={() => makeAdmin(account.player)}>
                    Admin
                  </button>
                )}

                <button type="button" onClick={() => deleteAccount(account.player)}>
                  Supprimer
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
