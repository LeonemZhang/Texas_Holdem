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

function digitCountForAmount(amount: number): number {
  return Math.max(1, Math.trunc(Math.abs(amount)).toString().length);
}

function amountTextForDisplay(amount: number): string {
  return amount.toLocaleString('zh-CN');
}

export function chipTextLengthForAmount(amount: number): number {
  return amountTextForDisplay(amount).length;
}

export function chipSizeForAmount(amount: number): string {
  const textLength = chipTextLengthForAmount(amount);
  const size =
    textLength <= 2
      ? Math.max(2.35, textLength * 0.72 + 1.55)
      : textLength >= 5
        ? textLength * 0.46 + 1.75
        : textLength * 0.66 + 1.55;
  return `${Number(size.toFixed(2))}rem`;
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
  const amountText = amountTextForDisplay(flight.amount);
  const digitCount = digitCountForAmount(flight.amount);
  const textLength = amountText.length;

  useEffect(() => {
    const timeout = window.setTimeout(() => onFlightEnd(flight.id), 2100);
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
    const scaleX =
      tableBounds.width > 0 && table.offsetWidth > 0
        ? tableBounds.width / table.offsetWidth
        : 1;
    const scaleY =
      tableBounds.height > 0 && table.offsetHeight > 0
        ? tableBounds.height / table.offsetHeight
        : 1;
    const startX =
      (sourceBounds.left + sourceBounds.width / 2 - tableBounds.left) / scaleX;
    const startY =
      (sourceBounds.top + sourceBounds.height / 2 - tableBounds.top) / scaleY;
    const targetX =
      (targetBounds.left + targetBounds.width / 2 - tableBounds.left) / scaleX;
    const targetY =
      (targetBounds.top + targetBounds.height / 2 - tableBounds.top) / scaleY;
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
          '--pot-chip-resolved-size': chipSizeForAmount(flight.amount),
          '--pot-chip-text-chars': textLength,
        } as CSSProperties
      }
      onAnimationEnd={() => onFlightEnd(flight.id)}
    >
      <span
        className="pot-chip-flight__chip poker-chip"
        data-pot-chip-digits={digitCount}
      >
        <span className="poker-chip__disc">
          <span className="poker-chip__value">{amountText}</span>
        </span>
      </span>
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
