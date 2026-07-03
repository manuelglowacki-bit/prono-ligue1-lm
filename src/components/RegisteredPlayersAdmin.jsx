import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const ADMIN_EMAIL = "manuelglowacki@gmail.com";

export default function RegisteredPlayersAdmin() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");

  async function loadPlayers() {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,player_name,created_at,account_status,blocked_at,deleted_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setPlayers(data || []);

      if (!selectedId && data?.length) {
        setSelectedId(data[0].id);
      }
    } catch (err) {
      setMessage(err.message || "Impossible de charger les joueurs.");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(player, status) {
    const email = player.email?.toLowerCase().trim();

    if (email === ADMIN_EMAIL) {
      alert("Tu ne peux pas bloquer ou supprimer ton compte admin.");
      return;
    }

    const label =
      status === "blocked"
        ? "bloquer"
        : status === "deleted"
        ? "supprimer"
        : "restaurer";

    if (!confirm(`Confirmer : ${label} ${player.email} ?`)) return;

    const payload = {
      account_status: status,
      blocked_at: status === "blocked" ? new Date().toISOString() : null,
      deleted_at: status === "deleted" ? new Date().toISOString() : null,
    };

    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", player.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadPlayers();
    setSelectedId(player.id);
  }

  useEffect(() => {
    loadPlayers();
  }, []);

  const counts = useMemo(() => {
    return {
      total: players.length,
      active: players.filter((p) => (p.account_status || "active") === "active").length,
      blocked: players.filter((p) => p.account_status === "blocked").length,
      deleted: players.filter((p) => p.account_status === "deleted").length,
    };
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const q = search.toLowerCase().trim();

    return players.filter((player) => {
      const status = player.account_status || "active";
      const text = `${player.player_name || ""} ${player.email || ""}`.toLowerCase();

      const matchSearch = !q || text.includes(q);
      const matchFilter = filter === "all" || status === filter;

      return matchSearch && matchFilter;
    });
  }, [players, search, filter]);

  const selectedPlayer = useMemo(() => {
    return players.find((player) => player.id === selectedId) || null;
  }, [players, selectedId]);

  function statusLabel(status) {
    if (status === "blocked") return "Bloque";
    if (status === "deleted") return "Supprime";
    return "Actif";
  }

  function statusColor(status) {
    if (status === "blocked") return "#fb923c";
    if (status === "deleted") return "#f87171";
    return "#86efac";
  }

  return (
    <section style={{
      marginTop: "52px",
      marginBottom: "18px",
      padding: "14px",
      borderRadius: "20px",
      background: "rgba(15,23,42,0.95)",
      border: "2px solid #facc15",
      color: "white"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        alignItems: "center",
        flexWrap: "wrap"
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px" }}>Joueurs inscrits</h2>
          <p style={{ margin: "4px 0 0", color: "#cbd5e1", fontSize: "13px" }}>
            {counts.total} total | {counts.active} actifs | {counts.blocked} bloques | {counts.deleted} supprimes
          </p>
        </div>

        <button
          type="button"
          onClick={loadPlayers}
          style={{
            border: 0,
            borderRadius: "999px",
            padding: "9px 13px",
            background: "#facc15",
            color: "#111827",
            fontWeight: 900,
            cursor: "pointer"
          }}
        >
          Actualiser
        </button>
      </div>

      <div style={{
        display: "flex",
        gap: "8px",
        marginTop: "12px",
        flexWrap: "wrap",
        alignItems: "center"
      }}>
        <input
          type="text"
          placeholder="Chercher un joueur ou un mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 260px",
            minWidth: "200px",
            padding: "11px 13px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(2,6,23,0.85)",
            color: "white",
            outline: "none"
          }}
        />

        {[
          ["all", "Tous"],
          ["active", "Actifs"],
          ["blocked", "Bloques"],
          ["deleted", "Supprimes"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            style={{
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: "999px",
              padding: "8px 11px",
              background: filter === value ? "#facc15" : "rgba(255,255,255,0.06)",
              color: filter === value ? "#111827" : "white",
              fontWeight: 800,
              cursor: "pointer"
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p style={{ marginTop: "12px" }}>Chargement...</p>}

      {message && (
        <div style={{
          marginTop: "12px",
          padding: "10px",
          borderRadius: "12px",
          background: "rgba(239,68,68,0.18)",
          color: "#fecaca"
        }}>
          Erreur : {message}
        </div>
      )}

      {!loading && !message && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 340px) 1fr",
          gap: "14px",
          marginTop: "14px"
        }}>
          <div style={{
            maxHeight: "300px",
            overflowY: "auto",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(2,6,23,0.45)"
          }}>
            {filteredPlayers.length === 0 ? (
              <div style={{ padding: "12px", color: "#cbd5e1" }}>
                Aucun joueur trouve.
              </div>
            ) : (
              filteredPlayers.map((player) => {
                const status = player.account_status || "active";
                const active = selectedId === player.id;

                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedId(player.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "10px",
                      padding: "10px 12px",
                      border: 0,
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      background: active ? "rgba(250,204,21,0.18)" : "transparent",
                      color: "white",
                      cursor: "pointer",
                      textAlign: "left"
                    }}
                  >
                    <span>
                      <strong>{player.player_name || "Sans nom"}</strong>
                      <span style={{
                        display: "block",
                        color: "#cbd5e1",
                        fontSize: "12px",
                        marginTop: "2px"
                      }}>
                        {player.email || "-"}
                      </span>
                    </span>

                    <span style={{
                      color: statusColor(status),
                      fontWeight: 900,
                      fontSize: "12px",
                      whiteSpace: "nowrap"
                    }}>
                      {statusLabel(status)}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div style={{
            minHeight: "170px",
            padding: "16px",
            borderRadius: "18px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(2,6,23,0.45)"
          }}>
            {!selectedPlayer ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>
                Selectionne un joueur dans la liste.
              </p>
            ) : (
              <>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap"
                }}>
                  <div>
                    <h3 style={{ margin: 0 }}>
                      {selectedPlayer.player_name || "Sans nom"}
                    </h3>

                    <p style={{ margin: "6px 0 0", color: "#cbd5e1" }}>
                      {selectedPlayer.email || "-"}
                    </p>

                    <p style={{ margin: "8px 0 0", color: "#cbd5e1", fontSize: "13px" }}>
                      Inscription :{" "}
                      {selectedPlayer.created_at
                        ? new Date(selectedPlayer.created_at).toLocaleDateString("fr-FR")
                        : "-"}
                    </p>
                  </div>

                  <div style={{
                    color: statusColor(selectedPlayer.account_status || "active"),
                    fontWeight: 900
                  }}>
                    {statusLabel(selectedPlayer.account_status || "active")}
                  </div>
                </div>

                <div style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  marginTop: "18px"
                }}>
                  {selectedPlayer.email?.toLowerCase().trim() === ADMIN_EMAIL ? (
                    <span style={{ color: "#94a3b8" }}>Compte admin protege</span>
                  ) : (
                    <>
                      {(selectedPlayer.account_status || "active") === "blocked" ? (
                        <button type="button" onClick={() => updateStatus(selectedPlayer, "active")}>
                          Debloquer
                        </button>
                      ) : (
                        <button type="button" onClick={() => updateStatus(selectedPlayer, "blocked")}>
                          Bloquer
                        </button>
                      )}

                      {selectedPlayer.account_status === "deleted" ? (
                        <button type="button" onClick={() => updateStatus(selectedPlayer, "active")}>
                          Restaurer
                        </button>
                      ) : (
                        <button type="button" onClick={() => updateStatus(selectedPlayer, "deleted")}>
                          Supprimer
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

