import { useAppearance, type AppearanceTheme } from "@/shell/AppearanceContext";
import { useAuth } from "@/shell/AuthContext";
import { useSync } from "@/shell/SyncContext";

const THEMES: Array<{ value: AppearanceTheme; label: string; note: string }> = [
  { value: "light", label: "Light", note: "Bright paper and the original library look." },
  { value: "sepia", label: "Sepia", note: "Warmer tones across the library and reader." },
  { value: "slate", label: "Slate", note: "A darker reading surface for the whole app." },
];

export function SettingsPage() {
  const { theme, setTheme } = useAppearance();
  const auth = useAuth();
  const sync = useSync();

  return (
    <div className="page-wrap">
      <section className="settings-hero">
        <div>
          <h1>Settings</h1>
          <p>Appearance is global. Changing it here updates the library, reader, and the rest of the site.</p>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-section-title">Appearance</div>
        <div className="settings-theme-grid">
          {THEMES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`settings-theme-option${theme === option.value ? " active" : ""}`}
              onClick={() => setTheme(option.value)}
            >
              <div className={`settings-theme-preview settings-theme-preview-${option.value}`} />
              <div className="settings-theme-copy">
                <strong>{option.label}</strong>
                <span>{option.note}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card settings-card-spaced">
        <div className="settings-section-title">Google Drive</div>
        <div className="settings-auth-row">
          <div className="settings-theme-copy">
            <strong>
              {auth.isAuthenticated
                ? auth.profile?.email ?? "Signed in"
                : auth.isConfigured
                  ? "Sign in to enable sync"
                  : "Google sign-in is not configured"}
            </strong>
            <span>
              {auth.isAuthenticated
                ? "Your progress sync now runs through the local server and Drive."
                : auth.isConfigured
                  ? "Drive sync is optional. Local reading works without signing in."
                  : "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env.local and restart the server."}
            </span>
          </div>

          {auth.isConfigured ? (
            auth.isAuthenticated ? (
              <button type="button" className="primary-button" onClick={() => void auth.signOut()}>
                Disconnect Drive
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                onClick={auth.signIn}
                disabled={auth.status === "loading"}
              >
                Sign in with Google
              </button>
            )
          ) : (
            <button type="button" className="primary-button" disabled>
              Missing Client ID
            </button>
          )}
        </div>

        {auth.error ? <div className="settings-inline-note">{auth.error}</div> : null}
      </section>

      <section className="settings-card settings-card-spaced">
        <div className="settings-section-title">Sync Diagnostics</div>
        <div className="settings-diagnostics-grid">
          <div className="settings-diagnostic">
            <strong>{sync.pendingCount}</strong>
            <span>Pending books</span>
          </div>
          <div className="settings-diagnostic">
            <strong>{sync.failedCount}</strong>
            <span>Books with sync issues</span>
          </div>
          <div className="settings-diagnostic">
            <strong>{sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleTimeString() : "--"}</strong>
            <span>Last successful sync</span>
          </div>
        </div>

        <div className="settings-auth-row">
          <div className="settings-theme-copy">
            <strong>Sync queue</strong>
            <span>Retry all pending progress uploads across your local library.</span>
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={() => void sync.syncAllPending()}
            disabled={sync.pendingCount === 0 || sync.isSyncingAll}
          >
            {sync.isSyncingAll ? "Syncing..." : "Sync All Pending"}
          </button>
        </div>
      </section>
    </div>
  );
}
