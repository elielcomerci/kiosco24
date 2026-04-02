/**
 * Trial Manager - Maneja el período de prueba de 24 horas
 * 
 * Uso:
 * - Cuando un usuario crea cuenta → iniciarTrial(kioscoId)
 * - Al entrar a Caja → verificar si puede operar
 * - Mostrar banner con tiempo restante
 */

const TRIAL_HOURS = 24;

export interface TrialInfo {
  isInTrial: boolean;
  trialStartsAt: Date | null;
  trialEndsAt: Date | null;
  remainingHours: number;
  isExpired: boolean;
}

/**
 * Calcula el estado del trial basado en las fechas
 */
export function calculateTrialInfo(
  trialStartsAt: Date | null,
  trialEndsAt: Date | null,
  hasActiveSubscription: boolean
): TrialInfo {
  // Si tiene suscripción activa, no está en trial
  if (hasActiveSubscription) {
    return {
      isInTrial: false,
      trialStartsAt: null,
      trialEndsAt: null,
      remainingHours: 0,
      isExpired: false,
    };
  }

  // Si no tiene fechas de trial, no está en trial
  if (!trialStartsAt || !trialEndsAt) {
    return {
      isInTrial: false,
      trialStartsAt: null,
      trialEndsAt: null,
      remainingHours: 0,
      isExpired: false,
    };
  }

  const now = new Date();
  const endsAt = new Date(trialEndsAt);
  const startsAt = new Date(trialStartsAt);
  
  const remainingMs = endsAt.getTime() - now.getTime();
  const remainingHours = remainingMs / (1000 * 60 * 60);
  const isExpired = remainingHours <= 0;

  return {
    isInTrial: true,
    trialStartsAt: startsAt,
    trialEndsAt: endsAt,
    remainingHours: Math.max(0, remainingHours),
    isExpired,
  };
}

/**
 * Formatea el tiempo restante para mostrar al usuario
 */
export function formatTrialTime(hours: number): string {
  if (hours >= 24) return "24 horas";
  if (hours >= 1) return `${Math.floor(hours)}h ${Math.floor((hours % 1) * 60)}min`;
  if (hours >= 0.5) return `${Math.floor(hours * 60)}min`;
  return "Menos de 30min";
}

/**
 * Obtiene un mensaje según el estado del trial
 */
export function getTrialMessage(hours: number): {
  title: string;
  description: string;
  urgency: "low" | "medium" | "high";
} {
  if (hours >= 12) {
    return {
      title: "Período de prueba activo",
      description: `Tenés ${formatTrialTime(hours)} para explorar Kiosco24 sin límites.`,
      urgency: "low",
    };
  }
  
  if (hours >= 1) {
    return {
      title: "Tu prueba está por terminar",
      description: `Te quedan ${formatTrialTime(hours)}. Activá tu suscripción para no perder tus datos.`,
      urgency: "medium",
    };
  }
  
  return {
    title: "Período de prueba finalizado",
    description: "Activá tu suscripción para seguir usando Kiosco24.",
    urgency: "high",
  };
}
