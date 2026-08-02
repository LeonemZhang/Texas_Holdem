import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActionCountdown } from './ActionCountdown.js';

describe('ActionCountdown', () => {
  it('shows the server action deadline for the current actor', () => {
    render(
      <ActionCountdown deadlineMs={40_000} actorName="Alice" nowMs={11_001} />,
    );

    expect(screen.getByLabelText('Alice 行动剩余 29 秒')).toHaveTextContent(
      '轮到 Alice',
    );
    expect(screen.getByText('29s')).toBeInTheDocument();
  });
});
