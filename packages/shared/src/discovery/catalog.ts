/**
 * Every category Atria can show, with the real brands that seed it. Brands are pulled in on demand: the
 * first time a category is opened (or "Add more brands" is pressed), its brands are resolved to their
 * official Facebook pages and their public ads are fetched through the free fallback chain.
 *
 * `tier: "challenger"` marks newer / less mainstream brands, so Discover can spotlight how they market.
 */
export interface CatalogBrand {
  name: string;
  tier?: "major" | "challenger";
  /** Search term for finding the official page when the plain name is ambiguous (e.g. "Norda" is also a school group). */
  query?: string;
}

/** Better search terms for ambiguous brand names. */
const QUERIES: Record<string, string> = {
  Norda: "norda run",
  Karhu: "karhu running",
  Teva: "teva footwear",
  Veja: "veja sneakers",
  "Hey Dude": "heydude shoes",
  TYR: "tyr sport",
  "361 Degrees": "361 degrees usa",
  Diadora: "diadora sport",
  "Hylo Athletics": "hylo running",
  "Thousand Fell": "thousand fell sneakers",
  "Li-Ning": "li-ning sports",
  Merrell: "merrell",
  Saysh: "saysh",
};

export interface Category {
  id: string;
  label: string;
  emoji: string;
  brands: CatalogBrand[];
}

const majors = (...names: string[]): CatalogBrand[] => names.map((name) => ({ name, tier: "major", query: QUERIES[name] }));
const challengers = (...names: string[]): CatalogBrand[] => names.map((name) => ({ name, tier: "challenger", query: QUERIES[name] }));

export const CATEGORIES: Category[] = [
  {
    id: "footwear",
    label: "Footwear",
    emoji: "👟",
    brands: [
      ...majors("Skechers", "Under Armour", "Merrell", "Crocs", "Keen", "Teva", "Converse", "Vans", "Dr. Martens", "UGG", "Birkenstock", "Timberland", "Clarks", "Ecco", "Columbia Sportswear"),
      ...challengers(
        "Hylo Athletics",
        "Norda",
        "La Sportiva",
        "Karhu",
        "Diadora",
        "361 Degrees",
        "Li-Ning",
        "Veja",
        "Cariuma",
        "Atoms",
        "Koio",
        "Thousand Fell",
        "Rothy's",
        "Hey Dude",
        "OOFOS",
        "Kizik",
        "Vessi",
        "TYR",
        "APL Athletic Propulsion Labs",
        "Saysh",
        "Craft Sportswear",
        "Mount to Coast",
        "Speedland",
        "Bandit Running",
        "Inov-8",
        "Ten Toes",
        "Lems Shoes",
        "Whitin",
        "Splits59",
        "Nnormal",
        "Scott Running",
        "Brooks Running",
      ),
    ],
  },
  { id: "apparel", label: "Apparel", emoji: "👕", brands: [...majors("Nike", "lululemon", "Under Armour", "Gymshark", "Alo Yoga", "Vuori", "Patagonia", "The North Face", "Arc'teryx"), ...challengers("Tracksmith", "Janji", "Ciele Athletics", "Outdoor Voices", "Bandit Running", "Gymreapers", "Buffbunny", "Satisfy", "Rhone", "Ten Thousand", "Represent", "Oner Active", "TALA", "Set Active", "Girlfriend Collective", "Popflex", "District Vision", "Soar Running")] },
  { id: "supplements", label: "Supplements", emoji: "💊", brands: [...majors("Optimum Nutrition", "Myprotein", "Garden of Life", "Vital Proteins", "Celsius"), ...challengers("AG1", "Momentous", "Huel", "Legion Athletics", "Ritual", "Liquid I.V.", "Thorne", "Cymbiotika", "Bloom Nutrition", "Transparent Labs", "GHOST", "Seed Health", "LMNT", "Create Wellness", "Ka'Chava", "Arrae", "Javy Coffee")] },
  { id: "skincare", label: "Skincare", emoji: "🧴", brands: [...majors("CeraVe", "La Roche-Posay", "Neutrogena", "Clinique", "Kiehl's"), ...challengers("The Ordinary", "Glow Recipe", "Drunk Elephant", "Paula's Choice", "Tatcha", "Bubble Skincare", "Naturium", "Youth To The People", "Byoma", "Summer Fridays", "Peach & Lily", "Topicals", "Starface", "Hero Cosmetics", "Medik8", "Dieux Skin", "Krave Beauty")] },
  { id: "makeup", label: "Makeup", emoji: "💄", brands: [...majors("MAC Cosmetics", "Maybelline", "NYX Professional Makeup", "Benefit Cosmetics", "Charlotte Tilbury"), ...challengers("Rare Beauty", "Fenty Beauty", "Glossier", "Milk Makeup", "e.l.f. Cosmetics", "Makeup by Mario", "Tower 28", "Kosas", "Saie", "Merit Beauty", "ILIA Beauty", "Westman Atelier", "Huda Beauty", "Patrick Ta", "Danessa Myricks Beauty", "Haus Labs", "Rhode")] },
  { id: "haircare", label: "Haircare", emoji: "💇", brands: [...majors("Pantene", "L'Oréal Paris", "Dyson", "Redken", "Kérastase"), ...challengers("Olaplex", "K18", "Prose", "OUAI", "Moroccanoil", "Briogeo", "Gisou", "Function of Beauty", "Crown Affair", "Act+Acre", "Bread Beauty Supply", "Pattern Beauty", "Ceremonia", "Living Proof", "Amika", "Color Wow", "Divi")] },
  { id: "fragrance", label: "Fragrance", emoji: "🌸", brands: [...majors("Dior Beauty", "Chanel", "YSL Beauty", "Jo Malone London", "Tom Ford Beauty"), ...challengers("Phlur", "Dossier", "Boy Smells", "Snif", "Byredo", "Le Labo", "Glossier You", "Sol de Janeiro", "Maison Margiela Replica", "Diptyque", "Henry Rose", "Kayali", "Ellis Brooklyn", "Commodity")] },
  { id: "wellness", label: "Wellness", emoji: "🧘", brands: [...majors("Calm", "Headspace", "Fitbit", "Garmin", "Theragun"), ...challengers("Oura", "WHOOP", "Hims", "Hers", "Eight Sleep", "Hatch", "Loop Earplugs", "Levels", "Function Health", "Ten Percent Happier", "Manta Sleep", "Bearaby", "Therabody", "Ultrahuman")] },
  { id: "fitness", label: "Fitness gear", emoji: "🏋️", brands: [...majors("Peloton", "Bowflex", "NordicTrack", "Garmin", "Apple"), ...challengers("Hyperice", "Tonal", "Hydrow", "Rogue Fitness", "Speediance", "Ergatta", "Tempo", "Mirror", "Gymshark", "Bala", "Rep Fitness", "Sorinex", "WHOOP", "Zwift")] },
  { id: "accessories", label: "Accessories", emoji: "💍", brands: [...majors("Ray-Ban", "Pandora", "Fossil", "Michael Kors", "Coach"), ...challengers("Mejuri", "Ana Luisa", "Warby Parker", "Bellroy", "Away", "Ridge Wallet", "Quince", "Monica Vinader", "Missoma", "Gorjana", "Baggu", "Calpak", "Pela Case", "Caden Lane")] },
  { id: "home", label: "Home", emoji: "🛋️", brands: [...majors("IKEA", "Dyson", "Wayfair", "West Elm", "Le Creuset"), ...challengers("Brooklinen", "Parachute Home", "Our Place", "Caraway", "Ruggable", "Simplehuman", "Burrow", "Floyd", "Great Jones", "Fellow", "Branch Basics", "Blueland", "Snowe", "Coyuchi", "Material Kitchen")] },
  { id: "food", label: "Food & drink", emoji: "🥤", brands: [...majors("Coca-Cola", "Red Bull", "Starbucks", "Oatly", "Celsius"), ...challengers("Olipop", "Poppi", "Liquid Death", "Athletic Brewing", "Magic Spoon", "Graza", "Siete Foods", "Mid-Day Squares", "Fishwife", "Banza", "Daily Harvest", "Huel", "Feastables", "Prime Hydration", "Ghia", "Recess")] },
  { id: "pets", label: "Pets", emoji: "🐾", brands: [...majors("Purina", "Pedigree", "Chewy", "Petco", "Blue Buffalo"), ...challengers("BarkBox", "The Farmer's Dog", "Ollie", "Wild One", "Furbo", "Fi Smart Collar", "Maxbone", "Open Farm", "Sundays for Dogs", "Zesty Paws", "Petlibro", "Smalls", "Bark Bright")] },
  { id: "tech", label: "Tech", emoji: "🎧", brands: [...majors("Apple", "Samsung", "Bose", "Sony", "Beats by Dre"), ...challengers("Anker", "Nothing", "Shokz", "Loop Earplugs", "Ember", "Peak Design", "Nomad Goods", "Native Union", "Teenage Engineering", "Rabbit", "Light Phone", "Oura", "Nanoleaf", "Brilliant Earth")] },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const categoryById = (id: string | null | undefined) => CATEGORIES.find((c) => c.id === id) ?? null;
