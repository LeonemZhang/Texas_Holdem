import type { ReactNode } from 'react';

export interface PokerTableLayoutProps {
  readonly roomName: string;
  readonly handLabel: string;
  readonly seats: ReactNode;
  readonly communityCards: ReactNode;
  readonly actionTimer?: ReactNode;
  readonly tableOverlay?: ReactNode;
  readonly chipFlights?: ReactNode;
  readonly controls?: ReactNode;
  readonly status?: ReactNode;
}

export function PokerTableLayout({
  roomName,
  handLabel,
  seats,
  communityCards,
  actionTimer,
  tableOverlay,
  chipFlights,
  controls,
  status,
}: PokerTableLayoutProps) {
  return (
    <main className="poker-table-page">
      <header className="poker-table-page__header">
        <h1 className="poker-table-page__room-name">{roomName}</h1>
        {status ? (
          <div className="poker-table-page__status">{status}</div>
        ) : null}
      </header>

      <section className="poker-table" aria-label="德州牌桌">
        <div className="poker-table__seats" aria-label="玩家座位">
          {seats}
        </div>
        <div className="poker-table__felt">
          <div className="poker-table__game-status" aria-label="牌局进度">
            {handLabel}
          </div>
          {actionTimer}
          <div className="poker-table__cards" aria-label="公共牌">
            {communityCards}
          </div>
        </div>
        {tableOverlay ? (
          <div className="poker-table__overlay">{tableOverlay}</div>
        ) : null}
        {chipFlights}
      </section>

      {controls ? (
        <section className="poker-table-controls" aria-label="行动操作区">
          {controls}
        </section>
      ) : null}
    </main>
  );
}
