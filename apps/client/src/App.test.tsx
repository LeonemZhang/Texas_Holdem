import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('application shell', () => {
  it('renders the framework status without poker business UI', async () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: "Texas Hold'em" }),
    ).toBeInTheDocument();
    expect(await screen.findByText('browser')).toBeInTheDocument();
    expect(screen.getByText('未连接')).toBeInTheDocument();
  });
});
