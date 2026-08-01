import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

import {
  DiscoveryScanInputSchema,
  type DesktopDiscoveredRoom,
  type DesktopNetworkInterface,
  type DiscoveryScanInput,
} from '../shared/runtime';

export function listDesktopNetworkInterfaces(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): readonly DesktopNetworkInterface[] {
  return Object.freeze(
    Object.entries(interfaces)
      .flatMap(([name, entries]) =>
        (entries ?? [])
          .filter((entry) => entry.family === 'IPv4' && !entry.internal)
          .map((entry) =>
            Object.freeze({
              name,
              address: entry.address,
              netmask: entry.netmask,
              mac: entry.mac,
            }),
          ),
      )
      .sort((left, right) =>
        `${left.name}:${left.address}`.localeCompare(
          `${right.name}:${right.address}`,
        ),
      ),
  );
}

export async function scanLanRooms(
  input: DiscoveryScanInput,
): Promise<readonly DesktopDiscoveredRoom[]> {
  const parsed = DiscoveryScanInputSchema.parse(input);
  const { LanRoomScanner } = await import('@texas-holdem/lan-discovery');
  const scanner = new LanRoomScanner({ discoveryPort: parsed.discoveryPort });
  try {
    return await scanner.scan(parsed.requestId);
  } finally {
    await scanner.close();
  }
}
