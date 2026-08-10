import { createServer } from 'node:net';

/**
 * Checks whether a room host can claim its TCP port without starting a child
 * process. Binding to all IPv4 interfaces matches the host service itself.
 */
export function isTcpPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    const complete = (available: boolean) => {
      probe.removeAllListeners();
      resolve(available);
    };
    probe.once('error', () => complete(false));
    probe.listen({ port, host: '0.0.0.0', exclusive: true }, () => {
      probe.close((error) => complete(!error));
    });
  });
}
