export const en = {
  // Navigation
  nav: {
    dashboard: "Dashboard",
    timeline: "Timeline",
    biomarkers: "Biomarkers",
    labResults: "Lab results",
    medications: "Medications",
    visits: "Visits",
    diagnoses: "Diagnoses",
    allergies: "Allergies",
    vaccines: "Vaccines",
    imaging: "Imaging",
    journal: "Journal",
    settings: "Settings",
    records: "Records",
    labsVitals: "Labs & Vitals",
    care: "Care",
  },

  // Theme
  theme: {
    lightMode: "Light mode",
    darkMode: "Dark mode",
    toggleTheme: "Toggle theme",
  },

  // Common actions
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    back: "Back",
    continue: "Continue",
    skipForNow: "Skip for now",
    export: "Export",
    import: "Import",
    remove: "Remove",
    close: "Close",
    select: "Select",
    selectModel: "Select model…",
    noMatches: "No matches",
    useCustomValue: 'Use "{{value}}"',
    search: "Search…",
    saveChanges: "Save changes",
    addVisit: "Add visit",
  },

  // Common field labels
  fields: {
    date: "Date",
    name: "Name",
    city: "City",
    country: "Country",
    type: "Type",
    notes: "Notes",
    unit: "Unit",
    value: "Value",
  },

  // Common categories
  categories: {
    custom: "Custom",
  },

  // Common status options
  status: {
    active: "Active",
    remission: "Remission",
    resolved: "Resolved",
  },

  // Common type options
  types: {
    blood: "Blood",
    urine: "Urine",
    other: "Other",
    supplement: "Supplement",
    drug: "Drug",
  },

  // Common frequency options
  frequency: {
    daily: "Daily",
    twiceDaily: "2× daily",
    thriceDaily: "3× daily",
    weekly: "Weekly",
    asNeeded: "As needed",
    custom: "Custom",
  },

  // Settings
  settings: {
    appearance: {
      title: "Appearance",
      description: "Language and theme.",
      language: "Language",
      theme: "Theme",
      light: "Light",
      dark: "Dark",
    },
    logs: {
      title: "Logs",
      description: "Application log with errors and diagnostics. Rotates at 10 MB.",
      open: "Open logs",
      error: "Could not open the log file.",
    },
    title: "Settings",
    description:
      "AI providers, profile and data export. Everything stays on this device unless you say otherwise.",

    // Language section
    language: {
      title: "Language",
      description: "Choose your preferred language",
      english: "English",
      russian: "Русский",
    },

    // Profile section
    profile: {
      title: "Profile",
      description:
        "Used for sex- and age-aware biomarker reference ranges. Single profile for now; multi-profile sharing comes later.",
      saveProfile: "Save profile",
      saved: "Saved ✓",
    },

    // AI Settings
    ai: {
      title: "AI analysis",
      description:
        "Off by default. Bring your own API key — it is stored in the OS keychain, never in the database or config files. Only multimodal models (vision + PDF) are offered, since the import pipeline reads photos and PDFs.",
      provider: "Provider",
      aiDisabled: "AI disabled",
      model: "Model (multimodal only)",
      customModel:
        "Custom model id (optional, overrides the list — must support vision + PDF input)",
      customModelPlaceholder: "e.g. a newer model id not in the registry yet",
      apiKeyFor: "API key for",
      checking: "checking…",
      storedInKeychain: "stored in keychain",
      notSet: "not set",
      saveKey: "Save key",
      testKey: "Test key",
      keyWorks: "Key works — model responded.",
      disclaimer:
        "AI output is never medical advice. Documents you import are sent to the selected provider only when you explicitly run an AI action.",
      aiDisclaimer:
        "AI-generated content. Not medical advice — always consult a qualified clinician.",
    },

    // Backup section
    backup: {
      title: "Cloud backup",
      // Note: BackupCard has its own complex content, leaving basic structure
    },

    // Export section
    export: {
      title: "Data export",
      description: "Everything is yours — full dump anytime, no lock-in.",
      exportAll: "Export all (JSON)",
      exportLabs: "Lab results (CSV)",
      exporting: "Exporting…",
    },
  },

  // Profile form fields
  profile: {
    fields: {
      name: "Name",
      dateOfBirth: "Date of birth",
      biologicalSex: "Biological sex",
      units: "Units",
      height: "Height",
      weight: "Weight",
      bloodGroup: "Blood group",
      rhFactor: "Rh factor",
      ethnicity: "Ethnicity",
      targetWeight: "Target weight",
      activityLevel: "Activity level",
      smoking: "Smoking",
      alcohol: "Alcohol",
      chronicConditions: "Chronic conditions",
    },
    options: {
      male: "Male",
      female: "Female",
      otherIntersex: "Other / intersex",
      metricSystem: "Metric (cm, kg)",
      imperialSystem: "Imperial (ft/in, lb)",
      positiveRh: "Positive (+)",
      negativeRh: "Negative (−)",
      sedentary: "Sedentary",
      lightlyActive: "Lightly active",
      moderatelyActive: "Moderately active",
      active: "Active",
      veryActive: "Very active",
      never: "Never",
      former: "Former",
      current: "Current",
      none: "None",
      occasional: "Occasional",
      moderate: "Moderate",
      heavy: "Heavy",
      bloodO: "O (I)",
      bloodA: "A (II)",
      bloodB: "B (III)",
      bloodAB: "AB (IV)",
    },
    descriptions: {
      sedentary: "Desk work, no regular exercise",
      lightlyActive: "Walks or light exercise 1–2× a week",
      moderatelyActive: "Exercise 2–4× a week",
      active: "Hard training 4–6× a week",
      veryActive: "Daily intense training or physical job",
      smokingFormer: "Quit — affects some ranges for years",
      alcoholOccasional: "A few drinks a month",
      alcoholModerate: "Up to ~7 drinks a week",
    },
    hints: {
      ethnicity: "Affects some reference ranges (e.g. eGFR, blood counts).",
      targetWeight: "Optional goal — shown as a target line on the weight chart in Journal.",
    },
    ethnicity: {
      white: "White / European",
      black: "Black / African",
      eastAsian: "East Asian",
      southAsian: "South Asian",
      southeastAsian: "Southeast Asian",
      centralAsian: "Central Asian",
      mena: "Middle Eastern / North African",
      hispanic: "Hispanic / Latino",
      nativeAmerican: "Native American / Indigenous",
      pacificIslander: "Pacific Islander",
      ashkenaziJewish: "Ashkenazi Jewish",
      caribbean: "Caribbean",
      mixed: "Mixed / multiracial",
      other: "Other",
    },
    placeholders: {
      ft: "ft",
      in: "in",
      cm: "cm",
      lb: "lb",
      kg: "kg",
      ethnicity: "e.g. East Asian, Black, White…",
      optional: "optional",
      chronicConditions: "e.g. Hypothyroidism, Type 2 diabetes… (free text)",
    },
  },

  // Onboarding
  onboarding: {
    welcomeTitle: "Welcome to Soma",
    welcomeDescription:
      "Your health record, on your terms — labs, medications and visits in one private timeline. A minute of setup lets Soma read your results against the reference ranges that actually apply to you.",
    privacyNote: "Everything you enter stays on this device — no account, no cloud, no tracking.",
    getStarted: "Get started",
    language: "Language",

    aboutYouTitle: "About you",
    aboutYouDescription:
      "Sex and age decide which reference ranges apply to your biomarkers — that's why these few are required.",

    fineTuningTitle: "Fine-tuning",
    fineTuningDescription:
      "Optional, and worth it: these refine a few reference ranges and help track goals. Skip anything — it's all editable later in Settings.",

    allSetTitle: "You're all set",
    allSetTitleWithName: "You're all set, {{name}}",
    allSetDescription:
      "Your profile is saved locally. Import a lab report, log what you take, and Soma starts connecting the dots.",
    tip: "Tip: overlay any medication on a biomarker chart to see whether what you take actually moves the numbers.",
    openDashboard: "Open dashboard",
  },

  // Page headers (will be used by PageHeader component)
  pages: {
    dashboard: {
      title: "Dashboard",
      description: "Your health at a glance — local, private, yours.",
    },
    timeline: {
      title: "Timeline",
      description: "All health events in chronological order",
    },
    biomarkers: {
      title: "Biomarkers",
      description: "Track lab values over time",
    },
    labs: {
      title: "Lab results",
      description: "Import and manage laboratory reports",
    },
    medications: {
      title: "Medications",
      description: "What you take and when",
    },
    visits: {
      title: "Medical visits",
      description: "Doctor appointments and consultations",
    },
    diagnoses: {
      title: "Diagnoses",
      description: "Medical conditions and diagnoses",
    },
  },

  // Loading states
  loading: {
    openingDatabase: "Opening local database…",
  },

  // Error states
  error: {
    databaseFailed: "Failed to open the local database",
  },

  // Labs page
  labs: {
    title: "Lab results",
    description: "Every blood draw and urine test, manually entered or AI-imported.",
    aiImport: "AI import",
    newPanel: "New panel",
    emptyTitle: "No lab panels yet",
    emptyDescription: "Enter results manually or import a PDF/photo of a lab report with AI.",
    addFirstPanel: "Add first panel",
    tableColumns: {
      date: "Date",
      lab: "Lab",
      location: "Location",
      type: "Type",
      results: "Results",
      outOfRange: "Out of range",
      source: "Source",
    },
    importSource: {
      ai: "AI",
      manual: "manual",
    },
  },

  // Timeline page
  timeline: {
    title: "Timeline",
    description: "Labs, visits, diagnoses and medication periods on one time scale.",
    ranges: {
      sixMonths: "6M",
      oneYear: "1Y",
      twoYears: "2Y",
      all: "All",
    },
    emptyTitle: "Timeline is empty",
    emptyDescription: "Events appear here as you add labs, medications, visits and diagnoses.",
    allEvents: "All events",
    eventKinds: {
      labs: "labs",
      medication: "medication",
      diagnosis: "diagnosis",
      visit: "visit",
      allergy: "allergy",
      vaccine: "vaccine",
      symptom: "symptom",
      imaging: "imaging",
    },
    outOfRange: "out of range",
    now: "now",
    symptomThreshold: "{{count}} minor symptom entries (severity < 6) hidden.",
    showAllSymptoms: "Show all",
    hideMinorSymptoms: "Hide minor symptoms",
  },

  // Lab panel detail page
  labPanelDetail: {
    backToLabs: "Lab results",
    aiImported: "AI imported",
    allInRange: "all in range",
    outOfRange: "out of range",
    deletePanel: "Delete panel",
    deletePanelTitle: "Delete this panel?",
    deletePanelDescription: "The panel and all its results will be removed. This cannot be undone.",
    panelNotFound: "Panel not found",
    tableColumns: {
      biomarker: "Biomarker",
      value: "Value",
      normalized: "Normalized",
      reference: "Reference",
      status: "Status",
      sourceLabel: "Source label",
    },
  },

  // Biomarkers page
  biomarkers: {
    title: "Biomarkers",
    description:
      "Reference dictionary with norm and optimal ranges. Click a biomarker to see its trend.",
    customBiomarker: "Custom biomarker",
    searchPlaceholder: "Search by name or alias…",
    withDataOnly: "With data only",
    emptySearchTitle: "Nothing matches",
    emptySearchDescription: "Try another search term.",
    custom: "custom",
    noData: "No data",
    createDialog: {
      title: "New custom biomarker",
      description: "For analytes not in the built-in dictionary.",
      nameLabel: "Name",
      namePlaceholder: "e.g. Omega-3 Index",
      categoryLabel: "Category",
      unitLabel: "Unit",
      unitPlaceholder: "e.g. %",
      refLowLabel: "Ref. low",
      refHighLabel: "Ref. high",
      directionLabel: "Direction",
      directionOptions: {
        range: "In range",
        higherBetter: "Higher better",
        lowerBetter: "Lower better",
      },
      aliasesLabel: "Aliases (comma-separated, any language)",
      aliasesPlaceholder: "synonym 1, синоним 2",
      create: "Create",
    },
  },

  // Medications page
  medications: {
    title: "Medications & supplements",
    description:
      "What you take, in what dose, and since when — overlayable on any biomarker trend.",
    emptyTitle: "Nothing tracked yet",
    emptyDescription:
      "Add drugs and supplements with doses and periods to correlate them with your labs.",
    addFirst: "Add first item",
    currentlyTaking: "Currently taking",
    past: "Past",
    addDialog: {
      titleAdd: "Add medication or supplement",
      titleEdit: "Edit medication",
    },
    doseUnits: {
      drops: "drops",
      tablets: "tablets",
      capsules: "capsules",
      sprays: "sprays",
    },
    fields: {
      dose: "Dose",
      frequency: "Frequency",
      scheduleNotesOptional: "Schedule notes (optional)",
      startDate: "Start date",
      endDateOptional: "End date (empty = ongoing)",
      purposeOptional: "Purpose (optional)",
    },
    actions: {
      stopToday: "Stop today",
    },
  },

  // Visits page
  visits: {
    title: "Doctor visits",
    description: "Consultations across clinics, cities and countries.",
    emptyTitle: "No visits yet",
    emptyDescription: "Log doctor consultations with diagnoses and prescriptions.",
    addFirst: "Add first visit",
    addDialog: {
      titleAdd: "New doctor visit",
      titleEdit: "Edit visit",
    },
    fields: {
      doctor: "Doctor",
      specialty: "Specialty",
      clinic: "Clinic",
      location: "Location",
    },
  },

  // Diagnoses page
  diagnoses: {
    title: "Diagnoses",
    description: "Active conditions and resolved history.",
    emptyTitle: "No diagnoses recorded",
    emptyDescription: "Track conditions with status: active, in remission or resolved.",
    addFirst: "Add first diagnosis",
    addDialog: {
      titleAdd: "Add diagnosis",
      titleEdit: "Edit diagnosis",
    },
    fields: {
      diagnosis: "Diagnosis",
      icd: "ICD",
      icdCodeOptional: "ICD code (optional)",
      status: "Status",
      notesOptional: "Notes (optional)",
      resolvedDate: "Resolved date",
    },
    sections: {
      active: "Active",
      remission: "Remission",
      resolved: "Resolved",
    },
    actions: {
      moveToRemission: "Move to remission",
      resolve: "Resolve",
      confirmResolve: "Confirm",
    },
  },

  // Allergies page
  allergies: {
    title: "Allergies",
    description: "Drug, food and environmental allergies with severity and reaction.",
    emptyTitle: "No allergies recorded",
    emptyDescription: "Track allergic reactions and intolerances.",
    addFirst: "Add first allergy",
    addDialog: {
      titleAdd: "Add allergy",
      titleEdit: "Edit allergy",
    },
    fields: {
      allergen: "Allergen",
      category: "Category",
      severity: "Severity",
      status: "Status",
      onsetDateOptional: "Onset date (optional)",
      reactionOptional: "Reaction (optional)",
      notesOptional: "Notes (optional)",
    },
    sections: {
      active: "Active",
      resolved: "Resolved",
    },
    actions: {
      resolve: "Resolve",
    },
    deleteAnaphylacticTooltip: "Anaphylactic allergy cannot be deleted — resolve it first.",
  },

  // Allergy category options
  allergyCategory: {
    drug: "Drug",
    food: "Food",
    environmental: "Environmental",
    other: "Other",
  },

  // Allergy severity options
  allergySeverity: {
    mild: "Mild",
    moderate: "Moderate",
    severe: "Severe",
    anaphylactic: "Anaphylactic",
  },

  allergySeverityDescription: {
    mild: "Discomfort, no treatment needed",
    moderate: "Needs antihistamines or treatment",
    severe: "Strong systemic reaction",
    anaphylactic: "Life-threatening — emergency epinephrine",
  },

  // Vaccines page
  vaccines: {
    title: "Vaccines",
    description: "Immunisation history with doses, batches and expiry dates.",
    emptyTitle: "No vaccines recorded",
    emptyDescription: "Log your immunisation history.",
    addFirst: "Add first vaccine",
    addDialog: {
      titleAdd: "Add vaccine record",
      titleEdit: "Edit vaccine record",
    },
    fields: {
      vaccineName: "Vaccine name",
      date: "Date",
      doseNumber: "Dose #",
      manufacturer: "Manufacturer",
      batchNumber: "Batch #",
      expiresOptional: "Expires (optional)",
      country: "Country",
      administeredByOptional: "Administered by (optional)",
      notesOptional: "Notes (optional)",
    },
    table: {
      date: "Date",
      dose: "Dose #",
      manufacturerBatch: "Manufacturer / Batch",
      country: "Country",
      administeredBy: "Administered by",
      expires: "Expires",
    },
    expired: "Expired",
  },

  // Backup card
  backup: {
    title: "Backups",
    description:
      "Encrypted snapshots of your database, saved into a folder your cloud client (iCloud Drive, Google Drive, Dropbox, OneDrive) already syncs. Soma never uploads anything itself and stores only encrypted .somabk files there — your live data never leaves this device.",
    setupBackups: "Set up backups",
    disable: "Disable",
    backupNow: "Back up now",
    backingUp: "Backing up…",
    restoreFromBackup: "Restore from backup…",
    destination: "Destination",
    frequency: "Frequency",
    lastBackup: "Last backup",
    noBackupYet: "No backup has run yet.",
    rotationNote: "Old snapshots are rotated automatically (newest 12 are kept).",
    lastAttemptFailed: "Last attempt failed",
    disableNote:
      "Disabling only stops future backups — existing snapshots and your passphrase are kept, so you can re-enable any time.",

    // Setup wizard
    setupStep: "Set up backups · step {{step}} of 3",
    step1Description: "Where should encrypted snapshots be saved?",
    step2Description: "Protect your backups with a passphrase.",
    step3Description: "How often should Soma back up?",

    // Step 1 - destination
    macosOnly: "macOS only",
    notFoundOnComputer: "Not found on this computer",
    detected: "Detected",
    chooseManually: "Choose a folder manually…",
    customWarning:
      "This folder is not one of the detected cloud folders. Backups saved here will only reach a cloud if something on this computer syncs this folder.",
    folderNotExist: "That folder does not exist.",
    folderNotWritable: "Soma cannot write into that folder — pick another one.",
    subfolderNote:
      "A Soma Backups subfolder is created inside, with a README explaining the files. Only encrypted snapshots go there — never your live data.",

    // Step 2 - passphrase
    passphraseTitle:
      "This passphrase encrypts every backup. It is stored only in this device's keychain.",
    passphraseWarning:
      "If you lose this device and the passphrase, your backups cannot be recovered — by anyone. Save it in your password manager now.",
    passphraseLabel: "Passphrase (min 8 characters)",
    passphraseRepeat: "Repeat passphrase",
    passphraseSaved: "I saved the passphrase somewhere safe",
    passphraseMinLength: "Use at least 8 characters.",
    passphraseMismatch: "Passphrases don't match.",

    // Step 3 - frequency
    backupFrequency: "Backup frequency",
    destinationSummary: "Destination:",
    catchupNote:
      "Soma also checks on every launch and catches up if a backup was missed. The newest 12 snapshots are kept; older ones are deleted automatically.",
    enableAndBackup: "Enable & back up now",

    // Restore dialog
    restoreTitle: "Restore from backup",
    restorePickDescription: "Pick a .somabk file and enter the passphrase it was encrypted with.",
    restoreReviewDescription: "Review the backup before replacing your data.",
    chooseBackupFile: "Choose backup file…",
    passphrase: "Passphrase",
    decryptedSize: "Decrypted size:",
    fileDate: "file date:",
    schema: "schema",
    appHas: "app has",
    newerVersionError:
      "This backup was made by a newer version of Soma. Update the app first, then restore.",
    olderSchemaNote:
      "The backup uses an older schema — it will be migrated automatically after the restart.",
    replaceWarningTitle: "This replaces your current database and restarts the app.",
    replaceWarningDescription:
      "A timestamped safety copy of the current database is kept next to it, so this can be undone manually if needed.",
    replaceAndRestart: "Replace data & restart",

    // Native dialogs
    chooseFolderDialogTitle: "Choose a backup folder",
    chooseBackupDialogTitle: "Choose a Soma backup",
    somaBackupFilter: "Soma backup",
  },

  // LabPanelNew page
  labPanelNew: {
    title: "New lab panel",
    description: "Manual entry of a lab draw.",
    selectBiomarker: "Select biomarker…",
    addRow: "Add row",
    savePanelSingular: "Save panel ({{count}} result)",
    savePanelPlural: "Save panel ({{count}} results)",
    panelTitle: "Panel",
    resultsTitle: "Results",
    fields: {
      labName: "Lab name",
      biomarker: "Biomarker",
    },
    removeRow: "Remove row",
    unitGroups: {
      compatible: "Convertible units",
      other: "Other units",
    },
    unitWarning:
      "Unknown conversion to {{unit}} — the value will be saved as entered, without normalization or an out-of-range flag.",
  },

  // BiomarkerDetail page
  biomarkerDetail: {
    biomarkerNotFound: "Biomarker not found",
    emptyTitle: "No results yet",
    emptyDescription: "Add a lab panel containing this biomarker to see the trend.",
    trendTitle: "Trend",
    allResultsTitle: "All results",
  },

  // ImportWizard page
  importWizard: {
    title: "AI import",
    description:
      "PDF or photo → extracted values → you confirm the mapping → saved. Nothing is written without your review.",
    notMapped: "— not mapped —",
    savingPanel: "Saving panel…",
    chooseLabReport: "Choose a lab report",
    reviewExtractedResults: "Review extracted results",
    matchColumn: "Match",
    panelDetailsTitle: "Panel details",
    aiDisabledTitle: "AI analysis is disabled",
    aiDisabledDescription:
      "To import lab reports from PDF or photos, enable AI analysis and paste your API key in Settings. Your documents are sent only to the provider you choose, only when you run an import.",
    openSettings: "Open Settings",
    selectType: {
      title: "What are you importing?",
      description: "Pick the document type so the AI knows what to look for.",
      continue: "Continue",
    },
    docTypes: {
      lab: "Lab report",
      labDescription: "Blood, urine and other quantitative results.",
      vaccine: "Vaccination certificate",
      vaccineDescription: "Vaccine doses, dates, manufacturers and batches.",
      discharge: "Discharge summary",
      dischargeDescription: "Visit, diagnoses and prescribed medications.",
    },
    reviewBanner: {
      title: "Requires 100% manual review",
      description:
        "Verify every entry against the original document before saving. Nothing here is auto-accepted.",
    },
    vaccineReview: {
      choose: "Choose a vaccination certificate",
      extracting: "Reading the certificate…",
      title: "Review extracted vaccines",
      description: "Tick the doses to keep and correct any field against the original.",
      saving: "Saving vaccines…",
      columns: {
        vaccine: "Vaccine name",
        dose: "Dose #",
        manufacturer: "Manufacturer",
        batch: "Batch",
        expires: "Expires",
      },
      empty: "No vaccine doses were found in the document.",
      save: "Save {{count}} vaccines",
    },
    dischargeReview: {
      choose: "Choose a discharge summary",
      extracting: "Reading the discharge summary…",
      title: "Review discharge summary",
      description: "Confirm the visit details and pick which records to save.",
      saving: "Saving records…",
      visitTitle: "Visit details",
      typeColumn: "Type",
      detailColumn: "Detail",
      diagnosisBadge: "diagnosis",
      medicationBadge: "medication",
      empty: "No diagnoses or medications were found in the document.",
      save: "Save {{count}} records",
    },
  },

  // Dashboard page
  dashboard: {
    noRecordsTitle: "No records yet",
    recentActivityTitle: "Recent activity",
    addLabResults: "Add lab results",
    stats: {
      labPanels: "Lab panels",
      outOfRangeLatest: "Out of range (latest panel)",
      activeMedications: "Active medications",
      lastLabDraw: "Last lab draw",
    },
    recentActivity: {
      description: "Add your first lab panel, medication or doctor visit to get started.",
    },
  },

  // VisitDetail page
  visitDetail: {
    visitNotFound: "Visit not found",
    deleteVisit: "Delete visit",
    deleteVisitTitle: "Delete this visit?",
    deleteVisitDescription:
      "Prescriptions of this visit are removed; linked diagnoses are kept but unlinked.",
    addPrescription: "Add prescription",
    diagnosesTitle: "Diagnoses",
    prescriptionsTitle: "Prescriptions",
    fields: {
      prescription: "Prescription",
      drugName: "Drug / supplement",
      durationDays: "Duration (days)",
      days: "days",
    },
  },

  // Full-text search + command palette
  search: {
    title: "Search",
    open: "Search",
    placeholder: "Search records…",
    timelineFilter: "Filter events…",
    esc: "Esc",
    hint: "Type to search your health records",
    noResults: 'No results for "{{query}}"',
    footer: "↑↓ navigate · Enter open · Esc close",
    types: {
      biomarker: "Biomarker",
      lab_panel: "Lab",
      visit: "Visit",
      diagnosis: "Diagnosis",
      medication: "Medication",
      allergy: "Allergy",
      vaccine: "Vaccine",
      symptom: "Symptom",
      imaging: "Imaging",
    },
  },

  // Emergency card
  emergency: {
    title: "Emergency card",
    description: "A printable summary of critical health information for first responders.",
    exportHtml: "Export HTML",
    openCard: "Emergency card",
    incompleteBanner: "Blood type or emergency contact is missing — this card may be incomplete.",
    updateProfile: "Update profile →",
    exportError: "Could not export the emergency card. Please try again.",
    sections: {
      identity: "Identity",
      contact: "Emergency contact",
      allergies: "Allergies",
      medications: "Active medications",
      diagnoses: "Active diagnoses",
      vaccines: "Recent vaccines",
    },
    identity: {
      name: "Name",
      dob: "Date of birth",
      age: "Age",
      ageValue: "{{years}} years",
      sex: "Sex",
      bloodType: "Blood type",
    },
    contact: {
      name: "Name",
      phone: "Phone",
      relation: "Relation",
      empty: "No emergency contact set — add one in Settings.",
    },
    allergies: {
      allergen: "Allergen",
      severity: "Severity",
      reaction: "Reaction",
      resolved: "Resolved",
      none: "No known allergies recorded.",
    },
    medications: {
      name: "Medication",
      dose: "Dose",
      schedule: "Schedule",
      since: "Since",
      none: "No active medications.",
    },
    diagnoses: {
      name: "Diagnosis",
      icd: "ICD",
      date: "Date",
      none: "No active diagnoses.",
    },
    vaccines: {
      name: "Vaccine",
      date: "Date",
      dose: "Dose",
      doseValue: "#{{n}}",
      expires: "Expires",
      expired: "Expired",
      none: "No vaccines recorded.",
    },
    footer:
      "Generated by Soma on {{date}}. Contains data as of export time. Always verify with treating physician.",
    settings: {
      title: "Emergency contact",
      description: "Surfaced on the emergency card for first responders.",
      name: "Contact name",
      phone: "Phone",
      relation: "Relation",
      save: "Save contact",
      saved: "Saved",
    },
  },

  // Journal page (weight / blood pressure / symptoms)
  journal: {
    title: "Journal",
    description: "Track weight, blood pressure and symptoms over time.",
    tabs: {
      weight: "Weight",
      bp: "Blood pressure",
      symptoms: "Symptoms",
    },
  },

  weight: {
    chartTitle: "Weight trend",
    targetLabel: "Target",
    logWeight: "Log weight",
    emptyTitle: "No weight entries yet",
    emptyDescription: "Log your weight to see how it trends over time.",
    addFirst: "Log first weight",
    table: {
      date: "Date",
      weight: "Weight",
      notes: "Notes",
    },
    dialog: {
      titleAdd: "Log weight",
      titleEdit: "Edit weight entry",
    },
    fields: {
      weight: "Weight",
      notesOptional: "Notes (optional)",
    },
  },

  bp: {
    chartTitle: "Blood pressure trend",
    systolic: "Systolic",
    diastolic: "Diastolic",
    logReading: "Log reading",
    emptyTitle: "No blood-pressure readings yet",
    emptyDescription: "Log a reading to track systolic and diastolic over time.",
    addFirst: "Log first reading",
    crisisBanner:
      "A reading in the last 7 days is in the hypertensive-crisis range (systolic > 180 or diastolic > 120). If you have symptoms such as chest pain, shortness of breath or vision changes, seek emergency medical attention.",
    status: {
      stage2: "Stage 2",
      crisis: "Crisis",
    },
    crisisHint: "This value is in the hypertensive-crisis range.",
    table: {
      date: "Date",
      time: "Time",
      reading: "Reading",
      pulse: "Pulse",
      status: "Status",
      notes: "Notes",
    },
    dialog: {
      titleAdd: "Log blood pressure",
      titleEdit: "Edit reading",
    },
    fields: {
      timeOptional: "Time (optional)",
      systolic: "Systolic",
      diastolic: "Diastolic",
      heartRate: "Heart rate",
      position: "Position",
      arm: "Arm",
      notesOptional: "Notes (optional)",
    },
    position: {
      sitting: "Sitting",
      standing: "Standing",
      supine: "Supine",
    },
    arm: {
      left: "Left",
      right: "Right",
    },
  },

  symptoms: {
    thresholdLabel: "Showing severity ≥ {{n}}",
    showAll: "Show all",
    logSymptom: "Log symptom",
    emptyTitle: "No symptoms logged yet",
    emptyDescription: "Log symptoms with a severity to spot patterns over time.",
    addFirst: "Log first symptom",
    previouslyLogged: "Previously logged",
    table: {
      date: "Date",
      time: "Time",
      symptom: "Symptom",
      severity: "Severity",
      notes: "Notes",
    },
    dialog: {
      titleAdd: "Log symptom",
      titleEdit: "Edit symptom",
    },
    fields: {
      symptomName: "Symptom",
      timeOptional: "Time (optional)",
      severity: "Severity",
      notesOptional: "Notes (optional)",
    },
    namePlaceholder: "e.g. Headache, Fatigue",
  },

  symptomSeverity: {
    "1": "1 — Minimal",
    "2": "2 — Very mild",
    "3": "3 — Mild",
    "4": "4 — Mild-moderate",
    "5": "5 — Moderate",
    "6": "6 — Moderate-severe",
    "7": "7 — Severe",
    "8": "8 — Very severe",
    "9": "9 — Intense",
    "10": "10 — Incapacitating",
  },

  // Imaging records
  imaging: {
    title: "Imaging",
    description: "X-ray, CT, MRI, ultrasound and other imaging studies.",
    newRecord: "New record",
    emptyTitle: "No imaging records yet",
    emptyDescription: "Add an imaging study to keep your radiology history in one place.",
    addFirst: "Add first record",
    back: "Imaging",
    table: {
      date: "Date",
      modality: "Modality",
      bodyArea: "Body area",
      facility: "Facility",
      visit: "Visit",
    },
    newTitle: "New imaging record",
    editTitle: "Edit imaging record",
    newDescription: "Record an imaging study and its findings.",
    studyDetailsTitle: "Study details",
    findingsTitle: "Findings",
    delete: "Delete record",
    fields: {
      date: "Date",
      modality: "Modality",
      bodyArea: "Body area",
      facility: "Facility",
      city: "City",
      country: "Country",
      visit: "Visit",
      findings: "Findings",
      radiologist: "Radiologist",
    },
    bodyAreaPlaceholder: "e.g. Lumbar spine, Chest",
    noVisit: "No linked visit",
    visitLabel: "{{date}} — {{doctor}}",
    visitLabelNoDoctor: "{{date}} — visit",
  },

  imagingModality: {
    xray: "X-ray",
    ct: "CT",
    mri: "MRI",
    ultrasound: "Ultrasound",
    pet: "PET",
    other: "Other",
  },

  biomarkerSymptoms: {
    toggle: "Symptoms",
  },
} as const;

export type TranslationKeys = typeof en;
