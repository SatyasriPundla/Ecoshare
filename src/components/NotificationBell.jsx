import { useMemo, useState } from "react";
import { useNotifications } from "../contexts/NotificationsContext.jsx";
import { auth, db } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";

export default function NotificationBell({ role }) {
  const { notifications, markAsRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const normalizedRole = String(role ?? "").toLowerCase();
  const currentUserId = auth?.currentUser?.uid;
  const dropdownBaseStyle = {
    backgroundColor: "#ECFDF5",
    color: "#065F46",
    border: "1px solid #A7F3D0",
    borderRadius: 8,
    padding: 8,
  };

  const notificationCardStyle = (n) => {
    const isRead = Boolean(n.read);
    return {
      backgroundColor: isRead ? "#F3F4F6" : "#ECFDF5",
      color: "#065F46",
      padding: 10,
      borderRadius: 8,
      marginBottom: 6,
      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
      border: "1px solid #A7F3D0",
      fontWeight: isRead ? 500 : 700,
      opacity: isRead ? 0.85 : 1,
    };
  };

  const visibleNotifications = useMemo(() => {
    if (!normalizedRole) return [];
    return notifications
      .filter((n) =>
        currentUserId ? n.userId === currentUserId : n.role === normalizedRole
      )
      .slice()
      .sort((a, b) => {
        const aTs =
          typeof a.createdAt === "number"
            ? a.createdAt
            : a.createdAt?.toMillis?.() ?? a.timestamp ?? 0;
        const bTs =
          typeof b.createdAt === "number"
            ? b.createdAt
            : b.createdAt?.toMillis?.() ?? b.timestamp ?? 0;
        return bTs - aTs;
      });
  }, [notifications, normalizedRole, currentUserId]);

  const unreadCount = useMemo(() => {
    return visibleNotifications.reduce((acc, n) => acc + (!n.read ? 1 : 0), 0);
  }, [visibleNotifications]);

  async function handleMarkAsRead(notificationId) {
    markAsRead(notificationId);
    try {
      if (!db) return;
      await updateDoc(doc(db, "notifications", notificationId), { read: true });
    } catch (error) {
      console.error("Notification bell read update failed:", error);
    }
  }

  return (
    <div className="notification-bell" onClick={() => setOpen((v) => !v)} role="button" tabIndex={0}>
      <span aria-hidden="true">🔔</span>
      {unreadCount > 0 ? <span className="badge">{unreadCount}</span> : null}

      {open ? (
        <ul className="notification-list" style={dropdownBaseStyle}>
          {visibleNotifications.length === 0 ? (
            <li
              className="notification-empty"
              style={{
                backgroundColor: "#F3F4F6",
                color: "#065F46",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #A7F3D0",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              No notifications
            </li>
          ) : (
            visibleNotifications.map((n) => (
              <li
                key={n.id}
                className={n.read ? "" : "unread"}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkAsRead(n.id);
                }}
                style={notificationCardStyle(n)}
              >
                {n.message}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

