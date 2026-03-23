import { useEffect, useMemo, useState } from "react";
import { formatExpiryRemainingText } from "../utils/expiryDisplay";

const boxStyle = {
  background: "#f9fafb",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #e5e7eb",
};

export default function DonationDetailsModal({ donation, onClose }) {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const {
    donorName,
    phone,
    type,
    condition,
    quantity,
    location,
    latitude,
    longitude,
    status,
    expiryTime,
  } = donation ?? {};

  const expiryLabel = formatExpiryRemainingText(expiryTime, currentTime);

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const mapSrc = useMemo(() => {
    if (latitude == null || longitude == null) return null;
    return `https://www.google.com/maps?q=${latitude},${longitude}&output=embed`;
  }, [latitude, longitude]);

  if (!donation) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "white",
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid var(--border)",
          boxShadow: "none",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #e5e4e7",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>Donation Details</h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "white",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            padding: "20px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          <h2 style={{ marginBottom: "20px", marginTop: 0 }}>Donation Details</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
            }}
          >
            <div style={boxStyle}>
              <p style={{ margin: "0 0 6px 0" }}>👤 Donor</p>
              <strong>{donorName || "N/A"}</strong>
            </div>

            <div style={boxStyle}>
              <p style={{ margin: "0 0 6px 0" }}>📞 Phone</p>
              <strong>{phone || "N/A"}</strong>
            </div>

            <div style={boxStyle}>
              <p style={{ margin: "0 0 6px 0" }}>🍱 Type</p>
              <strong>{type || "—"}</strong>
            </div>

            <div style={boxStyle}>
              <p style={{ margin: "0 0 6px 0" }}>📦 Quantity</p>
              <strong>{quantity ?? "—"}</strong>
            </div>

            <div style={boxStyle}>
              <p style={{ margin: "0 0 6px 0" }}>🥗 Condition</p>
              <strong>{type === "food" ? condition || "—" : "—"}</strong>
            </div>

            <div style={boxStyle}>
              <p style={{ margin: "0 0 6px 0" }}>📌 Status</p>
              <strong style={{ color: "#22c55e" }}>{status || "—"}</strong>
            </div>

            {expiryLabel ? (
              <div style={boxStyle}>
                <p style={{ margin: "0 0 6px 0" }}>⏱ Expiry</p>
                <strong
                  style={{
                    color: expiryLabel === "Expired" ? "#b91c1c" : "#047857",
                  }}
                >
                  {expiryLabel}
                </strong>
              </div>
            ) : null}
          </div>

          <div style={{ ...boxStyle, marginTop: "20px" }}>
            <p style={{ margin: "0 0 6px 0" }}>📍 Address</p>
            <strong>{location || "—"}</strong>
          </div>

          <div style={{ marginTop: "20px", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ fontSize: 12, color: "#6b6375", marginBottom: 8 }}>Map</div>
            {mapSrc ? (
              <iframe
                title="Donation location map"
                src={mapSrc}
                style={{ width: "100%", height: 320, border: 0, borderRadius: 12 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <p style={{ margin: 0, color: "crimson" }}>Location not available for this donation.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

