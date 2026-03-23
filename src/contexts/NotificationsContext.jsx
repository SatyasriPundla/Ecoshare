/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

const NotificationsContext = createContext(null);
const STORAGE_KEY = "ecoshare_notifications_v2";

function safeParse(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function NotificationsProvider({ children }) {
  const [notifications, setNotifications] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return safeParse(raw);
    } catch {
      return [];
    }
  });

  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUserId(u?.uid ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch {
      // Keep in-memory notifications when storage is unavailable.
    }
  }, [notifications]);

  useEffect(() => {
    if (!db || !currentUserId) return undefined;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", currentUserId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docItem) => {
          const payload = docItem.data();
          const notification = {
            id: docItem.id,
            ...payload,
            read: payload?.read ?? false,
          };
          console.log(notification.read);
          return notification;
        });
        // Source of truth is Firestore; avoid preserving stale local read flags.
        setNotifications(data);
      },
      (error) => {
        console.error("Notifications onSnapshot error:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUserId]);

  const value = useMemo(() => {
    function addNotification({ message, role, donationId }) {
      const id = `${donationId}_${role}_${message}`;

      setNotifications((prev) => {
        if (prev.some((n) => n.id === id)) return prev;

        return [
          {
            id,
            message,
            role,
            read: false,
            timestamp: Date.now(),
          },
          ...prev,
        ];
      });
    }

    function markAsRead(id) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    }

    function markAllAsRead(role) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.role === role ? { ...n, read: true } : n
        )
      );
    }

    return {
      notifications,
      addNotification,
      markAsRead,
      markAllAsRead,
    };
  }, [notifications]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}