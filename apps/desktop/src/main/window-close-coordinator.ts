import type { WindowRoomContext } from '../shared/runtime';

export interface PreventableCloseEvent {
  preventDefault(): void;
}

export interface PlayerWindowClosePort {
  confirmPlayerExit(): Promise<boolean>;
  requestPlayerExit(): void;
  closeWindow(): void;
}

export class WindowCloseCoordinator {
  #context: WindowRoomContext = { inRoom: false, isHost: false };
  #allowClose = false;
  #confirming = false;

  constructor(private readonly port: PlayerWindowClosePort) {}

  setContext(context: WindowRoomContext): void {
    this.#context = Object.freeze({ ...context });
  }

  handleClose(event: PreventableCloseEvent): void {
    if (this.#allowClose || !this.#context.inRoom || this.#context.isHost)
      return;
    event.preventDefault();
    if (this.#confirming) return;
    this.#confirming = true;
    void this.port
      .confirmPlayerExit()
      .then((confirmed) => {
        if (confirmed) this.port.requestPlayerExit();
      })
      .finally(() => {
        this.#confirming = false;
      });
  }

  completePlayerExit(): void {
    this.#allowClose = true;
    this.port.closeWindow();
  }
}
