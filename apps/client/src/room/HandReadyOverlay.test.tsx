import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HandReadyOverlay } from './HandReadyOverlay.js';

describe('HandReadyOverlay', () => {
  it('shows the server deadline and both participation choices', () => {
    const onChoose = vi.fn();
    render(
      <HandReadyOverlay
        deadlineMs={40_000}
        nowMs={10_000}
        ownChoice="pending"
        pendingRequests={[]}
        complete={false}
        onChoose={onChoose}
      />,
    );
    expect(screen.getByLabelText('剩余 30 秒')).toHaveTextContent('30s');
    fireEvent.click(screen.getByRole('button', { name: '就绪' }));
    fireEvent.click(screen.getByRole('button', { name: '下一手暂不参与' }));
    expect(onChoose).toHaveBeenNthCalledWith(1, 'ready');
    expect(onChoose).toHaveBeenNthCalledWith(2, 'sitting-out');
  });

  it('blocks ready and exposes unresolved chip requests', () => {
    render(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="ready"
        pendingRequests={[
          { requestId: 'r1', requesterName: 'Bob', amount: 200 },
        ]}
        complete={false}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByText('Bob 请求 200 筹码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '就绪' })).toBeDisabled();
    expect(screen.getByText('已就绪')).toBeInTheDocument();
  });

  it('automatically disappears after the server marks preparation complete', () => {
    const { container } = render(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={30_000}
        ownChoice="ready"
        pendingRequests={[]}
        complete
        onChoose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
