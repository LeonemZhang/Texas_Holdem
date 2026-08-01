import { verifyStandardFiveCardDistribution } from '../src/evaluator/five-card-distribution.js';

const startedAt = performance.now();
verifyStandardFiveCardDistribution();
const elapsedSeconds = ((performance.now() - startedAt) / 1_000).toFixed(2);

console.log(
  `Verified all 2,598,960 five-card combinations in ${elapsedSeconds}s.`,
);
