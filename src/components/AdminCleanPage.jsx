import React from "react";
import AdminExcelImportMatches from "./AdminExcelImportMatches.jsx";

export default function AdminCleanPage() {
  return (
    <div className="admin-clean-page">
      <section className="admin-clean-card">
        <h2>⚙️ Administration</h2>
        <p>Gestion des journées : import Excel uniquement.</p>
      </section>

      <AdminExcelImportMatches />
    </div>
  );
}
