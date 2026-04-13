"use client";

import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from "react";
import { updateOnboardingFlags } from "@/app/actions/tour";
import "driver.js/dist/driver.css";

type OnboardingFlags = Record<string, boolean>;

interface TourContextType {
  flags: OnboardingFlags;
  markModuleCompleted: (moduleName: string) => void;
  isModuleCompleted: (moduleName: string) => boolean;
  masterActive: boolean;
  dismissAll: () => void;
  reactivateAll: () => void;
  lastManualTrigger: number;
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
  const [lastManualTrigger, setLastManualTrigger] = useState(0);

  useEffect(() => {
    setFlags(initialFlags);
  }, [initialFlags]);

  const flagsRef = useMemo(() => ({ current: flags }), [flags]);

  const markModuleCompleted = useCallback((moduleName: string) => {
    if (flagsRef.current[moduleName]) return;

    setFlags(prev => ({ ...prev, [moduleName]: true }));
    
    // Ejecutamos la acción fuera del ciclo de renderizado
    updateOnboardingFlags({ [moduleName]: true }).catch(console.error);
  }, [flagsRef]);

  const dismissAll = useCallback(() => {
    if (flagsRef.current.masterDismissed) return;

    setFlags(prev => ({ ...prev, masterDismissed: true }));
    updateOnboardingFlags({ masterDismissed: true }).catch(console.error);
  }, [flagsRef]);

  const reactivateAll = useCallback(() => {
    // Reseteamos todas las flags conocidas a false
    const clearFlags = Object.keys(flagsRef.current).reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {} as Record<string, boolean>);
    
    // Forzamos que el despido maestro sea false
    clearFlags.masterDismissed = false;
    
    setFlags(clearFlags);
    setLastManualTrigger(Date.now());
    updateOnboardingFlags(clearFlags).catch(console.error);
  }, [flagsRef]);

  const isModuleCompleted = useCallback((moduleName: string) => {
    return !!flags[moduleName] || !!flags["masterDismissed"];
  }, [flags]);

  const masterActive = useMemo(() => !flags["masterDismissed"], [flags]);

  const contextValue = useMemo(() => ({
    flags,
    markModuleCompleted,
    isModuleCompleted,
    masterActive,
    dismissAll,
    reactivateAll,
    lastManualTrigger
  }), [flags, markModuleCompleted, isModuleCompleted, masterActive, dismissAll, reactivateAll, lastManualTrigger]);

  return (
    <TourContext.Provider value={contextValue}>
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
