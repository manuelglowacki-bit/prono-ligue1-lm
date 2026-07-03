import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const ADMIN_EMAIL = "manuelglowacki@gmail.com";

export default function AdminOnly({ children }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAdmin() {
      try {
        if (!supabase) {
          if (mounted) {
            setAllowed(false);
            setLoading(false);
          }
          return;
        }

        const { data } = await supabase.auth.getUser();
        const email = data?.user?.email?.toLowerCase().trim();

        if (mounted) {
          setAllowed(email === ADMIN_EMAIL);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setAllowed(false);
          setLoading(false);
        }
      }
    }

    checkAdmin();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div className="loading-screen">Verification admin...</div>;
  }

  if (!allowed) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">🔒</div>
          <h1>Acces refuse</h1>
          <p className="auth-subtitle">
            Cette page est reservee a Manu.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

