import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Mode = "light" | "dark";
const Ctx = createContext<{ mode: Mode; toggle: () => void }>({ mode: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    // Default to light per spec; honor system pref only if user has dark prefs
    if (typeof window !== "undefined") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) setMode("dark");
    }
  }, []);

  useEffect(() => {
    if (mode === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [mode]);

  return <Ctx.Provider value={{ mode, toggle: () => setMode(m => m === "light" ? "dark" : "light") }}>{children}</Ctx.Provider>;
}

export function useTheme() { return useContext(Ctx); }
