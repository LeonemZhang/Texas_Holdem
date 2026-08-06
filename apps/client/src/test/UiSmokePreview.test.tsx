import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { UiSmokePreview, uiSmokePreviewPages } from './UiSmokePreview.js';

afterEach(cleanup);

describe('UiSmokePreview', () => {
  it.each(uiSmokePreviewPages)('renders the current %s preview', (page) => {
    const { container } = render(<UiSmokePreview page={page} />);

    expect(container).not.toBeEmptyDOMElement();
  });

  it('exercises the current action-order and hand-peak presentation', () => {
    render(<UiSmokePreview page="table" />);
    expect(screen.getAllByText('行动顺位 1').length).toBeGreaterThan(0);

    cleanup();
    render(<UiSmokePreview page="statistics" />);
    fireEvent.click(screen.getByRole('tab', { name: '牌型记录' }));
    expect(screen.getByText('本局最高牌型')).toBeInTheDocument();
  });
});
