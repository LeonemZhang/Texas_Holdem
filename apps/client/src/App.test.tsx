import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('application shell', () => {
  it('renders the browser join entry without desktop-only actions', async () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: "Texas Hold'em" }),
    ).toBeInTheDocument();
    expect(await screen.findByText('浏览器玩家')).toBeInTheDocument();
    expect(screen.getByLabelText('房主 IP 或完整地址')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '创建房间' })).toBeNull();
  });
});
