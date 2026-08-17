import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HandReadyOverlay, sortBestFiveCards } from './HandReadyOverlay.js';

describe('HandReadyOverlay', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('shows ready and sitting-out actions alongside the preparation information', () => {
    const onChoose = vi.fn();
    render(
      <HandReadyOverlay
        deadlineMs={40_000}
        nowMs={10_000}
        ownChoice="pending"
        pendingRequests={[]}
        complete={false}
        ownChips={100}
        onChoose={onChoose}
      />,
    );
    expect(screen.queryByText('下一局准备')).toBeNull();
    expect(screen.getByLabelText('剩余 30 秒')).toHaveTextContent('30s');
    fireEvent.click(screen.getByRole('button', { name: '就绪' }));
    fireEvent.click(screen.getByRole('button', { name: '暂不参与' }));
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
            targetPlayerId: 'alice',
            amount: 200,
          },
        ]}
        complete={false}
        ownChips={100}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '已就绪' })).toBeDisabled();
    expect(screen.getByText('Bob 请求 200 筹码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已就绪' })).toBeInTheDocument();
    expect(screen.queryByText('当前选择：')).toBeNull();
  });

  it('automatically disappears after the next round starts', () => {
    const { container, rerender } = render(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="ready"
        pendingRequests={[]}
        complete={false}
        ownChips={100}
        onChoose={vi.fn()}
      />,
    );
    expect(container).not.toBeEmptyDOMElement();
    rerender(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="ready"
        pendingRequests={[]}
        complete
        ownChips={100}
        onChoose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('derives readiness from the latest chip balance and big blind', () => {
    const { rerender } = render(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        complete={false}
        ownChips={1}
        bigBlind={2}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '就绪' })).toBeDisabled();
    rerender(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        complete={false}
        ownChips={2}
        bigBlind={2}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '就绪' })).toBeEnabled();
  });

  it('allows a funded player to choose ready while requests remain pending', () => {
    render(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[
          {
            requestId: 'r1',
            requesterId: 'bob',
            requesterName: 'Bob',
            targetPlayerId: 'alice',
            amount: 20,
          },
        ]}
        complete={false}
        ownChips={2}
        bigBlind={2}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '就绪' })).toBeEnabled();
  });

  it('lets a timed-out sitting-out player become ready again', () => {
    const onChoose = vi.fn();
    render(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={30_000}
        ownChoice="sitting-out"
        pendingRequests={[]}
        complete={false}
        ownChips={100}
        onChoose={onChoose}
      />,
    );
    expect(screen.getByLabelText('等待至少两名玩家就绪')).toHaveTextContent(
      '等待就绪',
    );
    fireEvent.click(screen.getByRole('button', { name: '就绪' }));
    expect(onChoose).toHaveBeenCalledWith('ready');
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
        ownChips={100}
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

  it('reuses the chip-request prompt style for an all-player reset vote', () => {
    const onChipResetVote = vi.fn();
    render(
      <HandReadyOverlay
        ownPlayerId="alice"
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        chipResetVote={{
          initialChips: 100,
          insufficientPlayerNames: ['Bob'],
          ownVote: 'pending',
          players: [
            { playerId: 'alice', nickname: 'Alice', vote: 'pending' },
            { playerId: 'bob', nickname: 'Bob', vote: 'pending' },
          ],
        }}
        complete={false}
        ownChips={100}
        onChoose={vi.fn()}
        onChipResetVote={onChipResetVote}
      />,
    );

    const prompt = screen.getByRole('alertdialog', { name: '筹码重置投票' });
    expect(prompt).toHaveClass('hand-ready-card__request-prompt');
    expect(prompt).toHaveClass('hand-ready-card__request-prompt--chip-reset');
    expect(prompt).toHaveTextContent('Bob 的剩余筹码不足以参加下一局');
    fireEvent.click(within(prompt).getByRole('button', { name: '同意' }));
    fireEvent.click(within(prompt).getByRole('button', { name: '拒绝' }));
    expect(onChipResetVote).toHaveBeenNthCalledWith(1, 'approve');
    expect(onChipResetVote).toHaveBeenNthCalledWith(2, 'reject');
    expect(screen.getByRole('button', { name: '就绪' })).toBeDisabled();
  });

  it('puts me first and aligns voted status in the reset vote table', () => {
    render(
      <HandReadyOverlay
        ownPlayerId="alice"
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        chipResetVote={{
          initialChips: 100,
          insufficientPlayerNames: ['Bob'],
          ownVote: 'pending',
          players: [
            { playerId: 'bob', nickname: 'Bob', vote: 'approve' },
            { playerId: 'alice', nickname: 'Alice', vote: 'pending' },
            { playerId: 'carol', nickname: 'Carol', vote: 'reject' },
          ],
        }}
        complete={false}
        ownChips={100}
        onChoose={vi.fn()}
      />,
    );

    const prompt = screen.getByRole('alertdialog', { name: '筹码重置投票' });
    expect(
      within(prompt).getByRole('button', { name: '收起筹码重置投票' }),
    ).toBeInTheDocument();
    const rows = within(prompt).getAllByRole('row');
    const ownRow = rows[0];
    const bobRow = rows[1];
    const carolRow = rows[2];
    if (!ownRow || !bobRow || !carolRow) {
      throw new Error('Expected three chip reset vote rows');
    }
    expect(ownRow).toHaveTextContent('我');
    expect(ownRow).toHaveTextContent('待投票');
    expect(bobRow).toHaveTextContent('Bob');
    expect(bobRow).toHaveTextContent('已同意');
    expect(within(bobRow).getByText('已同意')).toHaveClass(
      'hand-ready-card__vote-status--approved',
    );
    expect(carolRow).toHaveTextContent('Carol');
    expect(carolRow).toHaveTextContent('已拒绝');
    expect(within(carolRow).getByText('已拒绝')).toHaveClass(
      'hand-ready-card__vote-status--rejected',
    );
  });

  it('hides the reset vote panel after the authoritative vote reaches a terminal result', () => {
    const { rerender } = render(
      <HandReadyOverlay
        ownPlayerId="alice"
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        chipResetVote={{
          initialChips: 100,
          insufficientPlayerNames: ['Bob'],
          ownVote: 'pending',
          players: [
            { playerId: 'alice', nickname: 'Alice', vote: 'pending' },
            { playerId: 'bob', nickname: 'Bob', vote: 'pending' },
          ],
        }}
        complete={false}
        ownChips={100}
        onChoose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('alertdialog', { name: '筹码重置投票' }),
    ).toBeInTheDocument();
    rerender(
      <HandReadyOverlay
        ownPlayerId="alice"
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        chipResetVote={null}
        complete={false}
        ownChips={100}
        onChoose={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('alertdialog', { name: '筹码重置投票' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '展开筹码重置投票' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the local collapse state when the authoritative vote fails', () => {
    const { rerender } = render(
      <HandReadyOverlay
        ownPlayerId="alice"
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        chipResetVote={{
          initialChips: 100,
          insufficientPlayerNames: ['Bob'],
          ownVote: 'pending',
          players: [
            { playerId: 'alice', nickname: 'Alice', vote: 'pending' },
            { playerId: 'bob', nickname: 'Bob', vote: 'pending' },
          ],
        }}
        complete={false}
        ownChips={100}
        onChoose={vi.fn()}
      />,
    );

    rerender(
      <HandReadyOverlay
        ownPlayerId="alice"
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        chipResetVote={{
          initialChips: 100,
          insufficientPlayerNames: ['Bob'],
          ownVote: 'reject',
          players: [
            { playerId: 'alice', nickname: 'Alice', vote: 'reject' },
            { playerId: 'bob', nickname: 'Bob', vote: 'pending' },
          ],
        }}
        complete={false}
        ownChips={100}
        onChoose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: '收起筹码重置投票' }),
    ).toBeInTheDocument();
    const prompt = screen.getByRole('alertdialog', { name: '筹码重置投票' });
    fireEvent.click(
      within(prompt).getByRole('button', { name: '收起筹码重置投票' }),
    );
    rerender(
      <HandReadyOverlay
        ownPlayerId="alice"
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        chipResetVote={{
          status: 'failed',
          initialChips: 100,
          insufficientPlayerNames: ['Bob'],
          ownVote: 'reject',
          players: [
            { playerId: 'alice', nickname: 'Alice', vote: 'reject' },
            { playerId: 'bob', nickname: 'Bob', vote: 'reject' },
          ],
        }}
        complete={false}
        ownChips={100}
        onChoose={vi.fn()}
      />,
    );

    const failedPrompt = screen.getByRole('alertdialog', {
      name: '筹码重置投票',
    });
    expect(failedPrompt).toHaveTextContent('筹码重置投票失败');
    expect(
      within(failedPrompt).getByRole('button', { name: '展开筹码重置投票' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '就绪' })).toBeEnabled();
  });

  it('shows the settlement summary until the next round starts', () => {
    const props = {
      ownPlayerId: 'alice',
      deadlineMs: 30_000,
      nowMs: 5_000,
      ownChoice: 'pending' as const,
      pendingRequests: [],
      ownChips: 100,
      onChoose: vi.fn(),
      onShowHoleCards: vi.fn(),
      settlement: {
        handId: 'hand-1',
        handNumber: 7,
        reason: 'showdown' as const,
        communityCards: ['2c', 'Td', 'Jh', 'Qs', 'Ac'],
        totalPot: 240,
        streetPots: [
          { street: 'preflop' as const, amount: 40 },
          { street: 'flop' as const, amount: 200 },
        ],
        players: [
          {
            playerId: 'alice',
            nickname: 'Alice',
            chips: 1_240,
            netChange: 240,
            holeCards: ['As', 'Kd'],
            bestFiveCards: ['As', 'Ad', 'Ac', 'Ks', 'Qd'],
            handType: '一对',
          },
          {
            playerId: 'bob',
            nickname: 'Bob',
            chips: 760,
            netChange: -240,
          },
        ],
      },
    };
    const { rerender } = render(
      <HandReadyOverlay {...props} complete={false} />,
    );
    expect(
      screen.getByRole('alertdialog', { name: '第 7 局结算' }),
    ).toBeInTheDocument();
    expect(screen.getByText('第 7 局结算 · 摊牌')).toBeInTheDocument();
    expect(screen.getByText('我').parentElement).toHaveTextContent(
      '我· 1,240 筹码赢得 240 筹码',
    );
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByText('Bob').parentElement).toHaveTextContent(
      'Bob· 760 筹码输掉 240 筹码',
    );
    const actions = screen.getByRole('group', { name: '准备操作' });
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['就绪', '摊牌', '暂不参与']);
    fireEvent.click(within(actions).getByRole('button', { name: '摊牌' }));
    expect(props.onShowHoleCards).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('本局结算玩家牌型')).toHaveTextContent(
      'Bob· 760 筹码输掉 240 筹码底牌未摊牌',
    );
    expect(screen.getByLabelText('我 的底牌')).toHaveTextContent('底牌A♠K♦');
    expect(screen.getByLabelText('本局公共牌')).toHaveTextContent(
      '公共牌2♣10♦J♥Q♠A♣',
    );
    expect(screen.getByLabelText('本局结算底池')).toHaveTextContent(
      '总池240翻牌前40翻牌200',
    );
    expect(screen.getByLabelText('我 的一对')).toHaveTextContent(
      '一对A♠A♦A♣K♠Q♦',
    );
    expect(screen.queryByText('最大牌')).toBeNull();
    expect(screen.getByLabelText('我 的最佳第 1 张牌 A♠')).toBeInTheDocument();
    expect(screen.getByLabelText('Bob 的底牌')).toHaveTextContent('底牌');
    expect(screen.getAllByLabelText(/Bob 的第 .* 张底牌，未公开/)).toHaveLength(
      2,
    );
    expect(screen.queryByRole('button', { name: '知道了' })).toBeNull();
    expect(
      screen.getByRole('button', { name: '收起结算详情' }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByLabelText('本局公共牌')
        .querySelector('.hand-ready-card__card-label'),
    ).toHaveTextContent('公共牌');
    rerender(
      <HandReadyOverlay
        {...props}
        complete={false}
        settlement={{
          ...props.settlement,
          players: props.settlement.players.map((player) =>
            player.playerId === 'alice' ? { ...player, chips: 1_250 } : player,
          ),
        }}
      />,
    );
    expect(screen.getByText('我').parentElement).toHaveTextContent(
      '我· 1,250 筹码赢得 240 筹码',
    );
    rerender(<HandReadyOverlay {...props} complete />);
    expect(
      screen.queryByRole('alertdialog', { name: '第 7 局结算' }),
    ).toBeNull();
  });

  it('puts my settlement row first and shows my result', () => {
    const makeSettlement = (ownNetChange: number) => ({
      handId: `hand-${ownNetChange}`,
      handNumber: 8,
      reason: 'showdown' as const,
      players: [
        {
          playerId: 'bob',
          nickname: 'Bob',
          chips: 80,
          netChange: -ownNetChange,
        },
        {
          playerId: 'alice',
          nickname: 'Alice',
          chips: 120,
          netChange: ownNetChange,
        },
      ],
    });
    const props = {
      ownPlayerId: 'alice',
      deadlineMs: 30_000,
      nowMs: 5_000,
      ownChoice: 'pending' as const,
      pendingRequests: [],
      complete: false,
      ownChips: 100,
      onChoose: vi.fn(),
    };
    const { rerender } = render(
      <HandReadyOverlay {...props} settlement={makeSettlement(20)} />,
    );

    expect(screen.getByText('胜利')).toHaveClass(
      'hand-ready-card__net-change--positive',
    );
    const players = within(
      screen.getByLabelText('本局结算玩家牌型'),
    ).getAllByRole('listitem');
    expect(players[0]).toHaveTextContent('我');
    expect(players[1]).toHaveTextContent('Bob');

    rerender(<HandReadyOverlay {...props} settlement={makeSettlement(-20)} />);
    expect(screen.getByText('失败')).toHaveClass(
      'hand-ready-card__net-change--negative',
    );

    rerender(<HandReadyOverlay {...props} settlement={makeSettlement(0)} />);
    expect(screen.getByText('平局')).toHaveClass(
      'hand-ready-card__net-change--tie',
    );
  });

  it('collapses settlement from its mobile detail button and restores it', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const settlement = {
      handId: 'hand-1',
      handNumber: 9,
      reason: 'showdown' as const,
      communityCards: ['2c', 'Td', 'Jh', 'Qs', 'Ac'],
      players: [
        {
          playerId: 'alice',
          nickname: 'Alice',
          chips: 120,
          netChange: 20,
          holeCards: ['As', 'Kd'],
          bestFiveCards: ['As', 'Kd', 'Qs', 'Jh', 'Td'],
          handType: '顺子',
        },
      ],
    };
    const props = {
      deadlineMs: 30_000,
      nowMs: 7_000,
      ownChoice: 'pending' as const,
      pendingRequests: [],
      complete: false,
      ownChips: 100,
      onChoose: vi.fn(),
    };
    const { rerender } = render(
      <HandReadyOverlay {...props} settlement={settlement} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '收起结算详情' }));
    expect(
      screen.queryByRole('alertdialog', { name: '第 9 局结算' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: '就绪' })).toBeNull();
    const expand = screen.getByRole('button', {
      name: '结算详情 · 23s',
    });
    expect(expand.closest('.hand-ready-overlay')).toHaveClass(
      'hand-ready-overlay--collapsed',
    );
    fireEvent.click(expand);
    expect(
      screen.getByRole('alertdialog', { name: '第 9 局结算' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '收起结算详情' }));
    rerender(
      <HandReadyOverlay
        {...props}
        settlement={{ ...settlement, handId: 'hand-2' }}
      />,
    );
    expect(
      screen.getByRole('alertdialog', { name: '第 9 局结算' }),
    ).toBeInTheDocument();
  });

  it('uses the same compact settlement entry after collapsing on desktop', () => {
    render(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={7_000}
        ownChoice="pending"
        pendingRequests={[]}
        complete={false}
        ownChips={100}
        onChoose={vi.fn()}
        settlement={{
          handId: 'hand-desktop',
          handNumber: 10,
          reason: 'uncontested',
          players: [
            {
              playerId: 'alice',
              nickname: 'Alice',
              chips: 120,
              netChange: 20,
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '收起结算详情' }));
    expect(
      screen.queryByRole('alertdialog', { name: '第 10 局结算' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '结算详情 · 23s' }),
    ).toBeInTheDocument();
  });

  it('shows only the already public community cards for an early settlement', () => {
    render(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        complete={false}
        ownChips={100}
        onChoose={vi.fn()}
        settlement={{
          handId: 'hand-early-turn',
          handNumber: 11,
          reason: 'uncontested',
          communityCards: ['As', 'Kd', 'Qh', 'Jc'],
          players: [
            {
              playerId: 'alice',
              nickname: 'Alice',
              chips: 140,
              netChange: 40,
            },
            {
              playerId: 'bob',
              nickname: 'Bob',
              chips: 60,
              netChange: -40,
            },
          ],
        }}
      />,
    );

    expect(screen.getByLabelText('本局公共牌')).toHaveTextContent(
      '公共牌A♠K♦Q♥J♣',
    );
    expect(screen.getAllByLabelText(/本局第 .* 张公共牌/)).toHaveLength(4);
    expect(screen.queryByLabelText('本局第 5 张公共牌')).toBeNull();
    expect(screen.getAllByLabelText(/的第 .* 张底牌，未公开/)).toHaveLength(4);
  });

  it('orders every hand type for readable settlement cards', () => {
    expect(sortBestFiveCards(['2c', 'As', 'Td', 'Kd', 'Qh'], '高牌')).toEqual([
      'As',
      'Kd',
      'Qh',
      'Td',
      '2c',
    ]);
    expect(sortBestFiveCards(['Ks', 'Ad', 'Ac', 'Qh', 'Jc'], '一对')).toEqual([
      'Ad',
      'Ac',
      'Ks',
      'Qh',
      'Jc',
    ]);
    expect(sortBestFiveCards(['3c', 'Kd', 'Kh', 'Ad', 'As'], '两对')).toEqual([
      'As',
      'Ad',
      'Kh',
      'Kd',
      '3c',
    ]);
    expect(sortBestFiveCards(['2c', 'Jd', 'Jh', 'Js', 'Ac'], '三条')).toEqual([
      'Js',
      'Jh',
      'Jd',
      'Ac',
      '2c',
    ]);
    expect(sortBestFiveCards(['2s', '5d', 'Ah', '3c', '4s'], '顺子')).toEqual([
      '5d',
      '4s',
      '3c',
      '2s',
      'Ah',
    ]);
    expect(sortBestFiveCards(['2h', 'Ah', '9h', 'Kh', 'Jh'], '同花')).toEqual([
      'Ah',
      'Kh',
      'Jh',
      '9h',
      '2h',
    ]);
    expect(sortBestFiveCards(['Kd', 'Ac', 'As', 'Kh', 'Ad'], '葫芦')).toEqual([
      'As',
      'Ad',
      'Ac',
      'Kh',
      'Kd',
    ]);
    expect(sortBestFiveCards(['2c', 'Qs', 'Qd', 'Qc', 'Qh'], '四条')).toEqual([
      'Qs',
      'Qh',
      'Qd',
      'Qc',
      '2c',
    ]);
    expect(
      sortBestFiveCards(['2h', '5h', 'Ah', '3h', '4h'], 'straight-flush'),
    ).toEqual(['5h', '4h', '3h', '2h', 'Ah']);
  });

  it('replaces settlement card backs with a player’s voluntarily revealed cards', () => {
    render(
      <HandReadyOverlay
        deadlineMs={30_000}
        nowMs={5_000}
        ownChoice="pending"
        pendingRequests={[]}
        complete={false}
        ownChips={100}
        onChoose={vi.fn()}
        settlement={{
          handId: 'hand-1',
          handNumber: 12,
          reason: 'uncontested',
          players: [
            {
              playerId: 'bob',
              nickname: 'Bob',
              chips: 80,
              netChange: -20,
              voluntarilyRevealedHoleCards: ['2c', '3d'],
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('主动摊牌')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Bob 的公开第 1 张底牌 2♣'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Bob 的公开第 2 张底牌 3♦'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Bob 的第 1 张底牌，未公开/)).toBeNull();
  });
});
