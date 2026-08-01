# Reference evaluator

Differential tests use `@pokertools/evaluator` version `1.0.16`, licensed under
MIT. It evaluates five, six, and seven card poker hands using lookup tables.

The package is a development-only dependency. Production code never imports it;
the in-house evaluator remains the sole runtime implementation. The differential
suite uses seed `0x5eed2026` so failures are reproducible.

Source: <https://github.com/aaurelions/pokertools/tree/main/packages/evaluator>
