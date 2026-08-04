import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
} from 'react';

export interface PotChipFlight {
  readonly id: string;
  readonly playerId: string;
  readonly amount: number;
}

export interface PotChipFlightsProps {
  readonly flights: readonly PotChipFlight[];
  readonly onFlightEnd: (id: string) => void;
}

interface FlightPosition {
  readonly startX: number;
  readonly startY: number;
  readonly travelX: number;
  readonly travelY: number;
}

function FlyingChip({
  flight,
  onFlightEnd,
}: {
  readonly flight: PotChipFlight;
  readonly onFlightEnd: (id: string) => void;
}) {
  const [position, setPosition] = useState<FlightPosition | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => onFlightEnd(flight.id), 800);
    return () => window.clearTimeout(timeout);
  }, [flight.id, onFlightEnd]);

  useLayoutEffect(() => {
    const layer = document.querySelector('.poker-table__chip-flights');
    const table = layer?.closest<HTMLElement>('.poker-table');
    const source = Array.from(
      table?.querySelectorAll<HTMLElement>('[data-player-id]') ?? [],
    ).find((element) => element.dataset.playerId === flight.playerId);
    const target = table?.querySelector<HTMLElement>('[data-pot-target]');
    if (!table || !source || !target) return;

    const tableBounds = table.getBoundingClientRect();
    const sourceBounds = source.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    const startX =
      sourceBounds.left + sourceBounds.width / 2 - tableBounds.left;
    const startY = sourceBounds.top + sourceBounds.height / 2 - tableBounds.top;
    const targetX =
      targetBounds.left + targetBounds.width / 2 - tableBounds.left;
    const targetY =
      targetBounds.top + targetBounds.height / 2 - tableBounds.top;
    setPosition({
      startX,
      startY,
      travelX: targetX - startX,
      travelY: targetY - startY,
    });
  }, [flight.playerId]);

  if (!position) return null;
  return (
    <span
      className="pot-chip-flight"
      style={
        {
          '--chip-flight-start-x': `${position.startX}px`,
          '--chip-flight-start-y': `${position.startY}px`,
          '--chip-flight-travel-x': `${position.travelX}px`,
          '--chip-flight-travel-y': `${position.travelY}px`,
        } as CSSProperties
      }
      onAnimationEnd={() => onFlightEnd(flight.id)}
    >
      +{flight.amount.toLocaleString('zh-CN')}
    </span>
  );
}

export function PotChipFlights({ flights, onFlightEnd }: PotChipFlightsProps) {
  return (
    <div className="poker-table__chip-flights" aria-hidden="true">
      {flights.map((flight) => (
        <FlyingChip flight={flight} key={flight.id} onFlightEnd={onFlightEnd} />
      ))}
    </div>
  );
}
