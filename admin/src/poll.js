import { useEffect } from "react";

// Calls fn now and every ms while the tab is visible (at once when it becomes visible again).
// A new fn (pass it through useCallback) restarts the cycle; ms = null pauses it.
export function usePoll(fn, ms = 30000) {
  useEffect(() => {
    if (ms == null) return;
    const tick = () => { if (document.visibilityState === "visible") fn(); };
    fn();
    const timer = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [fn, ms]);
}
