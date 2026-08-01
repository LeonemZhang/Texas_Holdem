import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import {
  ReconnectSessionStore,
  type KeyValueStorage,
} from './reconnect-session-store.js';

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const session = (roomId: string) => ({
  protocolVersion: PROTOCOL_VERSION,
  roomId,
  playerId: `player-${roomId}`,
  token: `secret-token-${roomId}-123456`,
  joinUrl: 'http://10.126.126.1:32100',
});

describe('ReconnectSessionStore', () => {
  it('restores a saved room identity after a page-refresh-style recreation', () => {
    const storage = new MemoryStorage();
    new ReconnectSessionStore(storage).save(session('room-1'));
    const refreshed = new ReconnectSessionStore(storage);
    expect(refreshed.load('room-1')).toEqual(session('room-1'));
  });

  it('isolates room tokens and only clears the deliberately exited room', () => {
    const storage = new MemoryStorage();
    const sessions = new ReconnectSessionStore(storage);
    sessions.save(session('room-1'));
    sessions.save(session('room-2'));
    sessions.clear('room-1');

    expect(sessions.load('room-1')).toBeNull();
    expect(sessions.load('room-2')).toEqual(session('room-2'));
  });

  it('drops corrupted or incompatible stored sessions', () => {
    const storage = new MemoryStorage();
    storage.setItem('texas-holdem:reconnect:room-1', '{broken');
    const sessions = new ReconnectSessionStore(storage);
    expect(sessions.load('room-1')).toBeNull();
    storage.setItem(
      'texas-holdem:reconnect:room-1',
      JSON.stringify({ ...session('room-1'), protocolVersion: '999' }),
    );
    expect(sessions.load('room-1')).toBeNull();
  });
});
