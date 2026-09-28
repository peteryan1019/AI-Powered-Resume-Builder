import type { Server } from "node:http";

/**
 * Stop accepting new requests and let existing requests finish. Long-lived SSE
 * connections must not hold a terminating Pod forever, so remaining sockets
 * are closed after the drain timeout.
 */
export function closeHttpServer(
  server: Server,
  drainTimeoutMs = 10_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const forceClose = setTimeout(() => server.closeAllConnections(), drainTimeoutMs);
    forceClose.unref();

    server.close((error) => {
      clearTimeout(forceClose);
      if (error) reject(error);
      else resolve();
    });
    server.closeIdleConnections();
  });
}
