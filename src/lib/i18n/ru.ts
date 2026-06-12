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
      ethnicity: "Этническая принадлежность (влияет на некоторые референсные диапазоны)",
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
    description: "Анализы, визиты, диагнозы и периоды приёма лекарств на одной временной шкале.",
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
  },

  // Lab panel detail page
  labPanelDetail: {
    backToLabs: "Результаты анализов",
    aiImported: "Импортировано ИИ",
    allInRange: "всё в диапазоне",
    outOfRange: "вне диапазона",
    deletePanel: "Удалить панель",
    deletePanelTitle: "Удалить эту панель?",
    deletePanelDescription: "Панель и все её результаты будут удалены. Это нельзя отменить.",
    panelNotFound: "Панель не найдена",
    tableColumns: {
      biomarker: "Биомаркер",
      value: "Значение",
      normalized: "Нормализованное",
      reference: "Референс",
      status: "Статус",
      sourceLabel: "Исходная метка",
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
    },
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

  // ImportWizard page
  importWizard: {
    title: "ИИ-импорт",
    description:
      "PDF или фото → извлечённые значения → вы подтверждаете соответствие → сохранено. Ничего не записывается без вашего просмотра.",
    notMapped: "— не сопоставлено —",
    savingPanel: "Сохраняем панель…",
    chooseLabReport: "Выберите отчёт лаборатории",
    reviewExtractedResults: "Просмотр извлечённых результатов",
    matchColumn: "Соответствие",
    panelDetailsTitle: "Детали панели",
    aiDisabledTitle: "ИИ-анализ отключён",
    aiDisabledDescription:
      "Чтобы импортировать отчёты лабораторий из PDF или фотографий, включите ИИ-анализ и вставьте свой API-ключ в настройках. Ваши документы отправляются только выбранному провайдеру и только когда вы запускаете импорт.",
    openSettings: "Открыть настройки",
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
} as const;
