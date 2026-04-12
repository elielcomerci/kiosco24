"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { updateOnboardingFlags } from "@/app/actions/tour";

type OnboardingFlags = Record<string, boolean>;

interface TourContextType {
  flags: OnboardingFlags;
  markModuleCompleted: (moduleName: string) => void;
  isModuleCompleted: (moduleName: string) => boolean;
  masterActive: boolean;
  dismissAll: () => void;
  reactivateAll: () => void;
}

const TourContext = createContext<TourContextType | null>(null);

export function TourProvider({ 
  children, 
  initialFlags = {}
}: { 
  children: ReactNode; 
  initialFlags?: OnboardingFlags;
}) {
  const [flags, setFlags] = useState<OnboardingFlags>(initialFlags);

  useEffect(() => {
    setFlags(initialFlags);
  }, [initialFlags]);

  const markModuleCompleted = (moduleName: string) => {
    if (flags[moduleName]) return;
    const newFlags = { ...flags, [moduleName]: true };
    setFlags(newFlags);
    updateOnboardingFlags({ [moduleName]: true }).catch(console.error);
  };

  const dismissAll = () => {
    const newFlags = { ...flags, masterDismissed: true };
    setFlags(newFlags);
    updateOnboardingFlags({ masterDismissed: true }).catch(console.error);
  };

  const reactivateAll = () => {
    // Para reactivarlo, forzamos false en masterDismissed y en los módulos
    const clearFlags = Object.keys(flags).reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {} as Record<string, boolean>);
    
    setFlags(clearFlags);
    updateOnboardingFlags(clearFlags).catch(console.error);
  };

  const isModuleCompleted = (moduleName: string) => {
    return !!flags[moduleName] || !!flags["masterDismissed"];
  };

  const masterActive = !flags["masterDismissed"];

  return (
    <TourContext.Provider value={{
      flags,
      markModuleCompleted,
      isModuleCompleted,
      masterActive,
      dismissAll,
      reactivateAll
    }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return context;
}
