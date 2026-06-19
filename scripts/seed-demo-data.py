#!/usr/bin/env python3
"""
Seed the local Soma database with a rich, correlated demo dataset so every
screen and feature has something to show: lab trends with reference/optimal
bands, out-of-range and critical flags, medication overlays that visibly move
markers, symptoms over time, weight/BP logs, visits + prescriptions, diagnoses,
allergies (incl. anaphylactic), multi-dose vaccine series with expiry, imaging,
and custom biomarkers.

Safe to re-run: it backs up the DB, then wipes user-data tables (the profile and
the 116-marker dictionary are preserved) before inserting a fresh demo set.

Usage:
    python3 scripts/seed-demo-data.py [path/to/soma.db]

Default path is the macOS Tauri app-data location for com.soma.health.
"""
import json
import os
import shutil
import sqlite3
import sys
from datetime import date, datetime

DEFAULT_DB = os.path.expanduser(
    "~/Library/Application Support/com.soma.health/soma.db"
)

PROFILE_ID = 1

# ── panels: (date, lab, city, country, fasting, collection_time) ──────────────
PANELS = [
    ("2024-01-15", "Invitro", "Moscow", "Russia", 1, "08:10"),
    ("2024-04-20", "Labcorp", "New York", "USA", 0, None),
    ("2024-07-10", "DILA", "Buenos Aires", "Argentina", 1, "07:50"),
    ("2024-10-05", "Bangkok Hospital", "Bangkok", "Thailand", 0, None),
    ("2025-01-12", "Synlab", "Lisbon", "Portugal", 1, "08:05"),
    ("2025-06-18", "Quest Diagnostics", "Austin", "USA", 1, "08:20"),
    ("2025-09-08", "Quick Clinic (urgent)", "Austin", "USA", 0, "14:30"),  # acute
    ("2025-12-02", "Policlinico Gemelli", "Rome", "Italy", 1, "07:40"),
    ("2026-06-10", "Invitro", "Tbilisi", "Georgia", 1, "08:00"),
]
ACUTE = 6  # index of the urgent infection panel

# Levels resolved against each marker's real reference range.
# story[name] = list of levels per panel index (None = not measured in panel).
N = "normal"
stories = {
    # Vitamin D deficiency → D3 5000 IU from 2024-05 → repletes
    "Vitamin D (25-OH)": ["low", "low", N, N, N, N, None, N, N],
    # High LDL → atorvastatin from 2025-02 → drops to normal
    "LDL Cholesterol": ["high", "high", "high", "high", "high", N, None, N, N],
    "Total Cholesterol": ["high", "high", "high", "high", "high", N, None, N, N],
    "Apolipoprotein B": ["high", None, "high", None, "high", N, None, None, N],
    # Iron-deficiency anemia → iron 2024-02..09 → recovers
    "Ferritin": ["low", "low", N, N, N, N, None, N, N],
    "Iron": ["low", "low", N, N, N, N, None, N, N],
    "Hemoglobin": ["low", "low", N, N, N, N, N, N, N],
    "Hematocrit": ["low", N, N, N, N, N, N, N, N],
    "MCV": ["low", "low", N, N, N, N, N, N, N],
    # Prediabetes → metformin from 2025-03 → improves
    "HbA1c": [N, N, "high", "high", "high", N, None, N, N],
    "Glucose (fasting)": [N, "high", "high", "high", "high", N, "high", N, N],
    "Insulin (fasting)": [None, None, "high", None, "high", N, None, None, N],
    "HOMA-IR": [None, None, "high", None, "high", N, None, None, N],
    # Subclinical hypothyroidism → levothyroxine from 2024-08 → normalizes
    "TSH": ["high", "high", "high", N, N, N, None, N, N],
    "Free T4": ["low", N, "low", N, N, N, None, N, N],
    # Fatty liver, improving with weight loss
    "ALT": ["high", "high", "high", N, N, N, None, N, N],
    "AST": ["high", N, "high", N, N, N, None, N, N],
    "GGT": ["high", "high", N, N, N, N, None, N, N],
    # Acute sinusitis @ 2025-09 → inflammation spike (amoxicillin course)
    "hs-CRP": [N, N, N, N, N, N, "critical_high", N, N],
    "White Blood Cells": [N, N, N, N, N, N, "high", N, N],
    "Neutrophils": [N, N, N, N, N, N, "high", N, N],
    "Lymphocytes": [N, N, N, N, N, N, "low", N, N],
    "ESR": [N, N, N, N, N, N, "high", N, N],
    # Mild hyperuricemia
    "Uric Acid": [N, "high", N, "high", N, N, None, N, "high"],
    "Homocysteine": ["high", None, N, None, N, N, None, None, N],
}

# Markers measured in the standard panels (besides the story markers above).
CORE_NORMAL = [
    "Red Blood Cells", "Platelets", "Monocytes", "Eosinophils", "Basophils",
    "RDW", "MCH", "MCHC", "HDL Cholesterol", "Triglycerides",
    "Creatinine", "eGFR", "Urea", "Sodium", "Potassium", "Calcium",
    "Magnesium", "Total Protein", "Albumin", "Bilirubin Total",
    "Vitamin B12", "Folate", "Free T3",
]
# Extended markers only on the yearly deep panels (0, 4, 8).
EXTENDED = [
    "Testosterone Total", "Testosterone Free", "SHBG", "Estradiol",
    "Cortisol (morning)", "DHEA-S", "Zinc", "Lipoprotein(a)",
    "Omega-3 Index", "PSA Total", "Ferritin",
]
DEEP_PANELS = {0, 4, 8}
ACUTE_MARKERS = [
    "White Blood Cells", "Neutrophils", "Lymphocytes", "Monocytes",
    "Hemoglobin", "Platelets", "hs-CRP", "ESR", "Glucose (fasting)",
]

# Custom biomarkers (is_custom=1): name, category, unit, ref_low, ref_high, direction, aliases
CUSTOM_BIOMARKERS = [
    ("Coenzyme Q10", "Custom", "mg/L", 0.8, 1.6, "higher_better", ["coq10", "ubiquinone", "коэнзим q10"]),
    ("Vitamin K2 (MK-7)", "Custom", "nmol/L", 0.2, 1.0, "higher_better", ["mk-7", "menaquinone", "витамин k2"]),
    ("Free Androgen Index", "Custom", "%", 14.8, 95.0, "range", ["fai", "иса"]),
    ("Heart Rate Variability (HRV)", "Custom", "ms", 40.0, 100.0, "higher_better", ["hrv", "rmssd", "вариабельность пульса"]),
]
CUSTOM_STORY = {
    "Coenzyme Q10": [None, None, None, "low", N, N, None, N, N],   # CoQ10 supp later
    "Vitamin K2 (MK-7)": [None, None, None, N, N, N, None, N, N],
    "Free Androgen Index": [None, None, None, None, N, N, None, None, N],
    "Heart Rate Variability (HRV)": [None, None, None, "low", "low", N, None, N, N],
}


def jitter(seed_parts, lo, hi):
    """Deterministic pseudo-random fraction in [0,1) from a tuple key."""
    h = abs(hash(seed_parts)) % 1000
    return h / 1000.0


def round_value(v):
    a = abs(v)
    if a == 0:
        return 0.0
    if a < 1:
        return round(v, 3)
    if a < 10:
        return round(v, 2)
    if a < 100:
        return round(v, 1)
    return round(v, 0)


def value_for(level, lo, hi, key):
    """Resolve a level label into a concrete value using the real ref range."""
    has_lo = lo is not None and lo > 0
    has_hi = hi is not None and hi > 0
    if not has_lo and not has_hi:
        base = 1.0
        table = {"low": 0.5, N: 1.0, "high": 1.6, "critical_high": 2.5, "critical_low": 0.3}
        return round_value(base * table.get(level, 1.0))
    if not has_lo:  # only an upper bound (e.g. ESR, hs-CRP)
        table = {
            "low": hi * 0.05, N: hi * (0.25 + 0.4 * jitter(key, lo, hi)),
            "high": hi * 1.3, "critical_high": hi * 2.4, "critical_low": hi * 0.02,
        }
        return round_value(table.get(level, hi * 0.4))
    if not has_hi:  # only a lower bound
        table = {
            "low": lo * 0.8, N: lo * (1.1 + 0.4 * jitter(key, lo, hi)),
            "high": lo * 1.6, "critical_high": lo * 3.0, "critical_low": lo * 0.4,
        }
        return round_value(table.get(level, lo * 1.3))
    span = hi - lo
    table = {
        # multiplicative bounds keep values positive and correctly classified:
        # refLow*0.5 < low < refLow ; refHigh < high < refHigh*2
        "low": lo * 0.85,
        N: lo + span * (0.32 + 0.36 * jitter(key, lo, hi)),
        "high": hi * 1.15,
        "critical_high": hi * 2.3,
        "critical_low": lo * 0.4,
    }
    return round_value(table.get(level, lo + span * 0.5))


def compute_flag(v, lo, hi):
    if lo is not None and v < lo:
        return (1, "critical" if v < lo * 0.5 else "low")
    if hi is not None and v > hi:
        return (1, "critical" if v > hi * 2 else "high")
    return (0, None)


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DB
    if not os.path.exists(db_path):
        sys.exit(f"DB not found: {db_path}\nLaunch the Soma app once to create it, then re-run.")

    backup = f"{db_path}.bak-{datetime.now():%Y%m%d-%H%M%S}"
    shutil.copy2(db_path, backup)
    print(f"Backup → {backup}")

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # marker dictionary (built-in)
    markers = {}
    for r in cur.execute(
        "SELECT id, canonical_name, default_unit, ref_low, ref_high FROM biomarker"
    ):
        markers[r["canonical_name"]] = dict(
            id=r["id"], unit=r["default_unit"], lo=r["ref_low"], hi=r["ref_high"]
        )

    # ── wipe user data (preserve profile + built-in dictionary) ──────────────
    cur.execute("PRAGMA foreign_keys = OFF")
    for t in [
        "medication_log", "lab_result", "lab_panel", "medication", "prescription",
        "diagnosis", "allergy", "vaccine", "symptom_log", "imaging_record",
        "weight_log", "bp_log", "attachment", "visit",
    ]:
        cur.execute(f"DELETE FROM {t}")
    cur.execute("DELETE FROM biomarker WHERE is_custom = 1")
    cur.execute("DELETE FROM fts_records WHERE profile_id = ?", (PROFILE_ID,))
    con.commit()
    cur.execute("PRAGMA foreign_keys = ON")

    # ── enrich the profile (Profile + Emergency Card screens) ────────────────
    cur.execute(
        """UPDATE profile SET
            height_cm=?, weight_kg=?, target_weight_kg=?, blood_type=?, rh_factor=?,
            ethnicity=?, activity_level=?, smoking=?, alcohol=?, conditions=?,
            emergency_contact_name=?, emergency_contact_phone=?, emergency_contact_relation=?,
            citizenship=?, languages=?, insurer=?, insurance_policy_number=?, insurance_phone=?,
            emergency_notes=?, pregnancy_status=?, code_status=?, organ_donor=?
           WHERE id=?""",
        (
            182, 84, 78, "O", "positive",
            "Eastern European", "moderate", "former", "occasional",
            "Subclinical hypothyroidism; hyperlipidemia; seasonal allergic rhinitis",
            "Anna Portnova", "+7 916 555 0142", "spouse",
            "Russia", "Russian, English, Spanish",
            "SafetyWing Nomad Insurance", "SW-2024-7741920", "+1 415 555 9000",
            "No implants or pacemaker. ANAPHYLAXIS to penicillin and peanuts — carries EpiPen.",
            "not_pregnant", "full_code", 1,
            PROFILE_ID,
        ),
    )

    # ── custom biomarkers ────────────────────────────────────────────────────
    for name, cat, unit, lo, hi, direction, aliases in CUSTOM_BIOMARKERS:
        cur.execute(
            """INSERT INTO biomarker (canonical_name, category, aliases, default_unit,
                 ref_low, ref_high, direction, is_custom)
               VALUES (?,?,?,?,?,?,?,1)""",
            (name, cat, json.dumps(aliases), unit, lo, hi, direction),
        )
        markers[name] = dict(id=cur.lastrowid, unit=unit, lo=lo, hi=hi)

    # ── lab panels + results ─────────────────────────────────────────────────
    n_results = n_flagged = n_crit = 0
    for pi, (pdate, lab, city, country, fasting, ctime) in enumerate(PANELS):
        cur.execute(
            """INSERT INTO lab_panel (profile_id, date, lab_name, city, country,
                 panel_type, collection_time, fasting, import_method, notes)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (PROFILE_ID, pdate, lab, city, country, "blood", ctime, fasting,
             "ai" if pi in (1, 4) else "manual",
             "Urgent visit — suspected sinus infection" if pi == ACUTE else None),
        )
        panel_id = cur.lastrowid

        # which markers go in this panel
        names = set()
        if pi == ACUTE:
            names.update(ACUTE_MARKERS)
        else:
            names.update(CORE_NORMAL)
            names.update(stories.keys())
            if pi in DEEP_PANELS:
                names.update(EXTENDED)
            if pi >= 3:  # custom markers tracked from the 4th panel on
                names.update(CUSTOM_BIOMARKERS_NAMES)

        for name in names:
            m = markers.get(name)
            if not m:
                continue
            story = stories.get(name) or CUSTOM_STORY.get(name)
            level = story[pi] if story else N
            if level is None:
                continue
            key = (name, pi, pdate)
            v = value_for(level, m["lo"], m["hi"], key)

            # one not-evaluated corner case: CoQ10 reported in a non-convertible
            # unit (no molar mass known) → stays unnormalized. Value kept on the
            # same numeric scale so the trend chart isn't distorted by the gap.
            if name == "Coenzyme Q10" and pi == 3:
                cur.execute(
                    """INSERT INTO lab_result (panel_id, biomarker_id, value, unit,
                         unit_normalized, value_normalized, out_of_range, flag, raw_label)
                       VALUES (?,?,?,?,?,?,?,?,?)""",
                    (panel_id, m["id"], 1.1, "µmol/L", None, None, 0, None, "CoQ10 (µmol/L)"),
                )
                n_results += 1
                continue

            oor, flag = compute_flag(v, m["lo"], m["hi"])
            raw = {"ALT": "ALT (GPT)", "AST": "AST (GOT)", "TSH": "TSH 3rd gen"}.get(name)
            cur.execute(
                """INSERT INTO lab_result (panel_id, biomarker_id, value, unit,
                     unit_normalized, value_normalized, out_of_range, flag, raw_label)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (panel_id, m["id"], v, m["unit"], m["unit"], v, oor, flag, raw),
            )
            n_results += 1
            n_flagged += oor
            n_crit += 1 if flag == "critical" else 0

    # ── visits + prescriptions ───────────────────────────────────────────────
    visits = [
        ("2024-01-16", "Dr. Elena Smirnova", "Invitro Clinic", "Moscow", "Russia",
         "General practitioner", "Routine check-up. Fatigue, pallor — ordered iron panel and thyroid."),
        ("2024-08-12", "Dr. Marco Rossi", "Endocrinology Center", "Lisbon", "Portugal",
         "Endocrinologist", "Subclinical hypothyroidism confirmed. Started levothyroxine 50 mcg."),
        ("2025-02-03", "Dr. James Carter", "Heart Health Austin", "Austin", "USA",
         "Cardiologist", "Persistently high LDL/ApoB. Started atorvastatin 20 mg. Recheck in 4 months."),
        ("2025-03-02", "Dr. Priya Nair", "Austin Diabetes & Metabolism", "Austin", "USA",
         "Endocrinologist", "Prediabetes (HbA1c 6.1%). Started metformin 500 mg BID + lifestyle."),
        ("2025-09-08", "Dr. Sofia Lopez", "Quick Clinic", "Austin", "USA",
         "Urgent care", "Acute bacterial sinusitis. Amoxicillin 500 mg TID x10d. Chest X-ray clear."),
        ("2026-06-11", "Dr. Giorgi Beridze", "Tbilisi Wellness", "Tbilisi", "Georgia",
         "General practitioner", "Annual review. Markers well controlled; continue current regimen."),
    ]
    visit_ids = []
    for v in visits:
        cur.execute(
            """INSERT INTO visit (profile_id, date, doctor_name, clinic, city, country, specialty, notes)
               VALUES (?,?,?,?,?,?,?,?)""",
            (PROFILE_ID, *v),
        )
        visit_ids.append(cur.lastrowid)

    def add_prescription(visit_idx, drug, amt, unit, freq, days, refills, notes):
        cur.execute(
            """INSERT INTO prescription (visit_id, drug_name, dose_amount, dose_unit,
                 frequency, duration_days, refills, notes, source_links)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (visit_ids[visit_idx], drug, amt, unit, freq, days, refills, notes, "[]"),
        )
        return cur.lastrowid

    presc_levo = add_prescription(1, "Levothyroxine", 50, "mcg", "daily", 90, 3, "Take fasting, 30 min before breakfast.")
    presc_atorva = add_prescription(2, "Atorvastatin", 20, "mg", "daily", 90, 5, "Evening dose.")
    presc_metf = add_prescription(3, "Metformin", 500, "mg", "2x_daily", 90, 5, "With meals; titrate as tolerated.")
    presc_amox = add_prescription(4, "Amoxicillin", 500, "mg", "3x_daily", 10, 0, "Complete the full course.")

    # ── medications (overlap the lab timeline → visible overlays) ────────────
    def sched(freq, times=None, notes=None):
        s = {"frequency": freq}
        if times:
            s["times"] = times
        if notes:
            s["notes"] = notes
        return json.dumps(s)

    meds = [
        # name, type, amt, unit, schedule, as_needed, start, end, purpose, prescription_id
        ("Omega-3 Fish Oil", "supplement", 2, "g", sched("daily", ["09:00"], "with food"), 0, "2024-01-01", None, "Cardiovascular & cognitive support", None),
        ("Ferrous Bisglycinate", "supplement", 25, "mg", sched("daily", ["12:00"], "with vitamin C"), 0, "2024-02-10", "2024-09-30", "Iron-deficiency anemia", None),
        ("Vitamin D3", "supplement", 5000, "IU", sched("daily", ["09:00"]), 0, "2024-05-01", None, "Vitamin D deficiency", None),
        ("Magnesium Glycinate", "supplement", 400, "mg", sched("daily", ["22:00"], "before sleep"), 0, "2024-06-01", None, "Sleep & muscle cramps", None),
        ("Levothyroxine", "drug", 50, "mcg", sched("daily", ["07:00"], "fasting"), 0, "2024-08-15", None, "Subclinical hypothyroidism", presc_levo),
        ("Atorvastatin", "drug", 20, "mg", sched("daily", ["22:00"]), 0, "2025-02-01", None, "Hyperlipidemia (high LDL/ApoB)", presc_atorva),
        ("Metformin", "drug", 500, "mg", sched("2x_daily", ["08:00", "20:00"], "with meals"), 0, "2025-03-01", None, "Prediabetes", presc_metf),
        ("Creatine Monohydrate", "supplement", 5, "g", sched("daily", ["09:00"]), 0, "2025-01-01", None, "Strength & lean mass", None),
        ("Coenzyme Q10", "supplement", 100, "mg", sched("daily", ["09:00"]), 0, "2024-11-01", None, "Statin support / energy", None),
        ("Amoxicillin", "drug", 500, "mg", sched("3x_daily", ["08:00", "14:00", "20:00"]), 0, "2025-09-08", "2025-09-18", "Acute bacterial sinusitis", presc_amox),
        ("Ibuprofen", "drug", 400, "mg", sched("as_needed", None, "max 3/day with food"), 1, "2024-01-01", None, "Headache / pain (PRN)", None),
        ("Vitamin K2 (MK-7)", "supplement", 100, "mcg", sched("daily", ["09:00"]), 0, "2024-11-01", None, "Bone & arterial health", None),
    ]
    med_ids = {}
    for name, typ, amt, unit, schedule, prn, start, end, purpose, pid in meds:
        cur.execute(
            """INSERT INTO medication (profile_id, name, type, dose_amount, dose_unit,
                 schedule, as_needed, start_date, end_date, purpose, prescription_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (PROFILE_ID, name, typ, amt, unit, schedule, prn, start, end, purpose, pid),
        )
        med_ids[name] = cur.lastrowid

    # a few adherence log entries
    for d in ("2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18"):
        for mn in ("Vitamin D3", "Atorvastatin", "Metformin"):
            cur.execute(
                "INSERT INTO medication_log (medication_id, taken_at, taken) VALUES (?,?,1)",
                (med_ids[mn], f"{d}T08:00:00Z"),
            )

    # ── symptoms over time (severity 1–10) ───────────────────────────────────
    symptoms = [
        ("2024-01-14", None, "Fatigue", 7, "Tired all day, low energy"),
        ("2024-02-02", None, "Brain fog", 5, None),
        ("2024-03-18", None, "Headache", 6, "Relieved by ibuprofen"),
        ("2024-04-19", None, "Fatigue", 6, None),
        ("2024-07-09", None, "Fatigue", 4, "Improving since iron + vit D"),
        ("2024-09-21", None, "Cold hands", 3, None),
        ("2024-11-30", None, "Headache", 5, None),
        ("2025-01-11", None, "Fatigue", 3, "Much better"),
        ("2025-04-05", None, "Joint pain", 4, "Knees after running"),
        ("2025-06-17", None, "Insomnia", 5, "Hard to fall asleep"),
        ("2025-09-06", "21:30", "Fever", 8, "38.7°C, facial pressure"),
        ("2025-09-07", "08:00", "Sinus pain", 9, "Severe, throbbing"),
        ("2025-09-07", "08:05", "Headache", 8, None),
        ("2025-09-12", None, "Fatigue", 6, "Recovering from infection"),
        ("2025-12-01", None, "Headache", 4, None),
        ("2026-03-22", None, "Seasonal allergies", 5, "Sneezing, itchy eyes"),
        ("2026-06-09", None, "Fatigue", 2, "Baseline good"),
    ]
    for s in symptoms:
        cur.execute(
            """INSERT INTO symptom_log (profile_id, date, time, symptom_name, severity, notes)
               VALUES (?,?,?,?,?,?)""",
            (PROFILE_ID, *s),
        )

    # ── weight log (trending toward target 78) ───────────────────────────────
    weights = [
        ("2024-01-15", 88.4), ("2024-03-01", 87.6), ("2024-05-01", 86.9),
        ("2024-07-10", 86.0), ("2024-10-05", 85.2), ("2025-01-12", 84.8),
        ("2025-04-01", 84.1), ("2025-06-18", 83.6), ("2025-09-08", 84.3),
        ("2025-12-02", 83.1), ("2026-03-01", 82.4), ("2026-06-10", 81.7),
    ]
    for d, kg in weights:
        cur.execute(
            "INSERT INTO weight_log (profile_id, date, weight_kg, notes) VALUES (?,?,?,?)",
            (PROFILE_ID, d, kg, None),
        )

    # ── blood pressure log (normal → elevated → stage 2 → a crisis reading) ──
    bps = [
        ("2024-01-15", "08:15", 122, 78, 64, "sitting", "left", None),
        ("2024-06-01", "07:50", 128, 82, 60, "sitting", "left", None),
        ("2024-10-05", "09:00", 134, 86, 72, "sitting", "right", "After coffee"),
        ("2025-01-12", "08:10", 138, 88, 70, "sitting", "left", None),
        ("2025-06-18", "08:25", 145, 94, 76, "sitting", "left", "Stressful week"),
        ("2025-09-08", "14:35", 152, 96, 92, "sitting", "left", "Febrile, unwell"),
        ("2025-11-02", "21:00", 182, 116, 88, "sitting", "left", "Severe headache — ER visit"),
        ("2025-12-02", "07:45", 136, 85, 66, "sitting", "left", None),
        ("2026-03-15", "08:00", 129, 81, 62, "standing", "right", None),
        ("2026-06-10", "08:05", 124, 79, 60, "sitting", "left", "Back to normal"),
    ]
    for b in bps:
        cur.execute(
            """INSERT INTO bp_log (profile_id, date, time, systolic, diastolic,
                 heart_rate_bpm, position, arm_side, notes) VALUES (?,?,?,?,?,?,?,?,?)""",
            (PROFILE_ID, *b),
        )

    # ── diagnoses (active / remission / resolved) ────────────────────────────
    diagnoses = [
        ("Vitamin D deficiency", "E55.9", "2024-01-16", "resolved", "2024-10-05", None, "Repleted with D3."),
        ("Iron-deficiency anemia", "D50.9", "2024-01-16", "remission", "2024-10-05", 0, "Resolved after iron course."),
        ("Subclinical hypothyroidism", "E03.9", "2024-08-12", "active", None, 1, "On levothyroxine."),
        ("Mixed hyperlipidemia", "E78.2", "2025-02-03", "active", None, 2, "On atorvastatin."),
        ("Prediabetes", "R73.03", "2025-03-02", "active", None, 3, "On metformin + lifestyle."),
        ("Acute bacterial sinusitis", "J01.90", "2025-09-08", "resolved", "2025-09-22", 4, "10-day amoxicillin."),
        ("Seasonal allergic rhinitis", "J30.2", "2026-03-22", "active", None, None, "Spring pollen."),
        ("Hepatic steatosis (NAFLD)", "K76.0", "2024-07-10", "remission", "2025-12-02", None, "Improved with weight loss."),
    ]
    for name, icd, ddate, status, resolved, vidx, notes in diagnoses:
        cur.execute(
            """INSERT INTO diagnosis (profile_id, name, icd_code, date, status, resolved_date, visit_id, notes)
               VALUES (?,?,?,?,?,?,?,?)""",
            (PROFILE_ID, name, icd, ddate, status, resolved,
             visit_ids[vidx] if vidx is not None else None, notes),
        )

    # ── allergies (incl. anaphylactic) ───────────────────────────────────────
    allergies = [
        ("Penicillin", "drug", "anaphylactic", "Throat swelling, hives", "2008-05-12", "active", "Confirmed; carries EpiPen."),
        ("Peanuts", "food", "anaphylactic", "Anaphylaxis", "1996-09-01", "active", "Avoids all tree-nut cross-contamination."),
        ("Pollen (grass)", "environmental", "moderate", "Rhinitis, itchy eyes", "2015-04-01", "active", "Seasonal, spring."),
        ("Cat dander", "environmental", "mild", "Sneezing", "2012-01-01", "active", None),
        ("Shellfish", "food", "severe", "Swelling, vomiting", "2010-07-20", "active", None),
        ("Sulfa drugs", "drug", "moderate", "Rash", "2019-03-15", "resolved", "Tolerated last exposure."),
    ]
    for a in allergies:
        cur.execute(
            """INSERT INTO allergy (profile_id, allergen, category, severity, reaction, onset_date, status, notes)
               VALUES (?,?,?,?,?,?,?,?)""",
            (PROFILE_ID, *a),
        )

    # ── vaccines (multi-dose series + expiry) ────────────────────────────────
    vaccines = [
        ("Hepatitis B", "2024-01-20", "Engerix-B", "HB7741", 1, None, "Invitro", "Russia", "Series 1/3"),
        ("Hepatitis B", "2024-02-20", "Engerix-B", "HB7799", 2, None, "Invitro", "Russia", "Series 2/3"),
        ("Hepatitis B", "2024-07-22", "Engerix-B", "HB8120", 3, None, "DILA", "Argentina", "Series 3/3 — complete"),
        ("Yellow Fever", "2024-03-12", "Stamaril", "YF5521", 1, "2034-03-12", "Travel Clinic", "Russia", "Valid 10 years"),
        ("Tetanus-Diphtheria (Td)", "2024-05-02", "Adacel", "TD3301", 1, "2034-05-02", "Endocrinology Center", "Portugal", "Booster"),
        ("COVID-19", "2024-09-15", "Pfizer-BioNTech", "FX2208", 1, None, "Quest", "USA", "Updated booster"),
        ("Influenza", "2024-10-18", "Fluarix", "IN9921", 1, None, "Quest", "USA", "2024–25 season"),
        ("Influenza", "2025-10-22", "Fluarix", "IN1042", 1, None, "Tbilisi Wellness", "Georgia", "2025–26 season"),
        ("Rabies (pre-exposure)", "2024-06-05", "Verorab", "RB2210", 1, None, "Travel Clinic", "Thailand", "Pre-exposure 1/2"),
    ]
    for vc in vaccines:
        cur.execute(
            """INSERT INTO vaccine (profile_id, vaccine_name, date, manufacturer, batch_number,
                 dose, expires_at, administered_by, country, notes) VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (PROFILE_ID, *vc),
        )

    # ── imaging ──────────────────────────────────────────────────────────────
    imaging = [
        ("2024-07-10", "ultrasound", "Abdomen", "Mild hepatic steatosis (grade 1). No focal lesions.", "Dr. Pereira", "DILA", "Buenos Aires", "Argentina", 0),
        ("2024-08-12", "ultrasound", "Thyroid", "Slightly heterogeneous echotexture, no nodules. Consistent with thyroiditis.", "Dr. Costa", "Endocrinology Center", "Lisbon", "Portugal", 1),
        ("2025-03-20", "mri", "Brain", "No acute intracranial abnormality. Normal study.", "Dr. Whitfield", "Austin Imaging", "Austin", "USA", None),
        ("2025-09-08", "xray", "Chest", "Lungs clear. No consolidation. Heart size normal.", "Dr. Lopez", "Quick Clinic", "Austin", "USA", 4),
        ("2025-12-02", "ultrasound", "Abdomen", "Liver echotexture normalized. Steatosis resolved.", "Dr. Bianchi", "Policlinico Gemelli", "Rome", "Italy", None),
    ]
    for im in imaging:
        d, modality, area, findings, rad, clinic, city, country, vidx = im
        cur.execute(
            """INSERT INTO imaging_record (profile_id, date, modality_type, body_area, findings,
                 radiologist_name, clinic, city, country, visit_id) VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (PROFILE_ID, d, modality, area, findings, rad, clinic, city, country,
             visit_ids[vidx] if vidx is not None else None),
        )

    con.commit()

    def count(t):
        return cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]

    print("\nDemo data loaded:")
    print(f"  lab panels        {count('lab_panel')}")
    print(f"  lab results       {n_results}  (flagged {n_flagged}, critical {n_crit})")
    print(f"  custom biomarkers {cur.execute('SELECT COUNT(*) FROM biomarker WHERE is_custom=1').fetchone()[0]}")
    print(f"  medications       {count('medication')}")
    print(f"  prescriptions     {count('prescription')}")
    print(f"  visits            {count('visit')}")
    print(f"  diagnoses         {count('diagnosis')}")
    print(f"  allergies         {count('allergy')}")
    print(f"  vaccines          {count('vaccine')}")
    print(f"  imaging           {count('imaging_record')}")
    print(f"  symptoms          {count('symptom_log')}")
    print(f"  weight points     {count('weight_log')}")
    print(f"  BP readings       {count('bp_log')}")
    con.close()
    print("\nOpen the app — the command palette rebuilds the search index on open.")


# names of custom biomarkers, referenced above
CUSTOM_BIOMARKERS_NAMES = [c[0] for c in CUSTOM_BIOMARKERS]

if __name__ == "__main__":
    main()
