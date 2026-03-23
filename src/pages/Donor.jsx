import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";

function shortAddress(address) {
  if (!address) return "";
  const trimmed = address.trim();
  if (trimmed.length <= 32) return trimmed;
  return trimmed.slice(0, 32) + "...";
}

export default function Donor() {
  const [type, setType] = useState("food"); // food | clothes
  const [foodCondition, setFoodCondition] = useState("fresh"); // fresh | spoiled (only for food)
  const [quantity, setQuantity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  /** Expiry duration in hours (1–24). */
  const [expiryHours, setExpiryHours] = useState("");

  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [locationMessage, setLocationMessage] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [totalDonations, setTotalDonations] = useState(0);
  const [pendingDonations, setPendingDonations] = useState(0);
  const [completedDonations, setCompletedDonations] = useState(0);
  const statsUnsubRef = useRef(null);

  const destinationType = useMemo(() => {
    if (type === "clothes") return "ngo";
    if (type === "food" && foodCondition === "fresh") return "ngo";
    if (type === "food" && foodCondition === "spoiled") return "compost";
    return "ngo";
  }, [type, foodCondition]);
  const shouldUseExpiry = type === "food" && foodCondition === "fresh";

  useEffect(() => {
    if (!db) return undefined;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (statsUnsubRef.current) {
        statsUnsubRef.current();
        statsUnsubRef.current = null;
      }
      if (!user) {
        setTotalDonations(0);
        setPendingDonations(0);
        setCompletedDonations(0);
        return;
      }

      const q = query(
        collection(db, "donations"),
        where("donor_id", "==", user.uid)
      );

      statsUnsubRef.current = onSnapshot(q, (snapshot) => {
        const rows = snapshot.docs.map((d) => d.data());
        const total = rows.length;
        const completed = rows.filter((r) => r.status === "completed").length;
        const pending = total - completed;
        setTotalDonations(total);
        setPendingDonations(pending);
        setCompletedDonations(completed);
      });
    });

    return () => {
      unsubAuth();
      if (statsUnsubRef.current) {
        statsUnsubRef.current();
        statsUnsubRef.current = null;
      }
    };
  }, []);

  function handleUseCurrentLocation() {
    setError("");
    setSuccess("");
    setLocationMessage("Capturing location...");

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setLocationMessage("");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setLocationMessage("Location captured successfully");
      },
      (geoErr) => {
        setError(geoErr?.message ?? "Failed to get location. Please try again.");
        setLocationMessage("");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const user = auth.currentUser;
    if (!user) {
      setError("Please login again to create a donation.");
      return;
    }

    // Validation
    if (latitude == null || longitude == null) {
      setError("Location not captured. Please click 'Use Current Location' first.");
      return;
    }
    if (!type || !quantity || !address.trim() || !phone.trim()) {
      setError("Please complete all fields (quantity, address, phone).");
      return;
    }
    if (type === "food" && !foodCondition) {
      setError("Please select a food condition.");
      return;
    }
    if (!db) {
      setError("Firestore is not initialized.");
      return;
    }

    if (phone.length !== 10) {
      alert("Phone number must be exactly 10 digits");
      return;
    }

    const hours = Number(expiryHours);
    if (shouldUseExpiry) {
      if (!Number.isFinite(hours) || hours < 1 || hours > 24) {
        alert("Enter expiry time between 1 and 24 hours");
        return;
      }
    }

    setSubmitting(true);
    try {
      console.log("Firestore db initialized:", Boolean(db));
      console.log("Submitting donation:", { type, quantity, latitude, longitude });

      const expiryTime = shouldUseExpiry
        ? Date.now() + hours * 60 * 60 * 1000
        : null;

      const payload = {
        type,
        quantity: quantity.trim(),
        // Backend stores this as `location`.
        location: address.trim(),
        phone: phone.trim(),
        latitude,
        longitude,
        destination_type: destinationType,
        status: "pending",
        userId: user.uid,
        donor_id: user.uid,
        donor_name: user?.displayName || "Anonymous",
        expiryTime,
      };

      // Always include the `condition` field for consistent document shape.
      // For clothes donations, we store `null` (UI renders as "—").
      payload.condition = type === "food" ? foodCondition : null;

      await addDoc(collection(db, "donations"), {
        ...payload,
        createdAt: Timestamp.now(),
      });

      // Clear form after submit
      setType("food");
      setFoodCondition("fresh");
      setQuantity("");
      setAddress("");
      setPhone("");
      setExpiryHours("");
      setLatitude(null);
      setLongitude(null);
      setLocationMessage("");

      setSuccess("Donation submitted successfully!");
    } catch (error) {
      console.error(error);
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard-page donor-page">
      <h2 style={{ textAlign: "center" }}>Donor Dashboard</h2>

      <div
        style={{
          display: "flex",
          gap: "20px",
          marginTop: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            flex: 1,
            background: "#ffffff",
            padding: "16px",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Total Donations</p>
          <p style={{ margin: "8px 0 0", fontSize: 24, fontWeight: "bold", color: "#111827" }}>
            {totalDonations}
          </p>
        </div>
        <div
          style={{
            flex: 1,
            background: "#ffffff",
            padding: "16px",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Pending Donations</p>
          <p style={{ margin: "8px 0 0", fontSize: 24, fontWeight: "bold", color: "#111827" }}>
            {pendingDonations}
          </p>
        </div>
        <div
          style={{
            flex: 1,
            background: "#ffffff",
            padding: "16px",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Completed Donations</p>
          <p style={{ margin: "8px 0 0", fontSize: 24, fontWeight: "bold", color: "#111827" }}>
            {completedDonations}
          </p>
        </div>
      </div>

      <div
        style={{
          background: "#e6f9f0",
          borderRadius: "16px",
          padding: "20px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.08)",
          border: "1px solid #bbf7d0",
          marginTop: 16,
        }}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "span 1" }}>
              <label style={{ display: "block", marginBottom: 6 }}>Donation Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
              >
                <option value="food">food</option>
                <option value="clothes">clothes</option>
              </select>
            </div>

            {type === "food" ? (
              <div style={{ gridColumn: "span 1" }}>
                <label style={{ display: "block", marginBottom: 6 }}>Food Condition</label>
                <select
                  value={foodCondition}
                  onChange={(e) => setFoodCondition(e.target.value)}
                  style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
                >
                  <option value="fresh">fresh</option>
                  <option value="spoiled">spoiled</option>
                </select>
              </div>
            ) : null}

            {shouldUseExpiry ? (
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", marginBottom: 6 }}>Expiry time (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  step={1}
                  placeholder="1–24 hours"
                  value={expiryHours}
                  onChange={(e) => setExpiryHours(e.target.value)}
                  required={shouldUseExpiry}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #ccc",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ) : null}

            <div style={{ gridColumn: "span 2" }}>
              <div
                style={{
                  display: "flex",
                  gap: "20px",
                  width: "100%",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ display: "block", marginBottom: 6 }}>Quantity</label>
                  <input
                    type="text"
                    placeholder="e.g., 10 kgs rice"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    required
                  />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ display: "block", marginBottom: 6 }}>Phone Number</label>
                  <div style={{ position: "relative", width: "100%" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "16px",
                      }}
                    >
                      📞
                    </span>

                    <input
                      type="text"
                      placeholder="e.g., 9876543210"
                      value={phone}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (/^\d*$/.test(value) && value.length <= 10) {
                          setPhone(value);
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "10px 12px 10px 35px",
                        borderRadius: "8px",
                        border: "1px solid #ccc",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", marginBottom: 6 }}>Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Full pickup address"
                style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
                required
              />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderRadius: 10,
                  border: "1px solid var(--accent)",
                  background: "transparent",
                  color: "#10b981",
                }}
              >
                Use Current Location
              </button>

              {locationMessage ? (
                <p style={{ margin: "10px 0 0", color: "#0f766e" }}>{locationMessage}</p>
              ) : null}
              {latitude != null && longitude != null ? (
                <p style={{ margin: "8px 0 0", color: "#6b6375", fontSize: 14 }}>
                  Captured: {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </p>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={submitting || latitude == null || longitude == null}
              onMouseOver={(e) => {
                if (!e.currentTarget.disabled) e.currentTarget.style.background = "#14532d";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "#166534";
              }}
              style={{
                flex: "1 1 220px",
                background: "#166534",
                color: "white",
                borderRadius: "999px",
                padding: "12px 20px",
                border: "none",
                fontWeight: "bold",
                cursor: submitting || latitude == null || longitude == null ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                opacity: submitting || latitude == null || longitude == null ? 0.7 : 1,
                pointerEvents: submitting || latitude == null || longitude == null ? "none" : "auto",
              }}
            >
              {submitting ? "Submitting..." : "Submit Donation"}
            </button>
            <div style={{ flex: "2 1 300px", alignSelf: "center", color: "var(--text)" }}>
              <strong>Auto destination:</strong> {destinationType}
              <div style={{ marginTop: 4, fontSize: 14, color: "#6b6375" }}>
                Preview address: {shortAddress(address || "—")}
              </div>
            </div>
          </div>

          {error ? <p style={{ color: "crimson", marginTop: 14 }}>{error}</p> : null}
          {success ? <p style={{ color: "#0f766e", marginTop: 14 }}>{success}</p> : null}
        </form>
      </div>
    </div>
  );
}

