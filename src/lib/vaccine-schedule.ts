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

export type ScheduleEntry = {
  id: string;
  name: string;
  nameRu: string;
  disease: string;
  diseaseRu: string;
  tier: VaccineTier;
  doses: ScheduleDose[];
  recurring?: RecurringBooster;
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
    ],
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
    note: "Primarily girls 9–14 (2 doses).",
    noteRu: "В первую очередь девочки 9–14 лет (2 дозы).",
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
    aliases: ["mumps", "паротит", "свинка", "mmr", "кпк", "приорикс", "priorix", "вактривир"],
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
    aliases: [
      "tick-borne",
      "клещ",
      "клещевой",
      "энцефалит",
      "fsme",
      "encepur",
      "энцепур",
      "клещ-э-вак",
      "tbe",
    ],
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

export type DoseStatus = "done" | "due" | "overdue" | "upcoming" | "contextual";

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
  const whole = Math.round(months);
  d.setUTCMonth(d.getUTCMonth() + whole);
  return d.toISOString().slice(0, 10);
}

/** Records whose name/manufacturer matches this antigen, sorted by date asc. */
export function matchRecords(
  entry: ScheduleEntry,
  records: VaccineRecordLike[],
): VaccineRecordLike[] {
  return records
    .filter((r) => {
      const hay = `${r.vaccineName} ${r.manufacturer ?? ""}`.toLowerCase();
      return entry.aliases.some((a) => hay.includes(a));
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

const OVERDUE_GRACE_MONTHS = 1;

/**
 * Personalizes one antigen against the profile birthDate and recorded shots.
 * Done doses are matched in date order; remaining doses are due/overdue/upcoming
 * from the recommended age. `birthDate` null ⇒ informational (no due/overdue).
 */
export function computeAntigen(
  entry: ScheduleEntry,
  birthDate: string | null,
  records: VaccineRecordLike[],
  todayISO: string,
  /** When false (regional/travel antigens) age-based doses are never flagged overdue/due. */
  gradeOverdue = true,
): AntigenView {
  const matched = matchRecords(entry, records);
  const ageNow = birthDate ? monthsBetween(birthDate, todayISO) : null;

  const doses: DoseView[] = entry.doses.map((dose, i) => {
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
    else if (ageNow >= dose.ageMonths + OVERDUE_GRACE_MONTHS) status = "overdue";
    else if (ageNow >= dose.ageMonths - OVERDUE_GRACE_MONTHS) status = "due";
    else status = "upcoming";
    return { ...dose, status, dueDate };
  });

  let recurring: RecurringView | undefined;
  if (entry.recurring) {
    const r = entry.recurring;
    let nextDate: string | undefined;
    let status: DoseStatus = gradeOverdue ? "upcoming" : "contextual";
    if (birthDate) {
      let ageM = r.startAgeMonths;
      while (addMonthsISO(birthDate, ageM) <= todayISO) ageM += r.everyYears * 12;
      nextDate = addMonthsISO(birthDate, ageM);
    } else {
      status = "contextual";
    }
    recurring = { label: r.label, labelRu: r.labelRu, everyYears: r.everyYears, nextDate, status };
  }

  const statuses = doses.map((d) => d.status);
  const hasDone = statuses.includes("done");
  let overall: DoseStatus;
  if (statuses.includes("overdue")) overall = "overdue";
  else if (statuses.includes("due")) overall = "due";
  else if (statuses.length === 0) overall = recurring ? recurring.status : "contextual";
  else if (statuses.every((s) => s === "done")) overall = "done";
  else if (hasDone && statuses.every((s) => s === "done" || s === "contextual")) overall = "done";
  else if (statuses.every((s) => s === "contextual")) overall = "contextual";
  else overall = "upcoming";

  return { entry, doses, recurring, overall };
}

export const TIER_ORDER: VaccineTier[] = ["universal", "special", "regional", "risk"];

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
  const entry = VACCINE_SCHEDULE.find((e) => matchRecords(e, [rec]).length > 0);
  if (!entry) return null;
  if (LIFETIME_IDS.has(entry.id)) return { lifetime: true, expiresAt: null };
  if (entry.recurring) {
    return {
      lifetime: false,
      expiresAt: addMonthsISO(doseDateISO, entry.recurring.everyYears * 12),
    };
  }
  return null;
}
