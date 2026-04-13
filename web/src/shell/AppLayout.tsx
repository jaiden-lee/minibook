import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AppearanceProvider, useAppearance } from "@/shell/AppearanceContext";
import { AuthProvider, useAuth } from "@/shell/AuthContext";

const navItems = [
  { label: "Library", icon: "auto_stories", to: "/" },
  { label: "Recent", icon: "history", to: "/" },
  { label: "Collections", icon: "library_books", to: "/" },
  { label: "Settings", icon: "settings", to: "/settings" },
];

export function AppLayout() {
  return (
    <AppearanceProvider>
      <AuthProvider>
        <AppLayoutInner />
      </AuthProvider>
    </AppearanceProvider>
  );
}

function AppLayoutInner() {
  const location = useLocation();
  const isReader = location.pathname.startsWith("/read/");
  const { theme } = useAppearance();
  const auth = useAuth();

  if (isReader) {
    return <div className={`app-theme app-theme-${theme}`}><Outlet /></div>;
  }

  return (
    <div className={`app-theme app-theme-${theme}`}>
      <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-title">minibook</div>
          <div className="brand-subtitle">Your Quiet Reading Space</div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
            >
              <MaterialIcon>{item.icon}</MaterialIcon>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {auth.isConfigured ? (
            auth.accessToken ? (
              <button className="primary-button" type="button" onClick={auth.signOut}>
                <MaterialIcon>cloud_done</MaterialIcon>
                <span>Disconnect Drive</span>
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={auth.signIn}
                disabled={auth.status === "loading" || auth.status === "authorizing"}
              >
                <MaterialIcon>cloud</MaterialIcon>
                <span>{auth.status === "authorizing" ? "Connecting..." : "Connect Drive"}</span>
              </button>
            )
          ) : (
            <button className="primary-button" type="button" disabled title="Add VITE_GOOGLE_CLIENT_ID in web/.env.local.">
              <MaterialIcon>cloud_off</MaterialIcon>
              <span>Drive Unconfigured</span>
            </button>
          )}
          <div className="subtle-note">
            {auth.accessToken
              ? auth.profile?.email ?? "Connected to Google Drive."
              : auth.isConfigured
                ? auth.error ?? "Sign in to enable Google Drive progress sync."
                : "Add VITE_GOOGLE_CLIENT_ID in web/.env.local to enable Google Drive sign-in."}
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <label className="search-box">
            <MaterialIcon>search</MaterialIcon>
            <input
              type="text"
              placeholder="Search your sanctuary..."
              disabled
            />
          </label>

          <div className="status-pill">
            {auth.accessToken ? "Drive connected" : "Offline-first library"}
          </div>
        </header>

        <Outlet />
      </div>
    </div>
    </div>
  );
}

function MaterialIcon({ children }: { children: string }) {
  return <span className="material-symbols-outlined">{children}</span>;
}
