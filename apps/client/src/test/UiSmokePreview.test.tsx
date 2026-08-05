import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { UiSmokePreview, uiSmokePreviewPages } from './UiSmokePreview.js';

afterEach(cleanup);

describe('UiSmokePreview', () => {
  it.each(uiSmokePreviewPages)('renders the current %s preview', (page) => {
    const { container } = render(<UiSmokePreview page={page} />);

    expect(container).not.toBeEmptyDOMElement();
  });
});
