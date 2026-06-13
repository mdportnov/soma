import type Database from "@tauri-apps/plugin-sql";

type SeedBiomarker = {
  code?: string;
  name: string;
  category: string;
  aliases: string[];
  unit: string;
  ref?: [number | null, number | null];
  optimal?: [number | null, number | null];
  direction?: "higher_better" | "lower_better" | "range";
};

/**
 * Seed reference dictionary (general adult ranges; labs and individual context
 * always take precedence). Aliases cover common synonyms, abbreviations and
 * Russian translations — they feed the deterministic import mapper, so the
 * richer this list, the fewer AI fallback calls the pipeline needs.
 */
const SEED: SeedBiomarker[] = [
  // ── Complete blood count ──
  {
    code: "718-7",
    name: "Hemoglobin",
    category: "Complete Blood Count",
    unit: "g/L",
    ref: [130, 170],
    aliases: ["hgb", "hb", "haemoglobin", "гемоглобин"],
  },
  {
    code: "4544-3",
    name: "Hematocrit",
    category: "Complete Blood Count",
    unit: "%",
    ref: [40, 50],
    aliases: ["hct", "haematocrit", "гематокрит"],
  },
  {
    code: "789-8",
    name: "Red Blood Cells",
    category: "Complete Blood Count",
    unit: "10^12/L",
    ref: [4.3, 5.7],
    aliases: ["rbc", "erythrocytes", "эритроциты", "red blood cell count"],
  },
  {
    code: "6690-2",
    name: "White Blood Cells",
    category: "Complete Blood Count",
    unit: "10^9/L",
    ref: [4, 9],
    aliases: ["wbc", "leukocytes", "лейкоциты", "white blood cell count"],
  },
  {
    code: "777-3",
    name: "Platelets",
    category: "Complete Blood Count",
    unit: "10^9/L",
    ref: [150, 400],
    aliases: ["plt", "thrombocytes", "тромбоциты", "platelet count"],
  },
  {
    code: "787-2",
    name: "MCV",
    category: "Complete Blood Count",
    unit: "fL",
    ref: [80, 100],
    aliases: ["mean corpuscular volume", "средний объем эритроцита"],
  },
  {
    code: "785-6",
    name: "MCH",
    category: "Complete Blood Count",
    unit: "pg",
    ref: [27, 34],
    aliases: ["mean corpuscular hemoglobin", "среднее содержание гемоглобина в эритроците"],
  },
  {
    code: "786-4",
    name: "MCHC",
    category: "Complete Blood Count",
    unit: "g/L",
    ref: [320, 360],
    aliases: [
      "mean corpuscular hemoglobin concentration",
      "средняя концентрация гемоглобина в эритроците",
    ],
  },
  {
    code: "788-0",
    name: "RDW",
    category: "Complete Blood Count",
    unit: "%",
    ref: [11.5, 14.5],
    aliases: ["red cell distribution width", "rdw-cv", "ширина распределения эритроцитов"],
  },
  {
    code: "770-8",
    name: "Neutrophils",
    category: "Complete Blood Count",
    unit: "%",
    ref: [40, 70],
    aliases: ["neut", "neutrophils %", "нейтрофилы", "сегментоядерные нейтрофилы"],
  },
  {
    code: "736-9",
    name: "Lymphocytes",
    category: "Complete Blood Count",
    unit: "%",
    ref: [20, 40],
    aliases: ["lymph", "lymphocytes %", "лимфоциты"],
  },
  {
    code: "5905-5",
    name: "Monocytes",
    category: "Complete Blood Count",
    unit: "%",
    ref: [2, 10],
    aliases: ["mono", "monocytes %", "моноциты"],
  },
  {
    code: "713-8",
    name: "Eosinophils",
    category: "Complete Blood Count",
    unit: "%",
    ref: [1, 5],
    aliases: ["eos", "eosinophils %", "эозинофилы"],
  },
  {
    code: "706-2",
    name: "Basophils",
    category: "Complete Blood Count",
    unit: "%",
    ref: [0, 1.5],
    aliases: ["baso", "basophils %", "базофилы"],
  },
  {
    code: "30341-2",
    name: "ESR",
    category: "Complete Blood Count",
    unit: "mm/h",
    ref: [0, 15],
    direction: "lower_better",
    aliases: ["erythrocyte sedimentation rate", "соэ", "скорость оседания эритроцитов", "sed rate"],
  },

  // ── Glucose metabolism ──
  {
    code: "1558-6",
    name: "Glucose (fasting)",
    category: "Glucose Metabolism",
    unit: "mmol/L",
    ref: [3.9, 5.6],
    optimal: [4.2, 5.0],
    aliases: [
      "glucose",
      "fasting glucose",
      "blood sugar",
      "глюкоза",
      "глюкоза натощак",
      "сахар крови",
    ],
  },
  {
    code: "4548-4",
    name: "HbA1c",
    category: "Glucose Metabolism",
    unit: "%",
    ref: [4, 5.7],
    optimal: [4.5, 5.3],
    direction: "lower_better",
    aliases: [
      "glycated hemoglobin",
      "hemoglobin a1c",
      "a1c",
      "гликированный гемоглобин",
      "гликогемоглобин",
    ],
  },
  {
    code: "20448-7",
    name: "Insulin (fasting)",
    category: "Glucose Metabolism",
    unit: "µIU/mL",
    ref: [2.6, 24.9],
    optimal: [2, 8],
    direction: "lower_better",
    aliases: ["insulin", "инсулин", "инсулин натощак"],
  },
  {
    code: "14933-6",
    name: "Uric Acid",
    category: "Glucose Metabolism",
    unit: "µmol/L",
    ref: [200, 420],
    optimal: [200, 360],
    aliases: ["urate", "мочевая кислота"],
  },
  {
    code: "1986-9",
    name: "C-Peptide",
    category: "Glucose Metabolism",
    unit: "ng/mL",
    ref: [1.1, 4.4],
    aliases: ["c-peptide", "с-пептид", "c-пептид", "связующий пептид"],
  },
  {
    name: "HOMA-IR",
    category: "Glucose Metabolism",
    unit: "index",
    ref: [0, 2.7],
    optimal: [0, 1.0],
    direction: "lower_better",
    aliases: ["homa-ir", "homa index", "индекс homa", "индекс инсулинорезистентности", "хома-ир"],
  },
  {
    code: "1755-8",
    name: "Fructosamine",
    category: "Glucose Metabolism",
    unit: "µmol/L",
    ref: [205, 285],
    direction: "lower_better",
    aliases: ["фруктозамин", "гликированный альбумин"],
  },
  {
    name: "Leptin",
    category: "Glucose Metabolism",
    unit: "ng/mL",
    ref: [1, 18],
    direction: "lower_better",
    aliases: ["лептин"],
  },
  {
    name: "Adiponectin",
    category: "Glucose Metabolism",
    unit: "µg/mL",
    ref: [4, 26],
    direction: "higher_better",
    aliases: ["адипонектин"],
  },

  // ── Lipid panel ──
  {
    code: "2093-3",
    name: "Total Cholesterol",
    category: "Lipid Panel",
    unit: "mmol/L",
    ref: [2.9, 5.2],
    aliases: [
      "cholesterol",
      "cholesterol total",
      "холестерин",
      "холестерин общий",
      "общий холестерин",
    ],
  },
  {
    code: "13457-7",
    name: "LDL Cholesterol",
    category: "Lipid Panel",
    unit: "mmol/L",
    ref: [1.4, 3.0],
    direction: "lower_better",
    aliases: ["ldl", "ldl-c", "лпнп", "холестерин лпнп", "low density lipoprotein"],
  },
  {
    code: "2085-9",
    name: "HDL Cholesterol",
    category: "Lipid Panel",
    unit: "mmol/L",
    ref: [1.0, 2.2],
    direction: "higher_better",
    aliases: ["hdl", "hdl-c", "лпвп", "холестерин лпвп", "high density lipoprotein"],
  },
  {
    code: "2571-8",
    name: "Triglycerides",
    category: "Lipid Panel",
    unit: "mmol/L",
    ref: [0.4, 1.7],
    optimal: [0.4, 1.0],
    direction: "lower_better",
    aliases: ["tg", "trig", "триглицериды"],
  },
  {
    code: "1884-6",
    name: "Apolipoprotein B",
    category: "Lipid Panel",
    unit: "g/L",
    ref: [0.6, 1.2],
    optimal: [0.4, 0.8],
    direction: "lower_better",
    aliases: ["apob", "apo b", "аполипопротеин b", "аполипопротеин в"],
  },
  {
    code: "10835-7",
    name: "Lipoprotein(a)",
    category: "Lipid Panel",
    unit: "nmol/L",
    ref: [0, 75],
    direction: "lower_better",
    aliases: ["lp(a)", "lpa", "липопротеин (а)", "липопротеин а"],
  },
  {
    code: "1869-7",
    name: "Apolipoprotein A1",
    category: "Lipid Panel",
    unit: "g/L",
    ref: [1.0, 2.0],
    optimal: [1.4, 2.0],
    direction: "higher_better",
    aliases: ["apoa1", "apo a1", "apo-a1", "аполипопротеин a1", "аполипопротеин а1"],
  },
  {
    name: "ApoB/ApoA1 Ratio",
    category: "Lipid Panel",
    unit: "ratio",
    ref: [0, 0.9],
    optimal: [0, 0.5],
    direction: "lower_better",
    aliases: [
      "apob/apoa1",
      "apob/apoa-1 ratio",
      "соотношение апоб/апоа1",
      "индекс атерогенности апо",
    ],
  },
  {
    code: "43396-1",
    name: "Non-HDL Cholesterol",
    category: "Lipid Panel",
    unit: "mmol/L",
    ref: [0, 3.8],
    optimal: [0, 2.6],
    direction: "lower_better",
    aliases: ["non-hdl", "non hdl cholesterol", "не-лпвп холестерин", "холестерин не-лпвп"],
  },
  {
    code: "13458-5",
    name: "VLDL Cholesterol",
    category: "Lipid Panel",
    unit: "mmol/L",
    ref: [0.1, 1.0],
    direction: "lower_better",
    aliases: ["vldl", "vldl-c", "лпонп", "холестерин лпонп", "very low density lipoprotein"],
  },
  {
    name: "Small Dense LDL",
    category: "Lipid Panel",
    unit: "mg/dL",
    ref: [0, 35],
    direction: "lower_better",
    aliases: ["sdldl", "sd-ldl", "small dense ldl-c", "малые плотные лпнп", "мелкие плотные лпнп"],
  },
  {
    name: "Oxidized LDL",
    category: "Lipid Panel",
    unit: "U/L",
    ref: [0, 60],
    direction: "lower_better",
    aliases: ["oxldl", "ox-ldl", "oxidised ldl", "окисленный лпнп", "окисленные лпнп"],
  },

  // ── Liver ──
  {
    code: "1742-6",
    name: "ALT",
    category: "Liver",
    unit: "U/L",
    ref: [7, 41],
    optimal: [10, 26],
    direction: "lower_better",
    aliases: ["alanine aminotransferase", "sgpt", "алт", "аланинаминотрансфераза"],
  },
  {
    code: "1920-8",
    name: "AST",
    category: "Liver",
    unit: "U/L",
    ref: [10, 40],
    optimal: [12, 26],
    direction: "lower_better",
    aliases: ["aspartate aminotransferase", "sgot", "аст", "аспартатаминотрансфераза"],
  },
  {
    code: "2324-2",
    name: "GGT",
    category: "Liver",
    unit: "U/L",
    ref: [8, 61],
    optimal: [8, 25],
    direction: "lower_better",
    aliases: ["gamma-glutamyl transferase", "ggtp", "ггт", "гамма-глутамилтрансфераза", "ггтп"],
  },
  {
    code: "6768-6",
    name: "Alkaline Phosphatase",
    category: "Liver",
    unit: "U/L",
    ref: [40, 130],
    aliases: ["alp", "alk phos", "щф", "щелочная фосфатаза"],
  },
  {
    code: "1975-2",
    name: "Bilirubin Total",
    category: "Liver",
    unit: "µmol/L",
    ref: [5, 21],
    aliases: ["total bilirubin", "билирубин общий", "общий билирубин"],
  },
  {
    code: "1968-7",
    name: "Bilirubin Direct",
    category: "Liver",
    unit: "µmol/L",
    ref: [0, 5],
    aliases: ["direct bilirubin", "conjugated bilirubin", "билирубин прямой", "прямой билирубин"],
  },
  {
    code: "1751-7",
    name: "Albumin",
    category: "Liver",
    unit: "g/L",
    ref: [35, 52],
    optimal: [42, 50],
    aliases: ["альбумин"],
  },
  {
    code: "2885-2",
    name: "Total Protein",
    category: "Liver",
    unit: "g/L",
    ref: [64, 83],
    aliases: ["protein total", "белок общий", "общий белок"],
  },
  {
    code: "1971-1",
    name: "Bilirubin Indirect",
    category: "Liver",
    unit: "µmol/L",
    ref: [0, 16],
    aliases: [
      "indirect bilirubin",
      "unconjugated bilirubin",
      "билирубин непрямой",
      "непрямой билирубин",
    ],
  },
  {
    code: "14804-9",
    name: "LDH",
    category: "Liver",
    unit: "U/L",
    ref: [125, 220],
    aliases: ["lactate dehydrogenase", "ldh", "лдг", "лактатдегидрогеназа"],
  },

  // ── Kidney ──
  {
    code: "2160-0",
    name: "Creatinine",
    category: "Kidney",
    unit: "µmol/L",
    ref: [62, 106],
    aliases: ["креатинин"],
  },
  {
    code: "3091-6",
    name: "Urea",
    category: "Kidney",
    unit: "mmol/L",
    ref: [2.8, 7.2],
    aliases: ["bun", "blood urea nitrogen", "мочевина"],
  },
  {
    code: "62238-1",
    name: "eGFR",
    category: "Kidney",
    unit: "mL/min/1.73m²",
    ref: [90, null],
    direction: "higher_better",
    aliases: ["gfr", "estimated gfr", "скф", "скорость клубочковой фильтрации", "расчетная скф"],
  },
  {
    code: "33863-2",
    name: "Cystatin C",
    category: "Kidney",
    unit: "mg/L",
    ref: [0.6, 1.1],
    direction: "lower_better",
    aliases: ["цистатин c", "цистатин с"],
  },

  // ── Electrolytes & minerals ──
  {
    code: "2951-2",
    name: "Sodium",
    category: "Electrolytes & Minerals",
    unit: "mmol/L",
    ref: [136, 145],
    aliases: ["na", "натрий"],
  },
  {
    code: "2823-3",
    name: "Potassium",
    category: "Electrolytes & Minerals",
    unit: "mmol/L",
    ref: [3.5, 5.1],
    aliases: ["k", "калий"],
  },
  {
    code: "17861-6",
    name: "Calcium",
    category: "Electrolytes & Minerals",
    unit: "mmol/L",
    ref: [2.15, 2.55],
    aliases: ["ca", "кальций", "кальций общий"],
  },
  {
    code: "19123-9",
    name: "Magnesium",
    category: "Electrolytes & Minerals",
    unit: "mmol/L",
    ref: [0.66, 1.07],
    optimal: [0.85, 1.05],
    aliases: ["mg", "магний"],
  },
  {
    code: "2777-1",
    name: "Phosphorus",
    category: "Electrolytes & Minerals",
    unit: "mmol/L",
    ref: [0.81, 1.45],
    aliases: ["phosphate", "фосфор", "фосфор неорганический"],
  },
  {
    code: "5763-8",
    name: "Zinc",
    category: "Electrolytes & Minerals",
    unit: "µmol/L",
    ref: [11, 18],
    aliases: ["zn", "цинк"],
  },
  {
    code: "2075-0",
    name: "Chloride",
    category: "Electrolytes & Minerals",
    unit: "mmol/L",
    ref: [98, 107],
    aliases: ["cl", "хлор", "хлориды"],
  },
  {
    code: "1963-8",
    name: "Bicarbonate",
    category: "Electrolytes & Minerals",
    unit: "mmol/L",
    ref: [22, 29],
    aliases: ["co2", "total co2", "bicarbonate", "бикарбонат", "углекислота"],
  },
  {
    code: "1995-0",
    name: "Calcium Ionized",
    category: "Electrolytes & Minerals",
    unit: "mmol/L",
    ref: [1.12, 1.32],
    aliases: ["ionized calcium", "ca++", "кальций ионизированный", "ионизированный кальций"],
  },
  {
    name: "Magnesium (RBC)",
    category: "Electrolytes & Minerals",
    unit: "mmol/L",
    ref: [1.65, 2.65],
    optimal: [2.0, 2.6],
    direction: "higher_better",
    aliases: ["rbc magnesium", "magnesium rbc", "магний в эритроцитах", "эритроцитарный магний"],
  },
  {
    code: "5631-7",
    name: "Copper",
    category: "Electrolytes & Minerals",
    unit: "µmol/L",
    ref: [11, 22],
    aliases: ["cu", "медь"],
  },
  {
    code: "5697-8",
    name: "Selenium",
    category: "Electrolytes & Minerals",
    unit: "µmol/L",
    ref: [0.9, 1.9],
    aliases: ["se", "селен"],
  },

  // ── Iron status ──
  {
    code: "2276-4",
    name: "Ferritin",
    category: "Iron Status",
    unit: "µg/L",
    ref: [30, 400],
    optimal: [50, 150],
    aliases: ["ферритин"],
  },
  {
    code: "2498-4",
    name: "Iron",
    category: "Iron Status",
    unit: "µmol/L",
    ref: [11, 31],
    aliases: ["serum iron", "fe", "железо", "железо сывороточное", "сывороточное железо"],
  },
  {
    code: "3034-6",
    name: "Transferrin",
    category: "Iron Status",
    unit: "g/L",
    ref: [2, 3.6],
    aliases: ["трансферрин"],
  },
  {
    code: "2502-3",
    name: "Transferrin Saturation",
    category: "Iron Status",
    unit: "%",
    ref: [20, 45],
    aliases: [
      "tsat",
      "iron saturation",
      "насыщение трансферрина",
      "коэффициент насыщения трансферрина железом",
    ],
  },
  {
    code: "2500-7",
    name: "TIBC",
    category: "Iron Status",
    unit: "µmol/L",
    ref: [45, 72],
    aliases: ["total iron binding capacity", "tibc", "ожсс", "общая железосвязывающая способность"],
  },

  // ── Inflammation ──
  {
    code: "30522-7",
    name: "hs-CRP",
    category: "Inflammation",
    unit: "mg/L",
    ref: [0, 5],
    optimal: [0, 1],
    direction: "lower_better",
    aliases: [
      "crp",
      "c-reactive protein",
      "срб",
      "с-реактивный белок",
      "c-реактивный белок",
      "срб ультрачувствительный",
    ],
  },
  {
    code: "13965-9",
    name: "Homocysteine",
    category: "Inflammation",
    unit: "µmol/L",
    ref: [5, 15],
    optimal: [5, 8],
    direction: "lower_better",
    aliases: ["hcy", "гомоцистеин"],
  },
  {
    code: "3255-7",
    name: "Fibrinogen",
    category: "Inflammation",
    unit: "g/L",
    ref: [2, 4],
    aliases: ["фибриноген"],
  },
  {
    code: "26881-3",
    name: "Interleukin-6",
    category: "Inflammation",
    unit: "pg/mL",
    ref: [0, 7],
    direction: "lower_better",
    aliases: ["il-6", "interleukin 6", "ил-6", "интерлейкин-6"],
  },
  {
    name: "Lp-PLA2",
    category: "Inflammation",
    unit: "ng/mL",
    ref: [0, 200],
    direction: "lower_better",
    aliases: [
      "lp-pla2",
      "lipoprotein-associated phospholipase a2",
      "pla2",
      "фосфолипаза а2",
      "лп-фла2",
    ],
  },

  // ── Thyroid ──
  {
    code: "3016-3",
    name: "TSH",
    category: "Thyroid",
    unit: "mIU/L",
    ref: [0.4, 4.0],
    optimal: [0.8, 2.5],
    aliases: ["thyroid stimulating hormone", "thyrotropin", "ттг", "тиреотропный гормон"],
  },
  {
    code: "3024-7",
    name: "Free T4",
    category: "Thyroid",
    unit: "pmol/L",
    ref: [12, 22],
    aliases: ["ft4", "free thyroxine", "т4 свободный", "свободный т4", "тироксин свободный"],
  },
  {
    code: "3051-0",
    name: "Free T3",
    category: "Thyroid",
    unit: "pmol/L",
    ref: [3.1, 6.8],
    aliases: [
      "ft3",
      "free triiodothyronine",
      "т3 свободный",
      "свободный т3",
      "трийодтиронин свободный",
    ],
  },
  {
    code: "8099-4",
    name: "Anti-TPO",
    category: "Thyroid",
    unit: "IU/mL",
    ref: [0, 34],
    direction: "lower_better",
    aliases: [
      "tpo antibodies",
      "thyroid peroxidase antibodies",
      "ат-тпо",
      "антитела к тиреопероксидазе",
    ],
  },
  {
    code: "8098-6",
    name: "Anti-TG",
    category: "Thyroid",
    unit: "IU/mL",
    ref: [0, 115],
    direction: "lower_better",
    aliases: ["tg antibodies", "thyroglobulin antibodies", "ат-тг", "антитела к тиреоглобулину"],
  },
  {
    code: "3026-2",
    name: "Total T4",
    category: "Thyroid",
    unit: "nmol/L",
    ref: [66, 181],
    aliases: ["t4 total", "total thyroxine", "т4 общий", "общий т4", "тироксин общий"],
  },
  {
    code: "3053-6",
    name: "Total T3",
    category: "Thyroid",
    unit: "nmol/L",
    ref: [1.3, 3.1],
    aliases: ["t3 total", "total triiodothyronine", "т3 общий", "общий т3", "трийодтиронин общий"],
  },
  {
    code: "30179-6",
    name: "Reverse T3",
    category: "Thyroid",
    unit: "ng/dL",
    ref: [9.2, 24.1],
    direction: "lower_better",
    aliases: ["rt3", "reverse t3", "reverse triiodothyronine", "реверсивный т3", "обратный т3"],
  },
  {
    code: "3013-0",
    name: "Thyroglobulin",
    category: "Thyroid",
    unit: "ng/mL",
    ref: [1.4, 78],
    aliases: ["tg", "thyroglobulin", "тиреоглобулин"],
  },

  // ── Hormones ──
  {
    code: "2986-8",
    name: "Testosterone Total",
    category: "Hormones",
    unit: "nmol/L",
    ref: [8.6, 29],
    optimal: [18, 29],
    aliases: [
      "testosterone",
      "total testosterone",
      "тестостерон",
      "тестостерон общий",
      "общий тестостерон",
    ],
  },
  {
    code: "2991-8",
    name: "Testosterone Free",
    category: "Hormones",
    unit: "pmol/L",
    ref: [170, 600],
    aliases: ["free testosterone", "тестостерон свободный", "свободный тестостерон"],
  },
  {
    code: "13967-5",
    name: "SHBG",
    category: "Hormones",
    unit: "nmol/L",
    ref: [17, 66],
    aliases: ["sex hormone binding globulin", "гспг", "глобулин связывающий половые гормоны"],
  },
  {
    code: "14715-7",
    name: "Estradiol",
    category: "Hormones",
    unit: "pmol/L",
    ref: [40, 160],
    aliases: ["e2", "эстрадиол"],
  },
  {
    code: "2143-6",
    name: "Cortisol (morning)",
    category: "Hormones",
    unit: "nmol/L",
    ref: [170, 540],
    aliases: ["cortisol", "кортизол", "кортизол утренний"],
  },
  {
    code: "2191-5",
    name: "DHEA-S",
    category: "Hormones",
    unit: "µmol/L",
    ref: [2.4, 11.6],
    aliases: [
      "dhea sulfate",
      "dhea-so4",
      "дгэа-с",
      "дгэа сульфат",
      "дегидроэпиандростерон-сульфат",
    ],
  },
  {
    code: "2842-3",
    name: "Prolactin",
    category: "Hormones",
    unit: "mIU/L",
    ref: [86, 324],
    aliases: ["пролактин"],
  },
  {
    code: "10501-5",
    name: "LH",
    category: "Hormones",
    unit: "IU/L",
    ref: [1.7, 8.6],
    aliases: ["luteinizing hormone", "лг", "лютеинизирующий гормон"],
  },
  {
    code: "15067-2",
    name: "FSH",
    category: "Hormones",
    unit: "IU/L",
    ref: [1.5, 12.4],
    aliases: ["follicle stimulating hormone", "фсг", "фолликулостимулирующий гормон"],
  },
  {
    code: "2484-4",
    name: "IGF-1",
    category: "Hormones",
    unit: "ng/mL",
    ref: [88, 246],
    aliases: [
      "insulin-like growth factor 1",
      "somatomedin c",
      "игф-1",
      "ифр-1",
      "инсулиноподобный фактор роста",
    ],
  },
  {
    code: "2857-1",
    name: "PSA Total",
    category: "Hormones",
    unit: "ng/mL",
    ref: [0, 4],
    direction: "lower_better",
    aliases: [
      "psa",
      "prostate specific antigen",
      "пса",
      "пса общий",
      "простатспецифический антиген",
    ],
  },
  {
    code: "10886-0",
    name: "PSA Free",
    category: "Hormones",
    unit: "ng/mL",
    ref: [0, 1],
    aliases: ["free psa", "free prostate specific antigen", "пса свободный", "свободный пса"],
  },
  {
    code: "2839-9",
    name: "Progesterone",
    category: "Hormones",
    unit: "nmol/L",
    ref: [0.7, 4.3],
    aliases: ["прогестерон"],
  },
  {
    code: "2731-8",
    name: "Parathyroid Hormone",
    category: "Hormones",
    unit: "pg/mL",
    ref: [15, 65],
    aliases: ["pth", "parathyroid hormone", "паратгормон", "паратиреоидный гормон"],
  },

  // ── Vitamins ──
  {
    code: "1989-3",
    name: "Vitamin D (25-OH)",
    category: "Vitamins",
    unit: "ng/mL",
    ref: [30, 100],
    optimal: [40, 60],
    aliases: [
      "vitamin d",
      "25-oh vitamin d",
      "25(oh)d",
      "calcidiol",
      "витамин d",
      "витамин д",
      "25-он витамин d",
      "витамин d (25-oh)",
    ],
  },
  {
    code: "2132-9",
    name: "Vitamin B12",
    category: "Vitamins",
    unit: "pg/mL",
    ref: [197, 771],
    optimal: [500, 900],
    aliases: ["b12", "cobalamin", "витамин b12", "витамин в12", "цианокобаламин", "кобаламин"],
  },
  {
    code: "2284-8",
    name: "Folate",
    category: "Vitamins",
    unit: "ng/mL",
    ref: [3.9, 26.8],
    optimal: [10, 25],
    aliases: ["folic acid", "vitamin b9", "фолиевая кислота", "фолаты", "витамин b9", "витамин в9"],
  },
  {
    name: "Active B12 (Holotranscobalamin)",
    category: "Vitamins",
    unit: "pmol/L",
    ref: [35, 150],
    optimal: [50, 150],
    direction: "higher_better",
    aliases: [
      "holotc",
      "active b12",
      "holotranscobalamin",
      "голотранскобаламин",
      "активный b12",
      "активный в12",
    ],
  },
  {
    code: "2923-1",
    name: "Vitamin A (Retinol)",
    category: "Vitamins",
    unit: "µmol/L",
    ref: [1.05, 2.27],
    aliases: ["retinol", "vitamin a", "витамин a", "витамин а", "ретинол"],
  },
  {
    code: "1823-4",
    name: "Vitamin E (Tocopherol)",
    category: "Vitamins",
    unit: "µmol/L",
    ref: [12, 42],
    aliases: ["tocopherol", "alpha-tocopherol", "vitamin e", "витамин e", "витамин е", "токоферол"],
  },
  {
    name: "Vitamin B6",
    category: "Vitamins",
    unit: "ng/mL",
    ref: [5, 50],
    aliases: [
      "pyridoxine",
      "plp",
      "pyridoxal-5-phosphate",
      "витамин b6",
      "витамин в6",
      "пиридоксин",
    ],
  },
  {
    code: "1992-7",
    name: "Vitamin C",
    category: "Vitamins",
    unit: "µmol/L",
    ref: [26, 85],
    aliases: ["ascorbic acid", "vitamin c", "витамин c", "витамин с", "аскорбиновая кислота"],
  },

  // ── Pancreas ──
  {
    code: "1798-8",
    name: "Amylase",
    category: "Pancreas",
    unit: "U/L",
    ref: [28, 100],
    aliases: ["alpha-amylase", "amylase total", "амилаза", "альфа-амилаза"],
  },
  {
    code: "3040-3",
    name: "Lipase",
    category: "Pancreas",
    unit: "U/L",
    ref: [13, 60],
    aliases: ["липаза"],
  },

  // ── Cardiac markers ──
  {
    code: "33762-6",
    name: "NT-proBNP",
    category: "Cardiac Markers",
    unit: "pg/mL",
    ref: [0, 125],
    direction: "lower_better",
    aliases: [
      "nt-probnp",
      "bnp",
      "b-type natriuretic peptide",
      "натрийуретический пептид",
      "мозговой натрийуретический пептид",
    ],
  },
  {
    code: "89579-7",
    name: "hs-Troponin I",
    category: "Cardiac Markers",
    unit: "ng/L",
    ref: [0, 26],
    direction: "lower_better",
    aliases: [
      "troponin",
      "hs-troponin",
      "high sensitivity troponin",
      "тропонин",
      "тропонин i",
      "высокочувствительный тропонин",
    ],
  },

  // ── Omega & fatty acids ──
  {
    name: "Omega-3 Index",
    category: "Omega & Fatty Acids",
    unit: "%",
    ref: [4, 12],
    optimal: [8, 12],
    direction: "higher_better",
    aliases: ["omega-3 index", "omega 3 index", "омега-3 индекс", "индекс омега-3"],
  },
  {
    name: "Omega-6/Omega-3 Ratio",
    category: "Omega & Fatty Acids",
    unit: "ratio",
    ref: [0, 4],
    optimal: [0, 3],
    direction: "lower_better",
    aliases: [
      "omega-6/omega-3 ratio",
      "omega 6 to omega 3 ratio",
      "соотношение омега-6/омега-3",
      "индекс омега-6/омега-3",
    ],
  },

  // ── Coagulation ──
  {
    code: "48065-7",
    name: "D-dimer",
    category: "Coagulation",
    unit: "µg/mL",
    ref: [0, 0.5],
    direction: "lower_better",
    aliases: ["d-dimer", "д-димер", "ддимер"],
  },
  {
    code: "34714-6",
    name: "INR",
    category: "Coagulation",
    unit: "ratio",
    ref: [0.8, 1.2],
    aliases: ["inr", "international normalized ratio", "prothrombin ratio", "мно"],
  },

  // ── Heavy metals ──
  {
    code: "5683-8",
    name: "Mercury",
    category: "Heavy Metals",
    unit: "µg/L",
    ref: [0, 5],
    direction: "lower_better",
    aliases: ["hg", "mercury", "ртуть"],
  },
  {
    code: "5671-3",
    name: "Lead",
    category: "Heavy Metals",
    unit: "µg/dL",
    ref: [0, 3.5],
    direction: "lower_better",
    aliases: ["pb", "lead", "свинец"],
  },
  {
    code: "5609-3",
    name: "Cadmium",
    category: "Heavy Metals",
    unit: "µg/L",
    ref: [0, 5],
    direction: "lower_better",
    aliases: ["cd", "cadmium", "кадмий"],
  },

  // ── Tumor markers ──
  {
    code: "2039-6",
    name: "CEA",
    category: "Tumor Markers",
    unit: "ng/mL",
    ref: [0, 5],
    direction: "lower_better",
    aliases: ["carcinoembryonic antigen", "cea", "рэа", "раково-эмбриональный антиген"],
  },
  {
    code: "1834-1",
    name: "AFP",
    category: "Tumor Markers",
    unit: "ng/mL",
    ref: [0, 9],
    direction: "lower_better",
    aliases: ["alpha-fetoprotein", "afp", "афп", "альфа-фетопротеин"],
  },
];

/**
 * Sex-specific adult reference ranges, in each biomarker's default unit.
 * Only well-established, clinically uncontroversial sex differences are seeded;
 * cycle-/assay-dependent markers (e.g. estradiol) are deliberately omitted so we
 * never assert a misleading range. `computeFlag` falls back to the biomarker's
 * generic range when no demographic row matches.
 */
const SEX_RANGES: { code: string; sex: "male" | "female"; ref: [number, number] }[] = [
  { code: "718-7", sex: "male", ref: [130, 170] }, // Hemoglobin g/L
  { code: "718-7", sex: "female", ref: [120, 150] },
  { code: "4544-3", sex: "male", ref: [40, 50] }, // Hematocrit %
  { code: "4544-3", sex: "female", ref: [36, 46] },
  { code: "789-8", sex: "male", ref: [4.3, 5.7] }, // RBC 10^12/L
  { code: "789-8", sex: "female", ref: [3.8, 5.1] },
  { code: "14933-6", sex: "male", ref: [200, 420] }, // Uric acid µmol/L
  { code: "14933-6", sex: "female", ref: [140, 360] },
  { code: "2160-0", sex: "male", ref: [62, 106] }, // Creatinine µmol/L
  { code: "2160-0", sex: "female", ref: [44, 80] },
  { code: "2276-4", sex: "male", ref: [30, 400] }, // Ferritin µg/L
  { code: "2276-4", sex: "female", ref: [15, 150] },
  { code: "2986-8", sex: "male", ref: [8.6, 29] }, // Testosterone total nmol/L
  { code: "2986-8", sex: "female", ref: [0.3, 1.7] },
];

export async function seedReferenceRangesIfEmpty(conn: Database): Promise<void> {
  const [{ n }] = await conn.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM biomarker_reference_range",
  );
  if (n > 0) return;
  await conn.execute("BEGIN");
  try {
    for (const r of SEX_RANGES) {
      const rows = await conn.select<{ id: number }[]>(
        "SELECT id FROM biomarker WHERE code = $1 LIMIT 1",
        [r.code],
      );
      const biomarkerId = rows[0]?.id;
      if (!biomarkerId) continue;
      await conn.execute(
        `INSERT INTO biomarker_reference_range
           (biomarker_id, sex, age_min_years, age_max_years, condition, ref_low, ref_high, optimal_low, optimal_high)
         VALUES ($1, $2, NULL, NULL, NULL, $3, $4, NULL, NULL)`,
        [biomarkerId, r.sex, r.ref[0], r.ref[1]],
      );
    }
    await conn.execute("COMMIT");
  } catch (e) {
    await conn.execute("ROLLBACK");
    throw e;
  }
}

export async function seedBiomarkersIfEmpty(conn: Database): Promise<void> {
  const [{ n }] = await conn.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM biomarker");
  if (n > 0) return;

  await conn.execute("BEGIN");
  try {
    for (const b of SEED) {
      await conn.execute(
        `INSERT INTO biomarker
           (code, canonical_name, category, aliases, default_unit,
            ref_low, ref_high, optimal_low, optimal_high, direction, is_custom)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0)`,
        [
          b.code ?? null,
          b.name,
          b.category,
          JSON.stringify(b.aliases),
          b.unit,
          b.ref?.[0] ?? null,
          b.ref?.[1] ?? null,
          b.optimal?.[0] ?? null,
          b.optimal?.[1] ?? null,
          b.direction ?? "range",
        ],
      );
    }
    await conn.execute("COMMIT");
  } catch (e) {
    await conn.execute("ROLLBACK");
    throw e;
  }
}
