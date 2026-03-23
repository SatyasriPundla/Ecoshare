import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "../firebase"; // ✅ IMPORTANT
import { doc, setDoc } from "firebase/firestore";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("donor");
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const USER_API_BASE_URL = "http://localhost:5000/api/users";

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

    try {
      // ✅ Create user in Firebase Auth
      const userCred = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // ✅ Store user name in Firebase Authentication profile
      await updateProfile(userCred.user, {
        displayName: name,
      });

      // ✅ Save user data in Firestore
      await setDoc(doc(db, "users", userCred.user.uid), {
        name,
        email,
        role,
      });

      // ✅ Also save user data in MongoDB backend
      try {
        const resp = await fetch(USER_API_BASE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: userCred.user.uid,
            email: userCred.user.email,
            role,
          }),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          void text;
        }
      } catch (apiErr) {
        void apiErr;
      }

      // ✅ Redirect to login
      navigate("/login");

    } catch (err) {
      setError(err.message || "Registration failed");
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
        <h2>Register</h2>

        <form onSubmit={handleSubmit}>
          <div>
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="donor">donor</option>
              <option value="ngo">ngo</option>
              <option value="compost">compost</option>
            </select>
          </div>

          <button className="primary-btn" type="submit">
            Create account
          </button>
        </form>

        {error && <p className="error-text">{error}</p>}

        <p className="hint">
          Already have an account?{" "}
          <button
            onClick={() => navigate("/login")}
            className="link-btn"
            type="button"
          >
            Go to login
          </button>
        </p>
      </div>
    </div>
  );
}