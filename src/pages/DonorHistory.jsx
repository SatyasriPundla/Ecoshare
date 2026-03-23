import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { formatExpiryRemainingText } from "../utils/expiryDisplay";

function getStatusBadgeStyle(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "completed") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
    };
  }
  if (s === "on_the_way" || s === "accepted") {
    return {
      background: "#dbeafe",
      color: "#1e40af",
      border: "1px solid #93c5fd",
    };
  }
  if (s === "pending") {
    return {
      background: "#fef9c3",
      color: "#854d0e",
      border: "1px solid #fde047",
    };
  }
  return {
    background: "#f3f4f6",
    color: "#374151",
    border: "1px solid #e5e7eb",
  };
}

function formatCreatedAtLabel(createdAt) {
  if (!createdAt) return null;
  try {
    const d =
      typeof createdAt?.toDate === "function"
        ? createdAt.toDate()
        : createdAt?.seconds
          ? new Date(createdAt.seconds * 1000)
          : null;
    if (!d || Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

export default function DonorHistory() {
  const [donations, setDonations] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setDonations([]);
      return;
    }
    setLoading(true);

    const q = query(
      collection(db, "donations"),
      where("donor_id", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        const sortedData = data.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });
        console.log("Fetched Donations:", sortedData);
        setDonations(sortedData);
        setLoading(false);
      },
      (error) => {
        console.error("DonorHistory snapshot error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div className="dashboard-page">
      <h2>Donor History</h2>

      {donations.length === 0 ? (
        <p>No donations found.</p>
      ) : (
        donations.map((donation) => {
          const status = donation.status ?? "pending";
          const dateLabel = formatCreatedAtLabel(donation.createdAt);
          const conditionLabel =
            donation.condition ?? donation.food_condition ?? "—";
          const expiryLabel = formatExpiryRemainingText(donation.expiryTime, currentTime);

          return (
            <div
              key={donation.id}
              style={{
                background: "#ffffff",
                padding: "18px 20px",
                borderRadius: "14px",
                marginBottom: "18px",
                boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  marginBottom: "10px",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#111827" }}>
                  {donation.type}{" "}
                  <span style={{ fontWeight: 500, color: "#6b7280" }}>
                    ({conditionLabel})
                  </span>
                </h3>
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 12px",
                    borderRadius: "9999px",
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "capitalize",
                    ...getStatusBadgeStyle(status),
                  }}
                >
                  {String(status).replace(/_/g, " ")}
                </span>
              </div>

              {dateLabel ? (
                <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#6b7280" }}>
                  Submitted {dateLabel}
                </p>
              ) : null}

              <p style={{ margin: "6px 0", color: "#374151" }}>
                📦 Quantity: {donation.quantity}
              </p>
              <p style={{ margin: "6px 0", color: "#374151" }}>
                📍 Location: {donation.location}
              </p>
              {expiryLabel ? (
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: "13px",
                    color: expiryLabel === "Expired" ? "#b91c1c" : "#047857",
                    fontWeight: 600,
                  }}
                >
                  ⏱ {expiryLabel}
                </p>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
