export const en = {
  // Navigation
  nav: {
    dashboard: "Dashboard",
    timeline: "Timeline",
    assistant: "AI assistant",
    biomarkers: "Biomarkers",
    labResults: "Lab results",
    medications: "Medications",
    visits: "Visits",
    diagnoses: "Diagnoses",
    allergies: "Allergies",
    vaccines: "Vaccines",
    imaging: "Imaging",
    journal: "Journal",
    lifestyle: "Lifestyle",
    notifications: "Notifications",
    report: "Doctor report",
    settings: "Settings",
    records: "Records",
    labsVitals: "Labs & Vitals",
    care: "Care",
    showAll: "Show all sections",
    showFewer: "Show fewer",
    manageSections: "Manage sections",
    aiNeedsSetup: "Set up",
  },

  // AI analysis (v0.3)
  aiAnalysis: {
    title: "AI assistant",
    description: "Ask about your biomarkers, medications and diagnoses.",
    stubTitle: "AI is turned off",
    stubDescription: "Add an API key in Settings to enable AI analysis.",
    openSettings: "Open settings",
    empty: "Ask about your trends, medications, or recent lab results.",
    starter1: "What do my latest lab results say?",
    starter2: "Which of my markers are out of range, and why does it matter?",
    starter3: "Are there any interactions between my medications?",
    placeholder: "Ask about your health…",
    inputHint: "Enter to send, Shift+Enter for a new line. Not medical advice.",
    thinking: "Thinking…",
    retry: "Retry",
    stop: "Stop",
    clear: "Clear chat",
    viewContext: "What the assistant can see",
    contextExplainer:
      "This summary of your record is sent with each question. Names are omitted. Nothing else leaves your device.",
  },
  aiInterpretation: {
    title: "AI interpretation",
    prompt: "Get a plain-language read on this trend, accounting for your medications and ranges.",
    button: "Interpret trend",
    loading: "Analyzing…",
    retry: "Retry",
    regenerate: "Regenerate",
    cached: "Saved from your last run",
    errorAuth: "API key was rejected. Check your AI settings.",
    errorGeneric: "Couldn't get a response. Please try again.",
  },

  // Medication adherence log
  adherence: {
    title: "Adherence",
    markTaken: "Mark taken today",
    markSkipped: "Skipped today",
    loggedToday: "Logged for today",
    taken: "Taken",
    skipped: "Skipped",
    streak: "{{count}}-day streak",
    windowSummary: "{{pct}}% over the last {{days}} days",
    noLogs: "No intake logged yet.",
    delete: "Delete entry",
  },

  // Theme
  theme: {
    lightMode: "Light mode",
    darkMode: "Dark mode",
    toggleTheme: "Toggle theme",
  },

  // Common actions
  dialog: {
    discardTitle: "Discard changes?",
    discardBody: "You have unsaved changes. Closing now will lose them.",
    discard: "Discard",
    keepEditing: "Keep editing",
  },
  errors: {
    pageTitle: "This page couldn't load",
    pageBody:
      "Something went wrong while loading your data. The error was written to the log file (Settings → Open logs).",
    retry: "Retry",
    actionFailed: "That action couldn't be completed. Please try again.",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    back: "Back",
    continue: "Continue",
    skipForNow: "Skip for now",
    dismiss: "Dismiss",
    export: "Export",
    import: "Import",
    remove: "Remove",
    close: "Close",
    select: "Select",
    undo: "Undo",
    resume: "Resume",
    expand: "Expand",
    collapse: "Collapse",
    selectModel: "Select model…",
    noMatches: "No matches",
    useCustomValue: 'Use "{{value}}"',
    search: "Search…",
    saveChanges: "Save changes",
    addVisit: "Add visit",
    validation: {
      endBeforeStart: "The end date can't be before the start date.",
      resolvedBeforeStart: "The resolved date can't be before the diagnosis date.",
      expiryBeforeDose: "The expiry date can't be before the date given.",
      futureBirthDate: "Birth date can't be in the future.",
      bpOrder: "Systolic should be higher than diastolic — check the values.",
    },
  },

  // Common field labels
  poweredBy: {
    prefix: "Powered by",
  },

  fields: {
    date: "Date",
    name: "Name",
    city: "City",
    country: "Country",
    type: "Type",
    sampleTypes: "Sample types",
    cost: "Cost",
    costHint: "What you paid for the whole check-up (USD).",
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
    stool: "Stool",
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

  // Toast notifications (success feedback for mutations)
  toasts: {
    added: "Added: {{name}}",
    updated: "Updated: {{name}}",
    deleted: "Deleted: {{name}}",
    saved: "Saved",
    profileSaved: "Profile saved",
    apiKeyRemoved: "API key removed",
    medStopped: "Stopped: {{name}}",
    medResumed: "Resumed: {{name}}",
    dxRemission: "Moved to remission: {{name}}",
    dxResolved: "Marked resolved: {{name}}",
    allergyResolved: "Marked resolved: {{name}}",
    panelSaved: "Lab panel saved",
    importSaved: "Import saved",
  },

  // Settings
  settings: {
    sections: {
      title: "Sidebar sections",
      description: "Choose which areas appear in the sidebar.",
    },
    dashboard: {
      title: "Dashboard layout",
      description:
        "Choose which cards appear on your home screen. Hidden cards stay reachable from the sidebar — this only changes the dashboard.",
      widgets: {
        safetyBanner: {
          label: "Critical allergy banner",
          desc: "The red strip warning of severe or life-threatening allergies.",
        },
        verdict: {
          label: "Health verdict",
          desc: 'The "all calm" / "needs attention" summary line.',
        },
        stats: {
          label: "Quick stats",
          desc: "Lab panels, out-of-range count, active meds and last draw.",
        },
        attention: {
          label: "Needs attention",
          desc: "Rolled-up biomarker, diagnosis, medication and vaccine alerts.",
        },
        review: {
          label: "Review queue",
          desc: "Imported lab panels still waiting for you to confirm.",
        },
        changes: {
          label: "Notable changes",
          desc: "What moved since your previous lab panel.",
        },
        activity: {
          label: "Recent activity",
          desc: "Your latest records across labs, meds, diagnoses and more.",
        },
      },
      safetyConfirm: {
        title: "Hide the critical-allergy banner?",
        body: "This banner warns of severe, life-threatening allergies at a glance. It will still appear on your Emergency Card — but it won't show on the dashboard anymore.",
        confirm: "Hide it",
      },
    },
    reset: {
      title: "Reset personalization",
      description:
        "Bring back every sidebar section and dashboard card, unmute all notifications, and restore dismissed reminders and tips. Your health data is not touched.",
      action: "Reset personalization",
      done: "Personalization reset to defaults.",
      confirm: {
        title: "Reset personalization?",
        body: "Sidebar sections, dashboard cards, notification preferences, and dismissed reminders and tips all return to their defaults. This doesn't affect any of your records.",
      },
    },
    appearance: {
      title: "Appearance",
      description: "Language and theme.",
      language: "Language",
      theme: "Theme",
      light: "Light",
      dark: "Dark",
      system: "System",
    },
    updates: {
      title: "Updates",
      description: "Installed version: v{{version}}",
      loadingVersion: "Reading installed version…",
      checking: "Checking GitHub Releases…",
      check: "Check again",
      available: "Soma v{{version}} is available.",
      current: "You're up to date. Latest release: v{{version}}.",
      noReleases: "No published releases yet.",
      error: "Couldn't check GitHub Releases. Check your connection and try again.",
      newVersion: "New version",
      openRelease: "View v{{version}}",
      allReleases: "All releases",
      manual: "Updates are downloaded from GitHub and installed manually.",
    },
    logs: {
      title: "Logs",
      description: "Application log with errors and diagnostics. Rotates at 10 MB.",
      open: "Open logs",
      error: "Could not open the log file.",
    },
    mcp: {
      title: "AI assistant access (MCP)",
      description:
        "Let an AI assistant on this Mac read and update your Soma data through the Model Context Protocol. The server runs locally and reads soma.db directly — nothing leaves your device and no token is needed.",
      intro:
        "Pick your assistant, copy the config into the file shown, and restart the assistant. The Soma tools (labs, medications, trends…) then appear automatically.",
      serverPath: "Server binary",
      notBuilt:
        "The MCP server binary isn't bundled yet. Run `pnpm mcp:sidecar` (dev) or rebuild the app, then reopen this screen.",
      pathLabel: "Path",
      whereToAdd: "Add to",
      cliShortcut: "Or run in a terminal:",
      copy: "Copy",
      copied: "Copied",
      copyPath: "Copy path",
      installAllDetected: "Install for all detected",
      install: "Install",
      update: "Update",
      installed: "Installed",
      reinstall: "Re-install",
      detected: "detected",
      notFound: "not found",
      installedToast: "Written to {{path}} — restart {{client}} to load Soma.",
      installErr: "Couldn't write config: {{msg}}",
      manualShow: "Manual setup (copy config yourself)",
      manualHide: "Hide manual setup",
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
      getApiKey: "Create API key",
      recommendTitle: "Which model should I pick?",
      recommendBody:
        "Best value: Google Gemini (Flash tier — has a free tier and reads PDFs directly). Best accuracy: Anthropic Claude (Sonnet). One key for many models: OpenRouter. Tip: Gemini and Claude read PDFs natively; with OpenAI/OpenRouter, clear photos work most reliably.",
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
      "Your health record, on your terms — labs, medications and visits in one private timeline. A minute of setup lets Soma read your results against what's actually normal for someone like you.",
    privacyNote: "Everything you enter stays on this device — no account, no cloud, no tracking.",
    getStarted: "Get started",
    language: "Language",

    aboutYouTitle: "About you",
    aboutYouDescription:
      "Soma uses your sex and age to know which results count as normal for you — that's the only reason these few are required.",

    fineTuningTitle: "Fine-tuning",
    fineTuningDescription:
      "Optional, and worth it: these refine a few reference ranges and help track goals. Skip anything — it's all editable later in Settings.",

    allSetTitle: "You're all set",
    allSetTitleWithName: "You're all set, {{name}}",
    allSetDescription:
      "Your profile is saved locally. Import a lab report, log what you take, and Soma starts connecting the dots.",
    tip: "Tip: overlay any medication on a biomarker chart to see whether what you take actually moves the numbers.",
    openDashboard: "Open dashboard",
    disclaimer:
      "Soma organizes your records — it isn't a medical device and gives no medical advice.",
    restore: "I already have a backup",
    interestsTitle: "What do you want to track?",
    interestsDescription:
      "Pick the areas you care about. The rest stay out of the sidebar — turn them back on anytime in Settings.",
    interestsHint: "Labs, biomarkers and your timeline are always on.",
    groups: {
      meds: { label: "Medications & supplements", desc: "Doses, schedules, intake periods" },
      conditions: { label: "Visits & diagnoses", desc: "Doctor visits, diagnoses, prescriptions" },
      allergies: { label: "Allergies & emergency", desc: "Allergy records and emergency card" },
      vaccines: { label: "Vaccines", desc: "Records, series and travel guidance" },
      imaging: { label: "Imaging", desc: "X-ray, CT, MRI, ultrasound reports" },
      vitals: { label: "Journal & lifestyle", desc: "Weight, blood pressure, sleep, stress" },
      ai: { label: "AI assistant & import", desc: "Chat and photo/PDF import" },
    },
  },

  gettingStarted: {
    title: "Get started",
    description: "A few steps to make Soma useful.",
    importLab: "Import or add your first lab report",
    addMed: "Add a medication or supplement",
    enableAi: "Turn on AI import & assistant (optional)",
    cta: "Open",
    skip: "Skip setup",
  },

  hints: {
    overlayTitle: "Tip: overlay medications on the chart",
    overlayBody:
      "Toggle any medication below to see its intake period as a band over the trend — spot whether what you take actually moves the marker.",
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

  // Lab comparison (two panels side by side)
  labCompare: {
    title: "Compare lab dates",
    description: "See two panels side by side and what changed between them.",
    button: "Compare",
    panelA: "First panel",
    panelB: "Second panel",
    selectPrompt: "Pick two lab panels to compare.",
    samePanel: "Pick two different panels.",
    needTwoPanels: "You need at least two lab panels to compare.",
    columns: {
      biomarker: "Biomarker",
      change: "Change",
      status: "Status",
    },
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
    description: "Your labs against medications, weight and vitals — one configurable time scale.",
    layersTitle: "Layers",
    shiftHint:
      "Highlighted lab dots mark panels where a biomarker shifted strongly vs the previous one.",
    shiftCount: "{{count}} notable change(s) vs previous",
    medsMore: "+{{count}} more medications",
    medsLess: "Show fewer medications",
    legend: {
      title: "Legend",
      outOfRange: "Lab out of range",
      shiftWatch: "Notable shift",
      shiftAlert: "Out of range / critical shift",
      bpNormal: "BP normal",
      bpStage1: "BP elevated",
      bpStage2: "BP stage 2",
      bpCrisis: "BP crisis",
      today: "Today",
    },
    layers: {
      lab_panel: "Labs",
      medication: "Medications",
      weight: "Weight",
      bp: "Blood pressure",
      symptom: "Symptoms",
      visit: "Visits",
      diagnosis: "Diagnoses",
      vaccine: "Vaccines",
      allergy: "Allergies",
      imaging: "Imaging",
    },
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
    deletePanelDescription:
      "The panel and all its results will be removed. You can undo right after.",
    deletedToast: "Panel deleted.",
    panelNotFound: "Panel not found",
    tableColumns: {
      biomarker: "Biomarker",
      value: "Value",
      change: "Δ since previous",
      normalized: "Normalized",
      reference: "Reference",
      status: "Status",
      sourceLabel: "Source label",
    },
  },

  // Cross-panel correlation ("what changed since last time")
  insights: {
    title: "Notable changes",
    sinceLast: "Compared with your previous results for each biomarker.",
    dashboardTitle: "What changed",
    dashboardSince: "Notable shifts in your latest panel ({{date}}) vs the time before.",
    baseline:
      "First reading for these biomarkers — future imports will be compared against this baseline.",
    allStable: "No notable changes since last time — values held steady.",
    since: "since {{date}}",
    unitChanged: "Units differ from the previous reading — change not comparable.",
    unitChangedShort: "units ≠",
    howTitle: "How is this decided?",
    howBody:
      "A change is flagged when it crosses the reference range, reaches a critical level, moves more than ~40% of the range width, or changes by ~50%+ relative to last time. Green means it moved toward the healthy direction; red means away from it.",
    trajectory: {
      improved: "improved",
      worsened: "worsened",
      neutral: "changed",
    },
    reason: {
      became_out_of_range: "moved out of range",
      worsened_critical: "reached a critical level",
      back_in_range: "back in range",
      large_move: "changed sharply",
      moved_within_range: "shifted (still in range)",
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
    optimal: "optimal",
    inRange: "in range",
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
      noRangeWarning:
        "Without a reference range this biomarker will never be flagged out of range.",
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
    editDialog: {
      action: "Edit ranges",
      title: "Edit dictionary entry",
      refLowLabel: "Ref. low",
      refHighLabel: "Ref. high",
      optimalLowLabel: "Optimal low",
      optimalHighLabel: "Optimal high",
      aliasesLabel: "Aliases (comma- or newline-separated, any language)",
      aliasesPlaceholder: "synonym 1, синоним 2",
      refOrderError: "Reference low can't be higher than reference high.",
      optimalOrderError: "Optimal low can't be higher than optimal high.",
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
    timeline: {
      title: "Intake timeline",
      now: "now",
    },
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
      resume: "Resume",
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
    timeline: {
      title: "Condition timeline",
    },
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
    drugGuardWarning: "⚠ {{allergen}} — you have a {{severity}} allergy",
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
    expiry: {
      lifetime: "Lifetime validity — no expiry (WHO).",
      suggest: "Suggested validity: {{date}} — tap to use",
    },
    recordsTitle: "Recorded vaccines",
    timeline: {
      title: "Vaccination timeline",
    },
    calendar: {
      title: "Vaccine calendar",
      subtitle: "WHO reference schedule",
      description:
        "Antigen-based and country-independent. National schedules differ — this is a WHO reference baseline, not medical advice.",
      addBirthDate:
        "Add your date of birth in the profile to see personal due / action-needed status.",
      summaryClear: "Nothing needs action right now.",
      actionable: "{{n}} need action",
      due: "{{n}} due",
      doseN: "Dose {{n}}",
      next: "next {{date}}",
      protects: "Protects against {{disease}}",
      status: {
        done: "Done",
        due: "Due",
        overdue: "Overdue",
        upcoming: "Upcoming",
        contextual: "As needed",
        not_recorded: "Not recorded",
      },
      tiers: {
        universal: "Childhood series",
        special: "Common additional",
        regional: "Regional",
        risk: "Risk groups & travel",
      },
      tierBlurbs: {
        universal:
          "Usually completed in childhood. Mark or import these if you had them — unrecorded ones are not overdue.",
        special: "Often added depending on the country and your history.",
        regional: "Travel-relevant — informational, depends on where you go.",
        risk: "Travel-relevant — informational, depends on destination and exposure.",
      },
    },
  },

  // OS keychain availability (API keys + backup passphrase)
  keychain: {
    unavailableTitle: "OS keychain unavailable",
    unavailableLinux:
      "Soma keeps API keys and your backup passphrase in the Linux Secret Service, so nothing sensitive is written to disk in the open. No keyring service is responding right now. Install and start one (e.g. gnome-keyring or KWallet), then re-check — everything else in Soma keeps working without it.",
    unavailableGeneric:
      "Soma couldn't reach your OS keychain ({{backend}}). Make sure it's available, then re-check.",
    recheck: "Re-check",
    saveFailed: "Couldn't save to the OS keychain. See the notice above, then re-check.",
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
      collectionTime: "Draw time",
      fasting: "Fasting",
      cycleDay: "Cycle day",
      notes: "Context / method",
    },
    fasting: { yes: "Fasting", no: "Non-fasting", unknown: "Unknown" },
    notesPlaceholder: "e.g. 2h post-meal, assay method, lab certification",
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
    allBiomarkers: "All biomarkers",
    reference: "Reference",
    optimal: "Optimal",
    higherBetter: "higher is better",
    lowerBetter: "lower is better",
    trendDescription:
      "Shaded bands: reference and optimal ranges. Toggle medications below to overlay intake periods and correlate them with shifts.",
  },

  // Trend chart (biomarker line + overlays)
  trendChart: {
    unitsNotRecognized:
      "Units not recognized — values shown in their raw units and not range-checked.",
    pointsHidden: "{{count}} point(s) hidden: unit not recognized, can't be plotted on this scale.",
    outOfRange: "out of range ({{flag}})",
    severityShort: "severity {{value}}/10",
    symptomLegend:
      "Vertical marks are logged symptoms; the number is severity on a 1–10 scale (color = intensity). Hover a mark for details.",
  },

  // "About this marker" reference card
  biomarkerInfo: {
    title: "About this marker",
    summaryLabel: "What it is",
    highLabel: "If elevated",
    lowLabel: "If low",
    affectsLabel: "What it affects",
    disclaimer:
      "Reference information only — not a diagnosis. Causes are possible, not definitive. Rely on your doctor's guidance for interpretation.",
  },

  // ImportWizard page
  importWizard: {
    title: "AI import",
    description:
      "PDF or photo → extracted values → you confirm the mapping → saved. Nothing is written without your review.",
    notMapped: "— not mapped —",
    translatedHint:
      "Matched via the AI's English translation, not the printed label — double-check it's the right biomarker (e.g. LDL vs total cholesterol).",
    savingPanel: "Saving panel…",
    chooseLabReport: "Choose a lab report",
    anyLangHint: "Any language, any lab, any country — scans and photos included.",
    chooseAnother: "Choose another",
    extractResults: "Extract results",
    fileFormats: "PDF, JPG, PNG or WebP",
    chooseFile: "Choose file",
    privacyNotice:
      "The selected document is sent in full to your configured AI provider for extraction. Everything else stays on your device.",
    extractingMapping: "Extracting and mapping…",
    extractingMappingDetail:
      "Phase 1: structured extraction. Phase 2: matching against your biomarker dictionary (exact → alias → fuzzy → AI disambiguation).",
    reviewExtractedResults: "Review extracted results",
    matchColumn: "Match",
    panelDetailsTitle: "Panel details",
    duplicateBadge: "duplicate",
    duplicateGroupHint:
      "Two rows mapped to the same biomarker. The best match is kept by default — pick another if needed.",
    duplicatesUnresolved:
      "{{count}} biomarker(s) still have duplicate rows selected — keep only one each.",
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
      dischargeDescription: "Visit, diagnoses, medications and allergies.",
      imaging: "Imaging report",
      imagingDescription: "Radiology studies — X-ray, CT, MRI, ultrasound — and findings.",
      prescription: "Prescription",
      prescriptionDescription: "Prescribed drugs and supplements with dose and schedule.",
      allergy: "Allergy record",
      allergyDescription: "Allergies and intolerances with reaction and severity.",
    },
    choosePrompt: "Choose a {{type}}",
    extractingDoc: "Reading the document…",
    verifyBadge: "verify",
    reviewBanner: {
      title: "Requires 100% manual review",
      description:
        "Verify every entry against the original document before saving. Nothing here is auto-accepted.",
    },
    vaccineReview: {
      choose: "Choose a vaccination certificate",
      extracting: "Reading the certificate…",
      title: "Review extracted vaccines",
      description:
        "Each dose is matched to a vaccine in your calendar — confirm the match, tick the doses to keep, and correct any field against the original.",
      saving: "Saving vaccines…",
      selectAll: "Select all",
      noMatch: "No match",
      columns: {
        vaccine: "Printed name",
        match: "Matched vaccine",
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
      allergyBadge: "allergy",
      empty: "No diagnoses, medications or allergies were found in the document.",
      save: "Save {{count}} records",
    },
    imagingReview: {
      title: "Review imaging studies",
      description: "Tick the studies to keep and correct any field against the report.",
      empty: "No imaging studies were found in the document.",
      columns: {
        date: "Date",
        modality: "Modality",
        bodyArea: "Body area",
        findings: "Findings",
        facility: "Facility",
      },
      save: "Save {{count}} studies",
    },
    prescriptionReview: {
      title: "Review prescribed medications",
      description: "Tick the medications to keep and correct dose, type and schedule.",
      empty: "No medications were found in the document.",
      columns: {
        name: "Medication",
        type: "Type",
        dose: "Dose",
        schedule: "Schedule",
        purpose: "Purpose",
      },
      duplicate: "already tracked",
      duplicateHint: "A medication with this name is already in your list.",
      save: "Save {{count}} medications",
    },
    allergyReview: {
      title: "Review allergies",
      description: "Tick the allergies to keep and confirm category and severity.",
      empty: "No allergies were found in the document.",
      columns: {
        allergen: "Allergen",
        category: "Category",
        severity: "Severity",
        reaction: "Reaction",
      },
      duplicate: "already recorded",
      duplicateHint: "An allergy to this allergen is already recorded.",
      save: "Save {{count}} allergies",
    },
  },

  // Source-document linking (the original file an import came from)
  sourceFile: {
    title: "Source document",
    attached: "Source file",
    open: "Open original",
    openInApp: "View original",
    openExternally: "Open in default app",
    revealInFinder: "Show in folder",
    page: "Page {{n}}",
    fromPage: "from page {{n}}",
    none: "No source file",
    manualEntry: "Entered manually — no source document.",
    missing: "The original file could not be found. It may have been moved or deleted.",
    previewUnsupported: "Inline preview isn't available for this file type.",
    pdf: "PDF document",
    image: "Image",
    close: "Close",
    loading: "Loading document…",
  },

  // Persistent "needs verification" state for uncertain AI mappings
  needsReview: {
    badge: "{{count}} to review",
    one: "1 result needs review",
    many: "{{count}} results need review",
    panelTitle: "Some results need your review",
    panelDescription:
      "These mappings were uncertain — open the original document, check each value, and confirm.",
    rowHint: "Uncertain — verify against the source",
    confirm: "Confirm",
    confirmRow: "Confirm mapping",
    confirmAll: "Confirm all",
    reviewed: "Verified",
    allReviewed: "All results verified",
    verifyAction: "Review & verify",
    // Global indicator (dashboard / nav)
    globalTitle: "Imports awaiting review",
    globalOne: "1 import has unverified results",
    globalMany: "{{count}} imports have unverified results",
    globalCta: "Review now",
    confirmedToast: "Marked as verified",
  },

  // Side-by-side verify screen (document ⟷ extracted values)
  verify: {
    title: "Verify import",
    description: "Compare each extracted value against the original document.",
    sourcePane: "Original document",
    resultsPane: "Extracted results",
    onlyUncertain: "Only rows needing review",
    showAll: "Show all rows",
    confirm: "Confirm",
    confirmAll: "Confirm all remaining",
    edit: "Edit mapping",
    done: "Done",
    backToPanel: "Back to panel",
    empty: "Nothing left to verify.",
    jumpToPage: "Go to page {{n}}",
  },

  // Typed AI import errors (replaces the single generic banner)
  importErrors: {
    authTitle: "API key rejected",
    authBody: "Your AI provider rejected the key. Check it in Settings.",
    authAction: "Open Settings",
    rateLimited: "The provider is rate-limiting requests.",
    overloaded: "The AI provider is overloaded.",
    retrying: "Temporary issue — retrying ({{attempt}}/{{max}})…",
    network: "Couldn't reach the AI provider. Check your connection.",
    retry: "Try again",
    badDocumentTitle: "No results found",
    badDocumentBody:
      "We couldn't find any values in this file. Is it the right document type, or is the scan readable?",
    switchType: "Change document type",
    truncatedTitle: "Document may be too large",
    truncatedBody:
      "The response was cut off, so some results may be missing. Review carefully or split the file.",
    parseFailed: "The AI returned an unreadable response. Try again.",
    tooLarge:
      "The document is too large for the AI provider. Try splitting the PDF or importing fewer pages at a time.",
    fileTooLarge:
      "This file is larger than {{limit}} MB — too big to send to the AI provider. Split the PDF or use a smaller scan.",
    badRequest:
      "The AI provider rejected the request. The selected model may not accept PDFs or images — pick a vision-capable model in Settings.",
    droppedRows: "{{count}} non-numeric row(s) were skipped (e.g. positive/negative, titres).",
    showDropped: "Show skipped rows",
    dateNotRecognized: "Couldn't read the collection date — defaulted to today. Please set it.",
    genericTitle: "Import failed",
  },

  // Dashboard page
  dashboard: {
    noRecordsTitle: "No records yet",
    recentActivityTitle: "Recent activity",
    fullTimeline: "Full timeline",
    addLabResults: "Add lab results",
    importLab: "Import lab report",
    empty: {
      title: "Your dashboard is hidden",
      description: "You've turned off every dashboard card. Turn some back on to fill this screen.",
      cta: "Choose cards",
    },
    stats: {
      labPanels: "Lab panels",
      outOfRangeLatest: "Out of range (latest panel)",
      activeMedications: "Active medications",
      lastLabDraw: "Last lab draw",
    },
    recentActivity: {
      description: "Add your first lab panel, medication or doctor visit to get started.",
    },
    verdict: {
      calm: "Everything looks normal",
      attentionOne: "1 thing needs your attention",
      attentionMany: "{{count}} things need your attention",
    },
    safety: {
      label: "Critical allergy",
    },
    attention: {
      title: "Needs attention",
      biomarkersOne: "1 biomarker worsened in your latest panel",
      biomarkersMany: "{{count}} biomarkers worsened in your latest panel",
      diagnosesOne: "1 active diagnosis: {{names}}",
      diagnosesMany: "{{count}} active diagnoses: {{names}}",
      medsEndingOne: "1 medication ends soon: {{names}}",
      medsEndingMany: "{{count}} medications end soon: {{names}}",
      vaccinesOne: "1 vaccine needs action",
      vaccinesMany: "{{count}} vaccines need action",
      reviewOne: "1 import has unverified results",
      reviewMany: "{{count}} imports have unverified results",
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
    medicationsTitle: "Medications",
    noMedications: "No medications linked to this visit.",
  },

  // Diagnosis detail page
  diagnosisDetail: {
    notFound: "Diagnosis not found",
    detailsTitle: "Details",
  },

  // Medication detail page
  medicationDetail: {
    notFound: "Medication not found",
    detailsTitle: "Details",
    endDate: "End date",
  },

  // Cross-entity "Related" blocks (visit ↔ diagnosis ↔ medication)
  related: {
    title: "Related",
    fromVisit: "From visit",
    treatedBy: "Treated by",
    treats: "Treats",
    prescribedAt: "Prescribed at",
    visit: "Visit",
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
    exportPdf: "Export PDF",
    openCard: "Emergency card",
    incompleteBanner: "Blood type or emergency contact is missing — this card may be incomplete.",
    updateProfile: "Update profile →",
    exportError: "Could not export the emergency card. Please try again.",
    sections: {
      identity: "Identity",
      criticalStatus: "Critical status",
      contact: "Emergency contact",
      insurance: "Insurance & assistance",
      notes: "Important notes",
      allergies: "Allergies",
      medications: "Active medications",
      diagnoses: "Active diagnoses",
      vaccines: "Recent vaccines",
    },
    criticalStatus: {
      pregnancy: "Pregnancy",
      codeStatus: "Resuscitation",
      organDonor: "Organ donor",
      yes: "Yes",
      no: "No",
      pregnancyValues: {
        not_pregnant: "Not pregnant",
        pregnant: "Pregnant",
        postpartum: "Postpartum",
        unknown: "Unknown",
      },
      codeStatusValues: {
        full_code: "Full code",
        dnr: "DNR (do not resuscitate)",
        dni: "DNI (do not intubate)",
      },
    },
    identity: {
      name: "Name",
      dob: "Date of birth",
      age: "Age",
      ageValue: "{{years}} years",
      sex: "Sex",
      bloodType: "Blood type",
      citizenship: "Citizenship",
      languages: "Languages",
    },
    insurance: {
      insurer: "Insurer",
      policyNumber: "Policy #",
      phone: "24/7 assistance",
    },
    emptyInsurance: "No insurance recorded — add in Settings.",
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
      asNeededTitle: "As needed (PRN)",
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
      title: "Emergency info",
      description: "Surfaced on the emergency card for first responders.",
      name: "Contact name",
      phone: "Phone",
      relation: "Relation",
      citizenship: "Citizenship",
      citizenshipPlaceholder: "e.g. Russia",
      languages: "Languages",
      languagesPlaceholder: "e.g. Russian, English",
      insurer: "Insurer",
      policyNumber: "Policy #",
      assistancePhone: "Assistance phone",
      notes: "Critical notes",
      notesHint: "Critical info for first responders: pacemaker, implants, transfusion refusal…",
      pregnancy: "Pregnancy",
      codeStatus: "Resuscitation",
      organDonor: "Organ donor",
      notSet: "Not specified",
      save: "Save",
      saved: "Saved",
    },
  },

  // Journal page (weight / blood pressure / symptoms)
  journal: {
    title: "Journal",
    description: "Track weight, blood pressure and symptoms over time.",
    tabs: {
      overview: "Overview",
      weight: "Weight",
      bp: "Blood pressure",
      symptoms: "Symptoms",
    },
    overview: {
      activity: "Activity log",
      noData: "No entries in this range",
      emptyTitle: "Nothing logged yet",
      emptyDescription:
        "Log weight, blood pressure or symptoms and they will appear here together.",
      entries: "{{n}} logged",
      pulse: "{{n}} bpm",
      ranges: {
        "3m": "3M",
        "6m": "6M",
        "1y": "1Y",
        all: "All",
      },
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

  weightGoal: {
    set: "Set goal",
    titleAdd: "Set a weight goal",
    titleEdit: "Edit weight goal",
    description:
      "Draws a glide path from your starting weight to the target, so you can see whether you are tracking ahead or behind.",
    startWeight: "Starting weight",
    startDate: "Start date",
    targetWeight: "Target weight",
    targetDate: "Target date",
    save: "Set goal",
    remove: "Remove goal",
    removedToast: "Weight goal removed",
    today: "Today",
    planLabel: "Plan",
    ahead: "{{v}} ahead",
    behind: "{{v}} behind",
    onTrack: "on track",
    expired: "deadline passed",
    upcoming: "not started yet",
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

  breadcrumb: {
    back: "Back",
    labPanelNew: "New panel",
    importWizard: "AI import",
    verify: "Verify",
    imagingNew: "New study",
    imagingEdit: "Edit study",
  },

  // Lifestyle context (sleep / training / stress) — v0.3 AI enrichment
  lifestyle: {
    title: "Lifestyle",
    description:
      "Daily sleep, training and stress — context that sharpens your trends and AI analysis.",
    logToday: "Log today",
    logEntry: "Log day",
    emptyTitle: "No lifestyle entries yet",
    emptyDescription:
      "Log how you slept, trained and felt. It enriches your trends and the AI assistant.",
    addFirst: "Log your first day",
    aiNote:
      "Your logged lifestyle context is included in the AI assistant and trend interpretation.",
    windowNote: "Averages over the last {{days}} days, from {{count}} logged day(s).",
    noWindowData: "No entries in the last {{days}} days.",
    cards: {
      sleep: "Sleep",
      training: "Training",
      stress: "Stress & energy",
    },
    metrics: {
      avgSleep: "Avg sleep",
      avgSleepQuality: "Sleep quality",
      trainingLoad: "Training",
      trainingDays: "{{count}} day(s)",
      avgStress: "Avg stress",
      avgEnergy: "Avg energy",
      restingHr: "Resting HR",
      steps: "Avg steps",
      hours: "{{n}} h",
      minutes: "{{n}} min",
      perWeek: "{{n}} / wk",
      scale5: "{{n}}/5",
      bpm: "{{n}} bpm",
      noData: "—",
    },
    fields: {
      date: "Date",
      sleepHours: "Sleep (hours)",
      sleepQuality: "Sleep quality",
      trainingMinutes: "Training (minutes)",
      trainingIntensity: "Intensity",
      steps: "Steps",
      restingHeartRate: "Resting heart rate",
      stressLevel: "Stress level",
      energyLevel: "Energy level",
      notesOptional: "Notes (optional)",
      notSet: "—",
    },
    intensity: {
      light: "Light",
      moderate: "Moderate",
      intense: "Intense",
    },
    scale: {
      "1": "1 — very low",
      "2": "2 — low",
      "3": "3 — moderate",
      "4": "4 — high",
      "5": "5 — very high",
    },
    table: {
      date: "Date",
      sleep: "Sleep",
      training: "Training",
      stress: "Stress",
      energy: "Energy",
      notes: "Notes",
    },
    dialog: {
      titleAdd: "Log lifestyle day",
      titleEdit: "Edit lifestyle day",
    },
    integrations: {
      title: "Connected sources",
      comingSoon: "Coming soon",
      body: "Apple Health, Google Fit and Health Connect sync is on the roadmap. For now, enter sleep, training and stress by hand — the data model is already shaped for an automatic sync later.",
      docNote: "See docs/health-data-integrations.md for the integration design.",
    },
  },

  // Notifications feed (in-app only — never an OS notification)
  notifications: {
    title: "Notifications",
    description:
      "Medication nudges and scheduled re-tests — in-app only, nothing leaves your device.",
    emptyTitle: "You're all caught up",
    emptyDescription: "Medication reminders and due re-tests will appear here.",
    feedTitle: "Feed",
    prefs: {
      title: "What you get notified about",
      description: "Mute categories you don't want. Applies to the feed and the bell badge.",
      medication: {
        label: "Medication reminders",
        desc: "Daily nudge for standing medications you haven't logged yet.",
      },
      retest: {
        label: "Re-test reminders",
        desc: "Alerts when a scheduled marker or panel is due to be re-checked.",
      },
      retestUpcoming: {
        label: "Include upcoming re-tests",
        desc: "Show re-tests due soon too — turn off to only get due and overdue ones.",
      },
    },
    dismiss: "Dismiss",
    dismissed: "Dismissed",
    showDismissed: "Show dismissed ({{count}})",
    hideDismissed: "Hide dismissed",
    restore: "Restore",
    medication: {
      title: "Take {{name}}",
      due: "Scheduled for today — not logged yet",
      atTimes: "At {{times}}",
      open: "Medications",
    },
    retest: {
      title: "{{label}} re-test",
      dueToday: "Due today",
      due: "Due {{date}}",
      overdue: "Overdue by {{days}} day(s)",
      upcoming: "Due in {{days}} day(s)",
      noAnchor: "Set a last-tested date to start the cadence",
      open: "Open",
    },
    schedules: {
      title: "Re-testing schedules",
      description: "Set a cadence to be reminded to re-check a marker every few months.",
      add: "Add schedule",
      emptyTitle: "No re-test schedules",
      emptyDescription: "Add a marker or panel you want to re-check on a regular cadence.",
      every: "Every {{n}} month(s)",
      nextDue: "Next due",
      lastTested: "Last tested",
      status: "Status",
      active: "Active",
      paused: "Paused",
      pause: "Pause",
      resume: "Resume",
      table: {
        label: "What",
        every: "Cadence",
        lastTested: "Last tested",
        nextDue: "Next due",
        status: "Status",
      },
      dialog: {
        titleAdd: "Add re-test schedule",
        titleEdit: "Edit re-test schedule",
      },
      fields: {
        label: "Label",
        labelPlaceholder: "e.g. Lipid panel, Vitamin D, TSH",
        biomarker: "Linked biomarker (optional)",
        biomarkerNone: "None",
        intervalMonths: "Re-test every (months)",
        lastTestedDate: "Last tested (optional)",
        notesOptional: "Notes (optional)",
      },
    },
  },

  // Doctor report (PDF generator)
  doctorReport: {
    title: "Doctor report",
    description: "Generate a clean PDF summary of your record to share with a clinician.",
    intro:
      "A printable summary of your current problems, medications, allergies and recent results. Built locally on your device — nothing is uploaded.",
    generate: "Generate PDF",
    generating: "Generating…",
    rangeLabel: "Time range for history",
    range: {
      last6m: "Last 6 months",
      last12m: "Last 12 months",
      all: "All time",
      custom: "Custom",
    },
    from: "From",
    to: "To",
    sectionsLabel: "Include sections",
    sections: {
      diagnoses: "Diagnoses",
      medications: "Medications",
      allergies: "Allergies",
      labs: "Lab results",
      visits: "Visits",
      imaging: "Imaging",
      vaccines: "Vaccines",
      lifestyle: "Lifestyle",
    },
    saved: "Report saved",
    cancelled: "Export cancelled",
    pdf: {
      title: "Health summary",
      preparedFor: "Prepared for {{name}}",
      generatedOn: "Generated {{date}}",
      rangeAll: "Full history",
      rangeFromTo: "{{from}} – {{to}}",
      rangeUpTo: "Up to {{to}}",
      rangeFrom: "From {{from}}",
      none: "None recorded",
      identity: {
        heading: "Patient",
        dob: "Date of birth",
        age: "{{years}} y",
        sex: "Sex",
        bloodType: "Blood type",
      },
      diagnoses: {
        heading: "Diagnoses",
        active: "Active",
        inactive: "Past / resolved",
        since: "since {{date}}",
      },
      medications: {
        heading: "Medications",
        current: "Current",
        asNeeded: "As needed",
        past: "Past",
        since: "since {{date}}",
        until: "until {{date}}",
      },
      allergies: {
        heading: "Allergies",
        resolved: "resolved",
      },
      abnormal: {
        heading: "Out-of-range markers (latest)",
      },
      labs: {
        heading: "Lab results",
        panel: "{{name}} · {{date}}",
        panelNoName: "Lab panel · {{date}}",
        marker: "Marker",
        value: "Value",
        reference: "Reference",
        outOfRange: "out of range",
      },
      visits: {
        heading: "Visits",
      },
      imaging: {
        heading: "Imaging",
      },
      vaccines: {
        heading: "Vaccines",
        dose: "dose {{n}}",
      },
      lifestyle: {
        heading: "Lifestyle context",
        summary: "Averages over {{count}} logged day(s)",
        sleep: "Sleep {{n}} h",
        sleepQuality: "Sleep quality {{n}}/5",
        training: "Training {{n}} min total",
        stress: "Stress {{n}}/5",
        energy: "Energy {{n}}/5",
        restingHr: "Resting HR {{n}} bpm",
      },
      flags: {
        low: "low",
        high: "high",
        critical: "critical",
      },
      disclaimer:
        "Generated by Soma from self-entered data. This is a personal summary, not an official medical record, and not medical advice. Verify against source documents.",
    },
  },

  // At-rest database encryption (optional)
  dbEncryption: {
    title: "Database encryption",
    description: "Encrypt your local database at rest. Optional, off by default.",
    statusOff: "Off",
    statusOn: "On",
    on: "Encryption is on",
    off: "Your database is not encrypted at rest.",
    howItWorks:
      "When enabled, Soma keeps your database encrypted on disk (Argon2id + AES-256-GCM) whenever the app is closed, and decrypts it on launch. Data is only in the clear while the app is running.",
    modeLabel: "Unlock mode",
    modeKeychain: "Automatic (OS keychain)",
    modeKeychainDesc:
      "The key lives in your OS keychain; Soma unlocks automatically at launch. Protects against offline disk theft. Lowest friction.",
    modePassphrase: "Passphrase on launch",
    modePassphraseDesc:
      "You type a passphrase each launch; the key is never written to disk. Strongest — resists a compromised keychain.",
    passphrase: "Passphrase",
    passphraseConfirm: "Confirm passphrase",
    passphraseHint: "At least 8 characters. There is no recovery if you forget it.",
    enable: "Enable encryption",
    disable: "Turn off encryption",
    enabling: "Enabling…",
    disabling: "Turning off…",
    changeMode: "Change mode",
    warning:
      "If you forget your passphrase, your encrypted data cannot be recovered — by anyone, including the Soma developers.",
    mismatch: "Passphrases don't match.",
    tooShort: "Passphrase must be at least 8 characters.",
    enabledToast: "Database encryption enabled",
    disabledToast: "Database encryption turned off",
    modeChangedToast: "Unlock mode updated",
    error: "Could not change encryption settings",
    requiresKeychainNote:
      "Encryption stores its key in the OS keychain, so a working keychain is required.",
  },

  // Unlock gate (passphrase mode, shown before the app loads)
  unlock: {
    title: "Unlock Soma",
    description: "Enter your database passphrase to decrypt your health data.",
    passphrase: "Passphrase",
    unlock: "Unlock",
    unlocking: "Unlocking…",
    wrong: "Wrong passphrase — try again.",
    error: "Could not unlock the database.",
    forgot:
      "Forgot it? Encrypted data can't be recovered without the passphrase. You can restore from an unencrypted backup or start fresh.",
  },
} as const;

export type TranslationKeys = typeof en;
