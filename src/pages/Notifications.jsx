import { useNotifications } from "../contexts/NotificationsContext";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

function notificationIcon(message) {
  const m = String(message ?? "").toLowerCase();
  if (m.includes("on the way") || m.includes("journey")) return "🚚";
  if (
    m.includes("reached") ||
    m.includes("meters away") ||
    m.includes("km away")
  )
    return "📍";
  if (m.includes("completed")) return "✅";
  return "🔔";
}

function getNotificationTimeMs(n) {
  if (typeof n.createdAt === "number") return n.createdAt;
  if (n.createdAt?.toMillis) return n.createdAt.toMillis();
  if (n.timestamp?.toMillis) return n.timestamp.toMillis();
  if (typeof n.timestamp === "number") return n.timestamp;
  return 0;
}

function formatTimestampLabel(ms) {
  if (!ms) return null;
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

const unreadCardStyle = {
  padding: "16px 18px",
  borderRadius: "12px",
  marginBottom: "14px",
  background: "#ecfdf5",
  color: "#1f2937",
  border: "1px solid rgba(34, 197, 94, 0.35)",
  borderLeft: "4px solid #22c55e",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
};

const readCardStyle = {
  padding: "16px 18px",
  borderRadius: "12px",
  marginBottom: "14px",
  background: "#f9fafb",
  color: "#1f2937",
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
};

export default function Notifications({ role }) {
  const { notifications, markAllAsRead, markAsRead } = useNotifications();

  const normalizedRole = String(role ?? "").toLowerCase();
  const currentUserId = auth?.currentUser?.uid;
  const list = notifications
    .filter((n) =>
      currentUserId
        ? n.userId === currentUserId
        : n.role === normalizedRole
    )
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

  const unreadList = list.filter((n) => !n.read);
  const readList = list.filter((n) => n.read);

  async function handleMarkAsRead(notificationId) {
    markAsRead(notificationId);

    try {
      if (!db) return;
      const ref = doc(db, "notifications", notificationId);
      await updateDoc(ref, { read: true });
    } catch (error) {
      console.error("Firestore notification update failed:", error);
    }
  }

  async function handleMarkAllAsRead() {
    markAllAsRead(normalizedRole);

    try {
      if (!db) return;
      const updates = unreadList.map((n) =>
        updateDoc(doc(db, "notifications", n.id), { read: true })
      );
      await Promise.all(updates);
    } catch (error) {
      console.error("Firestore mark-all notification update failed:", error);
    }
  }

  function renderRow(n, isUnread) {
    const timeMs = getNotificationTimeMs(n);
    const timeLabel = formatTimestampLabel(timeMs);
    const icon = notificationIcon(n.message);

    return (
      <div key={n.id} style={isUnread ? unreadCardStyle : readCardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              flex: 1,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: "1.35rem",
                lineHeight: 1.2,
                flexShrink: 0,
              }}
              aria-hidden
            >
              {icon}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: isUnread ? 700 : 500,
                  lineHeight: 1.45,
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  whiteSpace: "normal",
                  maxWidth: "100%",
                }}
              >
                {n.message}
              </div>
              {timeLabel ? (
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "12px",
                    color: "#6b7280",
                  }}
                >
                  {timeLabel}
                </div>
              ) : null}
            </div>
          </div>

          {isUnread ? (
            <button
              className="btn-secondary"
              style={{ whiteSpace: "nowrap", flexShrink: 0 }}
              onClick={() => handleMarkAsRead(n.id)}
            >
              Mark as read
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="card" style={{ padding: "18px 20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>Notifications</h3>

          <button
            className="btn-secondary"
            onClick={handleMarkAllAsRead}
          >
            Mark all as read
          </button>
        </div>

        {list.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280" }}>No notifications yet</p>
        ) : (
          <>
            <div style={{ marginTop: 8 }}>
              <h4
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "0.95rem",
                  color: "#374151",
                }}
              >
                Unread Notifications
              </h4>
              <div>
                {unreadList.map((n) => renderRow(n, true))}
              </div>
            </div>

            <div style={{ marginTop: 22 }}>
              <h4
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "0.95rem",
                  color: "#374151",
                }}
              >
                Read Notifications
              </h4>
              <div>{readList.map((n) => renderRow(n, false))}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
