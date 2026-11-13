import { CATEGORIES } from "@signal/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LabApp } from "@/components/lab/lab-app";
import { SkeletonBlock } from "@/components/states";
import { getFeed } from "@/lib/server/ads";
import { readAllLab, readLab } from "@/lib/server/lab";
import { feedFitFor, getMyBrand } from "@/lib/server/my-brand";

export const metadata = { title: "Brand Lab" };

const SECTIONS = new Set(["scripts", "check", "positioning", "branding", "ideas", "inspiration", "remix"]);
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Every Brand Lab view has its own URL so a refresh or a shared link lands in the same place:
 * /lab/scripts/<scriptId>, /lab/check, /lab/positioning/<chapter>, /lab/branding/<chapter>, /lab/ideas/<n>, /lab/inspiration, /lab/remix/<adId>/<chapter>.
 */
export default function LabPage({ params, searchParams }: PageProps<"/lab/[[...slug]]">) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-10 lg:grid-cols-[228px_minmax(0,1fr)]">
          <div className="hidden flex-col gap-3 lg:flex">
            <SkeletonBlock className="h-[70px] rounded-2xl" />
            <SkeletonBlock className="h-64 rounded-2xl" />
          </div>
          <div className="flex flex-col gap-6">
            <SkeletonBlock className="h-24 w-2/3 rounded-2xl" />
            <SkeletonBlock className="h-48 rounded-2xl" />
            <SkeletonBlock className="h-80 rounded-2xl" />
          </div>
        </div>
      }
    >
      <Lab params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Lab({ params, searchParams }: { params: PageProps<"/lab/[[...slug]]">["params"]; searchParams: PageProps<"/lab/[[...slug]]">["searchParams"] }) {
  await connection();
  const [{ slug = [] }, sp] = await Promise.all([params, searchParams]);

  // Old links: /lab?tab=ideas and /lab?remix=<adId>.
  if (typeof sp.remix === "string" && UUID.test(sp.remix)) redirect(`/lab/remix/${sp.remix}`);
  if (typeof sp.tab === "string" && SECTIONS.has(sp.tab) && sp.tab !== "remix") redirect(`/lab/${sp.tab}`);

  const [section = "scripts", sub] = slug;
  if (!SECTIONS.has(section) || slug.length > (section === "remix" ? 3 : 2) || (section === "remix" && !(sub && UUID.test(sub)))) redirect("/lab/scripts");

  const me = await getMyBrand();
  if (!me)
    return (
      <p className="text-sm text-muted-foreground">
        Add your brand in{" "}
        <Link href="/settings" className="underline">
          Settings
        </Link>{" "}
        first.
      </p>
    );
  const remixId = section === "remix" ? sub! : null;
  const fit = await feedFitFor(me);
  const [lab, remix, competitorAds, categoryAds] = await Promise.all([
    readAllLab(),
    remixId ? readLab("remix", remixId) : Promise.resolve(null),
    fit.brandIds.length ? getFeed({ niche: "everything", trackedOnly: true, sort: "longest", active: true, limit: 24 }) : Promise.resolve(null),
    getFeed({ niche: me.category, sort: "longest", active: true, limit: 24, fit }),
  ]);
  const seen = new Set<string>();
  const inspiration = [...(competitorAds?.ok ? competitorAds.data.ads : []), ...(categoryAds.ok ? categoryAds.data.ads : [])].filter((a) => !seen.has(a.id) && seen.add(a.id) && a.format !== "dco").slice(0, 36);
  return (
    <LabApp
      brand={{ name: me.name, logo: me.logo, products: me.products, price: me.priceMin && me.priceMax ? `$${me.priceMin}–${me.priceMax}` : null, category: CATEGORIES.find((c) => c.id === me.category)?.label ?? me.category }}
      entries={lab.entries}
      profile={lab.profile}
      inspiration={inspiration}
      remix={remixId ? { adId: remixId, entry: remix } : null}
    />
  );
}
