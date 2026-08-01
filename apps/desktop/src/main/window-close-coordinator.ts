import type { WindowRoomContext } from '../shared/runtime';

export interface PreventableCloseEvent {
  preventDefault(): void;
}

export interface PlayerWindowClosePort {
  confirmPlayerExit(): Promise<boolean>;
  confirmHostClose(): Promise<boolean>;
  requestPlayerExit(): void;
  requestHostClose(): void;
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
    if (this.#allowClose || !this.#context.inRoom) return;
    event.preventDefault();
    if (this.#confirming) return;
    this.#confirming = true;
    const confirmation = this.#context.isHost
      ? this.port.confirmHostClose()
      : this.port.confirmPlayerExit();
    void confirmation
      .then((confirmed) => {
        if (!confirmed) return;
        if (this.#context.isHost) this.port.requestHostClose();
        else this.port.requestPlayerExit();
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
