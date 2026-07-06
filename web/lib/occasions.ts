// Occasion calendar for the promo planner. Static data + date math only — no
// network, safe to import in client components. Fixed-date occasions recur
// every year; lunar-calendar festivals move every year, so those are listed
// per year and carry approxDate — the UI tells the owner to double-check the
// exact day before sending anything.

export interface UpcomingOccasion {
  id: string;
  name: string;
  startsInDays: number; // 0 while ongoing
  ongoing: boolean;
  approxDate: boolean;
  vegLean: boolean; // customers skew vegetarian around this occasion
  angle: string; // one-line marketing context, injected into the prompt as data
  dateLabel: string; // "17 Jul – 13 Aug" or "15 Aug"
}

interface OccasionBase {
  id: string;
  name: string;
  vegLean?: boolean;
  approxDate?: boolean;
  angle: string;
}
/** Recurs every year on a fixed date (durationDays > 1 for seasons). */
type AnnualOccasion = OccasionBase & { month: number; day: number; durationDays?: number };
/** Movable (lunar-calendar) dates, listed explicitly per year. */
type DatedOccasion = OccasionBase & { start: string; end?: string };

const ANNUAL: AnnualOccasion[] = [
  { id: "republic-day", name: "Republic Day", month: 1, day: 26, angle: "National holiday — family day out, long-weekend lunches." },
  { id: "valentines", name: "Valentine's Day", month: 2, day: 14, angle: "Couples' dinner — share-a-pizza-for-two angle." },
  { id: "monsoon", name: "Monsoon season", month: 6, day: 15, durationDays: 92, angle: "Rainy evenings — hot pizza cravings when nobody wants to step out." },
  { id: "friendship-day", name: "Friendship Day", month: 8, day: 2, approxDate: true, angle: "First Sunday of August — groups of friends splitting big orders." },
  { id: "independence-day", name: "Independence Day", month: 8, day: 15, angle: "National holiday — family lunches and group orders." },
  { id: "childrens-day", name: "Children's Day", month: 11, day: 14, angle: "Kids' favourites — family treat angle." },
  { id: "christmas", name: "Christmas", month: 12, day: 25, angle: "Festive dinners and small parties." },
  { id: "new-year", name: "New Year's Eve", month: 12, day: 31, angle: "Party orders — groups, celebrations, late evening rush." },
];

// Movable festivals with their (approximate) 2026 dates. Extend this list each
// year — an occasion whose window has passed simply stops being suggested, and
// the owner can always type a custom occasion in the planner.
const DATED: DatedOccasion[] = [
  { id: "holi-2026", name: "Holi", start: "2026-03-03", end: "2026-03-04", approxDate: true, angle: "Colours and gatherings — big group appetites after playing." },
  { id: "eid-2026", name: "Eid al-Fitr", start: "2026-03-20", end: "2026-03-21", approxDate: true, angle: "Festive family meals after Ramadan." },
  { id: "shravan-2026", name: "Shravan (Sawan) month", start: "2026-07-17", end: "2026-08-13", approxDate: true, vegLean: true, angle: "Many customers eat pure vegetarian this month — lead with veg options." },
  { id: "rakhi-2026", name: "Raksha Bandhan", start: "2026-08-28", approxDate: true, angle: "Sibling get-togethers — family treat angle." },
  { id: "janmashtami-2026", name: "Janmashtami", start: "2026-09-04", approxDate: true, vegLean: true, angle: "Fasting and vegetarian meals — veg-only messaging." },
  { id: "ganesh-2026", name: "Ganesh Chaturthi", start: "2026-09-14", end: "2026-09-25", approxDate: true, vegLean: true, angle: "Festive vegetarian season, community gatherings." },
  { id: "navratri-2026", name: "Sharad Navratri", start: "2026-10-11", end: "2026-10-19", approxDate: true, vegLean: true, angle: "Nine days of vegetarian/fasting food — strictly veg messaging." },
  { id: "dussehra-2026", name: "Dussehra", start: "2026-10-20", approxDate: true, angle: "Family outings after Ravan Dahan — evening rush." },
  { id: "diwali-2026", name: "Diwali", start: "2026-11-06", end: "2026-11-10", approxDate: true, angle: "Card parties, family gatherings, gifting mood all week." },
];

const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function label(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return end.getTime() === start.getTime() ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

/** Occasions ongoing now or starting within `withinDays`, soonest first. */
export function upcomingOccasions(now: Date = new Date(), withinDays = 45): UpcomingOccasion[] {
  const today = startOfDay(now);
  const windows: { o: OccasionBase; start: Date; end: Date }[] = [];

  for (const o of ANNUAL) {
    // Check last/this/next year so multi-day windows spanning New Year still match.
    for (const year of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
      const start = new Date(year, o.month - 1, o.day);
      const end = new Date(start.getTime() + ((o.durationDays ?? 1) - 1) * DAY_MS);
      windows.push({ o, start, end });
    }
  }
  for (const o of DATED) {
    const start = startOfDay(new Date(`${o.start}T00:00:00`));
    const end = o.end ? startOfDay(new Date(`${o.end}T00:00:00`)) : start;
    windows.push({ o, start, end });
  }

  const out: UpcomingOccasion[] = [];
  for (const w of windows) {
    const ongoing = today >= w.start && today <= w.end;
    const startsInDays = Math.round((w.start.getTime() - today.getTime()) / DAY_MS);
    if (!ongoing && (startsInDays < 0 || startsInDays > withinDays)) continue;
    out.push({
      id: w.o.id,
      name: w.o.name,
      startsInDays: ongoing ? 0 : startsInDays,
      ongoing,
      approxDate: Boolean(w.o.approxDate),
      vegLean: Boolean(w.o.vegLean),
      angle: w.o.angle,
      dateLabel: label(w.start, w.end),
    });
  }
  return out.sort((a, b) => a.startsInDays - b.startsInDays || a.name.localeCompare(b.name));
}
