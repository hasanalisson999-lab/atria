import "server-only";
import { type FeedAd, getFeed, LOGO_SQL } from "./ads";
import { query, type Result } from "./db";

/** One competitor's week: what they launched, stopped and are scaling, plus their creative mix. */
export interface CompetitorMove {
  id: string;
  name: string;
  logo_url: string | null;
  logo_small: string | null;
  category: string | null;
  live: number;
  new7: number;
  new30: number;
  stopped7: number;
  scaling: number;
  video_share: number;
  top_cta: string | null;
  last_launch: string | null;
  longest_live: number | null;
  /** New creatives per week, oldest first; the last bucket is the 7 days up to and including today. */
  spark: number[];
  synced_at: string | null;
  /** Live creatives by format. */
  mix: { video: number; image: number; carousel: number; dynamic: number };
}

export interface WatchData {
  moves: CompetitorMove[];
  /** New creatives from tracked brands in the last 14 days, grouped per brand. */
  launches: Record<string, FeedAd[]>;
  /** Proven creatives (live 30+ days) from tracked brands. */
  winners: FeedAd[];
  totals: { tracked: number; new7: number; stopped7: number; scaling: number; live: number };
}

const G = "coalesce(a.creative_group, a.id::text)";

export function getWatchData(): Promise<Result<WatchData>> {
  return query(async (sql) => {
    const movesP = sql<CompetitorMove[]>`
      select b.id, b.name, ${sql.unsafe(LOGO_SQL)} as logo_url, b.logo_url as logo_small, b.category, b.ads_synced_at::text as synced_at,
        (count(distinct ${sql.unsafe(G)}) filter (where a.is_active))::int as live,
        (count(distinct ${sql.unsafe(G)}) filter (where a.start_date > current_date - 7))::int as new7,
        (count(distinct ${sql.unsafe(G)}) filter (where a.start_date > current_date - 30))::int as new30,
        (count(distinct ${sql.unsafe(G)}) filter (where not a.is_active and a.end_date >= current_date - 7))::int as stopped7,
        (select count(*)::int from (select coalesce(a2.creative_group, a2.id::text) from public.ads a2 where a2.brand_id = b.id and a2.is_active
                                    group by coalesce(a2.creative_group, a2.id::text) having count(*) >= 3) s) as scaling,
        coalesce(round(100.0 * count(distinct ${sql.unsafe(G)}) filter (where a.is_active and a.format = 'video')
                 / nullif(count(distinct ${sql.unsafe(G)}) filter (where a.is_active), 0))::int, 0) as video_share,
        mode() within group (order by a.cta) filter (where a.is_active and a.cta is not null) as top_cta,
        max(a.start_date)::text as last_launch,
        max(a.days_running) filter (where a.is_active) as longest_live,
        array(select (select count(distinct coalesce(y.creative_group, y.id::text))::int from public.ads y
                      where y.brand_id = b.id and y.start_date > current_date - (w + 1) * 7 and y.start_date <= current_date - w * 7)
              from generate_series(7, 0, -1) w) as spark,
        json_build_object(
          'video', (count(distinct ${sql.unsafe(G)}) filter (where a.is_active and a.format = 'video'))::int,
          'image', (count(distinct ${sql.unsafe(G)}) filter (where a.is_active and a.format = 'image'))::int,
          'carousel', (count(distinct ${sql.unsafe(G)}) filter (where a.is_active and a.format = 'carousel'))::int,
          'dynamic', (count(distinct ${sql.unsafe(G)}) filter (where a.is_active and a.format = 'dco'))::int
        ) as mix
      from public.brands b left join public.ads a on a.brand_id = b.id
      where b.status = 'tracked' and b.merged_into is null
      group by b.id
      order by count(distinct ${sql.unsafe(G)}) filter (where a.start_date > current_date - 7) desc,
               count(distinct ${sql.unsafe(G)}) filter (where a.is_active) desc`;
    // Two pages of the newest creatives (the feed caps a page at 240): enough for two weeks of launches.
    const [moves, recent, recent2, winners] = await Promise.all([
      movesP,
      getFeed({ niche: "everything", trackedOnly: true, sort: "newest", limit: 240, diverse: false }),
      getFeed({ niche: "everything", trackedOnly: true, sort: "newest", limit: 240, offset: 240, diverse: false }),
      getFeed({ niche: "everything", trackedOnly: true, sort: "longest", active: true, minDays: 30, limit: 18 }),
    ]);
    const cutoff = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
    const launches: Record<string, FeedAd[]> = {};
    const seen = new Set<string>();
    for (const ad of [...(recent.ok ? recent.data.ads : []), ...(recent2.ok ? recent2.data.ads : [])]) {
      if (seen.has(ad.id)) continue;
      seen.add(ad.id);
      if (!ad.brand_id || !ad.start_date || ad.start_date.slice(0, 10) < cutoff) continue;
      (launches[ad.brand_id] ??= []).push(ad);
    }
    const sum = (k: keyof CompetitorMove) => moves.reduce((n, m) => n + (Number(m[k]) || 0), 0);
    return {
      moves: [...moves],
      launches,
      winners: winners.ok ? winners.data.ads : [],
      totals: { tracked: moves.length, new7: sum("new7"), stopped7: sum("stopped7"), scaling: sum("scaling"), live: sum("live") },
    };
  });
}
