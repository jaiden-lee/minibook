import { useAppearance, type AppearanceTheme } from "@/shell/AppearanceContext";
import { useAuth } from "@/shell/AuthContext";

const THEMES: Array<{ value: AppearanceTheme; label: string; note: string }> = [
  { value: "light", label: "Light", note: "Bright paper and the original library look." },
  { value: "sepia", label: "Sepia", note: "Warmer tones across the library and reader." },
  { value: "slate", label: "Slate", note: "A darker reading surface for the whole app." },
];

export function SettingsPage() {
  const { theme, setTheme } = useAppearance();
  const auth = useAuth();

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
              {auth.accessToken
                ? auth.profile?.email ?? "Signed in"
                : auth.isConfigured
                  ? "Sign in to enable sync"
                  : "Google sign-in is not configured"}
            </strong>
            <span>
              {auth.accessToken
                ? "You can now sync the currently open book from the reader."
                : auth.isConfigured
                  ? "Drive sync is optional. Local reading works without signing in."
                  : "Add VITE_GOOGLE_CLIENT_ID in web/.env.local and restart the dev server."}
            </span>
          </div>

          {auth.isConfigured ? (
            auth.accessToken ? (
              <button type="button" className="primary-button" onClick={auth.signOut}>
                Disconnect Drive
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                onClick={auth.signIn}
                disabled={auth.status === "loading" || auth.status === "authorizing"}
              >
                {auth.status === "authorizing" ? "Connecting..." : "Sign in with Google"}
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
    </div>
  );
}
