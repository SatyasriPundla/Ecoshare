import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const navbarEl = document.querySelector(".navbar");
    const sidebarEl = document.querySelector(".sidebar");

    const prevNavbarDisplay = navbarEl?.style.display;
    const prevSidebarDisplay = sidebarEl?.style.display;

    if (navbarEl) navbarEl.style.display = "none";
    if (sidebarEl) sidebarEl.style.display = "none";

    return () => {
      if (navbarEl) navbarEl.style.display = prevNavbarDisplay ?? "";
      if (sidebarEl) sidebarEl.style.display = prevSidebarDisplay ?? "";
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!role) {
      setError("Please select role");
      return;
    }

    try {
      // 🔥 Login user
      const userCred = await signInWithEmailAndPassword(auth, email, password);

      // 🔥 Get user data from Firestore
      const docRef = doc(db, "users", userCred.user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const firestoreRole = docSnap.data().role;

        if (role !== firestoreRole) {
          await signOut(auth);
          setError("Incorrect role selected");
          return;
        }

        localStorage.setItem("role", firestoreRole);

        // 🔥 Redirect based on role
        if (firestoreRole === "donor") navigate("/donor");
        else if (firestoreRole === "ngo") navigate("/ngo");
        else if (firestoreRole === "compost") navigate("/compost");
        else setError("Invalid role found");
      } else {
        setError("User data not found in database");
      }

    } catch (err) {
      setError(err?.message ?? "Login failed");
    }
  }

  return (
    <div
      className="dashboard-page auth-page"
      style={{
        background: "#F9FAFB",
        width: "100%",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <style>{`
        .auth-page .auth-card {
          max-width: 400px;
          margin: auto;
          margin-top: 80px;
          padding: 24px;
          background: #FFFFFF;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          width: 100%;
          box-sizing: border-box;
        }
        .auth-page h2 {
          text-align: center;
          font-size: 24px;
          font-weight: bold;
          color: #111827;
          margin-bottom: 20px;
        }
        .auth-page input,
        .auth-page select {
          width: 100%;
          padding: 10px;
          margin-bottom: 12px;
          border: 1px solid #D1D5DB;
          border-radius: 8px;
          box-sizing: border-box;
        }
        .auth-page input:focus,
        .auth-page select:focus {
          border-color: #22C55E;
          outline: none;
        }
        .auth-page .primary-btn {
          width: 100%;
          background-color: #22C55E;
          color: white;
          padding: 10px;
          border-radius: 8px;
          font-weight: 500;
          border: none;
          cursor: pointer;
        }
        .auth-page .primary-btn:hover {
          background-color: #16A34A;
        }
        .auth-page .link-btn {
          color: #22C55E;
          text-align: center;
          display: block;
          margin-top: 10px;
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          font-weight: 500;
        }
        .auth-page .error-text {
          color: #DC2626;
          text-align: center;
          margin-top: 10px;
        }
        .auth-page .hint {
          text-align: center;
        }
      `}</style>

      <div className="auth-card">
        <h2>Login</h2>

        <form onSubmit={handleSubmit}>
          <div>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          </div>

          <div>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          </div>

          <div>
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">Select Role</option>
                <option value="donor">Donor</option>
                <option value="ngo">NGO</option>
                <option value="compost">Compost</option>
              </select>
            </label>
          </div>

          <button className="primary-btn" type="submit">
            Sign in
          </button>
        </form>

        {error ? <p className="error-text">{error}</p> : null}

        <p className="hint">
          New here?{" "}
          <button type="button" className="link-btn" onClick={() => navigate("/register")}>
            Register
          </button>
        </p>
      </div>
    </div>
  );
}