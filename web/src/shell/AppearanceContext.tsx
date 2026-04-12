import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppearanceTheme = "light" | "sepia" | "slate";

type AppearanceContextValue = {
  theme: AppearanceTheme;
  setTheme: (theme: AppearanceTheme) => void;
};

const APPEARANCE_THEME_KEY = "minibook:appearance-theme";

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppearanceTheme>(() => readStoredTheme());

  useEffect(() => {
    localStorage.setItem(APPEARANCE_THEME_KEY, theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used within AppearanceProvider.");
  }

  return context;
}

function readStoredTheme(): AppearanceTheme {
  const value = localStorage.getItem(APPEARANCE_THEME_KEY);
  return value === "sepia" || value === "slate" ? value : "light";
}
