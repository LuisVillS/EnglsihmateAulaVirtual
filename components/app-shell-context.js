"use client";

import { createContext, useContext } from "react";

const AppShellContext = createContext({
  displayName: "",
  avatarUrl: null,
});

export function AppShellProvider({ value, children }) {
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  return useContext(AppShellContext);
}
