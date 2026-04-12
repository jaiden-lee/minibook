import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AppearanceProvider, useAppearance } from "@/shell/AppearanceContext";

const navItems = [
  { label: "Library", icon: "auto_stories", to: "/" },
  { label: "Recent", icon: "history", to: "/" },
  { label: "Collections", icon: "library_books", to: "/" },
  { label: "Settings", icon: "settings", to: "/settings" },
];

export function AppLayout() {
  return (
    <AppearanceProvider>
      <AppLayoutInner />
    </AppearanceProvider>
  );
}

function AppLayoutInner() {
  const location = useLocation();
  const isReader = location.pathname.startsWith("/read/");
  const { theme } = useAppearance();

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
          <button
            className="primary-button"
            type="button"
            disabled
            title="Google Drive sync will be added in the next implementation step."
          >
            <MaterialIcon>cloud</MaterialIcon>
            <span>Drive Sync Soon</span>
          </button>
          <div className="subtle-note">
            Local-first reading is live. Google Drive progress sync comes next.
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

          <div className="status-pill">Offline-first library</div>
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
