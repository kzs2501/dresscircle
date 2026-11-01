/**
 * A way for the rest of the page to open the Chaos panel, which lives in the header:
 * anything may ask, and the panel, while it's mounted, listens.
 */
const listeners = new Set<() => void>();

/** Open the Chaos panel, if there is one on the page. */
export function requestChaosPanel() {
  for (const listener of listeners) listener();
}

/** For the panel: be told when something asks for it. Returns how to stop listening. */
export function onChaosPanelRequest(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
