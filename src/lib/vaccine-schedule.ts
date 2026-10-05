/**
 * Universal, antigen-based immunization schedule derived from WHO "Table 3:
 * Recommendations for Interrupted or Delayed Routine Immunization — Summary of
 * WHO Position Papers" (updated Sept 2020) and the underlying position papers
 * for full childhood ages.
 *
 * Deliberately brand-free and country-independent: entries are antigens (the
 * disease target), not commercial products. National schedules differ — this is
 * a reference baseline, not medical advice. `aliases` map common product names
 * and EN/RU spellings back to the antigen so recorded shots can be matched.
 */

export type VaccineTier = "universal" | "regional" | "risk" | "special";

export type ScheduleDose = {
  /** Recommended age from birth in months (0 = at birth). `null` = not age-driven (contextual). */
  ageMonths: number | null;
  ageLabel: string;
  ageLabelRu: string;
  /** Role label override; defaults to "Dose N". */
  label?: string;
  labelRu?: string;
  booster?: boolean;
};

export type RecurringBooster = {
  everyYears: number;
  /** Age in months at which the lifelong booster cycle begins. */
  startAgeMonths: number;
  label: string;
  labelRu: string;
};

/** One dose of a series started late, timed from the first recorded dose. */
export type CatchUpDose = { afterDays: number; label: string; labelRu: string };

export type ScheduleEntry = {
  id: string;
  name: string;
  nameRu: string;
  disease: string;
  diseaseRu: string;
  tier: VaccineTier;
  doses: ScheduleDose[];
  recurring?: RecurringBooster;
  /**
   * The series as given to someone who starts it late (or, with no age limit,
   * whenever it is started — rabies PrEP). Once the first dose is recorded at or
   * after `fromAgeMonths`, the remaining doses are timed from it instead of from
   * the birth date, so a started course is tracked to completion.
   */
  catchUp?: { fromAgeMonths?: number; doses: CatchUpDose[] };
  /** Lowercase tokens matched against a recorded vaccine's name/manufacturer. */
  aliases: string[];
  note?: string;
  noteRu?: string;
};

// weeks → months helpers for readability
const W6 = 1.5;
const W10 = 2.5;
const W14 = 3.5;

export const VACCINE_SCHEDULE: ScheduleEntry[] = [
  // ── Universal (recommended for all immunization programmes) ────────────────
  {
    id: "bcg",
    name: "BCG",
    nameRu: "БЦЖ",
    disease: "Tuberculosis",
    diseaseRu: "Туберкулёз",
    tier: "universal",
    doses: [{ ageMonths: 0, ageLabel: "at birth", ageLabelRu: "при рождении" }],
    aliases: ["bcg", "бцж", "tuberculosis", "туберкул"],
  },
  {
    id: "hepb",
    name: "Hepatitis B",
    nameRu: "Гепатит B",
    disease: "Hepatitis B",
    diseaseRu: "Гепатит B",
    tier: "universal",
    doses: [
      {
        ageMonths: 0,
        ageLabel: "at birth (<24h)",
        ageLabelRu: "при рождении (<24ч)",
        label: "Birth dose",
        labelRu: "Доза при рождении",
      },
      { ageMonths: W6, ageLabel: "6 weeks", ageLabelRu: "6 недель" },
      { ageMonths: W10, ageLabel: "10 weeks", ageLabelRu: "10 недель" },
      { ageMonths: W14, ageLabel: "14 weeks", ageLabelRu: "14 недель" },
    ],
    aliases: [
      "hepatitis b",
      "hep b",
      "hepb",
      "hbv",
      "днк",
      "гепатит b",
      "гепатит в",
      "энджерикс",
      "engerix",
      "эувакс",
      "euvax",
      "регевак",
      "комбиотех",
      "infanrix hexa",
      "hexaxim",
      "гексаксим",
      "twinrix",
      "твинрикс",
    ],
    catchUp: {
      fromAgeMonths: 216,
      doses: [
        { afterDays: 0, label: "Dose 1", labelRu: "Доза 1" },
        { afterDays: 30, label: "+1 month", labelRu: "+1 месяц" },
        { afterDays: 180, label: "+6 months", labelRu: "+6 месяцев" },
      ],
    },
  },
  {
    id: "polio",
    name: "Polio",
    nameRu: "Полиомиелит",
    disease: "Poliomyelitis",
    diseaseRu: "Полиомиелит",
    tier: "universal",
    doses: [
      { ageMonths: W6, ageLabel: "6 weeks", ageLabelRu: "6 недель" },
      { ageMonths: W10, ageLabel: "10 weeks", ageLabelRu: "10 недель" },
      { ageMonths: W14, ageLabel: "14 weeks", ageLabelRu: "14 недель" },
    ],
    aliases: [
      "polio",
      "ipv",
      "opv",
      "bopv",
      "опв",
      "ипв",
      "бопв",
      "полио",
      "полиомиелит",
      "имовакс",
      "imovax",
      "poliorix",
      "полиорикс",
      "пентаксим",
      "pentaxim",
      "тетраксим",
      "tetraxim",
      "hexaxim",
      "гексаксим",
      "infanrix hexa",
    ],
    note: "IPV given with the 3rd dose (bOPV+IPV schedule).",
    noteRu: "ИПВ вводится с 3-й дозой (схема бОПВ+ИПВ).",
  },
  {
    id: "dtp",
    name: "DTP",
    nameRu: "АКДС",
    disease: "Diphtheria, Tetanus, Pertussis",
    diseaseRu: "Дифтерия, столбняк, коклюш",
    tier: "universal",
    doses: [
      { ageMonths: W6, ageLabel: "6 weeks", ageLabelRu: "6 недель" },
      { ageMonths: W10, ageLabel: "10 weeks", ageLabelRu: "10 недель" },
      { ageMonths: W14, ageLabel: "14 weeks", ageLabelRu: "14 недель" },
      {
        ageMonths: 18,
        ageLabel: "12–23 months",
        ageLabelRu: "12–23 месяца",
        label: "Booster 1",
        labelRu: "Бустер 1",
        booster: true,
      },
      {
        ageMonths: 60,
        ageLabel: "4–7 years",
        ageLabelRu: "4–7 лет",
        label: "Booster 2",
        labelRu: "Бустер 2",
        booster: true,
      },
      {
        ageMonths: 144,
        ageLabel: "9–15 years",
        ageLabelRu: "9–15 лет",
        label: "Booster 3",
        labelRu: "Бустер 3",
        booster: true,
      },
    ],
    recurring: {
      everyYears: 10,
      startAgeMonths: 216,
      label: "Td booster every 10 years",
      labelRu: "Бустер Td каждые 10 лет",
    },
    aliases: [
      "dtp",
      "dtap",
      "dtpa",
      "tdap",
      "td",
      "dt",
      "акдс",
      "адс",
      "адс-м",
      "адс-м",
      "пентаксим",
      "pentaxim",
      "инфанрикс",
      "infanrix",
      "tetraxim",
      "тетраксим",
      "hexaxim",
      "гексаксим",
      "адасель",
      "adacel",
      "boostrix",
      "бустрикс",
      "diphtheria",
      "tetanus",
      "pertussis",
      "дифтерия",
      "столбняк",
      "коклюш",
    ],
  },
  {
    id: "hib",
    name: "Hib",
    nameRu: "ХИБ-инфекция",
    disease: "Haemophilus influenzae type b",
    diseaseRu: "Гемофильная инфекция типа b",
    tier: "universal",
    doses: [
      { ageMonths: W6, ageLabel: "6 weeks", ageLabelRu: "6 недель" },
      { ageMonths: W10, ageLabel: "10 weeks", ageLabelRu: "10 недель" },
      { ageMonths: W14, ageLabel: "14 weeks", ageLabelRu: "14 недель" },
    ],
    aliases: [
      "hib",
      "haemophilus",
      "хиб",
      "гемофильн",
      "act-hib",
      "акт-хиб",
      "hiberix",
      "пентаксим",
      "pentaxim",
      "hexaxim",
      "гексаксим",
      "infanrix hexa",
    ],
  },
  {
    id: "pcv",
    name: "Pneumococcal",
    nameRu: "Пневмококковая",
    disease: "Pneumococcal disease",
    diseaseRu: "Пневмококковая инфекция",
    tier: "universal",
    doses: [
      { ageMonths: W6, ageLabel: "6 weeks", ageLabelRu: "6 недель" },
      { ageMonths: W10, ageLabel: "10 weeks", ageLabelRu: "10 недель" },
      { ageMonths: W14, ageLabel: "14 weeks", ageLabelRu: "14 недель" },
    ],
    aliases: [
      "pneumococc",
      "pcv",
      "pcv13",
      "pcv10",
      "пневмококк",
      "превенар",
      "prevenar",
      "synflorix",
      "синфлорикс",
      "пневмо",
    ],
  },
  {
    id: "rotavirus",
    name: "Rotavirus",
    nameRu: "Ротавирус",
    disease: "Rotavirus gastroenteritis",
    diseaseRu: "Ротавирусная инфекция",
    tier: "universal",
    doses: [
      { ageMonths: W6, ageLabel: "6 weeks", ageLabelRu: "6 недель" },
      { ageMonths: W10, ageLabel: "10 weeks", ageLabelRu: "10 недель" },
    ],
    aliases: [
      "rotavirus",
      "rota",
      "ротавирус",
      "рота",
      "rotarix",
      "ротарикс",
      "rotateq",
      "ротатек",
    ],
    note: "2 or 3 doses depending on product.",
    noteRu: "2 или 3 дозы в зависимости от препарата.",
  },
  {
    id: "measles",
    name: "Measles",
    nameRu: "Корь",
    disease: "Measles",
    diseaseRu: "Корь",
    tier: "universal",
    doses: [
      { ageMonths: 9, ageLabel: "9–12 months", ageLabelRu: "9–12 месяцев" },
      { ageMonths: 15, ageLabel: "15–18 months", ageLabelRu: "15–18 месяцев" },
    ],
    aliases: [
      "measles",
      "корь",
      "жкв",
      "mmr",
      "кпк",
      "приорикс",
      "priorix",
      "mmr ii",
      "mmrii",
      "rouvax",
      "вактривир",
    ],
  },
  {
    id: "rubella",
    name: "Rubella",
    nameRu: "Краснуха",
    disease: "Rubella",
    diseaseRu: "Краснуха",
    tier: "universal",
    doses: [{ ageMonths: 12, ageLabel: "9–12 months", ageLabelRu: "9–12 месяцев" }],
    aliases: ["rubella", "краснуха", "mmr", "кпк", "mr", "приорикс", "priorix", "вактривир"],
    note: "Given as a measles-containing combination (MR/MMR).",
    noteRu: "Вводится в комбинации с коревой вакциной (MR/MMR).",
  },
  {
    id: "hpv",
    name: "HPV",
    nameRu: "ВПЧ",
    disease: "Human papillomavirus",
    diseaseRu: "Вирус папилломы человека",
    tier: "universal",
    doses: [
      { ageMonths: 108, ageLabel: "from 9 years", ageLabelRu: "с 9 лет" },
      { ageMonths: 114, ageLabel: "+5–6 months", ageLabelRu: "+5–6 месяцев" },
    ],
    aliases: ["hpv", "впч", "папиллом", "gardasil", "гардасил", "cervarix", "церварикс"],
    catchUp: {
      fromAgeMonths: 180,
      doses: [
        { afterDays: 0, label: "Dose 1", labelRu: "Доза 1" },
        { afterDays: 60, label: "+2 months", labelRu: "+2 месяца" },
        { afterDays: 180, label: "+6 months", labelRu: "+6 месяцев" },
      ],
    },
    note: "Primarily girls 9–14 (2 doses); from 15 years 3 doses (0, 2, 6 months).",
    noteRu: "В первую очередь девочки 9–14 лет (2 дозы); с 15 лет 3 дозы (0, 2, 6 месяцев).",
  },

  // ── Special programmes (programmes with certain characteristics) ───────────
  {
    id: "mumps",
    name: "Mumps",
    nameRu: "Паротит",
    disease: "Mumps",
    diseaseRu: "Эпидемический паротит",
    tier: "special",
    doses: [
      { ageMonths: 12, ageLabel: "12–18 months", ageLabelRu: "12–18 месяцев" },
      { ageMonths: 18, ageLabel: "+4 weeks", ageLabelRu: "+4 недели" },
    ],
    aliases: [
      "mumps",
      "паротит",
      "свинка",
      "жпв",
      "mmr",
      "кпк",
      "приорикс",
      "priorix",
      "вактривир",
    ],
  },
  {
    id: "influenza",
    name: "Seasonal influenza",
    nameRu: "Грипп",
    disease: "Influenza",
    diseaseRu: "Грипп",
    tier: "special",
    doses: [],
    recurring: { everyYears: 1, startAgeMonths: 6, label: "Annually", labelRu: "Ежегодно" },
    aliases: [
      "influenza",
      "flu",
      "грипп",
      "ваксигрип",
      "vaxigrip",
      "инфлювак",
      "influvac",
      "совигрипп",
      "ультрикс",
      "fluarix",
    ],
  },
  {
    id: "varicella",
    name: "Varicella",
    nameRu: "Ветряная оспа",
    disease: "Chickenpox",
    diseaseRu: "Ветряная оспа",
    tier: "special",
    doses: [
      { ageMonths: 12, ageLabel: "12–18 months", ageLabelRu: "12–18 месяцев" },
      { ageMonths: 18, ageLabel: "+4 weeks – 3 months", ageLabelRu: "+4 недели – 3 месяца" },
    ],
    aliases: ["varicella", "chickenpox", "ветрян", "varilrix", "варилрикс", "варивакс", "varivax"],
    note: "1–2 doses depending on manufacturer.",
    noteRu: "1–2 дозы в зависимости от производителя.",
  },

  // ── Regional ───────────────────────────────────────────────────────────────
  {
    id: "je",
    name: "Japanese encephalitis",
    nameRu: "Японский энцефалит",
    disease: "Japanese encephalitis",
    diseaseRu: "Японский энцефалит",
    tier: "regional",
    doses: [{ ageMonths: 8, ageLabel: "6–9 months", ageLabelRu: "6–9 месяцев" }],
    aliases: ["japanese encephalitis", "японск", "je-vac", "ixiaro", "иксиаро"],
    note: "Endemic parts of Asia; dose count depends on vaccine type.",
    noteRu: "Эндемичные регионы Азии; число доз зависит от типа вакцины.",
  },
  {
    id: "yellow-fever",
    name: "Yellow fever",
    nameRu: "Жёлтая лихорадка",
    disease: "Yellow fever",
    diseaseRu: "Жёлтая лихорадка",
    tier: "regional",
    doses: [{ ageMonths: 9, ageLabel: "9–12 months", ageLabelRu: "9–12 месяцев" }],
    aliases: ["yellow fever", "жёлтая лихорадка", "желтая лихорадка", "stamaril", "стамарил"],
    note: "Single lifelong dose; endemic Africa & South America.",
    noteRu: "Одна доза пожизненно; эндемичные Африка и Южная Америка.",
  },
  {
    id: "tbe",
    name: "Tick-borne encephalitis",
    nameRu: "Клещевой энцефалит",
    disease: "Tick-borne encephalitis",
    diseaseRu: "Клещевой энцефалит",
    tier: "regional",
    doses: [
      { ageMonths: 12, ageLabel: "from 1 year", ageLabelRu: "с 1 года" },
      { ageMonths: 13, ageLabel: "+1–3 months", ageLabelRu: "+1–3 месяца" },
      { ageMonths: 18, ageLabel: "+9–12 months", ageLabelRu: "+9–12 месяцев" },
    ],
    recurring: {
      everyYears: 3,
      startAgeMonths: 54,
      label: "Booster every 3 years",
      labelRu: "Бустер каждые 3 года",
    },
    aliases: ["tick-borne", "клещ", "клещевой", "fsme", "encepur", "энцепур", "клещ-э-вак", "tbe"],
  },

  // ── Risk groups / travel ────────────────────────────────────────────────────
  {
    id: "typhoid",
    name: "Typhoid",
    nameRu: "Брюшной тиф",
    disease: "Typhoid fever",
    diseaseRu: "Брюшной тиф",
    tier: "risk",
    doses: [{ ageMonths: 6, ageLabel: "from 6 months (TCV)", ageLabelRu: "с 6 месяцев (TCV)" }],
    recurring: {
      everyYears: 3,
      startAgeMonths: 42,
      label: "Booster every 3 years (Vi PS)",
      labelRu: "Бустер каждые 3 года (Vi PS)",
    },
    aliases: ["typhoid", "брюшной тиф", "тиф", "typbar", "vi ps", "тифим", "typhim"],
  },
  {
    id: "cholera",
    name: "Cholera",
    nameRu: "Холера",
    disease: "Cholera",
    diseaseRu: "Холера",
    tier: "risk",
    doses: [
      { ageMonths: 12, ageLabel: "from 1–2 years", ageLabelRu: "с 1–2 лет" },
      { ageMonths: 12.5, ageLabel: "+1–6 weeks", ageLabelRu: "+1–6 недель" },
    ],
    recurring: {
      everyYears: 2,
      startAgeMonths: 36,
      label: "Booster every 2 years",
      labelRu: "Бустер каждые 2 года",
    },
    aliases: ["cholera", "холер", "dukoral", "дукорал", "shanchol", "euvichol", "эввичол"],
  },
  {
    id: "meningococcal",
    name: "Meningococcal",
    nameRu: "Менингококковая",
    disease: "Meningococcal disease",
    diseaseRu: "Менингококковая инфекция",
    tier: "risk",
    doses: [
      {
        ageMonths: 12,
        ageLabel: "9–18 months (conjugate)",
        ageLabelRu: "9–18 месяцев (конъюгированная)",
      },
    ],
    aliases: [
      "mening",
      "менинг",
      "menactra",
      "менактра",
      "nimenrix",
      "менвео",
      "menveo",
      "менцевакс",
    ],
    note: "Schedule depends on vaccine (Men A/C/ACWY).",
    noteRu: "Схема зависит от вакцины (Men A/C/ACWY).",
  },
  {
    id: "hepa",
    name: "Hepatitis A",
    nameRu: "Гепатит A",
    disease: "Hepatitis A",
    diseaseRu: "Гепатит A",
    tier: "risk",
    doses: [{ ageMonths: 12, ageLabel: "from 1 year", ageLabelRu: "с 1 года" }],
    aliases: [
      "hepatitis a",
      "hep a",
      "гепатит a",
      "гепатит а",
      "havrix",
      "хаврикс",
      "twinrix",
      "твинрикс",
      "avaxim",
      "аваксим",
      "альгавак",
    ],
    note: "At least 1 dose; 2-dose schedules common.",
    noteRu: "Минимум 1 доза; часто 2-дозовая схема.",
  },
  {
    id: "rabies",
    name: "Rabies",
    nameRu: "Бешенство",
    disease: "Rabies",
    diseaseRu: "Бешенство",
    tier: "risk",
    doses: [
      {
        ageMonths: null,
        ageLabel: "as needed (pre-exposure)",
        ageLabelRu: "по показаниям (доэкспозиционно)",
      },
      { ageMonths: null, ageLabel: "+7 days", ageLabelRu: "+7 дней" },
    ],
    catchUp: {
      doses: [
        { afterDays: 0, label: "Day 0", labelRu: "День 0" },
        { afterDays: 7, label: "Day 7", labelRu: "День 7" },
      ],
    },
    aliases: ["rabies", "бешенств", "rabipur", "кокав", "verorab", "верораб", "rabivac"],
  },
  {
    id: "dengue",
    name: "Dengue",
    nameRu: "Денге",
    disease: "Dengue",
    diseaseRu: "Лихорадка денге",
    tier: "risk",
    doses: [
      { ageMonths: 108, ageLabel: "from 9 years", ageLabelRu: "с 9 лет" },
      { ageMonths: 114, ageLabel: "+6 months", ageLabelRu: "+6 месяцев" },
      { ageMonths: 120, ageLabel: "+12 months", ageLabelRu: "+12 месяцев" },
    ],
    aliases: ["dengue", "денге", "dengvaxia", "денгваксия", "qdenga"],
    note: "Seropositive individuals in endemic areas.",
    noteRu: "Для серопозитивных в эндемичных регионах.",
  },
];

// ── Status computation ───────────────────────────────────────────────────────

/**
 * Dose lifecycle status.
 *  - `done`       — a matching recorded shot exists.
 *  - `due`        — recommended right now (within the grace window) and actionable.
 *  - `overdue`    — a genuinely actionable item lapsed: a recurring adult booster
 *                   (Td, flu, TBE…) whose `nextDate` is in the past.
 *  - `upcoming`   — recommended in the future.
 *  - `contextual` — informational only (travel/risk antigens, no birthDate).
 *  - `not_recorded` — a childhood primary-series dose whose recommended age is far
 *                   in the past and was never logged. Neutral, NOT actionable: for
 *                   an adult these were almost certainly given but never entered, so
 *                   flagging them red ("overdue") would be false alarm. Render grey.
 */
export type DoseStatus = "done" | "due" | "overdue" | "upcoming" | "contextual" | "not_recorded";

export type DoseView = ScheduleDose & {
  status: DoseStatus;
  /** ISO date of the matched record, when done. */
  doneDate?: string;
  /** ISO date this dose is/was recommended, when birthDate is known. */
  dueDate?: string;
};

export type RecurringView = {
  label: string;
  labelRu: string;
  everyYears: number;
  /** Date of the most recent matching shot — the anchor of the booster clock. */
  lastDate?: string;
  /** When the next booster is (or, if lapsed, was) due. */
  nextDate?: string;
  status: DoseStatus;
};

export type AntigenView = {
  entry: ScheduleEntry;
  doses: DoseView[];
  recurring?: RecurringView;
  overall: DoseStatus;
};

/** A recorded vaccine, minimally typed for matching. */
export type VaccineRecordLike = {
  vaccineName: string;
  manufacturer?: string | null;
  date: string;
};

function monthsBetween(fromISO: string, toISO: string): number {
  // Anchor in UTC so the comparison matches addMonthsISO's UTC arithmetic and
  // never drifts a day across timezone offsets.
  const f = new Date(fromISO + "T00:00:00Z");
  const t = new Date(toISO + "T00:00:00Z");
  let m = (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth());
  if (t.getUTCDate() < f.getUTCDate()) m -= 1;
  return m;
}

function addMonthsISO(fromISO: string, months: number): string {
  // Build and serialize in UTC: a local-time Date fed to toISOString() shifts
  // the calendar day for users west of UTC, making every suggested expiry/due
  // date land one day early.
  const d = new Date(fromISO + "T00:00:00Z");
  // Integer months map to calendar months; the fractional part (the 6/10/14-week
  // infant doses are stored as 1.5/2.5/3.5 months) is added as days. Rounding the
  // whole thing collapsed those distinct doses onto the same/wrong month.
  const whole = Math.trunc(months);
  const fracDays = Math.round((months - whole) * 30.4375);
  d.setUTCMonth(d.getUTCMonth() + whole);
  if (fracDays) d.setUTCDate(d.getUTCDate() + fracDays);
  return d.toISOString().slice(0, 10);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Whole-word alias match. A short alias (td, mr, hib, тиф) must equal a word —
 * a substring test made "Ltd" a tetanus shot and "mRNA" a rubella one. A longer
 * final word may be a stem ("пневмококк", "mening") and matches a word prefix.
 */
function aliasMatches(alias: string, tokens: string[]): boolean {
  const parts = tokenize(alias);
  for (let i = 0; i + parts.length <= tokens.length; i++) {
    const hit = parts.every((part, k) => {
      const token = tokens[i + k];
      return k === parts.length - 1 && part.length >= 4 ? token.startsWith(part) : token === part;
    });
    if (hit) return true;
  }
  return false;
}

/** Does this recorded shot belong to the antigen? Abbreviations count only in the name. */
export function recordMatches(entry: ScheduleEntry, record: VaccineRecordLike): boolean {
  const name = tokenize(record.vaccineName);
  const maker = tokenize(record.manufacturer ?? "");
  return entry.aliases.some(
    (a) => aliasMatches(a, name) || (a.length >= 4 && aliasMatches(a, maker)),
  );
}

function addDaysISO(fromISO: string, days: number): string {
  const d = new Date(fromISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A started series' dose this many days past its date turns from due to overdue. */
const SERIES_OVERDUE_GRACE_DAYS = 30;

/** Records whose name/manufacturer matches this antigen, sorted by date asc. */
export function matchRecords<R extends VaccineRecordLike>(entry: ScheduleEntry, records: R[]): R[] {
  return records
    .filter((r) => recordMatches(entry, r))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const OVERDUE_GRACE_MONTHS = 1;

/**
 * Age (months) past which an unrecorded primary-series dose is treated as
 * `not_recorded` rather than `due`/`overdue`. Doses recommended in childhood
 * (BCG at birth, the 6/10/14-week series, MMR, etc.) sit well below this, so for
 * any adult they collapse to a neutral "not recorded" instead of a red overdue —
 * they were almost certainly given, just never entered. 18 years = legal adult.
 */
const ADULT_AGE_MONTHS = 216;

/**
 * Personalizes one antigen against the profile birthDate and recorded shots.
 *
 * Done doses are matched in date order. For remaining doses the status is
 * deliberately conservative so the calendar never invents false anxiety:
 *  - A childhood primary-series dose long in the past (recommended below the
 *    adult cutoff, person already an adult) and unrecorded ⇒ `not_recorded`,
 *    never `overdue`.
 *  - A dose recommended around now ⇒ `due`; in the future ⇒ `upcoming`.
 *  - Genuine actionable lapses live on `recurring` (adult boosters past their
 *    `nextDate`), which is the only source of an `overdue` status here.
 *
 * `birthDate` null ⇒ informational (no due/overdue/not_recorded grading).
 */
export function computeAntigen(
  entry: ScheduleEntry,
  birthDate: string | null,
  records: VaccineRecordLike[],
  todayISO: string,
  /** When false (regional/travel antigens) age-based doses are never graded; they stay contextual. */
  gradeOverdue = true,
): AntigenView {
  const matched = matchRecords(entry, records);
  const ageNow = birthDate ? monthsBetween(birthDate, todayISO) : null;
  const isAdult = ageNow != null && ageNow >= ADULT_AGE_MONTHS;

  const first = matched[0];
  const ageAtFirst = birthDate && first ? monthsBetween(birthDate, first.date) : null;
  const catchUp =
    entry.catchUp &&
    first &&
    (entry.catchUp.fromAgeMonths == null ||
      (ageAtFirst != null && ageAtFirst >= entry.catchUp.fromAgeMonths))
      ? entry.catchUp
      : null;

  // A course started late is timed from its first dose and graded even for
  // travel/risk antigens: once begun, finishing it is genuinely actionable.
  const doses: DoseView[] = catchUp
    ? catchUp.doses.map((d, i): DoseView => {
        const base = { ageMonths: null, ageLabel: d.label, ageLabelRu: d.labelRu };
        const done = matched[i];
        if (done) return { ...base, status: "done", doneDate: done.date };
        const dueDate = addDaysISO(first!.date, d.afterDays);
        const status: DoseStatus =
          dueDate > todayISO
            ? "upcoming"
            : addDaysISO(dueDate, SERIES_OVERDUE_GRACE_DAYS) < todayISO
              ? "overdue"
              : "due";
        return { ...base, status, dueDate };
      })
    : entry.doses.map((dose, i) => {
        const done = matched[i];
        if (done) {
          return { ...dose, status: "done", doneDate: done.date };
        }
        const dueDate =
          birthDate && dose.ageMonths != null ? addMonthsISO(birthDate, dose.ageMonths) : undefined;
        let status: DoseStatus;
        if (dose.ageMonths == null) status = "contextual";
        else if (!gradeOverdue) status = "contextual";
        else if (ageNow == null) status = "upcoming";
        else if (isAdult && dose.ageMonths < ADULT_AGE_MONTHS) {
          // Childhood dose, long past, never logged — neutral, not actionable.
          status = "not_recorded";
        } else if (ageNow >= dose.ageMonths + OVERDUE_GRACE_MONTHS) {
          // A genuinely missed dose around the person's current age (e.g. a teen
          // booster that just lapsed) — surface it, but only inside childhood range.
          status = "overdue";
        } else if (ageNow >= dose.ageMonths - OVERDUE_GRACE_MONTHS) status = "due";
        else status = "upcoming";
        return { ...dose, status, dueDate };
      });

  let recurring: RecurringView | undefined;
  if (entry.recurring) {
    recurring = computeRecurring(entry.recurring, birthDate, matched, todayISO, gradeOverdue);
  }

  const statuses = doses.map((d) => d.status);
  const recurringOverdue = recurring?.status === "overdue";
  const recurringIsDue = recurring?.status === "due";
  const hasDone = statuses.includes("done");
  let overall: DoseStatus;
  // Only recurring adult boosters past due are actionable "overdue".
  if (recurringOverdue) overall = "overdue";
  else if (statuses.includes("overdue")) overall = "overdue";
  else if (statuses.includes("due") || recurringIsDue) overall = "due";
  else if (statuses.length === 0) overall = recurring ? recurring.status : "contextual";
  else if (statuses.every((s) => s === "done")) overall = "done";
  else if (hasDone && statuses.every((s) => s === "done" || s === "contextual")) overall = "done";
  else if (statuses.every((s) => s === "contextual")) overall = "contextual";
  else if (statuses.some((s) => s === "not_recorded")) overall = "not_recorded";
  else overall = "upcoming";

  return { entry, doses, recurring, overall };
}

/**
 * The booster clock runs from the most recent matching shot, never from the
 * birth date: a Td given last month makes the next one due in ten years, no
 * matter which birthday cycle that falls in.
 *  - Shots recorded ⇒ next = last shot + interval (not before the cycle starts).
 *    Past ⇒ `overdue`; for an annual (seasonal) shot ⇒ `due` — a missed flu
 *    season is "get this year's", not an alarm about a decade-old record.
 *  - Nothing recorded ⇒ the birth-date cycle gives an informational next date;
 *    an unrecorded lifelong cycle is a data gap, so it is never `overdue`.
 *  - Ungraded tiers or no birth date ⇒ `contextual`, still with the next date
 *    when a shot anchors it.
 */
function computeRecurring(
  r: RecurringBooster,
  birthDate: string | null,
  matched: VaccineRecordLike[],
  todayISO: string,
  gradeOverdue: boolean,
): RecurringView {
  const base = { label: r.label, labelRu: r.labelRu, everyYears: r.everyYears };
  const last = matched[matched.length - 1];
  const cycleStart = birthDate ? addMonthsISO(birthDate, r.startAgeMonths) : undefined;

  if (last) {
    let nextDate = addMonthsISO(last.date, r.everyYears * 12);
    if (cycleStart && nextDate < cycleStart) nextDate = cycleStart;
    let status: DoseStatus = "contextual";
    if (gradeOverdue && birthDate) {
      if (nextDate > todayISO) status = "upcoming";
      else status = r.everyYears === 1 ? "due" : "overdue";
    }
    return { ...base, lastDate: last.date, nextDate, status };
  }

  if (!birthDate || !gradeOverdue) return { ...base, status: "contextual" };
  let ageM = r.startAgeMonths;
  while (addMonthsISO(birthDate, ageM) <= todayISO) ageM += r.everyYears * 12;
  return { ...base, nextDate: addMonthsISO(birthDate, ageM), status: "upcoming" };
}

export const TIER_ORDER: VaccineTier[] = ["universal", "special", "regional", "risk"];

/** Tiers whose age-based doses are graded (due/overdue/not_recorded). Travel/risk
 * antigens (regional/risk) stay purely informational. */
export function isGradedTier(tier: VaccineTier): boolean {
  return tier === "universal" || tier === "special";
}

/** Antigen ids a recorded shot covers (a combination shot covers several). */
export function antigenIdsOf(record: VaccineRecordLike): string[] {
  return VACCINE_SCHEDULE.filter((e) => recordMatches(e, record)).map((e) => e.id);
}

/**
 * A shot is superseded when a later shot covers everything it covered: the old
 * certificate's validity no longer describes the person's protection. Shots
 * matching no calendar antigen fall back to comparing their names.
 */
export function isSuperseded<R extends VaccineRecordLike>(record: R, records: R[]): boolean {
  const ids = antigenIdsOf(record);
  const name = record.vaccineName.trim().toLowerCase();
  return records.some((other) => {
    if (other === record || other.date <= record.date) return false;
    if (ids.length === 0) return other.vaccineName.trim().toLowerCase() === name;
    const covered = new Set(antigenIdsOf(other));
    return ids.every((id) => covered.has(id));
  });
}

/**
 * Certificates whose validity has lapsed and that no later shot has renewed —
 * the only expired records that call for action. A lapse already reported as
 * an overdue booster of the same antigen is left out so it is not counted twice.
 */
export function lapsedRecords<R extends VaccineRecordLike & { expiresAt?: string | null }>(
  records: R[],
  todayISO: string,
  views: AntigenView[] = [],
): R[] {
  // An antigen already nagging through its booster (or an overdue dose) carries
  // the lapse; its certificate would only repeat it.
  const overdue = new Set(
    views
      .filter(
        (v) =>
          v.overall === "overdue" ||
          v.recurring?.status === "overdue" ||
          v.recurring?.status === "due",
      )
      .map((v) => v.entry.id),
  );
  return records.filter(
    (r) =>
      r.expiresAt != null &&
      r.expiresAt < todayISO &&
      !isSuperseded(r, records) &&
      !antigenIdsOf(r).some((id) => overdue.has(id)),
  );
}

// ── Reminders ────────────────────────────────────────────────────────────────

type CertRecord = VaccineRecordLike & { id?: number; expiresAt?: string | null };

/**
 * One thing the app would nudge about: a booster or dose that is due/overdue, or
 * a lapsed certificate nobody renewed. Every surface — the Vaccines page, the
 * dashboard, the bell and the assistant — derives its list from
 * {@link vaccineReminders}, so they can never disagree.
 */
export type VaccineReminder = {
  /**
   * Stable identity for hiding. It embeds what the reminder is about (the due
   * date, the certificate), so recording a new dose produces a new key and a
   * later lapse surfaces again instead of staying silently hidden forever.
   */
  key: string;
  kind: "booster" | "dose" | "certificate";
  /** `overdue` is the actionable alarm; `due` is a quieter "around now". */
  status: "overdue" | "due";
  antigenId: string | null;
  /** Antigen (or, for an unmatched certificate, the recorded) name. */
  name: string;
  nameRu: string;
  /** What is due: the booster cadence or the dose's age — absent for certificates. */
  label?: string;
  labelRu?: string;
  /** Booster/dose: when it became due. Certificate: the expiry date. */
  date: string | null;
  /** Most recent matching shot, when one exists. */
  lastDate: string | null;
  /** The certificate's record, for `certificate` reminders. */
  record?: CertRecord;
  hidden: boolean;
};

export function certificateReminderKey(r: CertRecord): string {
  return r.id != null ? `cert:${r.id}` : `cert:${r.vaccineName}|${r.date}`;
}

/**
 * All current reminders, overdue first. `hiddenKeys` are the ones the user chose
 * to hide; they are still returned (flagged `hidden`) so a screen can offer to
 * bring them back, but {@link activeReminders} drops them.
 */
export function vaccineReminders<R extends CertRecord>(
  views: AntigenView[],
  records: R[],
  todayISO: string,
  hiddenKeys: Iterable<string> = [],
): VaccineReminder[] {
  const hidden = new Set(hiddenKeys);
  const out: VaccineReminder[] = [];
  for (const v of views) {
    const base = { antigenId: v.entry.id, name: v.entry.name, nameRu: v.entry.nameRu };
    const r = v.recurring;
    if (r && (r.status === "overdue" || r.status === "due")) {
      const key = `booster:${v.entry.id}:${r.nextDate ?? ""}`;
      out.push({
        ...base,
        key,
        kind: "booster",
        status: r.status,
        label: r.label,
        labelRu: r.labelRu,
        date: r.nextDate ?? null,
        lastDate: r.lastDate ?? null,
        hidden: hidden.has(key),
      });
    }
    v.doses.forEach((d, i) => {
      if (d.status !== "overdue" && d.status !== "due") return;
      const key = `dose:${v.entry.id}:${i}`;
      out.push({
        ...base,
        key,
        kind: "dose",
        status: d.status,
        label: d.ageLabel,
        labelRu: d.ageLabelRu,
        date: d.dueDate ?? null,
        lastDate: null,
        hidden: hidden.has(key),
      });
    });
  }
  for (const rec of lapsedRecords(records, todayISO, views)) {
    const antigen = VACCINE_SCHEDULE.find((e) => recordMatches(e, rec));
    const key = certificateReminderKey(rec);
    out.push({
      key,
      kind: "certificate",
      status: "overdue",
      antigenId: antigen?.id ?? null,
      name: rec.vaccineName,
      nameRu: rec.vaccineName,
      date: rec.expiresAt ?? null,
      lastDate: rec.date,
      record: rec,
      hidden: hidden.has(key),
    });
  }
  return out.sort((a, b) => (a.status === b.status ? 0 : a.status === "overdue" ? -1 : 1));
}

export function activeReminders(reminders: VaccineReminder[]): VaccineReminder[] {
  return reminders.filter((r) => !r.hidden);
}

/**
 * The actionable headline count — what the big "overdue" badge reflects: only
 * overdue boosters/doses and lapsed, unrenewed certificates the user hasn't
 * hidden. Unrecorded childhood doses and contextual antigens never count.
 */
export function countActionable(
  views: AntigenView[],
  records: CertRecord[],
  todayISO: string,
  hiddenKeys: Iterable<string> = [],
): number {
  return activeReminders(vaccineReminders(views, records, todayISO, hiddenKeys)).filter(
    (r) => r.status === "overdue",
  ).length;
}

/** Schedule entries with a known fixed certificate validity (years). */
const LIFETIME_IDS = new Set(["yellow-fever"]); // WHO 2016: single dose, lifelong validity

export type ExpirySuggestion = { lifetime: boolean; expiresAt: string | null };

/**
 * Suggests a certificate-validity expiry for a recorded shot, derived from the
 * WHO schedule — never guessed. Returns null when the vaccine has no
 * well-established fixed validity (the user enters expiry manually).
 *  - Yellow fever → lifetime (no expiry).
 *  - Antigens with a recurring booster (e.g. Td every 10y) → dose date + interval.
 */
export function suggestVaccineExpiry(
  vaccineName: string,
  manufacturer: string | null | undefined,
  doseDateISO: string,
): ExpirySuggestion | null {
  if (!vaccineName.trim() || !doseDateISO) return null;
  const rec: VaccineRecordLike = { vaccineName, manufacturer, date: doseDateISO };
  const entry = VACCINE_SCHEDULE.find((e) => recordMatches(e, rec));
  if (!entry) return null;
  if (LIFETIME_IDS.has(entry.id)) return { lifetime: true, expiresAt: null };
  // An annual shot (flu) is a seasonal habit, not a certificate with a validity.
  if (entry.recurring && entry.recurring.everyYears > 1) {
    return {
      lifetime: false,
      expiresAt: addMonthsISO(doseDateISO, entry.recurring.everyYears * 12),
    };
  }
  return null;
}
