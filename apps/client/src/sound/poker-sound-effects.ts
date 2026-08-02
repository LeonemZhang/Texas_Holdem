import type { PlayerSnapshot } from '@texas-holdem/protocol';

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

  dispose(): void {
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
        this.tone(context, 330, start, 0.035, 0.05, 'square');
        this.tone(context, 270, start + 0.055, 0.035, 0.04, 'square');
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
        [196, 262, 330, 523].forEach((frequency, index) =>
          this.tone(context, frequency, start + index * 0.06, 0.14, 0.07),
        );
    }
  }

  private tone(
    context: BrowserAudioContext,
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    endFrequency = frequency,
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
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
