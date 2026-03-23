import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import Donor from "./pages/Donor.jsx";
import DonorHistory from "./pages/DonorHistory.jsx";
import Ngo from "./pages/Ngo.jsx";
import Compost from "./pages/Compost.jsx";
import NgoHistory from "./pages/NgoHistory.jsx";
import CompostHistory from "./pages/CompostHistory.jsx";
import Notifications from "./pages/Notifications.jsx";

import NotificationBell from "./components/NotificationBell.jsx";
import { NotificationsProvider } from "./contexts/NotificationsContext.jsx";

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setProfile(null);
        return;
      }

      try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfile({
            name: data?.name ?? user.email ?? "User",
            role: data?.role ?? null,
          });
        } else {
          setProfile({
            name: user.email ?? "User",
            role: null,
          });
        }
      } catch {
        setProfile({
          name: user.email ?? "User",
          role: null,
        });
      }
    });

    return () => unsub();
  }, []);

  const role = profile?.role;
  const userName = profile?.name;

  const dashboardPath =
    role === "ngo" ? "/ngo" : role === "compost" ? "/compost" : "/donor";
  const historyPath =
    role === "ngo"
      ? "/ngo/history"
      : role === "compost"
      ? "/compost/history"
      : "/donor/history";

  async function handleLogout() {
    try {
      if (!auth.currentUser) {
        navigate("/login");
        return;
      }
      await signOut(auth);
      navigate("/login");
    } catch (err) {
      // Intentionally ignore logout failures to avoid crashing UI.
      void err;
    }
  }

  return (
    <div className="layout">
      {/* Navbar */}
      <div className="navbar">
        <div className="logo">EcoShare</div>

        <div className="navbar-right">
          <span className="nav-username">
            {userName
              ? `${userName}${role ? ` (${role})` : ""}`
              : "User"}
          </span>

          <NotificationBell role={role} />

          <button
            className="btn-secondary"
            onClick={handleLogout}
            style={{
              backgroundColor: "#EF4444",
              color: "white",
              padding: "8px 12px",
              borderRadius: 6,
              marginLeft: 10,
              border: "1px solid #EF4444",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Sidebar + Content */}
      <div className="layout-body">
        <div className="sidebar">
          <div className="sidebar-header">Menu</div>

          <ul>
            <li
              className={
                location.pathname === "/donor" ||
                location.pathname === "/ngo" ||
                location.pathname === "/compost"
                  ? "active"
                  : ""
              }
            >
              <Link to={dashboardPath}>Dashboard</Link>
            </li>

            <li
              className={
                location.pathname === "/notifications" ? "active" : ""
              }
            >
              <Link to="/notifications">Notifications</Link>
            </li>

            {role === "donor" ? (
              <li
                className={
                  location.pathname === "/donor/history" ? "active" : ""
                }
              >
                <Link to="/donor/history">History</Link>
              </li>
            ) : null}

            {role === "ngo" || role === "compost" ? (
              <li
                className={
                  location.pathname === "/ngo/history" ||
                  location.pathname === "/compost/history"
                    ? "active"
                    : ""
                }
              >
                <Link to={historyPath}>History</Link>
              </li>
            ) : null}
          </ul>
        </div>

        <main className="main">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/donor" element={<Donor />} />
            <Route path="/donor/history" element={<DonorHistory />} />
            <Route path="/ngo" element={<Ngo />} />
            <Route path="/ngo/history" element={<NgoHistory />} />
            <Route path="/compost" element={<Compost />} />
            <Route path="/compost/history" element={<CompostHistory />} />
            <Route
              path="/notifications"
              element={<Notifications role={role} />}
            />

            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <NotificationsProvider>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </NotificationsProvider>
  );
}