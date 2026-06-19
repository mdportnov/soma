import type { BiomarkerInfoMap } from "./biomarker-info";

/**
 * English reference explanations, keyed by biomarker canonical name.
 * Educational and non-categorical by design — see biomarker-info.ts.
 */
export const biomarkerInfoEn: BiomarkerInfoMap = {
  // ── Complete Blood Count ──
  Hemoglobin: {
    summary:
      "The iron-containing protein in red blood cells that binds oxygen in the lungs and carries it to tissues.",
    high: "May reflect dehydration (concentrated blood), smoking, living at high altitude, or, less often, overproduction of red cells.",
    low: "May indicate anemia from iron, B12 or folate deficiency, blood loss, chronic disease, or increased red-cell breakdown.",
    affects:
      "Determines how much oxygen the blood can deliver; low levels are linked to fatigue, breathlessness and pallor.",
  },
  Hematocrit: {
    summary:
      "The percentage of blood volume made up of red blood cells; it tracks closely with hemoglobin.",
    high: "May reflect dehydration, smoking, high-altitude living or increased red-cell production.",
    low: "May indicate anemia, blood loss, overhydration or fluid overload.",
    affects: "Reflects the blood's oxygen-carrying capacity and its thickness (viscosity).",
  },
  "Red Blood Cells": {
    summary:
      "The number of red blood cells per volume of blood; these cells transport oxygen and carbon dioxide.",
    high: "May reflect dehydration, smoking, chronic low-oxygen states (lung disease, altitude) or a bone-marrow disorder.",
    low: "May indicate anemia, blood loss, nutritional deficiency or reduced marrow production.",
    affects:
      "Sets the blood's capacity to carry oxygen to tissues and return carbon dioxide to the lungs.",
  },
  "White Blood Cells": {
    summary:
      "The total number of immune cells in the blood, the body's main defense against infection.",
    high: "May accompany infection, inflammation, physical stress, smoking, or certain medications; rarely a blood disorder.",
    low: "May follow viral infections, certain medications, autoimmune conditions or reduced marrow production.",
    affects: "Reflects the immune system's activity and its ability to fight infection.",
  },
  Platelets: {
    summary: "Small cell fragments that clump together to form clots and stop bleeding.",
    high: "May reflect inflammation, infection, iron deficiency, recovery after blood loss, or a marrow disorder.",
    low: "May indicate increased destruction, certain infections or medications, liver disease, or reduced marrow production, and can raise bleeding risk.",
    affects: "Central to blood clotting and wound healing.",
  },
  MCV: {
    summary: "The average size of a red blood cell; it helps classify the type of anemia.",
    high: "Larger cells may be associated with B12 or folate deficiency, alcohol use, liver disease or thyroid issues.",
    low: "Smaller cells may be associated with iron deficiency or inherited conditions such as thalassemia.",
    affects: "Guides the interpretation of anemia by pointing to its likely cause.",
  },
  MCH: {
    summary: "The average amount of hemoglobin contained in a single red blood cell.",
    high: "May accompany large-cell (macrocytic) anemias, e.g. B12 or folate deficiency.",
    low: "May accompany iron-deficiency or other small-cell anemias.",
    affects:
      "Reflects how much oxygen-carrying pigment each red cell holds; interpreted alongside MCV.",
  },
  MCHC: {
    summary: "The concentration of hemoglobin within red blood cells.",
    high: "May be seen with red-cell membrane disorders (spherocytosis) or sample handling effects.",
    low: "May accompany iron deficiency or other conditions where cells are under-filled with hemoglobin.",
    affects: "Indicates how densely red cells are packed with hemoglobin.",
  },
  RDW: {
    summary: "A measure of how much red-cell size varies; greater variation raises the value.",
    high: "May be an early sign of iron, B12 or folate deficiency, or a mix of anemia types.",
    low: "Generally not clinically significant.",
    affects: "Helps detect and distinguish nutritional anemias, often before other indices change.",
  },
  Neutrophils: {
    summary: "The most common white blood cells, the front line against bacterial infection.",
    high: "May rise with bacterial infection, inflammation, physical or emotional stress, or steroid use.",
    low: "May follow viral infections, certain medications, or reduced marrow production, increasing infection risk.",
    affects: "Key to the rapid immune response against bacteria and fungi.",
  },
  Lymphocytes: {
    summary: "White blood cells central to viral defense and long-term immune memory.",
    high: "May accompany viral infections, some chronic infections, or certain blood conditions.",
    low: "May follow acute infections, stress, steroid use or immune suppression.",
    affects: "Drive antibody production and targeted immune responses.",
  },
  Monocytes: {
    summary: "White blood cells that clear debris and pathogens and support other immune cells.",
    high: "May accompany chronic infections, inflammation or recovery phases.",
    low: "Usually not significant on its own; may follow certain treatments.",
    affects: "Part of the body's clean-up and longer-term immune defense.",
  },
  Eosinophils: {
    summary: "White blood cells involved in allergic reactions and defense against parasites.",
    high: "May accompany allergies, asthma, parasitic infection or certain drug reactions.",
    low: "Usually not significant.",
    affects: "Mediates allergic responses and antiparasitic defense.",
  },
  Basophils: {
    summary: "The least common white blood cells, involved in allergic and inflammatory responses.",
    high: "May accompany allergic reactions, chronic inflammation, or rarely a blood disorder.",
    low: "Usually not significant.",
    affects: "Releases histamine and other mediators in allergy and inflammation.",
  },
  ESR: {
    summary:
      "A nonspecific marker of inflammation based on how quickly red cells settle in a tube.",
    high: "May indicate inflammation, infection, tissue injury or, with other findings, autoimmune disease; can rise with age, anemia and pregnancy.",
    low: "Generally not a concern.",
    affects: "A broad signal of inflammatory activity, used to track its course over time.",
  },

  // ── Glucose Metabolism ──
  "Glucose (fasting)": {
    summary:
      "The amount of sugar in the blood after not eating, a core measure of how the body handles fuel.",
    high: "May indicate impaired glucose regulation or diabetes; also rises with stress, illness or certain medications.",
    low: "May follow excess insulin or other glucose-lowering medication, prolonged fasting or, less often, hormonal causes.",
    affects: "The body's main energy supply; tight regulation protects nerves, vessels and organs.",
  },
  HbA1c: {
    summary:
      "Reflects average blood sugar over the past 2–3 months by measuring sugar bound to hemoglobin.",
    high: "May indicate elevated average glucose, prediabetes or diabetes, or poor glucose control.",
    low: "May reflect low average glucose, recent blood loss, anemia or conditions that shorten red-cell lifespan.",
    affects: "A long-term gauge of glucose control and the risk of diabetes-related complications.",
  },
  "Insulin (fasting)": {
    summary: "The hormone that moves glucose into cells, measured after fasting.",
    high: "May indicate insulin resistance, where the body needs more insulin to manage glucose.",
    low: "May reflect reduced insulin production or, in context, well-preserved insulin sensitivity.",
    affects: "Central to blood-sugar control, fat storage and metabolic health.",
  },
  "Uric Acid": {
    summary: "A waste product from the breakdown of purines, cleared mainly by the kidneys.",
    high: "May be associated with gout, a high-purine diet, alcohol, reduced kidney clearance or metabolic syndrome.",
    low: "Usually not a concern; may reflect certain medications or diet.",
    affects: "High levels can crystallize in joints (gout) and contribute to kidney stones.",
  },
  "C-Peptide": {
    summary:
      "A fragment released in equal amounts to insulin, showing how much insulin the body makes.",
    high: "May reflect insulin resistance or high insulin output.",
    low: "May indicate reduced insulin production by the pancreas.",
    affects:
      "Helps distinguish how much insulin is produced by the body versus given as medication.",
  },
  "HOMA-IR": {
    summary:
      "A calculated index from fasting glucose and insulin that estimates insulin resistance.",
    high: "Higher values may indicate greater insulin resistance and metabolic risk.",
    low: "Lower values generally reflect good insulin sensitivity.",
    affects: "A screening estimate of how well the body responds to insulin.",
  },
  Fructosamine: {
    summary:
      "Reflects average blood sugar over the past 2–3 weeks via sugar bound to blood proteins.",
    high: "May indicate elevated average glucose over recent weeks.",
    low: "May reflect low average glucose or low blood-protein states.",
    affects: "A shorter-term alternative to HbA1c, useful when red-cell turnover is abnormal.",
  },
  Leptin: {
    summary: "A hormone made by fat tissue that signals energy stores and helps regulate appetite.",
    high: "Often tracks higher body fat and may indicate leptin resistance.",
    low: "May reflect low body fat or fasting.",
    affects: "Influences appetite, energy balance and body-weight regulation.",
  },
  Adiponectin: {
    summary:
      "A hormone from fat tissue that improves insulin sensitivity and has anti-inflammatory effects.",
    high: "Generally considered favorable for metabolic health.",
    low: "May be associated with insulin resistance, obesity and higher cardiometabolic risk.",
    affects: "Supports insulin sensitivity and healthy fat and glucose metabolism.",
  },

  // ── Lipid Panel ──
  "Total Cholesterol": {
    summary: "The total amount of cholesterol in the blood across all lipoprotein particles.",
    high: "May reflect diet, genetics, low thyroid function or metabolic factors and can raise cardiovascular risk.",
    low: "Usually not a concern; very low levels occasionally reflect malnutrition, liver disease or an overactive thyroid.",
    affects:
      "Cholesterol builds cell membranes and hormones; the balance of particle types matters most for heart risk.",
  },
  "LDL Cholesterol": {
    summary:
      'Cholesterol carried by LDL particles, the main driver of arterial plaque ("bad" cholesterol).',
    high: "May increase the risk of plaque build-up and cardiovascular disease; influenced by diet, genetics and metabolism.",
    low: "Generally favorable for cardiovascular risk.",
    affects: "A primary target for reducing heart-attack and stroke risk.",
  },
  "HDL Cholesterol": {
    summary:
      'Cholesterol carried by HDL particles, which helps remove cholesterol from arteries ("good" cholesterol).',
    high: "Often considered protective, though very high levels are not always beneficial.",
    low: "May be associated with higher cardiovascular risk, inactivity or metabolic syndrome.",
    affects: "Supports reverse cholesterol transport, moving cholesterol back to the liver.",
  },
  Triglycerides: {
    summary: "The main type of fat in the blood, used for energy and stored in fat tissue.",
    high: "May reflect high-carbohydrate or alcohol intake, excess weight, insulin resistance or genetics; very high levels can stress the pancreas.",
    low: "Usually not a concern.",
    affects: "An energy source; elevated levels are linked to cardiovascular and metabolic risk.",
  },
  "Apolipoprotein B": {
    summary:
      "A protein found on each atherogenic particle, so it counts the particles most likely to cause plaque.",
    high: "May indicate a higher number of plaque-forming particles and greater cardiovascular risk.",
    low: "Generally favorable for cardiovascular risk.",
    affects: "Often a more precise measure of heart risk than cholesterol concentration alone.",
  },
  "Lipoprotein(a)": {
    summary: "A largely inherited lipoprotein particle that can promote plaque and clotting.",
    high: "May indicate a genetically higher cardiovascular risk, independent of LDL.",
    low: "Considered favorable.",
    affects: "A mostly fixed, inherited contributor to heart and vascular risk.",
  },
  "Apolipoprotein A1": {
    summary: "The main protein of HDL particles, supporting their cholesterol-clearing function.",
    high: "Generally considered favorable, reflecting protective HDL.",
    low: "May be associated with lower HDL and higher cardiovascular risk.",
    affects: "Enables HDL to remove excess cholesterol from tissues.",
  },
  "ApoB/ApoA1 Ratio": {
    summary:
      "The balance between plaque-forming and protective particles, used as a cardiovascular risk indicator.",
    high: "A higher ratio may indicate greater atherosclerotic risk.",
    low: "A lower ratio is generally favorable.",
    affects: "Summarizes the balance of harmful versus protective lipoproteins.",
  },
  "Non-HDL Cholesterol": {
    summary: "All cholesterol except HDL — the sum of the atherogenic particles.",
    high: "May indicate higher cardiovascular risk from plaque-forming lipoproteins.",
    low: "Generally favorable.",
    affects: "A robust risk marker that does not require fasting.",
  },
  "VLDL Cholesterol": {
    summary:
      "Cholesterol carried by very-low-density lipoproteins, which mainly transport triglycerides.",
    high: "Often tracks high triglycerides and may add to cardiovascular risk.",
    low: "Generally not a concern.",
    affects: "Part of the body's fat-transport system; usually estimated from triglycerides.",
  },
  "Small Dense LDL": {
    summary:
      "A subtype of LDL made of small, dense particles considered especially prone to causing plaque.",
    high: "May indicate a more atherogenic lipid pattern, often with insulin resistance.",
    low: "Generally favorable.",
    affects: "Reflects LDL quality, not just quantity, in cardiovascular risk.",
  },
  "Oxidized LDL": {
    summary:
      "LDL particles damaged by oxidation, which are more readily taken up into arterial plaque.",
    high: "May reflect oxidative stress and accelerated plaque formation.",
    low: "Generally favorable.",
    affects: "Linked to the inflammatory process underlying atherosclerosis.",
  },

  // ── Liver ──
  ALT: {
    summary: "A liver enzyme released into the blood when liver cells are stressed or damaged.",
    high: "May indicate liver-cell injury from fatty liver, alcohol, viral hepatitis, medications or other causes.",
    low: "Generally not a concern.",
    affects: "One of the most specific markers of liver-cell health.",
  },
  AST: {
    summary:
      "An enzyme found in the liver and also in muscle and the heart, released when those cells are damaged.",
    high: "May reflect liver injury, muscle damage (including intense exercise) or, less often, heart-related causes.",
    low: "Generally not a concern.",
    affects: "Interpreted with ALT to gauge liver versus muscle sources of damage.",
  },
  GGT: {
    summary: "A liver and bile-duct enzyme sensitive to alcohol and bile-flow problems.",
    high: "May indicate alcohol use, bile-duct obstruction, fatty liver or certain medications.",
    low: "Generally not a concern.",
    affects: "Helps clarify whether a raised alkaline phosphatase comes from the liver.",
  },
  "Alkaline Phosphatase": {
    summary: "An enzyme found mainly in liver and bone, reflecting bile flow and bone activity.",
    high: "May indicate bile-duct issues, liver disease, bone growth or turnover; physiologically higher in children and pregnancy.",
    low: "Uncommon; may relate to certain nutritional or genetic factors.",
    affects: "A shared liver and bone marker, interpreted with other liver tests.",
  },
  "Bilirubin Total": {
    summary: "A yellow pigment from the breakdown of red blood cells, processed by the liver.",
    high: "May reflect increased red-cell breakdown, liver dysfunction or bile-flow obstruction; can cause jaundice.",
    low: "Not clinically significant.",
    affects: "Reflects the balance of red-cell turnover and the liver's processing capacity.",
  },
  "Bilirubin Direct": {
    summary: "The liver-processed (conjugated) form of bilirubin, ready for excretion in bile.",
    high: "May indicate bile-flow obstruction or liver-cell dysfunction.",
    low: "Not significant.",
    affects: "A rise points toward liver or bile-duct problems specifically.",
  },
  Albumin: {
    summary:
      "The main protein made by the liver, keeping fluid in vessels and carrying many substances.",
    high: "Usually reflects dehydration (concentrated blood).",
    low: "May reflect liver disease, poor nutrition, inflammation, or protein loss via kidneys or gut.",
    affects: "Maintains blood's fluid balance and transports hormones, drugs and minerals.",
  },
  "Total Protein": {
    summary: "The combined amount of albumin and globulins in the blood.",
    high: "May reflect dehydration, chronic inflammation or certain immune disorders.",
    low: "May reflect liver or kidney disease, poor nutrition or malabsorption.",
    affects: "Supports fluid balance, immune function and transport of substances.",
  },
  "Bilirubin Indirect": {
    summary: "The unprocessed (unconjugated) form of bilirubin before the liver handles it.",
    high: "May reflect increased red-cell breakdown or a common, harmless inherited variation (Gilbert's syndrome).",
    low: "Not significant.",
    affects: "A rise points toward red-cell breakdown rather than bile obstruction.",
  },
  LDH: {
    summary:
      "An enzyme present in most tissues, released when cells are damaged anywhere in the body.",
    high: "A nonspecific sign that may reflect tissue injury, red-cell breakdown or inflammation.",
    low: "Generally not a concern.",
    affects: "A broad marker of cell turnover or damage, interpreted with other tests.",
  },

  // ── Kidney ──
  Creatinine: {
    summary: "A muscle waste product filtered by the kidneys, used to estimate kidney function.",
    high: "May indicate reduced kidney filtration, dehydration, or high muscle mass / intense exercise.",
    low: "May reflect low muscle mass; rarely a concern.",
    affects: "A core measure of how well the kidneys clear waste.",
  },
  Urea: {
    summary: "A waste product of protein breakdown, cleared by the kidneys (also called BUN).",
    high: "May reflect reduced kidney function, dehydration, high protein intake or bleeding in the gut.",
    low: "May reflect low protein intake or liver issues.",
    affects: "Reflects kidney filtration and the balance of protein metabolism and hydration.",
  },
  eGFR: {
    summary:
      "An estimate of how much blood the kidneys filter per minute, calculated from creatinine.",
    high: "Higher values generally indicate well-preserved kidney function.",
    low: "May indicate reduced kidney function and helps stage chronic kidney disease.",
    affects: "The standard summary measure of overall kidney function.",
  },
  "Cystatin C": {
    summary:
      "A protein filtered by the kidneys that estimates filtration independently of muscle mass.",
    high: "May indicate reduced kidney filtration.",
    low: "Generally favorable.",
    affects: "A kidney-function marker useful when creatinine is affected by muscle mass.",
  },

  // ── Electrolytes & Minerals ──
  Sodium: {
    summary: "The main electrolyte outside cells, governing fluid balance and nerve signaling.",
    high: "May reflect dehydration or water loss exceeding salt loss.",
    low: "May reflect overhydration, certain medications, or hormonal and kidney conditions.",
    affects: "Controls fluid balance, blood pressure and nerve and muscle function.",
  },
  Potassium: {
    summary: "The main electrolyte inside cells, essential for heart and muscle function.",
    high: "May reflect kidney issues, certain medications or sample handling; can affect heart rhythm.",
    low: "May reflect fluid loss (vomiting, diarrhea), diuretics or poor intake; can affect heart and muscles.",
    affects: "Critical for normal heart rhythm and nerve and muscle activity.",
  },
  Calcium: {
    summary:
      "A mineral vital for bones, nerves, muscles and clotting, tightly regulated in the blood.",
    high: "May reflect overactive parathyroid glands, certain cancers, excess vitamin D or dehydration.",
    low: "May reflect vitamin D deficiency, low parathyroid activity, kidney disease or low albumin.",
    affects: "Supports bone strength, muscle contraction, nerve signaling and blood clotting.",
  },
  Magnesium: {
    summary:
      "A mineral involved in hundreds of enzyme reactions, including energy and muscle function.",
    high: "Uncommon; may relate to kidney impairment or excess supplementation.",
    low: "May reflect poor intake, gut losses, alcohol use or certain medications; can affect muscles and heart rhythm.",
    affects: "Supports energy production, muscle and nerve function and heart rhythm.",
  },
  Phosphorus: {
    summary: "A mineral working with calcium for bones and central to energy storage.",
    high: "May reflect reduced kidney function or excess intake.",
    low: "May reflect poor intake, malabsorption, vitamin D deficiency or certain hormonal states.",
    affects: "Builds bone and teeth and powers cellular energy (ATP).",
  },
  Zinc: {
    summary: "An essential trace mineral needed for immunity, wound healing and enzyme function.",
    high: "Usually from excess supplementation.",
    low: "May reflect poor intake, malabsorption or increased needs; can affect immunity and healing.",
    affects: "Supports immune defense, taste and smell, skin health and growth.",
  },
  Chloride: {
    summary: "An electrolyte that pairs with sodium to maintain fluid and acid–base balance.",
    high: "May accompany dehydration or certain acid–base disturbances.",
    low: "May accompany fluid loss from vomiting or certain metabolic states.",
    affects: "Helps regulate fluid balance and blood pH.",
  },
  Bicarbonate: {
    summary: "A buffer that helps keep the blood's acid–base balance stable.",
    high: "May reflect metabolic alkalosis or compensation for breathing problems.",
    low: "May reflect metabolic acidosis from various causes.",
    affects: "Central to maintaining stable blood pH.",
  },
  "Calcium Ionized": {
    summary: "The active, free form of calcium not bound to proteins.",
    high: "May reflect overactive parathyroid glands or other causes of high calcium.",
    low: "May reflect parathyroid, vitamin D or kidney issues.",
    affects: "The physiologically active calcium for nerves, muscles and clotting.",
  },
  "Magnesium (RBC)": {
    summary:
      "Magnesium measured inside red blood cells, reflecting tissue stores more than the blood value.",
    high: "Uncommon; may relate to excess supplementation.",
    low: "May indicate depleted magnesium stores even when blood magnesium looks normal.",
    affects: "A more sensitive view of the body's true magnesium status.",
  },
  Copper: {
    summary:
      "An essential trace mineral for iron metabolism, connective tissue and antioxidant defense.",
    high: "May reflect inflammation, certain conditions, or excess intake.",
    low: "May reflect malabsorption, high zinc intake or rare genetic causes.",
    affects: "Supports iron handling, nerve function and the formation of connective tissue.",
  },
  Selenium: {
    summary:
      "A trace mineral that is part of the body's antioxidant and thyroid-supporting enzymes.",
    high: "Usually from excess supplementation and can be toxic.",
    low: "May reflect poor intake in selenium-poor regions and affect thyroid and antioxidant function.",
    affects: "Supports antioxidant defense, thyroid hormone activation and immunity.",
  },

  // ── Iron Status ──
  Ferritin: {
    summary: "The body's iron-storage protein and the best single marker of iron reserves.",
    high: "May reflect inflammation or infection (it rises as an acute-phase protein), liver disease or iron overload.",
    low: "A specific sign of depleted iron stores, often before anemia appears.",
    affects: "Reflects long-term iron reserves available for making red blood cells.",
  },
  Iron: {
    summary: "The amount of iron circulating in the blood at the moment of the test.",
    high: "May reflect excess intake, iron overload or release from tissues; fluctuates through the day.",
    low: "May reflect iron deficiency, blood loss or inflammation.",
    affects: "Iron is essential for hemoglobin, oxygen transport and energy production.",
  },
  Transferrin: {
    summary: "The protein that transports iron through the blood.",
    high: "Often rises in iron deficiency as the body tries to capture more iron.",
    low: "May reflect inflammation, liver disease or malnutrition.",
    affects: "Determines how iron is carried to the marrow and tissues.",
  },
  "Transferrin Saturation": {
    summary: "The percentage of iron-carrying capacity currently filled with iron.",
    high: "May indicate iron overload or excess intake.",
    low: "A sensitive sign of iron deficiency.",
    affects: "Shows how much iron is available for red-cell production.",
  },
  TIBC: {
    summary: "The blood's total capacity to bind and transport iron, reflecting transferrin.",
    high: "Often rises in iron deficiency.",
    low: "May reflect inflammation, iron overload or malnutrition.",
    affects: "Interpreted with iron and ferritin to assess iron status.",
  },

  // ── Inflammation ──
  "hs-CRP": {
    summary:
      "A sensitive marker of inflammation made by the liver, also used to gauge cardiovascular risk.",
    high: "May reflect infection, injury or chronic low-grade inflammation; persistently mild elevations are linked to cardiovascular risk.",
    low: "Generally favorable.",
    affects: "A broad signal of inflammation in the body and blood vessels.",
  },
  Homocysteine: {
    summary: "An amino acid whose level depends on B-vitamin status (B12, folate, B6).",
    high: "May reflect deficiency of B12, folate or B6, kidney issues or genetics; linked to cardiovascular risk.",
    low: "Generally not a concern.",
    affects: "Elevated levels are associated with blood-vessel and clotting risk.",
  },
  Fibrinogen: {
    summary: "A clotting protein that also rises with inflammation.",
    high: "May reflect inflammation or infection and contributes to clotting tendency and cardiovascular risk.",
    low: "May reflect liver dysfunction or consumption during heavy clotting.",
    affects: "Essential for clot formation and a marker of inflammatory activity.",
  },
  "Interleukin-6": {
    summary: "A signaling protein (cytokine) that drives inflammatory responses.",
    high: "May reflect infection, injury or chronic inflammation.",
    low: "Generally favorable.",
    affects: "A key driver of the body's inflammatory and immune signaling.",
  },
  "Lp-PLA2": {
    summary: "An enzyme linked to inflammation within artery walls.",
    high: "May indicate vascular inflammation and added cardiovascular risk.",
    low: "Generally favorable.",
    affects: "Reflects inflammation specific to the arterial wall.",
  },

  // ── Thyroid ──
  TSH: {
    summary:
      "The pituitary hormone that tells the thyroid how much hormone to make; the main thyroid screening test.",
    high: "May indicate an underactive thyroid (hypothyroidism), as the body signals for more hormone.",
    low: "May indicate an overactive thyroid (hyperthyroidism) or excess thyroid medication.",
    affects: "Regulates the thyroid and, through it, metabolism, energy and temperature.",
  },
  "Free T4": {
    summary: "The active, unbound form of the thyroid's main hormone available to tissues.",
    high: "May indicate an overactive thyroid.",
    low: "May indicate an underactive thyroid.",
    affects: "Drives metabolic rate, energy use and many body systems.",
  },
  "Free T3": {
    summary: "The unbound form of the most active thyroid hormone.",
    high: "May indicate an overactive thyroid.",
    low: "May indicate an underactive thyroid or conversion changes during illness.",
    affects: "The most metabolically active thyroid hormone at the tissue level.",
  },
  "Anti-TPO": {
    summary: "Antibodies against a thyroid enzyme, a marker of autoimmune thyroid disease.",
    high: "May indicate autoimmune thyroid conditions such as Hashimoto's or Graves'.",
    low: "Normal; suggests autoimmune thyroid disease is less likely.",
    affects: "Helps explain the cause of abnormal thyroid function.",
  },
  "Anti-TG": {
    summary: "Antibodies against thyroglobulin, another marker of autoimmune thyroid disease.",
    high: "May indicate autoimmune thyroid disease and can affect thyroglobulin test interpretation.",
    low: "Normal; suggests autoimmune thyroid disease is less likely.",
    affects: "Supports the assessment of autoimmune thyroid conditions.",
  },
  "Total T4": {
    summary: "The total amount of the thyroid's main hormone, both bound and free.",
    high: "May indicate an overactive thyroid; also affected by proteins and pregnancy.",
    low: "May indicate an underactive thyroid.",
    affects: "Reflects overall thyroid hormone output, interpreted with free hormone levels.",
  },
  "Total T3": {
    summary: "The total amount of the active thyroid hormone, bound and free.",
    high: "May indicate an overactive thyroid.",
    low: "May reflect an underactive thyroid or illness.",
    affects: "Reflects active thyroid hormone available to the body.",
  },
  "Reverse T3": {
    summary:
      "An inactive form of T3 that rises when the body diverts thyroid hormone, often during stress or illness.",
    high: "May reflect illness, stress or fasting rather than thyroid disease itself.",
    low: "Generally not a concern.",
    affects: "Reflects how the body manages thyroid hormone during stress states.",
  },
  Thyroglobulin: {
    summary:
      "A protein made only by the thyroid, used mainly to monitor certain thyroid conditions.",
    high: "May reflect thyroid inflammation, goiter or, in follow-up, remaining thyroid tissue.",
    low: "Expected after complete thyroid removal.",
    affects: "Mainly a monitoring marker for thyroid disorders and follow-up.",
  },

  // ── Hormones ──
  "Testosterone Total": {
    summary: "The main male sex hormone (present in both sexes), measured as bound plus free.",
    high: "In context may reflect supplementation or hormonal conditions; in women may relate to PCOS.",
    low: "May reflect aging, testicular or pituitary issues, obesity or chronic illness.",
    affects: "Supports libido, muscle and bone mass, mood and energy.",
  },
  "Testosterone Free": {
    summary: "The unbound, biologically active portion of testosterone available to tissues.",
    high: "May reflect supplementation or hormonal conditions.",
    low: "May indicate low active testosterone even when total looks normal, e.g. with high SHBG.",
    affects: "The fraction that actually acts on tissues for libido, muscle and energy.",
  },
  SHBG: {
    summary: "A protein that binds sex hormones and controls how much is freely available.",
    high: "May reflect high estrogen, an overactive thyroid or liver factors, lowering free hormone.",
    low: "May reflect insulin resistance, obesity or low thyroid, raising free hormone.",
    affects: "Regulates the active fraction of testosterone and estrogen.",
  },
  Estradiol: {
    summary: "The main estrogen, important for reproduction and bone health in both sexes.",
    high: "May reflect normal cycle phases, supplementation or other hormonal sources.",
    low: "May reflect menopause, low ovarian activity or, in men, certain imbalances.",
    affects: "Supports reproductive function, bone density and cardiovascular and mood health.",
  },
  "Cortisol (morning)": {
    summary: "The body's main stress hormone, normally highest in the morning.",
    high: "May reflect stress, illness, certain medications or, less often, adrenal overactivity.",
    low: "May reflect adrenal underactivity or suppression from steroid use.",
    affects: "Regulates stress response, blood sugar, blood pressure and immune activity.",
  },
  "DHEA-S": {
    summary: "An adrenal hormone that serves as a building block for sex hormones.",
    high: "May reflect adrenal overactivity or supplementation; declines naturally with age.",
    low: "May reflect adrenal underactivity or aging.",
    affects: "A precursor for testosterone and estrogen and a marker of adrenal output.",
  },
  Prolactin: {
    summary: "A pituitary hormone best known for supporting milk production.",
    high: "May reflect stress, certain medications, pituitary issues or pregnancy; can disrupt cycles and fertility.",
    low: "Usually not a concern.",
    affects: "Influences reproduction, lactation and, when high, other hormone levels.",
  },
  LH: {
    summary: "A pituitary hormone that triggers ovulation and supports testosterone production.",
    high: "May reflect menopause, ovarian or testicular underactivity.",
    low: "May reflect pituitary or hypothalamic issues.",
    affects: "Drives ovulation, the menstrual cycle and testosterone production.",
  },
  FSH: {
    summary: "A pituitary hormone that supports egg and sperm development.",
    high: "May reflect menopause or reduced ovarian or testicular function.",
    low: "May reflect pituitary or hypothalamic issues.",
    affects: "Central to fertility and reproductive function in both sexes.",
  },
  "IGF-1": {
    summary:
      "A hormone reflecting growth-hormone activity, important for growth and tissue repair.",
    high: "May reflect excess growth hormone.",
    low: "May reflect growth-hormone deficiency, aging, poor nutrition or liver issues.",
    affects: "Supports growth, muscle and bone maintenance and tissue repair.",
  },
  "PSA Total": {
    summary: "A protein made by the prostate, used to screen and monitor prostate health in men.",
    high: "May reflect prostate enlargement, inflammation, recent activity or, with other findings, prostate cancer.",
    low: "Generally reassuring.",
    affects: "A monitoring and screening marker for prostate conditions.",
  },
  "PSA Free": {
    summary:
      "The unbound portion of PSA; its ratio to total PSA helps refine prostate-cancer risk.",
    high: "A higher free-to-total ratio generally favors benign prostate causes.",
    low: "A lower ratio may raise concern and prompt further evaluation.",
    affects: "Improves the specificity of PSA testing.",
  },
  Progesterone: {
    summary: "A hormone that prepares the uterus for pregnancy and regulates the menstrual cycle.",
    high: "May reflect the luteal phase of the cycle or pregnancy.",
    low: "May reflect lack of ovulation or low ovarian activity.",
    affects: "Supports the menstrual cycle, pregnancy and hormonal balance.",
  },
  "Parathyroid Hormone": {
    summary: "A hormone that raises blood calcium by acting on bone, kidneys and vitamin D.",
    high: "May reflect low calcium, vitamin D deficiency, kidney disease or overactive parathyroid glands.",
    low: "May reflect high calcium or underactive parathyroid glands.",
    affects: "The main regulator of calcium and bone metabolism.",
  },

  // ── Vitamins ──
  "Vitamin D (25-OH)": {
    summary: "The storage form of vitamin D and the best measure of overall vitamin D status.",
    high: "Usually from excess supplementation and can raise calcium.",
    low: "Common with limited sun exposure or low intake; may affect bone, immune and muscle health.",
    affects: "Supports calcium absorption, bone strength, immunity and muscle function.",
  },
  "Vitamin B12": {
    summary: "A vitamin essential for red-cell formation, nerves and DNA synthesis.",
    high: "Usually from supplementation; rarely reflects other conditions.",
    low: "May reflect low intake, absorption problems or certain medications; can affect blood and nerves.",
    affects: "Supports healthy red blood cells, nerve function and energy.",
  },
  Folate: {
    summary: "A B vitamin essential for cell division, red-cell formation and DNA synthesis.",
    high: "Usually from supplementation and not a concern.",
    low: "May reflect poor intake, alcohol use or malabsorption; important before and during pregnancy.",
    affects: "Supports red-cell production, cell growth and healthy fetal development.",
  },
  "Active B12 (Holotranscobalamin)": {
    summary: "The fraction of B12 that cells can actually use, an early marker of B12 status.",
    high: "Usually from supplementation.",
    low: "May reveal early B12 deficiency before total B12 falls.",
    affects: "A more sensitive indicator of usable vitamin B12.",
  },
  "Vitamin A (Retinol)": {
    summary: "A fat-soluble vitamin important for vision, skin and immune function.",
    high: "Usually from excess supplementation and can be toxic.",
    low: "May reflect poor intake or fat malabsorption; can affect vision and immunity.",
    affects: "Supports vision, skin, growth and immune defense.",
  },
  "Vitamin E (Tocopherol)": {
    summary: "A fat-soluble antioxidant vitamin that protects cell membranes.",
    high: "Usually from excess supplementation.",
    low: "Uncommon; may reflect fat malabsorption.",
    affects: "Protects cells from oxidative damage and supports immune function.",
  },
  "Vitamin B6": {
    summary:
      "A B vitamin involved in protein metabolism, neurotransmitters and red-cell formation.",
    high: "Usually from excess supplementation; very high long-term intake can affect nerves.",
    low: "May reflect poor intake or certain conditions and affect metabolism and mood.",
    affects: "Supports brain chemistry, metabolism and red-cell production.",
  },
  "Vitamin C": {
    summary:
      "A water-soluble antioxidant vitamin essential for collagen, immunity and iron absorption.",
    high: "Usually from supplementation; excess is excreted.",
    low: "May reflect poor intake; severe deficiency impairs healing and connective tissue.",
    affects: "Supports collagen formation, immune defense, antioxidant protection and iron uptake.",
  },

  // ── Pancreas ──
  Amylase: {
    summary:
      "A digestive enzyme from the pancreas and salivary glands that breaks down carbohydrates.",
    high: "May reflect pancreatic inflammation, salivary-gland issues or reduced clearance.",
    low: "Usually not a concern.",
    affects: "Aids carbohydrate digestion and signals pancreatic or salivary problems.",
  },
  Lipase: {
    summary: "A pancreatic enzyme that digests fats, more specific to the pancreas than amylase.",
    high: "May indicate pancreatic inflammation (pancreatitis) or other pancreatic conditions.",
    low: "Usually not a concern.",
    affects: "Aids fat digestion and is a key marker of pancreatic injury.",
  },

  // ── Cardiac Markers ──
  "NT-proBNP": {
    summary: "A hormone fragment released when the heart's chambers are stretched or under strain.",
    high: "May indicate heart strain or heart failure; also rises with age and reduced kidney function.",
    low: "Generally reassuring for heart-failure assessment.",
    affects: "Reflects the workload and stress on the heart muscle.",
  },
  "hs-Troponin I": {
    summary: "A highly sensitive marker of heart-muscle injury.",
    high: "May indicate heart-muscle damage, including heart attack, or other cardiac strain.",
    low: "Generally reassuring.",
    affects: "A key marker for detecting injury to the heart muscle.",
  },

  // ── Omega & Fatty Acids ──
  "Omega-3 Index": {
    summary: "The proportion of omega-3 fatty acids (EPA and DHA) in red-cell membranes.",
    high: "Generally favorable and associated with lower cardiovascular risk.",
    low: "May reflect low omega-3 intake and higher cardiovascular risk.",
    affects: "Reflects long-term omega-3 status, relevant to heart and brain health.",
  },
  "Omega-6/Omega-3 Ratio": {
    summary: "The balance between omega-6 and omega-3 fatty acids in the body.",
    high: "A higher ratio may reflect a more pro-inflammatory dietary pattern.",
    low: "A lower ratio is generally considered favorable.",
    affects: "Reflects the dietary fat balance influencing inflammation.",
  },

  // ── Coagulation ──
  "D-dimer": {
    summary: "A fragment released when blood clots break down, used to help rule out clots.",
    high: "May reflect clot formation and breakdown, but also rises with inflammation, infection, surgery, pregnancy and age.",
    low: "Makes a significant clot less likely.",
    affects: "A sensitive but nonspecific marker used mainly to exclude clotting events.",
  },
  INR: {
    summary:
      "A standardized measure of how quickly blood clots, often used to monitor blood thinners.",
    high: "May indicate slower clotting from anticoagulant medication, liver issues or vitamin K deficiency, raising bleeding risk.",
    low: "May indicate faster clotting or under-treatment on blood thinners.",
    affects: "Guides the safety and dosing of anticoagulant therapy.",
  },

  // ── Heavy Metals ──
  Mercury: {
    summary: "A toxic heavy metal that can accumulate from sources such as certain fish.",
    high: "May reflect exposure (often dietary) and can affect the nervous system at high levels.",
    low: "Normal and desirable.",
    affects: "Excess can harm the nervous system, kidneys and, in pregnancy, the developing baby.",
  },
  Lead: {
    summary: "A toxic heavy metal with no safe beneficial role in the body.",
    high: "May reflect environmental or occupational exposure and can affect nerves, blood and kidneys.",
    low: "Normal and desirable.",
    affects: "Excess can impair the nervous system, blood production and kidney function.",
  },
  Cadmium: {
    summary: "A toxic heavy metal found in tobacco smoke and some industrial settings.",
    high: "May reflect smoking or environmental exposure and can affect kidneys and bones.",
    low: "Normal and desirable.",
    affects: "Excess can harm the kidneys and bone health over time.",
  },

  // ── Tumor Markers ──
  CEA: {
    summary: "A protein used mainly to monitor certain cancers; not a standalone diagnostic test.",
    high: "May rise with some cancers but also with smoking, inflammation and benign conditions.",
    low: "Generally reassuring.",
    affects: "Used mostly to track treatment response and follow-up, not for diagnosis.",
  },
  AFP: {
    summary:
      "A protein used to monitor certain liver and germ-cell conditions, and in pregnancy screening.",
    high: "May reflect certain liver or germ-cell conditions, liver regeneration, or pregnancy.",
    low: "Generally reassuring outside pregnancy.",
    affects: "Used for monitoring specific conditions and in prenatal screening.",
  },
};
