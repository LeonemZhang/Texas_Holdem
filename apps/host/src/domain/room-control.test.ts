import { describe, expect, it } from 'vitest';

import { createRoom } from './room.js';
import { closeRoom, pauseRoom, resumeRoom } from './room-control.js';

function playingRoom() {
  return Object.freeze({
    ...createRoom({
      roomId: 'room',
      hostPlayerId: 'host',
      hostNickname: 'Alice',
      settings: {
        roomName: 'Friends',
        maxPlayers: 10,
        initialChips: 100,
        blind: { kind: 'preset', smallBlind: 1 },
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    }),
    phase: 'playing' as const,
    firstHandStarted: true,
  });
}

function serviceOnlyPlayingRoom() {
  return Object.freeze({
    ...createRoom({
      roomId: 'room',
      hostId: 'host-manager',
      hostParticipation: 'service-only',
      hostNickname: 'Alice',
      settings: {
        roomName: 'Friends',
        maxPlayers: 10,
        initialChips: 100,
        blind: { kind: 'preset', smallBlind: 1 },
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    }),
    phase: 'playing' as const,
    firstHandStarted: true,
  });
}

describe('host room controls', () => {
  it('pauses and resumes to the exact prior domain phase', () => {
    const paused = pauseRoom(playingRoom(), 'host');
    expect(paused.room.phase).toBe('paused');
    expect(paused.pausedFrom).toBe('playing');
    expect(resumeRoom(paused, 'host').phase).toBe('playing');
  });

  it('enforces host permission for pause, resume, and close', () => {
    expect(() => pauseRoom(playingRoom(), 'other')).toThrow(
      'Only the host can control the room',
    );
    const paused = pauseRoom(playingRoom(), 'host');
    expect(() => resumeRoom(paused, 'other')).toThrow(
      'Only the host can control the room',
    );
    expect(() => closeRoom(playingRoom(), 'other')).toThrow(
      'Only the host can control the room',
    );
  });

  it('marks only an explicit host close command as a normal close', () => {
    const result = closeRoom(playingRoom(), 'host');
    expect(result.room.phase).toBe('closed');
    expect(result.event).toEqual({
      type: 'room.closed',
      roomId: 'room',
      actorPlayerId: 'host',
      normal: true,
    });
    expect(playingRoom().phase).toBe('playing');
  });

  it('authorizes a service-only host by host identity, not a player id', () => {
    expect(pauseRoom(serviceOnlyPlayingRoom(), 'host-manager').room.phase).toBe(
      'paused',
    );
    expect(() => pauseRoom(serviceOnlyPlayingRoom(), 'host-player')).toThrow(
      'Only the host can control the room',
    );
  });
});
