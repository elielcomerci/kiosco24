import {
  LEGACY_SOUND_STORAGE_KEY,
  LEGACY_SOUND_TOGGLE_EVENT,
  SOUND_STORAGE_KEY,
  SOUND_TOGGLE_EVENT,
} from "@/lib/brand";

/**
 * Caches audio instances to avoid lag and memory overhead.
 * We use one Audio object per URL and reset its currentTime on each play.
 */
const audioCache: Map<string, HTMLAudioElement> = new Map();
const STORAGE_KEYS = [SOUND_STORAGE_KEY, LEGACY_SOUND_STORAGE_KEY] as const;

// Private state to avoid reading localStorage on every single tap
let _isSoundEnabled = true;

// Initialize state from localStorage in browser environment
if (typeof window !== "undefined") {
  const stored = STORAGE_KEYS.map((key) => localStorage.getItem(key)).find((value) => value !== null);
  _isSoundEnabled = stored === null || stored === "true";
}

/**
 * Preloads a list of audio URLs to ensure zero-latency playback.
 * All preloaded HTMLAudioElements are stored in the internal cache.
 */
export function preloadAudio(urls: string[]) {
  if (typeof window === "undefined") return;

  urls.forEach((url) => {
    if (!audioCache.has(url)) {
      const audio = new Audio(url);
      // We don't need to await the load, the browser will fetch it in background
      audio.load();
      audioCache.set(url, audio);
    }
  });
}

/**
 * Play a sound effect from the public folder.
 * Optimized for low latency: restarts audio immediately if already playing.
 */
export async function playAudio(url: string, volume: number = 1.0): Promise<void> {
  if (typeof window === "undefined" || !_isSoundEnabled) return;

  try {
    let audio = audioCache.get(url);
    if (!audio) {
      audio = new Audio(url);
      audioCache.set(url, audio);
    }

    // Reset to beginning to allow rapid-fire sounds without overlapping
    audio.pause();
    audio.currentTime = 0;
    audio.volume = volume;
    
    await audio.play();
  } catch (error) {
    // Autoplay policy or other errors
    console.warn(`[Audio] Could not play ${url}:`, error);
  }
}

/**
 * Global sound enabled state.
 */
export function isSoundEnabled() {
  return _isSoundEnabled;
}

/**
 * Toggles sound and persists to localStorage.
 */
export function toggleSound(): boolean {
  _isSoundEnabled = !_isSoundEnabled;
  if (typeof window !== "undefined") {
    localStorage.setItem(SOUND_STORAGE_KEY, String(_isSoundEnabled));
    localStorage.setItem(LEGACY_SOUND_STORAGE_KEY, String(_isSoundEnabled));
    // Emit a custom event so the UI can update if needed
    window.dispatchEvent(new CustomEvent(SOUND_TOGGLE_EVENT, { detail: _isSoundEnabled }));
    window.dispatchEvent(new CustomEvent(LEGACY_SOUND_TOGGLE_EVENT, { detail: _isSoundEnabled }));
  }
  return _isSoundEnabled;
}

/**
 * Ensures the audio system is warm on user interaction.
 */
export function warmupAudio() {
  if (typeof window === "undefined") return;

  const unlock = () => {
    document.removeEventListener("click", unlock);
    document.removeEventListener("touchstart", unlock);
    document.removeEventListener("keydown", unlock);
  };

  document.addEventListener("click", unlock);
  document.addEventListener("touchstart", unlock);
  document.addEventListener("keydown", unlock);
}
