import type { ReactNode } from 'react';

export interface PokerTableLayoutProps {
  readonly roomName: string;
  readonly handLabel: string;
  readonly seats: ReactNode;
  readonly communityCards: ReactNode;
  readonly pots: ReactNode;
  readonly controls: ReactNode;
  readonly status?: ReactNode;
}

export function PokerTableLayout({
  roomName,
  handLabel,
  seats,
  communityCards,
  pots,
  controls,
  status,
}: PokerTableLayoutProps) {
  return (
    <main className="poker-table-page">
      <header className="poker-table-page__header">
        <div>
          <p className="connection-home__kicker">{handLabel}</p>
          <h1>{roomName}</h1>
        </div>
        {status ? (
          <div className="poker-table-page__status">{status}</div>
        ) : null}
      </header>

      <section className="poker-table" aria-label="德州牌桌">
        <div className="poker-table__seats" aria-label="玩家座位">
          {seats}
        </div>
        <div className="poker-table__felt">
          <div className="poker-table__cards" aria-label="公共牌">
            {communityCards}
          </div>
          <div className="poker-table__pots" aria-label="底池">
            {pots}
          </div>
        </div>
      </section>

      <section className="poker-table-controls" aria-label="行动操作区">
        {controls}
      </section>
    </main>
  );
}
