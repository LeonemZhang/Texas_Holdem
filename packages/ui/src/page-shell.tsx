import type { PropsWithChildren, ReactNode } from 'react';

export interface PageShellProps extends PropsWithChildren {
  title: string;
  subtitle?: ReactNode;
}

export function PageShell({ children, subtitle, title }: PageShellProps) {
  return (
    <main className="page-shell">
      <header className="page-shell__header">
        <p className="page-shell__eyebrow">LAN poker</p>
        <h1>{title}</h1>
        {subtitle ? (
          <div className="page-shell__subtitle">{subtitle}</div>
        ) : null}
      </header>
      <section className="page-shell__content">{children}</section>
    </main>
  );
}
