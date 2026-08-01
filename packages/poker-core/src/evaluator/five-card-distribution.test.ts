import { describe, expect, it } from 'vitest';

import { parseCard } from '../cards/card.js';
import { countFiveCardHandDistribution } from './five-card-distribution.js';

describe('countFiveCardHandDistribution', () => {
  it('requires the complete standard deck', () => {
    expect(() =>
      countFiveCardHandDistribution(['As', 'Ks'].map(parseCard)),
    ).toThrow('Expected a 52-card deck, received 2');
  });
});
