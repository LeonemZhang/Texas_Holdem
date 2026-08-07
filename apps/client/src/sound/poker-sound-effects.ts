import type { PlayerSnapshot } from '@texas-holdem/protocol';

const DEFAULT_SOUND_VOLUME_MULTIPLIER = 18;
const TURN_CLOCK_PERIOD_MS = 2_000;
const TURN_CLOCK_TICK_DURATION_MS = 160;
const TURN_CLOCK_TOCK_DURATION_MS = 100;
const TURN_CLOCK_VOLUME_MULTIPLIER = 10;

type PlayerActionSound = 'fold' | 'check' | 'call' | 'raise' | 'all-in';

export type PokerSoundCue =
  'deal' | 'ready' | 'turn-self' | 'turn-other' | PlayerActionSound;

const actionSoundByStatistic = {
  fold: 'fold',
  check: 'check',
  call: 'call',
  raiseTo: 'raise',
  allIn: 'all-in',
} as const satisfies Record<
  keyof PlayerSnapshot['statistics']['players'][number]['actions'],
  PlayerActionSound
>;

function changedAction(
  previous: PlayerSnapshot,
  next: PlayerSnapshot,
): PlayerActionSound | null {
  for (const nextPlayer of next.statistics.players) {
    const previousPlayer = previous.statistics.players.find(
      ({ playerId }) => playerId === nextPlayer.playerId,
    );
    if (!previousPlayer) continue;
    for (const [statistic, sound] of Object.entries(actionSoundByStatistic) as [
      keyof typeof actionSoundByStatistic,
      PlayerActionSound,
    ][]) {
      if (nextPlayer.actions[statistic] > previousPlayer.actions[statistic]) {
        return sound;
      }
    }
  }
  return null;
}

function turnCue(snapshot: PlayerSnapshot): PokerSoundCue | null {
  const actorId = snapshot.game?.currentActorId;
  if (!actorId) return null;
  return actorId === snapshot.playerId ? 'turn-self' : 'turn-other';
}

/**
 * Derives audible state changes from authoritative snapshots. The initial
 * snapshot deliberately produces no cue, so reconnecting never replays a
 * whole hand's sound history.
 */
export function pokerSoundCues(
  previous: PlayerSnapshot | null,
  next: PlayerSnapshot,
): readonly PokerSoundCue[] {
  if (!previous || next.sequence <= previous.sequence) return [];

  const newHand =
    next.game !== null && previous.game?.handId !== next.game.handId;
  if (newHand) {
    const cue = turnCue(next);
    return cue ? ['deal', cue] : ['deal'];
  }

  if (
    next.handReady !== null &&
    previous.handReady === null &&
    next.handReady.ownChoice === 'pending'
  ) {
    return ['ready'];
  }

  const cues: PokerSoundCue[] = [];
  const action = changedAction(previous, next);
  if (action) cues.push(action);
  if (previous.game?.currentActorId !== next.game?.currentActorId) {
    const cue = turnCue(next);
    if (cue) cues.push(cue);
  }
  return cues;
}

type BrowserAudioContext = AudioContext;

export class PokerSoundEffects {
  #context: BrowserAudioContext | null = null;
  #removeUnlockListeners: (() => void) | null = null;
  #turnClockTimer: number | null = null;
  #turnClockDeadlineMs: number | null = null;

  enableOnFirstInteraction(): void {
    if (this.#removeUnlockListeners || typeof window === 'undefined') return;
    const unlock = () => {
      const context = this.context();
      if (context?.state === 'suspended') void context.resume();
      this.#removeUnlockListeners?.();
      this.#removeUnlockListeners = null;
    };
    window.addEventListener('pointerdown', unlock, {
      once: true,
      capture: true,
    });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    this.#removeUnlockListeners = () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }

  play(cues: readonly PokerSoundCue[]): void {
    const context = this.#context;
    if (!context || context.state !== 'running') return;
    cues.forEach((cue, index) => this.playCue(context, cue, index * 0.18));
  }

  setTurnClock(deadlineMs: number | null): void {
    if (
      deadlineMs === null ||
      deadlineMs <= Date.now() ||
      deadlineMs === this.#turnClockDeadlineMs
    ) {
      if (deadlineMs === null || deadlineMs <= Date.now()) {
        this.stopTurnClock();
      }
      return;
    }

    this.stopTurnClock();
    this.#turnClockDeadlineMs = deadlineMs;
    this.scheduleTurnClock(TURN_CLOCK_PERIOD_MS);
  }

  private scheduleTurnClock(delayMs: number): void {
    this.#turnClockTimer = window.setTimeout(() => {
      if (
        this.#turnClockDeadlineMs === null ||
        Date.now() >= this.#turnClockDeadlineMs
      ) {
        this.stopTurnClock();
        return;
      }
      this.playTurnClockPair();
      this.scheduleTurnClock(
        TURN_CLOCK_PERIOD_MS -
          TURN_CLOCK_TICK_DURATION_MS -
          TURN_CLOCK_TOCK_DURATION_MS,
      );
    }, delayMs);
  }

  dispose(): void {
    this.stopTurnClock();
    this.#removeUnlockListeners?.();
    this.#removeUnlockListeners = null;
    void this.#context?.close();
    this.#context = null;
  }

  private context(): BrowserAudioContext | null {
    if (this.#context) return this.#context;
    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextConstructor) return null;
    this.#context = new AudioContextConstructor();
    return this.#context;
  }

  private playCue(
    context: BrowserAudioContext,
    cue: PokerSoundCue,
    delay: number,
  ): void {
    const start = context.currentTime + delay;
    switch (cue) {
      case 'deal':
        [0, 0.06, 0.12, 0.18].forEach((offset, index) =>
          this.tone(context, 1_100 - index * 80, start + offset, 0.035, 0.035),
        );
        return;
      case 'ready':
        this.tone(context, 440, start, 0.08, 0.055);
        this.tone(context, 660, start + 0.1, 0.12, 0.06);
        return;
      case 'turn-self':
        this.tone(context, 523, start, 0.08, 0.07);
        this.tone(context, 784, start + 0.1, 0.14, 0.075);
        return;
      case 'turn-other':
        this.tone(context, 262, start, 0.1, 0.035);
        return;
      case 'fold':
        this.tone(context, 360, start, 0.13, 0.055, 'sawtooth', 150);
        return;
      case 'check':
        this.tone(context, 520, start, 0.045, 0.05);
        this.tone(context, 700, start + 0.055, 0.055, 0.042);
        return;
      case 'call':
        this.tone(context, 660, start, 0.07, 0.06);
        this.tone(context, 880, start + 0.065, 0.09, 0.05);
        return;
      case 'raise':
        [440, 554, 659].forEach((frequency, index) =>
          this.tone(context, frequency, start + index * 0.055, 0.09, 0.055),
        );
        return;
      case 'all-in':
        this.tone(context, 98, start, 0.26, 0.03, 'sawtooth', 73);
        this.tone(context, 147, start + 0.07, 0.2, 0.025, 'sawtooth', 196);
        this.tone(context, 196, start + 0.14, 0.16, 0.025, 'square', 294);
        [196, 294, 392].forEach((frequency) =>
          this.tone(context, frequency, start + 0.22, 0.34, 0.015, 'sawtooth'),
        );
    }
  }

  private playTurnClockPair(): void {
    const context = this.#context;
    if (!context || context.state !== 'running') return;
    const start = context.currentTime;
    this.tone(
      context,
      1_900,
      start,
      0.05,
      0.009,
      'square',
      1_900,
      0.006,
      TURN_CLOCK_VOLUME_MULTIPLIER,
    );
    this.tone(
      context,
      1_350,
      start,
      0.16,
      0.01,
      'triangle',
      1_350,
      0.025,
      TURN_CLOCK_VOLUME_MULTIPLIER,
    );
    this.tone(
      context,
      760,
      start + 0.16,
      0.1,
      0.018,
      'triangle',
      520,
      0.02,
      TURN_CLOCK_VOLUME_MULTIPLIER,
    );
  }

  private stopTurnClock(): void {
    if (this.#turnClockTimer !== null) {
      window.clearTimeout(this.#turnClockTimer);
      this.#turnClockTimer = null;
    }
    this.#turnClockDeadlineMs = null;
  }

  private tone(
    context: BrowserAudioContext,
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    endFrequency = frequency,
    attackDuration = 0.01,
    volumeMultiplier = DEFAULT_SOUND_VOLUME_MULTIPLIER,
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      endFrequency,
      start + duration,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      volume * volumeMultiplier,
      start + attackDuration,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
