# Source benchmark: Meta Ad Library scrapers

Run: 2026-11-12T19:39:16.548Z · Queries: "gym shorts" US (70), "activewear" GB (70), "pre workout" US (60)
Total spent: **$0.44** of Apify free credit (Apify billing meter; per-run figures under-reported $0.23 and were reconciled) (estimate was $0.440) · Ads both scrapers returned: **198**

## Summary

| Scraper | Unique ads | Avg completeness | Media reachable | Real cost | Cost / 1k ads | Time |
|---|---:|---:|---:|---:|---:|---:|
| curious_coder · Facebook Ad Library Scraper | 199 | 99.4% | 15/15 (video 0/0) | $0.15 | $0.75 | 45s |
| automly · Facebook Ads Scraper | 199 | 95.3% | 15/15 (video 0/0) | $0.29 | $0.70 + $0.05/run | 39s |

## Field completeness (all ads / ads both returned)

| Field | curious_coder | automly |
|---|---:|---:|
| body text | 99% / 99% | 99.5% / 99.5% |
| headline | 96% / 96% | 96% / 96% |
| CTA | 99.5% / 99.5% | 99.5% / 99.5% |
| landing URL | 99.5% / 99.5% | 99.5% / 99.5% |
| start date | 100% / 100% | 100% / 100% |
| platforms | 100% / 100% | 100% / 100% |
| brand name | 100% / 100% | 100% / 100% |
| brand logo | 99.5% / 99.5% | 99.5% / 99.5% |
| any media URL | 100% / 100% | 77.4% / 77.3% |
| video URL (video ads) | 100% / 100% | 77.4% / 77.3% |
| known format | 100% / 100% | 100% / 100% |
| variations count > 1 | 18.6% / 18.7% | 19.6% / 19.7% |

## Formats

- **curious_coder/facebook-ads-library-scraper**: dco 96, video 45, image 55, carousel 3
- **automly/facebook-ad-library-scraper**: dco 74, video 45, carousel 26, image 54

## Runs

**curious_coder/facebook-ads-library-scraper**
- gym shorts / US: SUCCEEDED, 70 items, $0.020, 15s (run KzpKCSfbmhTZtS9JE)
- activewear / GB: SUCCEEDED, 70 items, $0.011, 15s (run 1DsMR0UHvrp5iIJvf)
- pre workout / US: SUCCEEDED, 60 items, $0.017, 15s (run yZRW0szT2IW8ChBCq)

**automly/facebook-ad-library-scraper**
- gym shorts / US: SUCCEEDED, 70 items, $0.050, 13s (run vOEDVEdYMxHl9WDNJ)
- activewear / GB: SUCCEEDED, 70 items, $0.077, 16s (run ebJlo70Xfubyh0kXR)
- pre workout / US: SUCCEEDED, 60 items, $0.057, 10s (run wRFCpDlq2HaNOwojV)

## Recommendation

**Use curious_coder/facebook-ads-library-scraper** (now set as `APIFY_ACTOR_ID`).

- More complete: 99.4% vs 95.3% average field completeness.
- Media on every ad: 100% of ads have media URLs vs 77% for automly, and all sampled URLs downloaded.
- Cheaper per run: $0.75 per 1,000 ads with no meaningful start fee; automly adds $0.05 per run, which dominates small keyword runs.
- Both returned almost the same ads for the same queries (198 of 199 overlap), so coverage is equal.

**Free-plan capacity:** Apify's free plan gives $5/month (hard cap, no card on file). With a $4.50 allowance in the cost ledger,
that is about **6,000 ads per month** at $0.75 per 1,000. Reaching 10,000+ ads per month for free needs the official
Meta Ad Library API (free, needs Meta ID verification) as a second source.

**Excluded:** apify/facebook-ads-scraper ($5.80 per 1,000 on the free tier) cannot fit a free budget. supreme_scraper does not exist on the Apify store.
