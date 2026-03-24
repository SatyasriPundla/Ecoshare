import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import DonationDetailsModal from "./DonationDetailsModal.jsx";
import { auth, db } from "../firebase";
import {
  formatExpiryRemainingText,
  getExpiryTimeMs,
} from "../utils/expiryDisplay";

function shortAddress(address) {
  const trimmed = (address ?? "").trim();
  if (!trimmed) return "—";
  if (trimmed.length <= 28) return trimmed;
  return trimmed.slice(0, 28) + "...";
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // km
}

function getStatusBadgeStyle(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "completed") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
    };
  }
  if (s === "on_the_way" || s === "accepted" || s === "started" || s === "reached") {
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

function getTimeMs(value) {
  if (!value) return null;
  try {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.toDate === "function") return value.toDate().getTime();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
  } catch {
    return null;
  }
  return null;
}

/** Milliseconds for sorting; 0 if missing (stable tie-break with newest-first). */
function getCreatedAtMs(createdAt) {
  if (!createdAt) return 0;
  try {
    if (typeof createdAt?.toMillis === "function") return createdAt.toMillis();
    if (typeof createdAt?.toDate === "function")
      return createdAt.toDate().getTime();
    if (typeof createdAt?.seconds === "number") return createdAt.seconds * 1000;
    if (typeof createdAt === "number" && Number.isFinite(createdAt))
      return createdAt;
  } catch {
    return 0;
  }
  return 0;
}

/**
 * Pending donations: earliest expiry → smaller distance → newer createdAt.
 * Missing expiry → last; missing distance → Infinity.
 */
function sortPendingDonationsForDisplay(list, distanceByDonation) {
  return [...list].sort((a, b) => {
    const expA = getExpiryTimeMs(a.expiryTime);
    const expB = getExpiryTimeMs(b.expiryTime);
    const keyA = expA == null ? Number.POSITIVE_INFINITY : expA;
    const keyB = expB == null ? Number.POSITIVE_INFINITY : expB;
    if (keyA !== keyB) return keyA - keyB;

    const distA = distanceByDonation[a.id];
    const distB = distanceByDonation[b.id];
    const dA = Number.isFinite(distA) ? distA : Number.POSITIVE_INFINITY;
    const dB = Number.isFinite(distB) ? distB : Number.POSITIVE_INFINITY;
    if (dA !== dB) return dA - dB;

    return getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt);
  });
}

export default function DonationsDashboard({ destinationType, title }) {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDonation, setSelectedDonation] = useState(null);
  const [notification, setNotification] = useState(null);
  const [distanceByDonation, setDistanceByDonation] = useState({});
  const [currentTime, setCurrentTime] = useState(Date.now());
  const distanceRef = useRef(new Set());
  const sentKeysRef = useRef(new Set());
  const reachedRef = useRef(new Set());
  const intervalRef = useRef(null);
  const donationsRef = useRef([]);
  const initialDistanceSentRef = useRef(new Set());
  const watchByDonationRef = useRef(new Map());
  const liveDistanceNotifiedRef = useRef(new Map());
  const liveReachedRef = useRef(new Set());
  const reassignmentRequestedRef = useRef(new Set());
  const reassignmentAutoRef = useRef(new Set());
  const userRole = localStorage.getItem("role");
  const actorName =
    auth?.currentUser?.displayName ||
    (destinationType === "compost" ? "Compost Team" : "NGO");
  const actorPrefix = destinationType === "compost" ? "Compost" : "NGO";

  async function sendNotification({
    donationId,
    userId,
    role,
    type,
    message,
    milestone = "",
  }) {
    if (!userId || !type || !message) return;
    if (
      destinationType === "compost" &&
      role === "donor" &&
      String(message).trim().startsWith("NGO")
    ) {
      return;
    }
    const key = donationId + "_" + type + "_" + (milestone || "none");
    if (sentKeysRef.current.has(key)) {
      return;
    }

    console.log("Sending notification:", key);
    await addDoc(collection(db, "notifications"), {
      message,
      donationId,
      userId,
      role,
      type,
      createdAt: serverTimestamp(),
      read: false,
    });
    sentKeysRef.current.add(key);
  }

  /** Donor pushes only; blocks stray "NGO …" copies in compost flow. */
  async function addDonorNotificationDoc(payload) {
    const msg = String(payload?.message ?? "");
    if (destinationType === "compost" && msg.startsWith("NGO")) return;
    await addDoc(collection(db, "notifications"), payload);
  }

  /** Segment for donor distance line: "... is <segment> away from your location" */
  function formatDonorDistanceSegment(distanceKm) {
    const meters = Math.max(0, Math.round(distanceKm * 1000));
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${meters} meters`;
  }

  /** Detailed donor copy: "Name's qty food donation" (omits missing qty/food safely). */
  function donorDetailedDonationPhrase(donation) {
    const donorName = donation?.donor_name || "Donor";
    const quantity = String(donation?.quantity ?? "").trim();
    const food = String(donation?.food_name ?? "").trim();
    const mid = [quantity, food].filter(Boolean).join(" ");
    return mid ? `${donorName}'s ${mid} donation` : `${donorName}'s donation`;
  }

  async function sendInitialDistanceNotification(donation) {
    try {
      if (!navigator.geolocation) return;
      const donorLat = Number(donation?.latitude);
      const donorLng = Number(donation?.longitude);
      const donorUserId = donation?.donor_id || donation?.userId;
      if (!Number.isFinite(donorLat) || !Number.isFinite(donorLng) || !donorUserId) return;
      if (initialDistanceSentRef.current.has(donation.id)) return;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const ngoLat = pos.coords.latitude;
          const ngoLng = pos.coords.longitude;
          const distanceKm = getDistance(ngoLat, ngoLng, donorLat, donorLng);
          const distSeg = formatDonorDistanceSegment(distanceKm);
          await sendNotification({
            donationId: donation.id,
            userId: donorUserId,
            role: "donor",
            type: "distance_initial",
            message: `${actorPrefix} ${actorName} is ${distSeg} away from your location`,
            milestone: "initial_distance_once",
          });
          initialDistanceSentRef.current.add(donation.id);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    } catch (e) {
      console.error("Initial distance notification failed:", e);
    }
  }

  function stopLiveTracking(donationId) {
    const watchId = watchByDonationRef.current.get(donationId);
    if (watchId != null && navigator.geolocation?.clearWatch) {
      navigator.geolocation.clearWatch(watchId);
    }
    watchByDonationRef.current.delete(donationId);
    liveDistanceNotifiedRef.current.delete(donationId);
  }

  function startLiveTracking(donation) {
    if (!navigator.geolocation?.watchPosition) return;
    if (!donation?.id) return;
    if (watchByDonationRef.current.has(donation.id)) return;

    const donorLat = Number(donation?.latitude);
    const donorLng = Number(donation?.longitude);
    const donorUserId = donation?.donor_id || donation?.userId;
    if (!Number.isFinite(donorLat) || !Number.isFinite(donorLng) || !donorUserId) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const ngoLat = pos.coords.latitude;
        const ngoLng = pos.coords.longitude;
        const distanceKm = getDistance(ngoLat, ngoLng, donorLat, donorLng);
        const distanceM = Math.round(distanceKm * 1000);

        const lastNotifiedM = liveDistanceNotifiedRef.current.get(donation.id);
        if (
          destinationType !== "compost" &&
          (lastNotifiedM == null || Math.abs(distanceM - lastNotifiedM) >= 200)
        ) {
          liveDistanceNotifiedRef.current.set(donation.id, distanceM);
          const distSeg = formatDonorDistanceSegment(distanceKm);
          await addDonorNotificationDoc({
            userId: donorUserId,
            message: `${actorPrefix} ${actorName} is ${distSeg} away from your location`,
            donationId: donation.id,
            createdAt: serverTimestamp(),
            read: false,
          });
        } else if (destinationType === "compost") {
          liveDistanceNotifiedRef.current.set(donation.id, distanceM);
        }

        if (distanceM <= 50 && !liveReachedRef.current.has(donation.id)) {
          liveReachedRef.current.add(donation.id);
          // Reached copy + dedupe: handled only in checkLocation() (one donor notification).

          // Optional reached status update for tracking flow.
          await updateDoc(doc(db, "donations", donation.id), { status: "reached" });
          setDonations((prev) =>
            prev.map((d) => (d.id === donation.id ? { ...d, status: "reached" } : d))
          );
          stopLiveTracking(donation.id);
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );

    watchByDonationRef.current.set(donation.id, watchId);
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        console.log("Destination type:", destinationType);
        if (!db) throw new Error("Firestore is not initialized.");

        const q = query(
          collection(db, "donations"),
          where("destination_type", "==", destinationType)
        );

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        if (!alive) return;

        console.log("Fetched donations:", data);
        // Expiry handling: mark pending donations as expired once their expiryTime passes.
        try {
          const nowMs = Date.now();
          const expiredIds = new Set();

          for (const d of data) {
            if (d?.status !== "pending") continue;
            if (d?.expiryTime == null) continue; // skip if missing expiryTime

            const expiryMs = getExpiryTimeMs(d.expiryTime);
            if (expiryMs == null) continue;

            if (nowMs <= expiryMs) continue; // not expired yet

            // Mark as expired in Firestore (only affects pending donations).
            await updateDoc(doc(db, "donations", d.id), {
              status: "expired",
              destination: "compost",
            });

            expiredIds.add(d.id);
          }

          const updatedData = expiredIds.size
            ? data.map((d) =>
                expiredIds.has(d.id)
                  ? { ...d, status: "expired", destination: "compost" }
                  : d
              )
            : data;

          setDonations(updatedData);
        } catch (expiryError) {
          console.error("Expiry handling failed:", expiryError);
          // Fail safely: still render the fetched donations as-is.
          setDonations(data);
        }
      } catch (loadError) {
        if (!alive) return;
        console.error("Fetch error:", loadError);
        setError(loadError.message);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [destinationType]);

  useEffect(() => {
    donationsRef.current = donations;
  }, [donations]);

  useEffect(() => {
    return () => {
      watchByDonationRef.current.forEach((watchId) => {
        if (navigator.geolocation?.clearWatch) navigator.geolocation.clearWatch(watchId);
      });
      watchByDonationRef.current.clear();
      liveDistanceNotifiedRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(t);
  }, [notification]);

  const checkLocation = useCallback(async (donation, ngoLat, ngoLng, currentUser) => {
    const prefix = destinationType === "compost" ? "Compost" : "NGO";
    const actorDisplayName =
      auth?.currentUser?.displayName ||
      (destinationType === "compost" ? "Compost Team" : "NGO");

    const donorLat = Number(donation.latitude);
    const donorLng = Number(donation.longitude);
    if (!Number.isFinite(donorLat) || !Number.isFinite(donorLng)) return;
    const donorUserId = donation.donor_id || donation.userId;
    if (!donorUserId) return;
    const actorRole = destinationType === "compost" ? "compost" : destinationType;
    const actorUserId =
      destinationType === "compost"
        ? donation.compost_id || currentUser.uid
        : currentUser.uid;

    const actorSelfDetail = donorDetailedDonationPhrase(donation);

    const distance = getDistance(ngoLat, ngoLng, donorLat, donorLng);
    setDistanceByDonation((prev) => ({
      ...prev,
      [donation.id]: distance,
    }));

    const donorReachedCopy = `${prefix} ${actorDisplayName} has reached your location`;

    if (donation.status === "reached") {
      if (reachedRef.current.has(donation.id)) return;
      reachedRef.current.add(donation.id);

      await addDonorNotificationDoc({
        message: donorReachedCopy,
        donationId: donation.id,
        userId: donorUserId,
        role: "donor",
        type: "reached",
        createdAt: serverTimestamp(),
        read: false,
      });

      await addDoc(collection(db, "notifications"), {
        message: `You reached for ${actorSelfDetail}`,
        donationId: donation.id,
        userId: actorUserId,
        role: actorRole,
        type: "ngo_action",
        createdAt: serverTimestamp(),
        read: false,
      });
      return;
    }

    const sameLocation =
      Math.abs(ngoLat - donorLat) < 0.001 &&
      Math.abs(ngoLng - donorLng) < 0.001;

    if (sameLocation) {
      if (reachedRef.current.has(donation.id)) return;
      reachedRef.current.add(donation.id);

      await addDonorNotificationDoc({
        message: donorReachedCopy,
        donationId: donation.id,
        userId: donorUserId,
        role: "donor",
        type: "reached",
        createdAt: serverTimestamp(),
        read: false,
      });

      await addDoc(collection(db, "notifications"), {
        message: `You reached for ${actorSelfDetail}`,
        donationId: donation.id,
        userId: actorUserId,
        role: actorRole,
        type: "ngo_action",
        createdAt: serverTimestamp(),
        read: false,
      });

      return;
    }

    let milestone = null;
    let message = "";

    // Trigger only while crossing these distance milestones.
    if (distance <= 0.2) {
      milestone = "sent200m";
      message = `${prefix} ${actorDisplayName} is 200 meters away from your location`;
    } else if (distance <= 0.5) {
      milestone = "sent500m";
      message = `${prefix} ${actorDisplayName} is 500 meters away from your location`;
    } else if (distance <= 1) {
      milestone = "sent1km";
      message = `${prefix} ${actorDisplayName} is 1 km away from your location`;
    } else if (distance <= 2) {
      milestone = "sent2km";
      message = `${prefix} ${actorDisplayName} is 2 km away from your location`;
    }

    if (milestone) {
      const key = donation.id + "_" + milestone;
      if (!distanceRef.current.has(key)) {
        distanceRef.current.add(key);

        await addDonorNotificationDoc({
          message,
          donationId: donation.id,
          userId: donorUserId,
          role: "donor",
          type: "distance",
          createdAt: serverTimestamp(),
          read: false,
        });
      }
    }

    if (distance <= 0.1) {
      if (reachedRef.current.has(donation.id)) return;
      reachedRef.current.add(donation.id);

      await addDonorNotificationDoc({
        message: donorReachedCopy,
        donationId: donation.id,
        userId: donorUserId,
        role: "donor",
        type: "reached",
        createdAt: serverTimestamp(),
        read: false,
      });

      await addDoc(collection(db, "notifications"), {
        message: `You reached for ${actorSelfDetail}`,
        donationId: donation.id,
        userId: actorUserId,
        role: actorRole,
        type: "ngo_action",
        createdAt: serverTimestamp(),
        read: false,
      });

    }
  }, [destinationType, auth?.currentUser?.displayName]);

  useEffect(() => {
    if (destinationType !== "ngo" && destinationType !== "compost") return undefined;
    if (!donations || donations.length === 0) return undefined;

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const ngoLat = pos.coords.latitude;
      const ngoLng = pos.coords.longitude;
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const active = donations.filter(
        (d) =>
          d.status === "on_the_way" ||
          d.status === "started" ||
          d.status === "reached"
      );
      for (const d of active) {
        await checkLocation(d, ngoLat, ngoLng, currentUser);
      }
    });
  }, [checkLocation, donations, destinationType]);

  useEffect(() => {
    if (destinationType !== "ngo" && destinationType !== "compost") return undefined;
    if (intervalRef.current) return undefined;

    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const ngoLat = pos.coords.latitude;
        const ngoLng = pos.coords.longitude;
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const active = donationsRef.current.filter(
          (d) =>
            d.status === "on_the_way" ||
            d.status === "started" ||
            d.status === "reached"
        );
        for (const d of active) {
          await checkLocation(d, ngoLat, ngoLng, currentUser);
        }
      });
    }, 8000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkLocation, destinationType]);

  const newDonations = useMemo(() => {
    const pending = donations.filter((d) => d.status === "pending");
    return sortPendingDonationsForDisplay(pending, distanceByDonation);
  }, [donations, distanceByDonation]);

  async function handleReassignDonation(donation, reason = "ngo_declined") {
    try {
      if (!db || !donation?.id) return;
      const updates = {
        status: "pending",
        ngo_id: null,
        reassigned: true,
        reassignmentRequested: false,
        reassignmentReason: reason,
      };
      await updateDoc(doc(db, "donations", donation.id), updates);
      setDonations((prev) =>
        prev.map((d) => (d.id === donation.id ? { ...d, ...updates } : d))
      );
      setNotification({ message: "Donation reassigned to pending queue." });
    } catch (reassignError) {
      console.error(reassignError);
      setError(reassignError.message);
    }
  }

  async function handleReassignmentYes(donation) {
    try {
      await handleOnTheWay(donation);
      if (!db || !donation?.id) return;
      await updateDoc(doc(db, "donations", donation.id), {
        reassignmentRequested: false,
        reassignmentRespondedAt: serverTimestamp(),
      });
      setDonations((prev) =>
        prev.map((d) =>
          d.id === donation.id
            ? { ...d, reassignmentRequested: false, status: "started" }
            : d
        )
      );
    } catch (yesError) {
      console.error(yesError);
      setError(yesError.message);
    }
  }

  async function handleReassignmentNo(donation) {
    await handleReassignDonation(donation, "ngo_declined");
  }

  useEffect(() => {
    if (destinationType !== "ngo" && destinationType !== "compost") return;
    if (!db || !Array.isArray(donations) || donations.length === 0) return;

    const actorRole = destinationType === "compost" ? "compost" : "ngo";
    const actorId = auth?.currentUser?.uid;

    donations.forEach(async (d) => {
      if (d?.status !== "accepted") return;
      if (d?.reassigned === true || d?.reassignmentRequested === true) return;
      if (!d?.expiryTime || !d?.acceptedAt) return;

      const expiryMs = getExpiryTimeMs(d.expiryTime);
      const acceptedAtMs = getTimeMs(d.acceptedAt);
      if (!Number.isFinite(expiryMs) || !Number.isFinite(acceptedAtMs)) return;

      const remainingMs = expiryMs - currentTime;
      if (remainingMs > 60 * 60 * 1000) return;

      if (reassignmentRequestedRef.current.has(d.id)) return;
      reassignmentRequestedRef.current.add(d.id);

      const donorName = d.donor_name || "Donor";
      const quantity = d.quantity || "";
      const food = d.food_name || "";
      const donationText = `${donorName}'s ${quantity}${food ? ` ${food}` : ""}`;

      try {
        await sendNotification({
          donationId: d.id,
          userId: d?.ngo_id || actorId,
          role: actorRole,
          type: "reassignment_request",
          message: `${actorPrefix} ${actorName}: Only 1 hour left. Can you complete this pickup for ${donationText} donation?`,
          milestone: "one_hour_left_prompt",
        });

        await updateDoc(doc(db, "donations", d.id), {
          reassignmentRequested: true,
          reassignmentRequestedAt: serverTimestamp(),
        });

        setDonations((prev) =>
          prev.map((row) =>
            row.id === d.id
              ? { ...row, reassignmentRequested: true, reassignmentRequestedAt: Date.now() }
              : row
          )
        );
      } catch (requestError) {
        console.error(requestError);
      }
    });
  }, [currentTime, db, destinationType, donations]);

  useEffect(() => {
    if (!db || !Array.isArray(donations) || donations.length === 0) return;
    const timeoutMs = 5 * 60 * 1000;

    donations.forEach(async (d) => {
      if (d?.status !== "accepted") return;
      if (d?.reassigned === true) return;
      if (d?.reassignmentRequested !== true) return;

      const requestedAtMs = getTimeMs(d.reassignmentRequestedAt);
      if (!Number.isFinite(requestedAtMs)) return;
      if (currentTime - requestedAtMs < timeoutMs) return;
      if (reassignmentAutoRef.current.has(d.id)) return;
      reassignmentAutoRef.current.add(d.id);

      await handleReassignDonation(d, "auto_timeout");
    });
  }, [currentTime, db, donations]);

  async function handleAccept(donation) {
    try {
      if (!db) throw new Error("Firestore is not initialized.");
      const id = donation.id;

      await updateDoc(doc(db, "donations", id), {
        status: "accepted",
        acceptedAt: serverTimestamp(),
      });

      const updated = {
        status: "accepted",
        acceptedAt: Date.now(),
        reassignmentRequested: false,
      };

      setDonations((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, ...updated, status: "accepted" } : d
        )
      );

      setNotification({ message: "Donation accepted successfully!" });
      await sendInitialDistanceNotification(donation);

      const matchedDonation = donations.find((d) => d.id === id);
      const detailed = donorDetailedDonationPhrase(donation);
      await sendNotification({
        donationId: id,
        userId: matchedDonation?.userId,
        role: "donor",
        type: "accepted",
        message: `${actorPrefix} ${actorName} has accepted ${detailed}`,
        milestone: "accepted",
      });

      await sendNotification({
        donationId: id,
        userId: auth?.currentUser?.uid,
        role: destinationType,
        type: "ngo_action",
        message: `You accepted ${detailed}`,
        milestone: "accepted_actor",
      });
    } catch (acceptError) {
      console.error(acceptError);
      setError(acceptError.message);
    }
  }

  async function handleOnTheWay(donation) {
    try {
      if (!db) throw new Error("Firestore is not initialized.");
      const id = donation.id;

      console.log("On the Way clicked");
      await updateDoc(doc(db, "donations", id), { status: "started" });

      setDonations((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "started" } : d))
      );
      startLiveTracking(donation);

      const matchedDonation = donations.find((d) => d.id === id);
      console.log("Sending notifications...");

      const detailed = donorDetailedDonationPhrase(donation);
      await sendNotification({
        donationId: id,
        userId: matchedDonation?.userId,
        role: "donor",
        type: "on_the_way",
        message: `${actorPrefix} ${actorName} is on the way for ${detailed}`,
        milestone: "on_the_way",
      });

      await sendNotification({
        donationId: id,
        userId: auth?.currentUser?.uid,
        role: destinationType,
        type: "ngo_action",
        message: `You started pickup for ${detailed}`,
        milestone: "on_the_way_actor",
      });
    } catch (onTheWayError) {
      console.error(onTheWayError);
      setError(onTheWayError.message);
    }
  }

  async function handleComplete(donation) {
    try {
      console.log("🔥 CLICKED COMPLETE BUTTON");
      console.log("📦 Donation Data:", donation);
      const docRef = doc(db, "donations", donation.id);

      const currentNgoUserId = auth?.currentUser?.uid;
      const actorUpdates = currentNgoUserId
        ? destinationType === "compost"
          ? { compost_id: currentNgoUserId }
          : { ngo_id: currentNgoUserId }
        : {};

      await updateDoc(docRef, {
        status: "completed",
        ...actorUpdates,
      });
      stopLiveTracking(donation.id);
      console.log("✅ STATUS UPDATED");

      setDonations((prev) =>
        prev.map((d) =>
          d.id === donation.id ? { ...d, status: "completed", ...actorUpdates } : d
        )
      );

      const donorId = donation?.donor_id ? String(donation.donor_id) : null;
      const ngoId =
        destinationType === "ngo" && currentNgoUserId
          ? String(currentNgoUserId)
          : donation?.ngo_id
            ? String(donation.ngo_id)
            : null;

      console.log("🧾 Extracted IDs:", { donorId, ngoId });

      if (!donorId && !ngoId) {
        console.error("❌ BOTH IDs MISSING → Cannot send notifications");
        return;
      }

      if (donorId) {
        const detailed = donorDetailedDonationPhrase(donation);
        await addDonorNotificationDoc({
          userId: donorId,
          message: `${actorPrefix} ${actorName} has completed ${detailed}`,
          donationId: donation.id,
          role: "donor",
          createdAt: serverTimestamp(),
          timestamp: serverTimestamp(),
          read: false,
        });
        console.log("✅ Donor notification sent");
      } else {
        console.warn("⚠️ donor_id missing");
      }

      if (ngoId) {
        const selfDetail = donorDetailedDonationPhrase(donation);
        await addDoc(collection(db, "notifications"), {
          userId: ngoId,
          message: `You completed ${selfDetail}`,
          donationId: donation.id,
          role: "ngo",
          createdAt: serverTimestamp(),
          timestamp: serverTimestamp(),
          read: false,
        });
        console.log("✅ NGO notification sent");
      } else {
        console.warn("⚠️ ngo_id missing");
      }

      console.log("🎉 COMPLETED FLOW FINISHED");
    } catch (error) {
      console.error("❌ ERROR IN handleComplete:", error);
      setError(error.message);
    }
  }

  function handleViewDetails(donation) {
    setSelectedDonation(donation);
    if (donation?.status === "pending" || donation?.status === "accepted") {
      void sendInitialDistanceNotification(donation);
    }
  }

  const pendingPickups = donations.filter(
    (d) =>
      d.status === "accepted" ||
      d.status === "started" ||
      d.status === "on_the_way" ||
      d.status === "reached"
  );
  const completedDonations = donations.filter((d) => d.status === "completed");

  function renderDonationCard(d) {
    const dateLabel = formatCreatedAtLabel(d.createdAt);
    const status = d.status ?? "pending";
    const expiryLabel = formatExpiryRemainingText(d.expiryTime, currentTime);

    return (
      <div
        key={d.id}
        className="card donation-card w-full bg-white rounded-xl shadow-md p-5"
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          padding: "18px 20px",
          marginBottom: "16px",
          width: "100%",
          boxShadow: "0 3px 12px rgba(0,0,0,0.08)",
          border: "1px solid #e5e7eb",
          transition: "transform 0.2s ease",
          boxSizing: "border-box",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.01)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            marginBottom: dateLabel ? "8px" : "10px",
          }}
        >
          <strong style={{ fontSize: "1.05rem", color: "#111827" }}>
            {d.type} {d.condition && `(${d.condition})`}
          </strong>
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
          <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#6b7280", lineHeight: 1.45 }}>
            Submitted {dateLabel}
          </p>
        ) : null}

        <p style={{ margin: "7px 0", color: "#374151", lineHeight: 1.45 }}>Quantity: {d.quantity}</p>
        <p style={{ margin: "7px 0", color: "#374151", lineHeight: 1.45 }}>
          Location: {shortAddress(d.location)}
        </p>
        <p style={{ margin: "7px 0", color: "#374151", lineHeight: 1.45 }}>
          Donor: {d.donor_name || "Unknown"}
        </p>
        <p style={{ margin: "7px 0", color: "#374151", lineHeight: 1.45 }}>
          Destination: {d.destination_type}
        </p>
        {expiryLabel ? (
          <p
            style={{
              margin: "8px 0",
              fontSize: "13px",
              color: expiryLabel === "Expired" ? "#b91c1c" : "#047857",
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            ⏱ {expiryLabel}
          </p>
        ) : null}
        {(d.status === "on_the_way" || d.status === "started" || d.status === "reached") &&
        Number.isFinite(distanceByDonation[d.id]) ? (
          distanceByDonation[d.id] < 0.1 ? (
            userRole === "donor" ? (
              <p style={{ color: "#22C55E", fontWeight: "bold" }}>
                {actorPrefix} reached your location 🚚
              </p>
            ) : null
          ) : (
            <p>Distance: {distanceByDonation[d.id].toFixed(2)} km away</p>
          )
        ) : null}

        <div className="card-actions">
          {d.status === "pending" && (
            <button className="btn-primary" onClick={() => handleAccept(d)}>
              Accept
            </button>
          )}

          {d.status === "accepted" && (
            <>
              {d.reassignmentRequested ? (
                <>
                  <button
                    className="btn-secondary"
                    onClick={() => handleReassignmentYes(d)}
                  >
                    YES
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => handleReassignmentNo(d)}
                  >
                    NO
                  </button>
                </>
              ) : (
                <button
                  className="btn-secondary"
                  onClick={() => handleOnTheWay(d)}
                >
                  On the Way
                </button>
              )}
              <button
                className="btn-secondary"
                onClick={() => handleViewDetails(d)}
              >
                View Details
              </button>
            </>
          )}

          {(d.status === "on_the_way" || d.status === "started" || d.status === "reached") && (
            <>
              <button
                className="btn-secondary"
                onClick={() => handleComplete(d)}
              >
                Completed
              </button>
              <button
                className="btn-secondary"
                onClick={() => handleViewDetails(d)}
              >
                View Details
              </button>
            </>
          )}

          {d.status === "completed" && (
            <p style={{ color: "#22C55E", fontWeight: "bold" }}>
              Completed ✅
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page donations-dashboard flex-1 w-full p-6 overflow-y-auto">
      <div
        style={{
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 18 }}>{title}</h2>

        {notification && (
          <div className="card" style={{ marginBottom: 14 }}>
            {notification.message}
          </div>
        )}

        {loading && <p>Loading...</p>}
        {error && <p style={{ color: "red", marginBottom: 10 }}>{error}</p>}

        <h3 style={{ margin: "12px 0 10px" }}>New Donations</h3>
        <div className="grid grid-cols-1 gap-6 space-y-6" style={{ display: "grid", width: "100%" }}>
          {newDonations.map((d) => renderDonationCard(d))}
        </div>

        <h3 style={{ margin: "14px 0 10px" }}>Pending Pickups</h3>
        <div className="grid grid-cols-1 gap-6 space-y-6" style={{ display: "grid", width: "100%" }}>
          {pendingPickups.map((d) => renderDonationCard(d))}
        </div>

        <p style={{ marginTop: 10, color: "#6b7280", lineHeight: 1.45 }}>
          Completed pickups moved to History ({completedDonations.length})
        </p>

        {selectedDonation && (
          <DonationDetailsModal
            donation={selectedDonation}
            onClose={() => setSelectedDonation(null)}
          />
        )}
      </div>
    </div>
  );
}