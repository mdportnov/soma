export const ru = {
  // Navigation
  nav: {
    dashboard: "Главная",
    timeline: "Временная шкала",
    biomarkers: "Биомаркеры",
    labResults: "Анализы",
    medications: "Лекарства",
    visits: "Визиты",
    diagnoses: "Диагнозы",
    allergies: "Аллергии",
    vaccines: "Прививки",
    imaging: "Снимки",
    journal: "Дневник",
    settings: "Настройки",
    records: "Записи",
    labsVitals: "Анализы и показатели",
    care: "Лечение",
  },

  // Theme
  theme: {
    lightMode: "Светлая тема",
    darkMode: "Тёмная тема",
    toggleTheme: "Переключить тему",
  },

  // Common actions
  common: {
    save: "Сохранить",
    cancel: "Отменить",
    delete: "Удалить",
    edit: "Редактировать",
    add: "Добавить",
    back: "Назад",
    continue: "Продолжить",
    skipForNow: "Пропустить",
    export: "Экспорт",
    import: "Импорт",
    remove: "Удалить",
    close: "Закрыть",
    select: "Выбрать",
    undo: "Отменить",
    selectModel: "Выберите модель…",
    noMatches: "Нет совпадений",
    useCustomValue: "Использовать «{{value}}»",
    search: "Поиск…",
    saveChanges: "Сохранить изменения",
    addVisit: "Добавить визит",
  },

  // Common field labels
  fields: {
    date: "Дата",
    name: "Название",
    city: "Город",
    country: "Страна",
    type: "Тип",
    notes: "Заметки",
    unit: "Единица",
    value: "Значение",
  },

  // Common categories
  categories: {
    custom: "Пользовательский",
  },

  // Common status options
  status: {
    active: "Активно",
    remission: "Ремиссия",
    resolved: "Решено",
  },

  // Common type options
  types: {
    blood: "Кровь",
    urine: "Моча",
    other: "Другое",
    supplement: "Добавка",
    drug: "Лекарство",
  },

  // Common frequency options
  frequency: {
    daily: "Ежедневно",
    twiceDaily: "2× в день",
    thriceDaily: "3× в день",
    weekly: "Еженедельно",
    asNeeded: "По необходимости",
    custom: "Индивидуально",
  },

  // Settings
  settings: {
    appearance: {
      title: "Внешний вид",
      description: "Язык и тема оформления.",
      language: "Язык",
      theme: "Тема",
      light: "Светлая",
      dark: "Тёмная",
      system: "Системная",
    },
    logs: {
      title: "Логи",
      description: "Журнал приложения с ошибками и диагностикой. Ротация при 10 МБ.",
      open: "Открыть логи",
      error: "Не удалось открыть файл логов.",
    },
    mcp: {
      title: "Доступ для ИИ-ассистента (MCP)",
      description:
        "Позвольте ИИ-ассистенту на этом Mac читать и обновлять данные Soma через Model Context Protocol. Сервер работает локально и читает soma.db напрямую — ничего не покидает устройство, токен не нужен.",
      intro:
        "Выберите ассистента, скопируйте конфиг в указанный файл и перезапустите ассистента. Инструменты Soma (анализы, лекарства, тренды…) появятся автоматически.",
      serverPath: "Бинарь сервера",
      notBuilt:
        "Бинарь MCP-сервера ещё не собран. Выполните `pnpm mcp:sidecar` (в dev) или пересоберите приложение и откройте этот экран заново.",
      pathLabel: "Путь",
      whereToAdd: "Добавьте в",
      cliShortcut: "Или выполните в терминале:",
      copy: "Скопировать",
      copied: "Скопировано",
      copyPath: "Скопировать путь",
      installAllDetected: "Установить во все найденные",
      install: "Установить",
      update: "Обновить",
      installed: "Установлено",
      reinstall: "Переустановить",
      detected: "найден",
      notFound: "не найден",
      installedToast: "Записано в {{path}} — перезапустите {{client}}, чтобы загрузить Soma.",
      installErr: "Не удалось записать конфиг: {{msg}}",
      manualShow: "Ручная настройка (скопировать конфиг самому)",
      manualHide: "Скрыть ручную настройку",
    },
    title: "Настройки",
    description:
      "Провайдеры ИИ, профиль и экспорт данных. Всё остаётся на этом устройстве, если вы не решите иначе.",

    // Language section
    language: {
      title: "Язык",
      description: "Выберите предпочитаемый язык",
      english: "English",
      russian: "Русский",
    },

    // Profile section
    profile: {
      title: "Профиль",
      description:
        "Используется для референсных диапазонов биомаркеров с учётом пола и возраста. Пока один профиль; совместное использование нескольких профилей появится позже.",
      saveProfile: "Сохранить профиль",
      saved: "Сохранено ✓",
    },

    // AI Settings
    ai: {
      title: "ИИ-анализ",
      description:
        "По умолчанию отключён. Используйте свой API-ключ — он хранится в системной связке ключей, никогда в базе данных или конфигурационных файлах. Предлагаются только мультимодальные модели (зрение + PDF), поскольку пайплайн импорта читает фотографии и PDF.",
      provider: "Провайдер",
      aiDisabled: "ИИ отключён",
      model: "Модель (только мультимодальные)",
      customModel:
        "Пользовательский ID модели (опционально, переопределяет список — должна поддерживать зрение + PDF)",
      customModelPlaceholder: "например, более новый ID модели, которого ещё нет в реестре",
      apiKeyFor: "API-ключ для",
      checking: "проверяем…",
      storedInKeychain: "сохранён в связке ключей",
      notSet: "не установлен",
      saveKey: "Сохранить ключ",
      testKey: "Тестировать ключ",
      keyWorks: "Ключ работает — модель ответила.",
      getApiKey: "Создать API-ключ",
      recommendTitle: "Какую модель выбрать?",
      recommendBody:
        "Лучшая цена: Google Gemini (тариф Flash — есть бесплатный тир и читает PDF напрямую). Лучшая точность: Anthropic Claude (Sonnet). Один ключ на много моделей: OpenRouter. Совет: Gemini и Claude читают PDF нативно; с OpenAI/OpenRouter надёжнее всего чёткие фото.",
      disclaimer:
        "Вывод ИИ никогда не является медицинской консультацией. Документы, которые вы импортируете, отправляются выбранному провайдеру только когда вы явно запускаете действие ИИ.",
      aiDisclaimer:
        "Контент создан ИИ. Не является медицинской консультацией — всегда обращайтесь к квалифицированному врачу.",
    },

    // Backup section
    backup: {
      title: "Облачное резервирование",
      // Note: BackupCard has its own complex content, leaving basic structure
    },

    // Export section
    export: {
      title: "Экспорт данных",
      description: "Всё ваше — полная выгрузка в любое время, без привязки.",
      exportAll: "Экспорт всех данных (JSON)",
      exportLabs: "Результаты анализов (CSV)",
      exporting: "Экспортируем…",
    },
  },

  // Profile form fields
  profile: {
    fields: {
      name: "Имя",
      dateOfBirth: "Дата рождения",
      biologicalSex: "Биологический пол",
      units: "Единицы измерения",
      height: "Рост",
      weight: "Вес",
      bloodGroup: "Группа крови",
      rhFactor: "Резус-фактор",
      ethnicity: "Этническая принадлежность",
      targetWeight: "Целевой вес",
      activityLevel: "Уровень активности",
      smoking: "Курение",
      alcohol: "Алкоголь",
      chronicConditions: "Хронические заболевания",
    },
    options: {
      male: "Мужской",
      female: "Женский",
      otherIntersex: "Другой / интерсекс",
      metricSystem: "Метрическая (см, кг)",
      imperialSystem: "Английская (фут/дюйм, фунт)",
      positiveRh: "Положительный (+)",
      negativeRh: "Отрицательный (−)",
      sedentary: "Малоподвижный",
      lightlyActive: "Слабоактивный",
      moderatelyActive: "Умеренно активный",
      active: "Активный",
      veryActive: "Очень активный",
      never: "Никогда",
      former: "Раньше",
      current: "Сейчас",
      none: "Не употребляю",
      occasional: "Иногда",
      moderate: "Умеренно",
      heavy: "Часто",
      bloodO: "O (I)",
      bloodA: "A (II)",
      bloodB: "B (III)",
      bloodAB: "AB (IV)",
    },
    descriptions: {
      sedentary: "Сидячая работа, без регулярных тренировок",
      lightlyActive: "Прогулки или лёгкие нагрузки 1–2 раза в неделю",
      moderatelyActive: "Тренировки 2–4 раза в неделю",
      active: "Интенсивные тренировки 4–6 раз в неделю",
      veryActive: "Ежедневные интенсивные тренировки или физический труд",
      smokingFormer: "Бросил(а) — влияет на некоторые диапазоны годами",
      alcoholOccasional: "Несколько порций в месяц",
      alcoholModerate: "До ~7 порций в неделю",
    },
    hints: {
      ethnicity: "Влияет на некоторые референсные диапазоны (например, СКФ, показатели крови).",
      targetWeight: "Необязательная цель — отображается линией на графике веса в «Журнале».",
    },
    ethnicity: {
      white: "Европеоидная",
      black: "Негроидная / африканская",
      eastAsian: "Восточноазиатская",
      southAsian: "Южноазиатская",
      southeastAsian: "Юго-восточноазиатская",
      centralAsian: "Центральноазиатская",
      mena: "Ближневосточная / североафриканская",
      hispanic: "Латиноамериканская",
      nativeAmerican: "Коренные народы Америки",
      pacificIslander: "Народы Океании",
      ashkenaziJewish: "Евреи-ашкеназы",
      caribbean: "Карибская",
      mixed: "Смешанная",
      other: "Другая",
    },
    placeholders: {
      ft: "ft",
      in: "in",
      cm: "cm",
      lb: "lb",
      kg: "kg",
      ethnicity: "напр. восточноазиатская, чёрная, белая…",
      optional: "опционально",
      chronicConditions: "напр. гипотиреоз, диабет 2 типа… (свободный текст)",
    },
  },

  // Onboarding
  onboarding: {
    welcomeTitle: "Добро пожаловать в Soma",
    welcomeDescription:
      "Ваша медицинская карта на ваших условиях — анализы, лекарства и визиты в одной приватной временной шкале. Минута настройки позволит Soma читать ваши результаты относительно референсных диапазонов, которые действительно применимы к вам.",
    privacyNote:
      "Всё, что вы вводите, остаётся на этом устройстве — никаких аккаунтов, облака или отслеживания.",
    getStarted: "Начать",
    language: "Язык",

    aboutYouTitle: "О вас",
    aboutYouDescription:
      "Пол и возраст определяют, какие референсные диапазоны применимы к вашим биомаркерам — поэтому эти несколько полей обязательны.",

    fineTuningTitle: "Тонкая настройка",
    fineTuningDescription:
      "Необязательно, но стоит того: это уточняет некоторые референсные диапазоны и помогает отслеживать цели. Пропускайте что угодно — всё можно изменить позже в настройках.",

    allSetTitle: "Всё готово",
    allSetTitleWithName: "Всё готово, {{name}}",
    allSetDescription:
      "Ваш профиль сохранён локально. Импортируйте отчёт о лабораторных исследованиях, записывайте что принимаете, и Soma начнёт соединять точки.",
    tip: "Совет: наложите любое лекарство на график биомаркера, чтобы увидеть, действительно ли то, что вы принимаете, влияет на показатели.",
    openDashboard: "Открыть главную",
  },

  // Page headers (will be used by PageHeader component)
  pages: {
    dashboard: {
      title: "Главная",
      description: "Ваше здоровье с первого взгляда — локально, приватно, ваше.",
    },
    timeline: {
      title: "Временная шкала",
      description: "Все события здоровья в хронологическом порядке",
    },
    biomarkers: {
      title: "Биомаркеры",
      description: "Отслеживание лабораторных показателей во времени",
    },
    labs: {
      title: "Результаты анализов",
      description: "Импорт и управление лабораторными отчётами",
    },
    medications: {
      title: "Лекарства",
      description: "Что вы принимаете и когда",
    },
    visits: {
      title: "Медицинские визиты",
      description: "Приёмы врачей и консультации",
    },
    diagnoses: {
      title: "Диагнозы",
      description: "Медицинские состояния и диагнозы",
    },
  },

  // Loading states
  loading: {
    openingDatabase: "Открываем локальную базу данных…",
  },

  // Error states
  error: {
    databaseFailed: "Не удалось открыть локальную базу данных",
  },

  // Labs page
  labs: {
    title: "Результаты анализов",
    description: "Каждый забор крови и анализ мочи, введённые вручную или импортированные ИИ.",
    aiImport: "ИИ-импорт",
    newPanel: "Новая панель",
    emptyTitle: "Пока нет панелей анализов",
    emptyDescription:
      "Введите результаты вручную или импортируйте PDF/фото лабораторного отчёта с помощью ИИ.",
    addFirstPanel: "Добавить первую панель",
    tableColumns: {
      date: "Дата",
      lab: "Лаборатория",
      location: "Местоположение",
      type: "Тип",
      results: "Результаты",
      outOfRange: "Вне диапазона",
      source: "Источник",
    },
    importSource: {
      ai: "ИИ",
      manual: "вручную",
    },
  },

  // Timeline page
  timeline: {
    title: "Временная шкала",
    description: "Анализы рядом с лекарствами, весом и показателями — одна настраиваемая шкала.",
    layersTitle: "Слои",
    shiftHint:
      "Подсвеченные точки анализов — панели, где биомаркер сильно изменился по сравнению с предыдущей.",
    shiftCount: "Заметных изменений к прошлому: {{count}}",
    medsMore: "+{{count}} ещё лекарств",
    medsLess: "Свернуть лекарства",
    legend: {
      title: "Легенда",
      outOfRange: "Анализ вне диапазона",
      shiftWatch: "Заметный сдвиг",
      shiftAlert: "Выход за диапазон / критично",
      bpNormal: "Давление в норме",
      bpStage1: "Давление повышено",
      bpStage2: "Давление 2 ст.",
      bpCrisis: "Гипертонический криз",
      today: "Сегодня",
    },
    layers: {
      lab_panel: "Анализы",
      medication: "Лекарства",
      weight: "Вес",
      bp: "Давление",
      symptom: "Симптомы",
      visit: "Визиты",
      diagnosis: "Диагнозы",
      vaccine: "Прививки",
      allergy: "Аллергии",
      imaging: "Снимки",
    },
    ranges: {
      sixMonths: "6М",
      oneYear: "1Г",
      twoYears: "2Г",
      all: "Всё",
    },
    emptyTitle: "Временная шкала пуста",
    emptyDescription:
      "События появятся здесь по мере добавления анализов, лекарств, визитов и диагнозов.",
    allEvents: "Все события",
    eventKinds: {
      labs: "анализы",
      medication: "лекарство",
      diagnosis: "диагноз",
      visit: "визит",
      allergy: "аллергия",
      vaccine: "прививка",
      symptom: "симптом",
      imaging: "снимок",
    },
    outOfRange: "вне диапазона",
    now: "сейчас",
    symptomThreshold: "Скрыто записей о лёгких симптомах (тяжесть < 6): {{count}}.",
    showAllSymptoms: "Показать все",
    hideMinorSymptoms: "Скрыть лёгкие симптомы",
  },

  // Lab panel detail page
  labPanelDetail: {
    backToLabs: "Результаты анализов",
    aiImported: "Импортировано ИИ",
    allInRange: "всё в диапазоне",
    outOfRange: "вне диапазона",
    deletePanel: "Удалить панель",
    deletePanelTitle: "Удалить эту панель?",
    deletePanelDescription: "Панель и все её результаты будут удалены. Сразу после можно отменить.",
    deletedToast: "Панель удалена.",
    panelNotFound: "Панель не найдена",
    tableColumns: {
      biomarker: "Биомаркер",
      value: "Значение",
      change: "Δ к прошлому",
      normalized: "Нормализованное",
      reference: "Референс",
      status: "Статус",
      sourceLabel: "Исходная метка",
    },
  },

  // Корреляция между панелями («что изменилось с прошлого раза»)
  insights: {
    title: "Заметные изменения",
    sinceLast: "Сравнение с вашим предыдущим результатом по каждому биомаркеру.",
    dashboardTitle: "Что изменилось",
    dashboardSince: "Заметные сдвиги в последней панели ({{date}}) по сравнению с прошлой.",
    baseline:
      "Это первые значения по этим биомаркерам — будущие импорты будут сравниваться с ними.",
    allStable: "С прошлого раза заметных изменений нет — значения стабильны.",
    since: "с {{date}}",
    unitChanged: "Единицы отличаются от прошлого замера — изменение несравнимо.",
    unitChangedShort: "ед. ≠",
    howTitle: "Как это определяется?",
    howBody:
      "Изменение отмечается, если оно выходит за референсный диапазон, достигает критического уровня, превышает ~40% ширины диапазона или меняется на ~50%+ относительно прошлого раза. Зелёный — сдвиг в сторону нормы, красный — от неё.",
    trajectory: {
      improved: "улучшение",
      worsened: "ухудшение",
      neutral: "изменение",
    },
    reason: {
      became_out_of_range: "вышло за диапазон",
      worsened_critical: "достигло критического уровня",
      back_in_range: "вернулось в диапазон",
      large_move: "резко изменилось",
      moved_within_range: "сдвинулось (в пределах нормы)",
    },
  },

  // Biomarkers page
  biomarkers: {
    title: "Биомаркеры",
    description:
      "Справочный словарь с нормальными и оптимальными диапазонами. Нажмите на биомаркер, чтобы увидеть тренд.",
    customBiomarker: "Пользовательский биомаркер",
    searchPlaceholder: "Поиск по названию или псевдониму…",
    withDataOnly: "Только с данными",
    emptySearchTitle: "Ничего не найдено",
    emptySearchDescription: "Попробуйте другой поисковый запрос.",
    custom: "пользовательский",
    noData: "Нет данных",
    createDialog: {
      title: "Новый пользовательский биомаркер",
      description: "Для аналитов, отсутствующих во встроенном словаре.",
      nameLabel: "Название",
      namePlaceholder: "например, Индекс омега-3",
      categoryLabel: "Категория",
      unitLabel: "Единица",
      unitPlaceholder: "например, %",
      refLowLabel: "Нижний реф.",
      refHighLabel: "Верхний реф.",
      noRangeWarning:
        "Без референсного диапазона этот биомаркер никогда не будет помечен как вне нормы.",
      directionLabel: "Направление",
      directionOptions: {
        range: "В диапазоне",
        higherBetter: "Выше лучше",
        lowerBetter: "Ниже лучше",
      },
      aliasesLabel: "Псевдонимы (через запятую, любой язык)",
      aliasesPlaceholder: "synonym 1, синоним 2",
      create: "Создать",
    },
  },

  // Medications page
  medications: {
    title: "Лекарства и добавки",
    description:
      "Что вы принимаете, в какой дозе и с какого времени — можно накладывать на любой тренд биомаркеров.",
    emptyTitle: "Пока ничего не отслеживается",
    emptyDescription:
      "Добавьте лекарства и добавки с дозами и периодами, чтобы сопоставить их с вашими анализами.",
    addFirst: "Добавить первый элемент",
    currentlyTaking: "Принимаю сейчас",
    past: "Прошлое",
    addDialog: {
      titleAdd: "Добавить лекарство или добавку",
      titleEdit: "Редактировать лекарство",
    },
    doseUnits: {
      drops: "капли",
      tablets: "таблетки",
      capsules: "капсулы",
      sprays: "впрыски",
    },
    fields: {
      dose: "Доза",
      frequency: "Частота",
      scheduleNotesOptional: "Заметки о расписании (опционально)",
      startDate: "Дата начала",
      endDateOptional: "Дата окончания (пустая = продолжается)",
      purposeOptional: "Цель (опционально)",
    },
    actions: {
      stopToday: "Прекратить сегодня",
    },
  },

  // Visits page
  visits: {
    title: "Визиты к врачам",
    description: "Консультации в клиниках, городах и странах.",
    emptyTitle: "Пока нет визитов",
    emptyDescription: "Записывайте консультации врачей с диагнозами и назначениями.",
    addFirst: "Добавить первый визит",
    addDialog: {
      titleAdd: "Новый визит к врачу",
      titleEdit: "Редактировать визит",
    },
    fields: {
      doctor: "Врач",
      specialty: "Специальность",
      clinic: "Клиника",
      location: "Местоположение",
    },
  },

  // Diagnoses page
  diagnoses: {
    title: "Диагнозы",
    description: "Активные состояния и история разрешённых случаев.",
    emptyTitle: "Диагнозы не записаны",
    emptyDescription: "Отслеживайте состояния со статусом: активно, в ремиссии или разрешено.",
    addFirst: "Добавить первый диагноз",
    addDialog: {
      titleAdd: "Добавить диагноз",
      titleEdit: "Редактировать диагноз",
    },
    fields: {
      diagnosis: "Диагноз",
      icd: "МКБ",
      icdCodeOptional: "Код МКБ (опционально)",
      status: "Статус",
      notesOptional: "Заметки (опционально)",
      resolvedDate: "Дата разрешения",
    },
    sections: {
      active: "Активные",
      remission: "В ремиссии",
      resolved: "Разрешённые",
    },
    actions: {
      moveToRemission: "В ремиссию",
      resolve: "Разрешить",
      confirmResolve: "Подтвердить",
    },
  },

  // Allergies page
  allergies: {
    title: "Аллергии",
    description:
      "Аллергии на лекарства, продукты питания и окружающую среду с указанием тяжести и реакции.",
    emptyTitle: "Аллергии не записаны",
    emptyDescription: "Отслеживайте аллергические реакции и непереносимость.",
    addFirst: "Добавить первую аллергию",
    addDialog: {
      titleAdd: "Добавить аллергию",
      titleEdit: "Редактировать аллергию",
    },
    fields: {
      allergen: "Аллерген",
      category: "Категория",
      severity: "Тяжесть",
      status: "Статус",
      onsetDateOptional: "Дата начала (опционально)",
      reactionOptional: "Реакция (опционально)",
      notesOptional: "Заметки (опционально)",
    },
    sections: {
      active: "Активные",
      resolved: "Разрешённые",
    },
    actions: {
      resolve: "Разрешить",
    },
    deleteAnaphylacticTooltip: "Анафилактическую аллергию нельзя удалить — сначала разрешите её.",
  },

  // Allergy category options
  allergyCategory: {
    drug: "Лекарство",
    food: "Еда",
    environmental: "Окружающая среда",
    other: "Другое",
  },

  // Allergy severity options
  allergySeverity: {
    mild: "Лёгкая",
    moderate: "Умеренная",
    severe: "Тяжёлая",
    anaphylactic: "Анафилактическая",
  },

  allergySeverityDescription: {
    mild: "Дискомфорт, лечение не требуется",
    moderate: "Нужны антигистаминные или лечение",
    severe: "Сильная системная реакция",
    anaphylactic: "Угроза жизни — экстренный адреналин",
  },

  // Vaccines page
  vaccines: {
    title: "Прививки",
    description: "История вакцинации с дозами, сериями и сроками годности.",
    emptyTitle: "Прививки не записаны",
    emptyDescription: "Ведите историю своей иммунизации.",
    addFirst: "Добавить первую прививку",
    addDialog: {
      titleAdd: "Добавить запись о прививке",
      titleEdit: "Редактировать запись о прививке",
    },
    fields: {
      vaccineName: "Название вакцины",
      date: "Дата",
      doseNumber: "Доза №",
      manufacturer: "Производитель",
      batchNumber: "Серия",
      expiresOptional: "Срок годности (опционально)",
      country: "Страна",
      administeredByOptional: "Кто ввёл (опционально)",
      notesOptional: "Заметки (опционально)",
    },
    table: {
      date: "Дата",
      dose: "Доза №",
      manufacturerBatch: "Производитель / Серия",
      country: "Страна",
      administeredBy: "Кто ввёл",
      expires: "Годен до",
    },
    expired: "Истёк",
    expiry: {
      lifetime: "Пожизненная действительность — без срока (ВОЗ).",
      suggest: "Рекомендуемый срок: {{date}} — нажмите, чтобы подставить",
    },
    recordsTitle: "Записанные прививки",
    calendar: {
      title: "Календарь прививок",
      subtitle: "Справочное расписание ВОЗ",
      description:
        "По антигенам, вне привязки к стране. Национальные календари отличаются — это базовый ориентир ВОЗ, а не медицинская рекомендация.",
      addBirthDate:
        "Укажите дату рождения в профиле, чтобы видеть персональные статусы «предстоит / просрочено».",
      summaryClear: "Универсальный календарь в порядке.",
      overdue: "просрочено: {{n}}",
      due: "предстоит: {{n}}",
      doseN: "Доза {{n}}",
      next: "след. {{date}}",
      protects: "Защищает от: {{disease}}",
      status: {
        done: "Сделано",
        due: "Пора",
        overdue: "Просрочено",
        upcoming: "Предстоит",
        contextual: "По показаниям",
      },
      tiers: {
        universal: "Рекомендовано всем",
        special: "Часто добавляют",
        regional: "Региональные",
        risk: "Группы риска и поездки",
      },
    },
  },

  // Backup card
  backup: {
    title: "Резервные копии",
    description:
      "Зашифрованные снимки вашей базы данных, сохранённые в папку, которую ваш облачный клиент (iCloud Drive, Google Drive, Dropbox, OneDrive) уже синхронизирует. Soma никогда не загружает ничего сама и сохраняет только зашифрованные .somabk файлы там — ваши живые данные никогда не покидают это устройство.",
    setupBackups: "Настроить резервирование",
    disable: "Отключить",
    backupNow: "Создать резервную копию",
    backingUp: "Создаём резервную копию…",
    restoreFromBackup: "Восстановить из резервной копии…",
    destination: "Назначение",
    frequency: "Частота",
    lastBackup: "Последняя резервная копия",
    noBackupYet: "Резервные копии ещё не создавались.",
    rotationNote: "Старые снимки автоматически удаляются (сохраняются 12 новейших).",
    lastAttemptFailed: "Последняя попытка не удалась",
    disableNote:
      "Отключение только останавливает будущие резервные копии — существующие снимки и ваша парольная фраза сохраняются, поэтому вы можете повторно включить в любое время.",

    // Setup wizard
    setupStep: "Настройка резервирования · шаг {{step}} из 3",
    step1Description: "Где должны сохраняться зашифрованные снимки?",
    step2Description: "Защитите ваши резервные копии парольной фразой.",
    step3Description: "Как часто Soma должна создавать резервные копии?",

    // Step 1 - destination
    macosOnly: "только macOS",
    notFoundOnComputer: "Не найдено на этом компьютере",
    detected: "Обнаружено",
    chooseManually: "Выбрать папку вручную…",
    customWarning:
      "Эта папка не является одной из обнаруженных облачных папок. Резервные копии, сохранённые здесь, попадут в облако только если что-то на этом компьютере синхронизирует эту папку.",
    folderNotExist: "Эта папка не существует.",
    folderNotWritable: "Soma не может записывать в эту папку — выберите другую.",
    subfolderNote:
      "Внутри создаётся подпапка Soma Backups с README, объясняющим файлы. Туда попадают только зашифрованные снимки — никогда ваши живые данные.",

    // Step 2 - passphrase
    passphraseTitle:
      "Эта парольная фраза шифрует каждую резервную копию. Она хранится только в связке ключей этого устройства.",
    passphraseWarning:
      "Если вы потеряете это устройство и парольную фразу, ваши резервные копии не смогут быть восстановлены — никем. Сохраните её в своём менеджере паролей прямо сейчас.",
    passphraseLabel: "Парольная фраза (минимум 8 символов)",
    passphraseRepeat: "Повторите парольную фразу",
    passphraseSaved: "Я сохранил парольную фразу в надёжном месте",
    passphraseMinLength: "Используйте минимум 8 символов.",
    passphraseMismatch: "Парольные фразы не совпадают.",

    // Step 3 - frequency
    backupFrequency: "Частота резервирования",
    destinationSummary: "Назначение:",
    catchupNote:
      "Soma также проверяет при каждом запуске и наверстывает, если резервная копия была пропущена. Сохраняются 12 новейших снимков; более старые удаляются автоматически.",
    enableAndBackup: "Включить и создать резервную копию",

    // Restore dialog
    restoreTitle: "Восстановить из резервной копии",
    restorePickDescription:
      "Выберите .somabk файл и введите парольную фразу, которой он был зашифрован.",
    restoreReviewDescription: "Просмотрите резервную копию перед заменой ваших данных.",
    chooseBackupFile: "Выбрать файл резервной копии…",
    passphrase: "Парольная фраза",
    decryptedSize: "Размер после расшифровки:",
    fileDate: "дата файла:",
    schema: "схема",
    appHas: "в приложении",
    newerVersionError:
      "Эта резервная копия была создана более новой версией Soma. Сначала обновите приложение, затем восстановите.",
    olderSchemaNote:
      "Резервная копия использует более старую схему — она будет автоматически мигрирована после перезапуска.",
    replaceWarningTitle: "Это заменит вашу текущую базу данных и перезапустит приложение.",
    replaceWarningDescription:
      "Резервная копия текущей базы данных с временной меткой сохраняется рядом с ней, поэтому это можно отменить вручную при необходимости.",
    replaceAndRestart: "Заменить данные и перезапустить",

    // Native dialogs
    chooseFolderDialogTitle: "Выберите папку для резервных копий",
    chooseBackupDialogTitle: "Выберите резервную копию Soma",
    somaBackupFilter: "Резервная копия Soma",
  },

  // LabPanelNew page
  labPanelNew: {
    title: "Новая панель анализов",
    description: "Ручной ввод забора лабораторных данных.",
    selectBiomarker: "Выберите биомаркер…",
    addRow: "Добавить строку",
    savePanelSingular: "Сохранить панель ({{count}} результат)",
    savePanelPlural: "Сохранить панель ({{count}} результатов)",
    panelTitle: "Панель",
    resultsTitle: "Результаты",
    fields: {
      labName: "Название лаборатории",
      biomarker: "Биомаркер",
      collectionTime: "Время забора",
      fasting: "Натощак",
      cycleDay: "День цикла",
      notes: "Контекст / метод",
    },
    fasting: { yes: "Натощак", no: "Не натощак", unknown: "Неизвестно" },
    notesPlaceholder: "напр. через 2ч после еды, метод анализа, аккредитация лаб.",
    removeRow: "Удалить строку",
    unitGroups: {
      compatible: "Конвертируемые единицы",
      other: "Другие единицы",
    },
    unitWarning:
      "Неизвестная конвертация в {{unit}} — значение сохранится как введено, без нормализации и флага выхода за норму.",
  },

  // BiomarkerDetail page
  biomarkerDetail: {
    biomarkerNotFound: "Биомаркер не найден",
    emptyTitle: "Пока нет результатов",
    emptyDescription: "Добавьте панель анализов, содержащую этот биомаркер, чтобы увидеть тренд.",
    trendTitle: "Тренд",
    allResultsTitle: "Все результаты",
  },

  // Справочная карточка «О показателе»
  biomarkerInfo: {
    title: "О показателе",
    summaryLabel: "Что это",
    highLabel: "О чём говорит повышение",
    lowLabel: "О чём говорит понижение",
    affectsLabel: "На что влияет",
    disclaimer:
      "Данные носят справочный характер и не являются диагнозом. Причины указаны как возможные, а не однозначные. Полагайтесь на рекомендации врача.",
  },

  // ImportWizard page
  importWizard: {
    title: "ИИ-импорт",
    description:
      "PDF или фото → извлечённые значения → вы подтверждаете соответствие → сохранено. Ничего не записывается без вашего просмотра.",
    notMapped: "— не сопоставлено —",
    translatedHint:
      "Сопоставлено по английскому переводу ИИ, а не по печатной метке — проверьте, что биомаркер верный (например, ЛПНП vs общий холестерин).",
    savingPanel: "Сохраняем панель…",
    chooseLabReport: "Выберите отчёт лаборатории",
    anyLangHint: "Любой язык, любая лаборатория, любая страна — включая сканы и фото.",
    chooseAnother: "Выбрать другой",
    extractResults: "Извлечь результаты",
    fileFormats: "PDF, JPG, PNG или WebP",
    chooseFile: "Выбрать файл",
    extractingMapping: "Извлечение и сопоставление…",
    extractingMappingDetail:
      "Этап 1: структурированное извлечение. Этап 2: сопоставление со справочником биомаркеров (точное → синонимы → нечёткое → ИИ-разрешение).",
    reviewExtractedResults: "Просмотр извлечённых результатов",
    matchColumn: "Соответствие",
    panelDetailsTitle: "Детали панели",
    aiDisabledTitle: "ИИ-анализ отключён",
    aiDisabledDescription:
      "Чтобы импортировать отчёты лабораторий из PDF или фотографий, включите ИИ-анализ и вставьте свой API-ключ в настройках. Ваши документы отправляются только выбранному провайдеру и только когда вы запускаете импорт.",
    openSettings: "Открыть настройки",
    selectType: {
      title: "Что вы импортируете?",
      description: "Выберите тип документа, чтобы ИИ знал, что искать.",
      continue: "Продолжить",
    },
    docTypes: {
      lab: "Отчёт лаборатории",
      labDescription: "Кровь, моча и другие количественные результаты.",
      vaccine: "Сертификат о прививках",
      vaccineDescription: "Дозы вакцин, даты, производители и серии.",
      discharge: "Выписной эпикриз",
      dischargeDescription: "Визит, диагнозы и назначенные лекарства.",
    },
    reviewBanner: {
      title: "Требуется полная ручная проверка",
      description:
        "Сверьте каждую запись с оригиналом перед сохранением. Ничего не сохраняется автоматически.",
    },
    vaccineReview: {
      choose: "Выберите сертификат о прививках",
      extracting: "Читаем сертификат…",
      title: "Проверьте извлечённые прививки",
      description: "Отметьте дозы для сохранения и при необходимости исправьте поля по оригиналу.",
      saving: "Сохраняем прививки…",
      columns: {
        vaccine: "Название вакцины",
        dose: "Доза №",
        manufacturer: "Производитель",
        batch: "Серия",
        expires: "Действует до",
      },
      empty: "В документе не найдено ни одной дозы вакцины.",
      save: "Сохранить прививок: {{count}}",
    },
    dischargeReview: {
      choose: "Выберите выписной эпикриз",
      extracting: "Читаем выписной эпикриз…",
      title: "Проверьте выписной эпикриз",
      description: "Подтвердите данные визита и выберите, какие записи сохранить.",
      saving: "Сохраняем записи…",
      visitTitle: "Данные визита",
      typeColumn: "Тип",
      detailColumn: "Детали",
      diagnosisBadge: "диагноз",
      medicationBadge: "лекарство",
      empty: "В документе не найдено диагнозов или лекарств.",
      save: "Сохранить записей: {{count}}",
    },
  },

  // Dashboard page
  dashboard: {
    noRecordsTitle: "Пока нет записей",
    recentActivityTitle: "Последняя активность",
    addLabResults: "Добавить анализы",
    stats: {
      labPanels: "Панели анализов",
      outOfRangeLatest: "Вне диапазона (последняя панель)",
      activeMedications: "Активные лекарства",
      lastLabDraw: "Последний забор крови",
    },
    recentActivity: {
      description:
        "Добавьте свою первую панель анализов, лекарство или визит к врачу, чтобы начать.",
    },
  },

  // VisitDetail page
  visitDetail: {
    visitNotFound: "Визит не найден",
    deleteVisit: "Удалить визит",
    deleteVisitTitle: "Удалить этот визит?",
    deleteVisitDescription:
      "Назначения этого визита удаляются; связанные диагнозы сохраняются, но отвязываются.",
    addPrescription: "Добавить назначение",
    diagnosesTitle: "Диагнозы",
    prescriptionsTitle: "Назначения",
    fields: {
      prescription: "Назначение",
      drugName: "Препарат / добавка",
      durationDays: "Длительность (дни)",
      days: "дн.",
    },
  },

  // Полнотекстовый поиск + командная палитра
  search: {
    title: "Поиск",
    open: "Поиск",
    placeholder: "Поиск по записям…",
    timelineFilter: "Фильтр событий…",
    esc: "Esc",
    hint: "Введите запрос для поиска по медицинским записям",
    noResults: "Ничего не найдено по запросу «{{query}}»",
    footer: "↑↓ навигация · Enter открыть · Esc закрыть",
    types: {
      biomarker: "Биомаркер",
      lab_panel: "Анализы",
      visit: "Визит",
      diagnosis: "Диагноз",
      medication: "Лекарство",
      allergy: "Аллергия",
      vaccine: "Вакцина",
      symptom: "Симптом",
      imaging: "Снимок",
    },
  },

  // Emergency card
  emergency: {
    title: "Карта экстренной помощи",
    description: "Печатная сводка важной медицинской информации для врачей скорой помощи.",
    exportHtml: "Экспорт в HTML",
    exportPdf: "Экспорт в PDF",
    openCard: "Карта экстренной помощи",
    incompleteBanner:
      "Не указана группа крови или контакт для экстренной связи — карта может быть неполной.",
    updateProfile: "Обновить профиль →",
    exportError: "Не удалось экспортировать карту. Попробуйте ещё раз.",
    sections: {
      identity: "Личные данные",
      criticalStatus: "Критический статус",
      contact: "Экстренный контакт",
      insurance: "Страховка и помощь",
      notes: "Важные заметки",
      allergies: "Аллергии",
      medications: "Активные лекарства",
      diagnoses: "Активные диагнозы",
      vaccines: "Недавние прививки",
    },
    criticalStatus: {
      pregnancy: "Беременность",
      codeStatus: "Реанимация",
      organDonor: "Донор органов",
      yes: "Да",
      no: "Нет",
      pregnancyValues: {
        not_pregnant: "Не беременна",
        pregnant: "Беременна",
        postpartum: "Послеродовой период",
        unknown: "Неизвестно",
      },
      codeStatusValues: {
        full_code: "Полная реанимация",
        dnr: "DNR (не реанимировать)",
        dni: "DNI (не интубировать)",
      },
    },
    identity: {
      name: "Имя",
      dob: "Дата рождения",
      age: "Возраст",
      ageValue: "{{years}} лет",
      sex: "Пол",
      bloodType: "Группа крови",
      citizenship: "Гражданство",
      languages: "Языки",
    },
    insurance: {
      insurer: "Страховая",
      policyNumber: "Номер полиса",
      phone: "Помощь 24/7",
    },
    emptyInsurance: "Страховка не указана — добавьте в настройках.",
    contact: {
      name: "Имя",
      phone: "Телефон",
      relation: "Кем приходится",
      empty: "Экстренный контакт не указан — добавьте его в настройках.",
    },
    allergies: {
      allergen: "Аллерген",
      severity: "Тяжесть",
      reaction: "Реакция",
      resolved: "Разрешилась",
      none: "Известных аллергий не зафиксировано.",
    },
    medications: {
      name: "Лекарство",
      dose: "Доза",
      schedule: "Приём",
      since: "С",
      none: "Активных лекарств нет.",
      asNeededTitle: "По потребности (PRN)",
    },
    diagnoses: {
      name: "Диагноз",
      icd: "МКБ",
      date: "Дата",
      none: "Активных диагнозов нет.",
    },
    vaccines: {
      name: "Прививка",
      date: "Дата",
      dose: "Доза",
      doseValue: "№{{n}}",
      expires: "Действует до",
      expired: "Истекла",
      none: "Прививок не зафиксировано.",
    },
    footer:
      "Сформировано в Soma {{date}}. Данные актуальны на момент экспорта. Всегда уточняйте у лечащего врача.",
    settings: {
      title: "Экстренная информация",
      description: "Отображается в карте экстренной помощи для врачей.",
      name: "Имя контакта",
      phone: "Телефон",
      relation: "Кем приходится",
      citizenship: "Гражданство",
      citizenshipPlaceholder: "напр. Россия",
      languages: "Языки",
      languagesPlaceholder: "напр. русский, английский",
      insurer: "Страховая",
      policyNumber: "Номер полиса",
      assistancePhone: "Телефон помощи",
      notes: "Критичные заметки",
      notesHint: "Важно для врачей скорой: кардиостимулятор, импланты, отказ от переливания…",
      pregnancy: "Беременность",
      codeStatus: "Реанимация",
      organDonor: "Донор органов",
      notSet: "Не указано",
      save: "Сохранить",
      saved: "Сохранено",
    },
  },

  // Journal page (weight / blood pressure / symptoms)
  journal: {
    title: "Дневник",
    description: "Отслеживайте вес, давление и симптомы во времени.",
    tabs: {
      weight: "Вес",
      bp: "Давление",
      symptoms: "Симптомы",
    },
  },

  weight: {
    chartTitle: "Динамика веса",
    targetLabel: "Цель",
    logWeight: "Записать вес",
    emptyTitle: "Записей о весе пока нет",
    emptyDescription: "Запишите вес, чтобы видеть его динамику во времени.",
    addFirst: "Записать первый вес",
    table: {
      date: "Дата",
      weight: "Вес",
      notes: "Заметки",
    },
    dialog: {
      titleAdd: "Записать вес",
      titleEdit: "Изменить запись веса",
    },
    fields: {
      weight: "Вес",
      notesOptional: "Заметки (необязательно)",
    },
  },

  bp: {
    chartTitle: "Динамика давления",
    systolic: "Систолическое",
    diastolic: "Диастолическое",
    logReading: "Записать измерение",
    emptyTitle: "Измерений давления пока нет",
    emptyDescription: "Запишите измерение, чтобы отслеживать давление во времени.",
    addFirst: "Записать первое измерение",
    crisisBanner:
      "Измерение за последние 7 дней находится в диапазоне гипертонического криза (систолическое > 180 или диастолическое > 120). При таких симптомах, как боль в груди, одышка или нарушение зрения, немедленно обратитесь за неотложной медицинской помощью.",
    status: {
      stage2: "2 стадия",
      crisis: "Криз",
    },
    crisisHint: "Это значение в диапазоне гипертонического криза.",
    table: {
      date: "Дата",
      time: "Время",
      reading: "Измерение",
      pulse: "Пульс",
      status: "Статус",
      notes: "Заметки",
    },
    dialog: {
      titleAdd: "Записать давление",
      titleEdit: "Изменить измерение",
    },
    fields: {
      timeOptional: "Время (необязательно)",
      systolic: "Систолическое",
      diastolic: "Диастолическое",
      heartRate: "Пульс",
      position: "Положение",
      arm: "Рука",
      notesOptional: "Заметки (необязательно)",
    },
    position: {
      sitting: "Сидя",
      standing: "Стоя",
      supine: "Лёжа",
    },
    arm: {
      left: "Левая",
      right: "Правая",
    },
  },

  symptoms: {
    thresholdLabel: "Показаны с тяжестью ≥ {{n}}",
    showAll: "Показать все",
    logSymptom: "Записать симптом",
    emptyTitle: "Симптомы пока не записаны",
    emptyDescription: "Записывайте симптомы с тяжестью, чтобы замечать закономерности.",
    addFirst: "Записать первый симптом",
    previouslyLogged: "Ранее записанные",
    table: {
      date: "Дата",
      time: "Время",
      symptom: "Симптом",
      severity: "Тяжесть",
      notes: "Заметки",
    },
    dialog: {
      titleAdd: "Записать симптом",
      titleEdit: "Изменить симптом",
    },
    fields: {
      symptomName: "Симптом",
      timeOptional: "Время (необязательно)",
      severity: "Тяжесть",
      notesOptional: "Заметки (необязательно)",
    },
    namePlaceholder: "напр. Головная боль, Усталость",
  },

  symptomSeverity: {
    "1": "1 — Минимальная",
    "2": "2 — Очень лёгкая",
    "3": "3 — Лёгкая",
    "4": "4 — Лёгкая-умеренная",
    "5": "5 — Умеренная",
    "6": "6 — Умеренно-сильная",
    "7": "7 — Сильная",
    "8": "8 — Очень сильная",
    "9": "9 — Интенсивная",
    "10": "10 — Невыносимая",
  },

  // Imaging records
  imaging: {
    title: "Снимки",
    description: "Рентген, КТ, МРТ, УЗИ и другие исследования.",
    newRecord: "Новая запись",
    emptyTitle: "Записей о снимках пока нет",
    emptyDescription: "Добавьте исследование, чтобы хранить историю снимков в одном месте.",
    addFirst: "Добавить первую запись",
    back: "Снимки",
    table: {
      date: "Дата",
      modality: "Тип",
      bodyArea: "Область тела",
      facility: "Учреждение",
      visit: "Визит",
    },
    newTitle: "Новая запись о снимке",
    editTitle: "Изменить запись о снимке",
    newDescription: "Запишите исследование и его заключение.",
    studyDetailsTitle: "Сведения об исследовании",
    findingsTitle: "Заключение",
    delete: "Удалить запись",
    fields: {
      date: "Дата",
      modality: "Тип",
      bodyArea: "Область тела",
      facility: "Учреждение",
      city: "Город",
      country: "Страна",
      visit: "Визит",
      findings: "Заключение",
      radiologist: "Рентгенолог",
    },
    bodyAreaPlaceholder: "напр. Поясничный отдел, Грудная клетка",
    noVisit: "Без привязки к визиту",
    visitLabel: "{{date}} — {{doctor}}",
    visitLabelNoDoctor: "{{date}} — визит",
  },

  imagingModality: {
    xray: "Рентген",
    ct: "КТ",
    mri: "МРТ",
    ultrasound: "УЗИ",
    pet: "ПЭТ",
    other: "Другое",
  },

  biomarkerSymptoms: {
    toggle: "Симптомы",
  },
} as const;
