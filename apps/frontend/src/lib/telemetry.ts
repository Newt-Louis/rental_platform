const ENDPOINT = `${(import.meta as any).env?.VITE_API_URL || '/api'}/telemetry/client-errors`;
const MAX_MESSAGE = 2000;
const MAX_STACK = 4000;

export type ClientErrorSource =
  | 'error-boundary'
  | 'window-error'
  | 'unhandled-rejection'
  | 'api-error';

/**
 * Deliberately uses `fetch` instead of the shared axios instance (lib/axios.ts):
 * that instance redirects to /login on 401 and its own interceptors could
 * themselves throw, which would re-trigger the very error listeners this
 * reports from. Wrapped defensively so a reporting failure can never surface
 * as a second error.
 */
export function reportClientError(input: {
  message: string;
  stack?: string;
  source: ClientErrorSource;
  route?: string;
}) {
  try {
    const payload = {
      message: input.message.slice(0, MAX_MESSAGE),
      stack: input.stack?.slice(0, MAX_STACK),
      source: input.source,
      route: input.route ?? window.location.pathname,
      appVersion: (import.meta as any).env?.VITE_APP_VERSION,
    };
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Telemetry must never be the cause of a second error.
  }
}

export function installGlobalErrorReporting() {
  window.addEventListener('error', (event) => {
    reportClientError({
      message: event.message || 'Unknown window error',
      stack: event.error?.stack,
      source: 'window-error',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportClientError({
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      source: 'unhandled-rejection',
    });
  });
}
