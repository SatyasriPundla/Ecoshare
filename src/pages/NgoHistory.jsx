import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

function HistoryCard({ donation }) {
  return (
    <div
      style={{
        background: "#ffffff",
        padding: "16px",
        borderRadius: "12px",
        marginBottom: "16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <h3>
        {donation.type} {donation.condition ? `(${donation.condition})` : ""}
      </h3>
      <p>📦 Quantity: {donation.quantity}</p>
      <p>📍 Location: {donation.location}</p>
      <p style={{ margin: "6px 0", color: "#374151" }}>
        Donor: {donation.donor_name || "Unknown"}
      </p>
      <p style={{ fontWeight: "bold" }}>Status: {donation.status}</p>
    </div>
  );
}

export default function NgoHistory({ destinationType = "ngo", title = "Completed Pickups" }) {
  const [completedDonations, setCompletedDonations] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUserId(u?.uid ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUserId) return undefined;
    const actorField = destinationType === "compost" ? "compost_id" : "ngo_id";
    const q = query(
      collection(db, "donations"),
      where("status", "==", "completed"),
      where(actorField, "==", currentUserId),
      where("destination_type", "==", destinationType)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      }));
      data.forEach((donation) => {
        console.log(donation.status, donation.destinationType ?? donation.destination_type);
      });
      setCompletedDonations(data);
    });

    return () => unsubscribe();
  }, [currentUserId, destinationType]);

  return (
    <div className="dashboard-page">
      <h2>{title}</h2>
      {completedDonations.length === 0 ? (
        <p>No completed donations found.</p>
      ) : (
        completedDonations.map((donation) => (
          <HistoryCard key={donation.id} donation={donation} />
        ))
      )}
    </div>
  );
}
