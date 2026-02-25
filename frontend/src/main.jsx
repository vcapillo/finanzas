import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import LoginScreen, { useAuth } from "./LoginScreen.jsx";
import "./index.css";

function Root() {
  const { authed, login, logout } = useAuth();

  if (!authed) {
    return <LoginScreen onLogin={login} />;
  }

  return <App onLogout={logout} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
