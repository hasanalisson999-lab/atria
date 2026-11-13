Shape fixtures for the Ad Library normalizer.

- `raw-snake.json`, `raw-camel.json`, `automly-clean.json` mirror the documented output shapes of
  the three benchmarked Apify actors (IDs and URLs are synthetic test values).
- `real-*.json` files are written by `npm run benchmark` from actual runs and are picked up by
  `normalize.real.test.ts` automatically.
