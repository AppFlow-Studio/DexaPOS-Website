/**
 * The icons a highlight may carry, and the guess made for a new one.
 *
 * The merchant picks from the grid — this is a closed set, matching the picker
 * Owner shows in their Features editor. It replaced a free-text box whose value
 * had to match a lucide name character-for-character, with no picker anywhere
 * and a silent no-icon render on a typo.
 *
 * Laid out six to a row in the panel, so the order here is the reading order
 * there: transport and payment, then food and dietary, then place and time.
 */
export const FEATURE_ICON_NAMES = [
  "Cake",
  "Car",
  "CreditCard",
  "ShoppingBag",
  "Mic",
  "Truck",
  "UtensilsCrossed",
  "Globe",
  "WheatOff",
  "Heart",
  "Leaf",
  "House",
  "Phone",
  "MapPin",
  "Star",
  "BookOpen",
  "Users",
  "Clock",
  "Gift",
  "Briefcase",
] as const;

export type FeatureIconName = (typeof FEATURE_ICON_NAMES)[number];

/**
 * What a newly added highlight starts on, from the words the merchant typed.
 *
 * Only ever a **starting point** — the picker is right there and one click
 * overrides it. The merchant types "Delivery", the truck is already selected,
 * and the common case costs no interaction at all.
 *
 * Ordered rules, **first match wins, so order is the tie-breaker.** Specific
 * beats generic: "Private dining room" carries both `private` and `dining`, and
 * people win, so `Users` sits above `UtensilsCrossed`. The food rule is last
 * precisely because its words are the most common — anything more specific
 * should have claimed the highlight already.
 */
const ICON_RULES: ReadonlyArray<readonly [FeatureIconName, readonly string[]]> = [
  ["WheatOff", ["gluten", "celiac", "coeliac", "wheat"]],
  ["Truck", ["deliver", "delivery", "courier", "shipping", "driver"]],
  ["Car", ["parking", "park", "curbside", "drive", "valet", "garage"]],
  ["Mic", ["music", "live", "karaoke", "band", "entertainment", "dj"]],
  ["Cake", ["cake", "dessert", "desserts", "bakery", "pastry", "sweet", "sweets"]],
  ["Leaf", ["vegan", "vegetarian", "veggie", "plant", "organic", "farm", "fresh", "seasonal", "sustainable"]],
  ["Heart", ["healthy", "health", "love", "homemade", "handmade", "craft", "crafted", "care", "wellness", "favorite", "favourite"]],
  ["Gift", ["gift", "reward", "rewards", "loyalty", "points", "birthday", "discount", "deal", "deals", "offer", "promo", "free"]],
  ["CreditCard", ["pay", "payment", "payments", "card", "cards", "cash", "contactless", "checkout", "split"]],
  ["Users", ["private", "party", "parties", "group", "groups", "family", "event", "events", "kids", "wedding", "banquet", "community", "seats", "seating"]],
  ["Clock", ["open", "hours", "late", "daily", "24", "247", "minute", "minutes", "fast", "quick", "always", "weekend", "weekends"]],
  ["MapPin", ["patio", "outdoor", "rooftop", "garden", "downtown", "neighborhood", "neighbourhood", "located", "location"]],
  ["Briefcase", ["business", "corporate", "office", "work", "meeting", "meetings"]],
  ["Globe", ["online", "web", "website", "international", "worldwide", "global"]],
  ["Phone", ["phone", "call", "contact", "text"]],
  ["BookOpen", ["menu", "story", "recipe", "recipes", "history", "about"]],
  ["House", ["home", "house", "cozy", "cosy", "indoor", "lounge", "atmosphere"]],
  ["ShoppingBag", ["shop", "retail", "merch", "market", "grocery", "order", "orders"]],
  ["UtensilsCrossed", ["cater", "catering", "dine", "dining", "takeout", "takeaway", "take", "pickup", "pick", "kitchen", "food", "meal", "meals", "chef", "grill", "grilled", "brunch", "breakfast", "lunch", "dinner", "halal", "kosher"]],
  ["Star", ["review", "reviews", "rated", "rating", "top", "popular", "best", "award", "awards", "certified", "authentic", "quality", "since", "established", "tradition", "traditional"]],
];

/** Nothing matched. A neutral mark the merchant can then change in one click. */
const FALLBACK_ICON: FeatureIconName = "Star";

/**
 * Words, not substrings.
 *
 * A substring test would give "Sparkling water" a map pin, because it contains
 * "park". Splitting first and matching each word by prefix keeps "delivery"
 * matching `deliver` while "sparkling" matches nothing.
 */
export function featureIconFor(title: string): FeatureIconName {
  const words = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return FALLBACK_ICON;

  for (const [icon, keywords] of ICON_RULES) {
    for (const word of words) {
      for (const keyword of keywords) {
        if (word.startsWith(keyword)) return icon;
      }
    }
  }

  return FALLBACK_ICON;
}
