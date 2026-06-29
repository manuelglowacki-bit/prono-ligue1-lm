import AdminCleanPage from "./components/AdminCleanPage.jsx";
import React, { useState } from 'react';
import AuthGate from './components/AuthGate';
import Layout from './layouts/AppLayout';

import HomePage from './pages/HomePage';
import FavoriteTeamSelect from './components/FavoriteTeamSelect';
import PronosPage from './pages/PronosPage';
import RankingPage from './pages/RankingPage';
import StatsPage from './pages/StatsPage';
import TrophiesPage from './pages/TrophiesPage';
import ProfilePage from './pages/ProfilePage';
import JournalPage from './pages/JournalPage';

import AdminJournees from './AdminJournees';
import AdminBonusAI from './components/AdminBonusAI';
import AdminAIControl from './components/AdminAIControl';
import AdminAccounts from './components/AdminAccounts';
import AdminReminders from './components/AdminReminders';
import AdminAutoReminder from './components/AdminAutoReminder';

const SESSION_KEY = 'prono_ligue1_lm_session';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function AdminDenied() {
  return (
    <section className="admin-denied">
      <p>ACCÈS REFUSÉ</p>
      <h1>Page réservée à l’admin</h1>
      <span>Seul le compte Manu peut accéder à la gestion Admin.</span>
    </section>
  );
}

export default function App() {
  const [page, setPage] = useState('Accueil');

  const session = getSession();
  const isAdmin = session?.role === 'admin' || session?.player === 'Manu';

  const pages = {
    Accueil: (
      <>
        <FavoriteTeamSelect />
        <HomePage setPage={setPage} />
      </>
    ),
    Pronos: <PronosPage />,
    Classement: <RankingPage />,
    Stats: <StatsPage />,
    'La Gazette': <JournalPage />,
    Trophées: <TrophiesPage />,
    Profil: <ProfilePage />,
    Admin: isAdmin ? (
      <>
        <AdminAutoReminder />
        <AdminReminders />
        <AdminAIControl />
        <AdminAccounts />
        <AdminBonusAI />
        <AdminJournees />
      </>
    ) : (
      <AdminDenied />
    ),
  };

  return (
    <AuthGate>
      <Layout page={page} setPage={setPage}>
        {pages[page] || pages.Accueil}
      </Layout>
    </AuthGate>
  );
}







