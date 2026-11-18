"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Moon, Sun } from "lucide-react";
import {
  DEFAULT_APP_LANGUAGE,
  DEFAULT_APP_THEME,
  getAppTranslations,
  isAppLanguage,
  isAppTheme,
  type AppLanguage,
  type AppTheme,
} from "@/lib/i18n";

export const THEME_STORAGE_KEY = "mailcleaner-theme";
export const LANG_STORAGE_KEY = "mailcleaner-lang";

export interface AppPreferencesContextValue {
  theme: AppTheme;
  lang: AppLanguage;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  setLang: (lang: AppLanguage) => void;
  toggleLang: () => void;
}

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(
  null,
);

const preferenceListeners = new Set<() => void>();

function notifyPreferenceListeners(): void {
  for (const listener of preferenceListeners) {
    listener();
  }
}

function subscribePreferences(listener: () => void): () => void {
  preferenceListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      preferenceListeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === THEME_STORAGE_KEY ||
      event.key === LANG_STORAGE_KEY
    ) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);
  return () => {
    preferenceListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function readThemeSnapshot(): AppTheme {
  if (typeof window === "undefined") {
    return DEFAULT_APP_THEME;
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isAppTheme(stored) ? stored : DEFAULT_APP_THEME;
  } catch {
    return DEFAULT_APP_THEME;
  }
}

function readLangSnapshot(): AppLanguage {
  if (typeof window === "undefined") {
    return DEFAULT_APP_LANGUAGE;
  }
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    return isAppLanguage(stored) ? stored : DEFAULT_APP_LANGUAGE;
  } catch {
    return DEFAULT_APP_LANGUAGE;
  }
}

function getServerThemeSnapshot(): AppTheme {
  return DEFAULT_APP_THEME;
}

function getServerLangSnapshot(): AppLanguage {
  return DEFAULT_APP_LANGUAGE;
}

function applyThemeToDocument(theme: AppTheme): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function applyLangToDocument(lang: AppLanguage): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.lang = lang;
}

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribePreferences,
    readThemeSnapshot,
    getServerThemeSnapshot,
  );
  const lang = useSyncExternalStore(
    subscribePreferences,
    readLangSnapshot,
    getServerLangSnapshot,
  );

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    applyLangToDocument(lang);
  }, [lang]);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // Ignore storage write errors in restricted browser contexts.
      }
    }
    applyThemeToDocument(nextTheme);
    notifyPreferenceListeners();
  }, []);

  const toggleTheme = useCallback(() => {
    const current = readThemeSnapshot();
    setTheme(current === "dark" ? "light" : "dark");
  }, [setTheme]);

  const setLang = useCallback((nextLang: AppLanguage) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LANG_STORAGE_KEY, nextLang);
      } catch {
        // Ignore storage write errors in restricted browser contexts.
      }
    }
    applyLangToDocument(nextLang);
    notifyPreferenceListeners();
  }, []);

  const toggleLang = useCallback(() => {
    const current = readLangSnapshot();
    setLang(current === "en" ? "es" : "en");
  }, [setLang]);

  const value = useMemo<AppPreferencesContextValue>(
    () => ({
      theme,
      lang,
      setTheme,
      toggleTheme,
      setLang,
      toggleLang,
    }),
    [theme, lang, setTheme, toggleTheme, setLang, toggleLang],
  );

  return (
    <AppPreferencesContext.Provider value={value}>
      {children}
    </AppPreferencesContext.Provider>
  );
}

export function useAppPreferences(): AppPreferencesContextValue {
  const context = useContext(AppPreferencesContext);
  if (!context) {
    throw new Error(
      "useAppPreferences must be used within an AppPreferencesProvider",
    );
  }
  return context;
}

export function ThemeLangControls({
  className = "",
}: {
  className?: string;
}) {
  const { theme, lang, toggleTheme, setLang } = useAppPreferences();
  const t = getAppTranslations(lang);
  const themeActionLabel =
    theme === "dark" ? t.controls.switchToLight : t.controls.switchToDark;

  return (
    <div className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={themeActionLabel}
        title={themeActionLabel}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {theme === "dark" ? (
          <Sun className="size-3.5 text-amber-400" />
        ) : (
          <Moon className="size-3.5 text-zinc-700" />
        )}
        <span className="hidden sm:inline">
          {theme === "dark" ? t.controls.lightLabel : t.controls.darkLabel}
        </span>
      </button>

      <div
        role="group"
        aria-label={t.controls.languageGroupLabel}
        className="inline-flex h-8 items-center rounded-lg border border-border bg-muted/60 p-0.5 text-xs"
      >
        <button
          type="button"
          aria-pressed={lang === "en"}
          aria-label={t.controls.switchToEnglish}
          onClick={() => setLang("en")}
          className={`cursor-pointer rounded-md px-2 py-1 font-medium transition-colors ${
            lang === "en"
              ? "bg-foreground text-background shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          EN
        </button>
        <button
          type="button"
          aria-pressed={lang === "es"}
          aria-label={t.controls.switchToSpanish}
          onClick={() => setLang("es")}
          className={`cursor-pointer rounded-md px-2 py-1 font-medium transition-colors ${
            lang === "es"
              ? "bg-foreground text-background shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          ES
        </button>
      </div>
    </div>
  );
}
