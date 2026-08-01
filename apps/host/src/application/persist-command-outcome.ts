import type { CommandResponse, DomainEvent } from '@texas-holdem/protocol';

import type { TransactionPort } from './persistence-ports.js';

export interface PersistCommandOutcomeInput {
  readonly roomId: string;
  readonly playerId: string;
  readonly commandId: string;
  readonly response: CommandResponse;
  readonly events: readonly DomainEvent[];
}

export function persistCommandOutcome(
  transactions: TransactionPort,
  input: PersistCommandOutcomeInput,
): CommandResponse {
  return transactions.run((stores) => {
    const existing = stores.commands.find(
      input.roomId,
      input.playerId,
      input.commandId,
    );
    if (existing) return existing.response;
    if (
      input.response.commandId !== input.commandId ||
      input.events.some(({ roomId }) => roomId !== input.roomId)
    ) {
      throw new RangeError(
        'Persisted command identity does not match its outcome',
      );
    }
    stores.events.append(input.events);
    stores.commands.save({
      roomId: input.roomId,
      playerId: input.playerId,
      commandId: input.commandId,
      response: input.response,
    });
    return input.response;
  });
}
