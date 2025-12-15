import React, { useCallback, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebaseClient";
import { API_ENDPOINTS } from "./config";
import "./Auth.css";

const AdminLoginForm = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    email: "admin@autopromote.org",
    password: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = useCallback(
    event => {
      const { name, value } = event.target;
      setFormData(previous => ({ ...previous, [name]: value }));
      if (errorMessage) {
        setErrorMessage("");
      }
    },
    [errorMessage]
  );

  const handleSubmit = async event => {
    event.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    try {
      const { email, password } = formData;
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const { user } = credential;
      const idToken = await user.getIdToken(true);

      // Confirm admin privileges with the backend before allowing access.
      const response = await fetch(API_ENDPOINTS.ADMIN_LOGIN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: window.location.origin,
        },
        body: JSON.stringify({
          idToken,
          email,
          isAdminLogin: true,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Admin authentication failed");
      }

      const data = await response.json();

      if (!data?.user || (!data.user.isAdmin && data.user.role !== "admin")) {
        throw new Error("Not authorized as admin");
      }

      onLogin({
        email: data.user.email,
        uid: data.user.uid,
        role: "admin",
        isAdmin: true,
        name: data.user.name,
        token: data.token,
        fromCollection: data.user.fromCollection || "admins",
      });
    } catch (caughtError) {
      let message = "Admin login failed. ";

      if (caughtError instanceof Error && caughtError.message.includes("Failed to fetch")) {
        message +=
          "Cannot connect to the server. Please ensure the backend is running on port 5000.";
      } else if (caughtError instanceof Error && caughtError.message.includes("Not authorized")) {
        message += "Your account lacks admin permissions. Please contact support.";
      } else if (caughtError?.code) {
        switch (caughtError.code) {
          case "auth/invalid-credential":
            message += "Invalid admin email or password.";
            break;
          case "auth/user-not-found":
            message += "No admin account exists with this email.";
            break;
          case "auth/wrong-password":
            message += "Incorrect admin password.";
            break;
          case "auth/invalid-api-key":
            message += "Invalid Firebase configuration. Please verify the Firebase keys.";
            break;
          case "auth/network-request-failed":
            message += "Network error. Please check your connection.";
            break;
          default:
            message += caughtError.message || "Unknown error occurred.";
        }
      } else if (caughtError instanceof Error) {
        message += caughtError.message || "Unknown error occurred.";
      }

      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2 className="auth-title">Admin Login</h2>
        {errorMessage && <div className="error-message">{errorMessage}</div>}

        <div className="form-group">
          <label className="form-label">Admin Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className="form-input"
            placeholder="Enter admin email"
            required
            autoComplete="email"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Admin Password</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            className="form-input"
            placeholder="Enter admin password"
            required
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="auth-button"
          style={{ backgroundColor: "#d32f2f" }}
        >
          {isLoading ? (
            <>
              <span className="loading-spinner" />
              Signing in as Admin...
            </>
          ) : (
            "Sign In as Admin"
          )}
        </button>

        <div
          className="admin-login-help"
          style={{ marginTop: "15px", fontSize: "14px", color: "#666" }}
        >
          <p>Default admin credentials:</p>
          <p>Email: admin@autopromote.org</p>
          <p>Password: AdminPassword123!</p>
        </div>

        <button type="button" onClick={() => window.location.reload()} className="auth-link">
          Go to user login
        </button>
      </form>
    </div>
  );
};

export default AdminLoginForm;
