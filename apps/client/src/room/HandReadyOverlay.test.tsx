import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HandReadyOverlay } from './HandReadyOverlay.js';

describe('HandReadyOverlay', () => {
  it('starts compact with a deadline and a ready action, then expands the other choice', () => {
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
    expect(screen.queryByRole('button', { name: '下一手暂不参与' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '准备详情' }));
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
          {
            requestId: 'r1',
            requesterId: 'bob',
            requesterName: 'Bob',
            targetPlayerId: null,
            amount: 200,
          },
        ]}
        complete={false}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '就绪' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '准备详情' }));
    expect(screen.getByText('Bob 请求 200 筹码')).toBeInTheDocument();
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

  it('presents an incoming chip request for approval or rejection', () => {
    const onApproveRequest = vi.fn();
    const onRejectRequest = vi.fn();
    render(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        complete={false}
        onChoose={vi.fn()}
        requestToReview={{
          requestId: 'request-1',
          requesterId: 'bob',
          requesterName: 'Bob',
          targetPlayerId: 'alice',
          amount: 200,
        }}
        onApproveRequest={onApproveRequest}
        onRejectRequest={onRejectRequest}
      />,
    );
    expect(
      screen.getByRole('alertdialog', { name: '筹码请求' }),
    ).toHaveTextContent('Bob 请求 200 筹码');
    fireEvent.click(screen.getByRole('button', { name: '同意' }));
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }));
    expect(onApproveRequest).toHaveBeenCalledWith('request-1');
    expect(onRejectRequest).toHaveBeenCalledWith('request-1');
  });

  it('shows a dismissible settlement summary during hand preparation', () => {
    render(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        complete={false}
        onChoose={vi.fn()}
        settlement={{
          handId: 'hand-1',
          reason: 'showdown',
          winners: [{ nickname: 'Alice', payout: 240 }],
        }}
      />,
    );
    expect(
      screen.getByRole('alertdialog', { name: '本手结算' }),
    ).toHaveTextContent('Alice 赢得 240 筹码');
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    expect(screen.queryByRole('alertdialog', { name: '本手结算' })).toBeNull();
  });
});
