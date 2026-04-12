import { useAppearance, type AppearanceTheme } from "@/shell/AppearanceContext";

const THEMES: Array<{ value: AppearanceTheme; label: string; note: string }> = [
  { value: "light", label: "Light", note: "Bright paper and the original library look." },
  { value: "sepia", label: "Sepia", note: "Warmer tones across the library and reader." },
  { value: "slate", label: "Slate", note: "A darker reading surface for the whole app." },
];

export function SettingsPage() {
  const { theme, setTheme } = useAppearance();

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
    </div>
  );
}
