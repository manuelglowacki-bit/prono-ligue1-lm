import React from "react";
import AdminExcelImportMatches from "./AdminExcelImportMatches.jsx";

export default function AdminCleanPage() {
  return (
    <div className="admin-clean-page">
      <section className="admin-clean-card">
        <h2>âš™ï¸ Administration</h2>
        <p>Gestion des journÃ©es : import Excel uniquement.</p>
      </section>

      <AdminExcelImportMatches />
    </div>
  );
}

