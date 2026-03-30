"use client";

import { createContext, useContext } from "react";

interface DarkModeContextValue {
  isDark: boolean;
  toggle: () => void;
}

export const DarkModeContext = createContext<DarkModeContextValue>({
  isDark: false,
  toggle: () => {},
});

export function useDarkMode() {
  return useContext(DarkModeContext);
}
