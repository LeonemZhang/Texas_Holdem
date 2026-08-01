import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHostServer } from './server.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const defaultStaticDirectory = resolve(currentDirectory, '../../client/dist');
const port = Number.parseInt(process.env.HOST_PORT ?? '32100', 10);
const address = process.env.HOST_ADDRESS ?? '0.0.0.0';
const advertisedHost = process.env.HOST_ADVERTISED_ADDRESS ?? '127.0.0.1';
const staticDirectory = process.env.CLIENT_DIST_DIR ?? defaultStaticDirectory;

if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
  throw new Error(`Invalid HOST_PORT: ${process.env.HOST_PORT ?? ''}`);
}

const host = await createHostServer({
  staticDirectory,
  advertisedHost,
  port,
});

try {
  await host.app.listen({ host: address, port });
  process.stdout.write(`Texas Hold’em host listening on ${address}:${port}\n`);
} catch (error) {
  await host.close();
  throw error;
}

async function shutdown() {
  await host.close();
  process.exitCode = 0;
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
