/**
 * Tiny mount registry for the /call-keypad route.
 *
 * The keypad is a transparent modal ROUTE (so it sits above the native call
 * modal, which a view in the root tree cannot do) while `callStore.keypadVisible`
 * stays the single source of truth for every call surface. The host needs to
 * know whether the route is currently on screen before pushing it again, and
 * the route tells it here.
 */
import { useSyncExternalStore } from 'react';

let mounted = false;
const listeners = new Set<() => void>();

export function setCallKeypadRouteMounted(value: boolean) {
  if (mounted === value) return;
  mounted = value;
  listeners.forEach((l) => l());
}

export function isCallKeypadRouteMounted() {
  return mounted;
}

export function useCallKeypadRouteMounted() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => mounted
  );
}
