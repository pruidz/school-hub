/**
 * Georgian UI strings — the single source of truth for user-facing text.
 *
 * Rules for every agent touching this file:
 *  - One object, grouped by area. Areas are in alphabetical order, keys inside
 *    an area are grouped by screen and kept short.
 *  - Values are Georgian. Keys, comments and code are English.
 *  - Append keys to the matching area; never rename or remove an existing key.
 *  - Placeholders use `{name}` syntax and are filled by `t(key, params)`.
 */

import type { AssignmentStatus } from "@/lib/db.types";

export const ka = {
  // --------------------------------------------------------- assignments ---
  assignments: {
    // list / shared
    title: "დავალებები",
    open: "გახსნა",
    empty: "დავალება ჯერ არ არის",
    emptyHint: "დაამატეთ პირველი დავალება",
    count: "{count} დავალება",
    due: "ვადა: {date}",
    noDue: "ვადის გარეშე",
    overdue: "ვადაგადაცილებული",
    dueToday: "დღეს",
    dueTomorrow: "ხვალ",
    redoCount: "დაბრუნებულია {count}-ჯერ",
    filterAll: "ყველა",
    filterStatus: "სტატუსი",
    filterSubject: "საგანი",
    filterChild: "ბავშვი",
    groupOverdue: "ვადაგადაცილებული",
    groupNoDue: "ვადის გარეშე",

    // create / edit
    newTitle: "ახალი დავალება",
    editTitle: "დავალების რედაქტირება",
    fieldTitle: "სათაური",
    fieldTitlePlaceholder: "მაგ. სავარჯიშოები წილადებზე",
    fieldDescription: "აღწერა",
    fieldSourceRef: "წყარო",
    fieldSourceRefPlaceholder: "წიგნი გვ. 45, სავარჯიშო 3",
    fieldDueDate: "ვადა",
    fieldDueTime: "დრო",
    fieldSubject: "საგანი",
    fieldTopic: "თემა",
    fieldLesson: "გაკვეთილი",
    fieldPriority: "პრიორიტეტი",
    fieldChild: "ბავშვი",
    priority1: "დაბალი",
    priority2: "ჩვეულებრივი",
    priority3: "მაღალი",
    noSubject: "საგნის გარეშე",
    noTopic: "თემის გარეშე",
    noLesson: "გაკვეთილის გარეშე",
    create: "დავალების შექმნა",
    creating: "იქმნება…",
    saveChanges: "ცვლილებების შენახვა",
    saving: "ინახება…",
    created: "დავალება შეიქმნა",
    updated: "დავალება განახლდა",
    deleteTitle: "დავალების წაშლა",
    deleteConfirm: "წაიშალოს „{title}“? ფოტოები და მიმოწერაც წაიშლება.",
    deleted: "დავალება წაიშალა",

    // work / submission
    taskPhotos: "დავალების ფოტოები",
    solutionPhotos: "ამოხსნის ფოტოები",
    selfRating: "თვითშეფასება",
    minutesSpent: "დახარჯული დრო",
    minutesUnit: "წთ",
    difficultyNote: "რა გამიჭირდა",
    start: "დაწყება",
    started: "დაწყებულია",
    submit: "ჩაბარება",
    submitting: "იგზავნება…",
    submittedOk: "დავალება ჩაბარდა",
    submittedAt: "ჩაბარდა: {date}",
    reviewedAt: "შემოწმდა: {date}",

    // errors — the DB trigger's English never reaches the screen
    errNotFound: "დავალება ვერ მოიძებნა",
    errForbidden: "ამის უფლება არ გაქვთ",
    errReviewerOnly: "სტატუსის დადასტურება ან დაბრუნება მხოლოდ მშობელს შეუძლია",
    errReopenReviewerOnly:
      "დადასტურებული დავალების ხელახლა გახსნა მხოლოდ მშობელს შეუძლია",
    errIllegalTransition: "ამ სტატუსიდან ასეთი გადასვლა დაუშვებელია",
    errChildLocked: "შემოწმების ველების შეცვლა მხოლოდ მშობელს შეუძლია",
    errInvalidValue: "შეყვანილი მონაცემი არასწორია",
    errNoSolutionPhotos: "ჩასაბარებლად საჭიროა მინიმუმ ერთი ფოტო ამოხსნისა",
    errSaveFailed: "დავალება ვერ შეინახა",
    errDeleteFailed: "დავალება ვერ წაიშალა",
  },

  // --------------------------------------------------------- attachments ---
  attachments: {
    addPhotos: "ფოტოს დამატება",
    addPhotosHint: "გადაიღე კამერით ან აირჩიე გალერეიდან",
    takePhoto: "კამერა",
    chooseFile: "ფაილის არჩევა",
    compressing: "მუშავდება…",
    uploading: "იტვირთება…",
    savingRow: "ინახება…",
    uploaded: "ატვირთულია",
    noPhotos: "ფოტო ჯერ არ არის",
    photoCount: "{count} ფოტო",
    limitReached: "მაქსიმუმ {count} ფოტოა დაშვებული",
    removePhoto: "ფოტოს წაშლა",
    removed: "ფოტო წაიშალა",
    retryUpload: "თავიდან ატვირთვა",
    loadingPhotos: "ფოტოები იტვირთება…",
    unavailable: "ფოტო ვერ ჩაიტვირთა",
    openPhoto: "ფოტოს გახსნა",
    closePhoto: "დახურვა",
    prevPhoto: "წინა ფოტო",
    nextPhoto: "შემდეგი ფოტო",
    zoomIn: "გადიდება",
    zoomOut: "დაპატარავება",
    zoomReset: "საწყისი ზომა",
    zoomHint: "გასადიდებლად ორი თითი ან ორმაგი შეხება",
    photoIndex: "{index} / {total}",
    deleteConfirmTitle: "წავშალოთ ფოტო?",
    deleteConfirmBody: "ფოტო სამუდამოდ წაიშლება. საჭიროების შემთხვევაში თავიდან გადაიღე.",

    errTooLarge: "ფაილი ძალიან დიდია",
    errBadType: "ასეთი ტიპის ფაილი არ იტვირთება",
    errNotImage: "აირჩიე სურათი",
    errDuplicate: "ეს ფაილი უკვე ატვირთულია",
    errForbidden: "ამ ფაილის ატვირთვის უფლება არ გაქვთ",
    errUploadFailed: "ატვირთვა ვერ მოხერხდა",
    errCompressFailed: "სურათი ვერ დამუშავდა",
    errDeleteFailed: "ფოტო ვერ წაიშალა",
    errTooManyFiles: "ერთდროულად მაქსიმუმ {count} ფაილი",
  },

  // ---------------------------------------------------------------- auth ---
  auth: {
    // shared
    appName: "SCHOOL-HUB",
    tagline: "სახლის დავალებების მართვა",
    email: "ელფოსტა",
    emailPlaceholder: "you@example.com",
    password: "პაროლი",
    passwordConfirm: "გაიმეორეთ პაროლი",
    displayName: "სახელი და გვარი",
    familyName: "ოჯახის სახელი",
    backToLogin: "დაბრუნება შესვლის გვერდზე",
    signOut: "გასვლა",

    // landing
    chooseRole: "როგორ შეხვალთ?",
    roleParent: "მშობელი",
    roleStudent: "მოსწავლე",

    // sign in
    loginTitle: "შესვლა",
    loginSubtitle: "შედით ელფოსტითა და პაროლით",
    signIn: "შესვლა",
    signingIn: "მიმდინარეობს შესვლა…",
    noAccount: "არ გაქვთ ანგარიში?",
    invalidCredentials: "ელფოსტა ან პაროლი არასწორია",
    emailNotConfirmed: "ელფოსტა ჯერ არ არის დადასტურებული",

    // sign up
    signUpTitle: "მშობლის ანგარიშის შექმნა",
    signUpSubtitle: "შექმენით ოჯახი და დაამატეთ ბავშვები",
    signUp: "რეგისტრაცია",
    signingUp: "მიმდინარეობს რეგისტრაცია…",
    hasAccount: "უკვე გაქვთ ანგარიში?",
    emailTaken: "ამ ელფოსტით ანგარიში უკვე არსებობს",
    checkEmail: "შეამოწმეთ ელფოსტა",
    confirmEmailSent: "დასადასტურებელი წერილი გამოგზავნილია მისამართზე {email}.",

    // password recovery
    forgotPassword: "დაგავიწყდათ პაროლი?",
    forgotTitle: "პაროლის აღდგენა",
    forgotSubtitle: "გამოგიგზავნით ბმულს ახალი პაროლის დასაყენებლად",
    sendResetLink: "ბმულის გაგზავნა",
    resetLinkSent:
      "თუ ასეთი ანგარიში არსებობს, აღდგენის ბმული გამოგზავნილია ელფოსტაზე.",
    resetTitle: "ახალი პაროლი",
    resetSubtitle: "შეიყვანეთ ახალი პაროლი",
    newPassword: "ახალი პაროლი",
    updatePassword: "პაროლის შენახვა",
    passwordUpdated: "პაროლი განახლდა",
    passwordSameAsOld: "ახალი პაროლი ძველის იდენტურია",
    resetLinkInvalid: "ბმული არასწორია ან ვადაგასულია. მოითხოვეთ ახალი.",
    resetNotForChild:
      "მოსწავლის ანგარიშს პაროლი არ აქვს — შესვლა PIN-ით ხდება. თუ PIN დაგავიწყდა, მშობელს სთხოვე ახალი მოწვევის კოდი.",

    // child — invite code
    joinTitle: "მოწვევის კოდი",
    joinSubtitle: "შეიყვანე კოდი, რომელიც მშობელმა მოგცა",
    inviteCode: "მოწვევის კოდი",
    inviteContinue: "გაგრძელება",
    inviteInvalid: "კოდი არასწორია",
    inviteExpired: "კოდს ვადა გაუვიდა. სთხოვე მშობელს ახალი.",
    inviteUsed: "ეს კოდი უკვე გამოყენებულია",
    inviteCodeCopied: "კოდი დაკოპირდა",

    // child — PIN
    pinCreateTitle: "შექმენი PIN-კოდი",
    pinCreateSubtitle: "4 ციფრი, რომელსაც ადვილად დაიმახსოვრებ",
    pin: "PIN-კოდი",
    pinConfirm: "გაიმეორე PIN-კოდი",
    pinSave: "შენახვა და შესვლა",
    pinWrong: "PIN-კოდი არასწორია",
    pinAttemptsLeft: "დარჩა {count} მცდელობა",
    pinLocked: "ძალიან ბევრი მცდელობა. სცადე {minutes} წუთში.",

    // child — sign in
    kidLoginTitle: "ვინ ხარ?",
    kidLoginSubtitle: "აირჩიე შენი სახელი",
    kidEnterPin: "შეიყვანე PIN-კოდი",
    kidWelcome: "გამარჯობა, {name}!",
    kidNoDevices: "ამ მოწყობილობაზე მოსწავლე ჯერ არ დამატებულა",
    kidAddDevice: "მოწვევის კოდით შესვლა",
    kidRemoveDevice: "წაშლა ამ მოწყობილობიდან",
    kidBackToList: "სხვა მოსწავლე",
  },

  // ------------------------------------------------------------ children ---
  children: {
    // list
    title: "ბავშვები",
    subtitle: "ბავშვების დამატება, რედაქტირება და წვდომის მართვა",
    empty: "ბავშვი ჯერ არ დაგიმატებიათ",
    emptyHint: "დაამატეთ პირველი ბავშვი, რომ ცხრილი და დავალებები აეწყოს",
    add: "ბავშვის დამატება",
    edit: "ბავშვის რედაქტირება",
    open: "გახსნა",
    selectHint: "აირჩიეთ ბავშვი, რომ ნახოთ მისი პარამეტრები",
    showArchived: "არქივის ჩვენება",

    // fields
    name: "სახელი",
    grade: "კლასი",
    gradeValue: "{grade} კლასი",
    gradeNone: "კლასი მითითებული არ არის",
    school: "სკოლა",
    schoolNone: "სკოლა მითითებული არ არის",
    birthDate: "დაბადების თარიღი",
    color: "ფერი",
    avatarUrl: "ავატარის ბმული",

    // lifecycle
    active: "აქტიური",
    archived: "არქივში",
    archive: "არქივში გადატანა",
    restore: "არქივიდან დაბრუნება",
    archiveConfirmTitle: "არქივში გადავიტანოთ {name}?",
    archiveConfirmBody:
      "ბავშვი გაქრება სიებიდან და ვეღარ შევა სისტემაში. მონაცემები რჩება — ნებისმიერ დროს დააბრუნებთ.",
    created: "ბავშვი დაემატა",
    updated: "ცვლილებები შენახულია",
    archivedToast: "ბავშვი არქივშია",
    restoredToast: "ბავშვი დაბრუნდა",

    // access panel
    accessTitle: "წვდომა",
    linked: "ანგარიში დაკავშირებულია",
    notLinked: "ანგარიში ჯერ არ არის დაკავშირებული",

    // invite code
    inviteTitle: "მოწვევის კოდი",
    inviteExplain:
      "ბავშვმა თავის ტელეფონზე უნდა გახსნას გვერდი /join და შეიყვანოს ეს 6-სიმბოლოიანი კოდი. შემდეგ თვითონ აირჩევს 4-ნიშნა PIN-ს და მოწყობილობა დაიმახსოვრებს შესვლას.",
    inviteGenerate: "კოდის გენერაცია",
    inviteRegenerate: "ახალი კოდის გენერაცია",
    inviteIssued: "ახალი კოდი გამოშვებულია",
    inviteNone: "აქტიური კოდი არ არის",
    inviteExpiresAt: "ვადა: {date}",
    inviteExpiredLabel: "კოდს ვადა გაუვიდა",
    inviteRevoke: "კოდის გაუქმება",
    inviteRevoked: "კოდი გაუქმდა",
    forgotPinTitle: "PIN დაავიწყდა?",
    forgotPinExplain:
      "ახალი კოდი იმავე ღილაკით გამოდის: ბავშვი თავიდან გაივლის /join-ს და ახალ PIN-ს დააყენებს. ძველი PIN უქმდება.",

    // PIN lock
    pinTitle: "PIN-კოდის ბლოკი",
    pinNotLocked: "დაბლოკილი არ არის",
    pinLockedUntil: "დაბლოკილია {time}-მდე",
    pinAttempts: "წარუმატებელი მცდელობა: {count}",
    pinUnlock: "ბლოკის მოხსნა",
    pinUnlocked: "ბლოკი მოხსნილია",
    pinUnlockExplain:
      "5 არასწორი მცდელობის შემდეგ შესვლა 15 წუთით იბლოკება. აქედან ბლოკს მაშინვე მოხსნით.",

    // preferences
    prefsTitle: "ინტერფეისი",
    uiMode: "ინტერფეისის რეჟიმი",
    uiModeSimple: "მარტივი",
    uiModeFull: "სრული",
    uiModeExplain:
      "მარტივი: მსხვილი ღილაკები, მხოლოდ „რა გავიარეთ“ და ფოტო, თვლადები არ ჩანს. სრული: შენიშვნის ველიც და დღის მოკლე სტატისტიკაც.",
    showOwnStats: "დაინახოს თავისი სტატისტიკა",
    showOwnStatsExplain:
      "თუ ჩართულია, ბავშვი თავის გვერდზე ხედავს კვირის შესრულებას და ზედიზედ დღეებს. თუ გამორთულია, ეს განყოფილება საერთოდ არ ჩანს.",
    prefsSaved: "პარამეტრები შენახულია",
  },

  // -------------------------------------------------------------- common ---
  common: {
    add: "დამატება",
    all: "ყველა",
    apply: "გამოყენება",
    back: "უკან",
    cancel: "გაუქმება",
    clear: "გასუფთავება",
    close: "დახურვა",
    confirm: "დადასტურება",
    copy: "კოპირება",
    create: "შექმნა",
    delete: "წაშლა",
    done: "მზადაა",
    edit: "რედაქტირება",
    filter: "ფილტრი",
    loading: "იტვირთება…",
    minutes: "წუთი",
    next: "შემდეგი",
    no: "არა",
    none: "არცერთი",
    notSet: "მითითებული არ არის",
    open: "გახსნა",
    optional: "არასავალდებულო",
    previous: "წინა",
    required: "სავალდებულო",
    retry: "თავიდან ცდა",
    save: "შენახვა",
    saving: "ინახება…",
    search: "ძებნა",
    today: "დღეს",
    yes: "დიახ",
    yesterday: "გუშინ",
  },

  // -------------------------------------------------------------- errors ---
  errors: {
    futureDate: "მომავალი თარიღი ჯერ ხელმისაწვდომი არ არის",
    generic: "რაღაც ვერ მოხერხდა. სცადეთ თავიდან.",
    network: "ქსელთან კავშირი ვერ დამყარდა",
    notFound: "ვერ მოიძებნა",
    offline: "ინტერნეტი გათიშულია",
    sessionExpired: "სესიას ვადა გაუვიდა. გთხოვთ, თავიდან შეხვიდეთ.",
    tooManyRequests: "ძალიან ბევრი მცდელობა. სცადეთ ცოტა ხანში.",
    unauthorized: "წვდომა აკრძალულია",

    // error / not-found boundaries
    pageTitle: "გვერდი ვერ ჩაიტვირთა",
    pageBody: "დროებითი შეფერხებაა. სცადეთ თავიდან.",
    backToDashboard: "დაფაზე დაბრუნება",
    reference: "კოდი: {code}",
    notFoundTitle: "გვერდი ვერ მოიძებნა",
    notFoundBody: "შესაძლოა ბმული მოძველდა ან გვერდი აღარ არსებობს.",
    goHome: "მთავარ გვერდზე",
  },

  // --------------------------------------------------------------- inbox ---
  inbox: {
    title: "შესამოწმებელი",
    subtitle: "ყველა ჩაბარებული დავალება, უახლესი ზემოთ",
    empty: "ყველაფერი შემოწმებულია",
    emptyHint: "როცა ბავშვი დავალებას ჩააბარებს, აქ გამოჩნდება",
    emptyFiltered: "ამ ფილტრით არაფერი მოიძებნა",
    waiting: "ელოდება {duration}",
    count: "{count} შესამოწმებელი",
    review: "შემოწმება",
    noPhoto: "ფოტოს გარეშე",
    clearFilters: "ფილტრის მოხსნა",
  },

  // ----------------------------------------------------------------- kid ---
  kid: {
    comingSoon: "მალე დაემატება",
    homeGreeting: "გამარჯობა, {name}!",
    homeSubtitle: "ეს არის შენი მთავარი გვერდი",
    menu: "მენიუ",

    // today (C1/C2)
    todayTitle: "დღეს",
    dayPrev: "გუშინდელი დღე",
    dayToday: "დღევანდელი დღე",
    noFuture: "მომავალ დღეზე ჯერ ვერ გადახვალ",
    lessonsHeading: "გაკვეთილები",
    assignmentsHeading: "დავალებები",
    dayDoneCount: "{done}/{total} შევსებული",

    // me (C5)
    meTitle: "ჩემი გვერდი",
    myClass: "კლასი",
    mySubjects: "ჩემი საგნები",
    mySubjectsEmpty: "საგნები ჯერ არ დამატებულა",
    myStats: "ჩემი პროგრესი",
    statsWeekDone: "ამ კვირაში ჩაბარებული",
    statsStreak: "ზედიზედ დღეები",
    statsCount: "{count}",

    // assignments (C3)
    assignmentsTitle: "დავალებები",
    assignmentsEmpty: "დავალება არ გაქვს",
    assignmentsEmptyHint: "როცა დავალება დაგემატება, აქ გამოჩნდება",
    redoBannerTitle: "გადასაკეთებელია",
    redoBannerHint: "ჯერ წაიკითხე შენიშვნა, მერე გააგრძელე",
    startWork: "დაწყება",
    submitWork: "ჩაბარება",
    needSolutionPhoto: "ჯერ ატვირთე ამოხსნის ფოტო — ერთი მაინც",
    howWasIt: "რამდენად გაიგე?",
    rating1: "ვერაფერი გავიგე",
    rating2: "ცოტა გავიგე",
    rating3: "მეტ-ნაკლებად",
    rating4: "კარგად გავიგე",
    rating5: "სრულად გავიგე",
    timeSpent: "რამდენი ხანი მოანდომე?",
    whatWasHard: "რა გამიჭირდა?",
    whatWasHardPlaceholder: "თუ გინდა, დაწერე…",
    submittedTitle: "ჩაბარებულია",
    submittedHint: "მშობელი შეამოწმებს",
    approvedTitle: "დადასტურებულია",
    approvedHint: "ყოჩაღ!",
    waitingReview: "შემოწმების მოლოდინში",
    parentComment: "მშობლის შენიშვნა",
    openChat: "ჩატის გახსნა",
    taskFromParent: "დავალების ფოტო",
    yourWork: "შენი ამოხსნა",

    // error boundary
    errorTitle: "უი, რაღაც აირია",
    errorBody: "არაუშავს — სცადე თავიდან.",
    errorRetry: "ისევ ცადე",
    errorHome: "დღევანდელ გვერდზე დაბრუნება",
  },

  // ------------------------------------------------------------- lessons ---
  lessons: {
    title: "გაკვეთილები",
    whatWeCovered: "რა გავიარეთ",
    topicPlaceholder: "მაგ. წილადების შეკრება",
    topicSuggestions: "საგნის თემები",
    notes: "შენიშვნა",
    notesPlaceholder: "დამატებითი დეტალები მშობლისთვის",
    photoLabel: "წიგნის ფოტო",
    saved: "შენახულია",
    empty: "ამ დღეს გაკვეთილი არ არის",
    emptyHint: "ცხრილში ამ დღეს გაკვეთილები არ დგას",
    subjectUnknown: "საგნის გარეშე",
    timeRange: "{from}–{to}",

    // materialisation from the timetable
    generate: "დღის გაკვეთილების აწყობა ცხრილიდან",
    generated: "ცხრილიდან დაემატა {count} გაკვეთილი",
    generatedNone: "ყველა გაკვეთილი უკვე აწყობილია",

    // "no homework" (needs lessons.no_homework in the DB)
    noHomework: "დავალება არ მოგვცეს",
    noHomeworkOn: "დავალება არ მოგვცეს — ჩაწერილია",
    noHomeworkUndo: "დავალება მაინც მოგვცეს",
    noHomeworkSaved: "ჩაწერილია: დავალება არ მოგვცეს",
    noHomeworkCleared: "მონიშვნა მოხსნილია",
    noHomeworkUnavailable:
      "ეს ფუნქცია ჯერ ბაზაში არ არის ჩართული (lessons.no_homework). მიმართეთ მშობელს.",
  },

  // ------------------------------------------------------------ messages ---
  messages: {
    title: "მიმოწერა",
    placeholder: "დაწერე შეტყობინება…",
    send: "გაგზავნა",
    sending: "იგზავნება…",
    empty: "შეტყობინება ჯერ არ არის",
    emptyHint: "დაწერე პირველი შეტყობინება",
    attachPhoto: "ფოტოს მიმაგრება",
    attachedCount: "{count} ფოტო მიმაგრებულია",
    unread: "ახალი",
    unreadCount: "{count} ახალი",
    you: "შენ",
    unknownAuthor: "მომხმარებელი",
    voiceMessage: "ხმოვანი შეტყობინება",
    voiceUnsupported: "ხმოვანი შეტყობინება ამ მოწყობილობაზე არ იკვრება",

    // /kid/chat
    chatListTitle: "ჩატები",
    chatListEmpty: "ჩატი ჯერ არ გაქვს",
    chatListEmptyHint: "მიმოწერა დავალების გვერდიდან იწყება",
    lastMessageAt: "ბოლო: {time}",

    errEmpty: "შეტყობინება ცარიელია",
    errSendFailed: "შეტყობინება ვერ გაიგზავნა",
    errTooLong: "შეტყობინება ძალიან გრძელია",
  },

  // ----------------------------------------------------------------- nav ---
  nav: {
    // parent
    dashboard: "დაფა",
    inbox: "შესამოწმებელი",
    children: "ბავშვები",
    schedule: "ცხრილი",
    subjects: "საგნები",
    settings: "პარამეტრები",
    // kid
    kidToday: "დღეს",
    kidAssignments: "დავალებები",
    kidChat: "ჩატი",
    kidMe: "მე",
    // chrome
    openMenu: "მენიუს გახსნა",
    closeMenu: "მენიუს დახურვა",
    mainNavigation: "მთავარი ნავიგაცია",
    userMenu: "მომხმარებლის მენიუ",
  },

  // -------------------------------------------------------------- parent ---
  parent: {
    comingSoon: "ეს განყოფილება მალე დაემატება",
    dashboardTitle: "დაფა",
    dashboardSubtitle: "ბავშვების დღევანდელი სურათი",
    noChildren: "ბავშვი ჯერ არ დაგიმატებიათ",
    addChild: "ბავშვის დამატება",
    selectChild: "აირჩიეთ ბავშვი",
    allChildren: "ყველა ბავშვი",
    childSwitcher: "ბავშვის არჩევა",
    noActiveChild: "ჯერ არცერთი აქტიური ბავშვი არ არის",
    manageChildren: "ბავშვების მართვა",

    // dashboard cards (P1)
    todayLessons: "დღევანდელი გაკვეთილები",
    dueToday: "დღეს ჩასაბარებელი",
    awaitingReview: "შესამოწმებელი",
    weekCompletion: "კვირის შესრულება",
    weekRedo: "კვირის გადაკეთება",
    weekCompletionEmpty: "ამ კვირაში ვადა არ დამდგარა",
    dashboardHint: "რიცხვზე დაჭერით გაიხსნება შესაბამისი სია",

    // assignments (P4 slice)
    assignmentsTitle: "დავალებები",
    assignmentsSubtitle: "ოჯახის ყველა დავალება",
    newAssignment: "ახალი დავალება",
  },

  // ----------------------------------------------------------------- pwa ---
  pwa: {
    appShortName: "სკოლა",
    offlineTitle: "ინტერნეტი გათიშულია",
    offlineBody: "შეამოწმე კავშირი და სცადე თავიდან.",
  },

  // -------------------------------------------------------------- review ---
  review: {
    title: "შემოწმება",
    taskSide: "დავალება",
    solutionSide: "ამოხსნა",
    approve: "დადასტურება",
    requestRedo: "გადასაკეთებელი",
    working: "მიმდინარეობს…",
    approvedOk: "დადასტურდა",
    sentBackOk: "დაბრუნდა გადასაკეთებლად",
    redoCommentLabel: "რა უნდა გადააკეთოს?",
    redoCommentPlaceholder: "მაგ. მე-3 სავარჯიშოში ჯამი არასწორია — გადათვალე.",
    childFeedback: "ბავშვის შეფასება",
    noSelfRating: "არ შეუფასებია",
    noMinutes: "დრო არ მითითებულა",
    noDifficultyNote: "შენიშვნის გარეშე",
    previousComments: "წინა შენიშვნები",
    noPreviousComments: "წინა შენიშვნები არ არის",
    nextInQueue: "შემდეგი",
    queueEmpty: "რიგი დასრულდა",
    queueRemaining: "დარჩა {count}",
    backToInbox: "შესამოწმებელზე დაბრუნება",
    shortcuts: "კლავიშები",
    shortcutApprove: "A — დადასტურება",
    shortcutRedo: "R — გადასაკეთებელი",
    shortcutNext: "N — შემდეგი",
    notSubmitted: "ეს დავალება ჩაბარებული არ არის",
    reopenTitle: "შესწორება",
    reopenToRedo: "გადასაკეთებლად დაბრუნება",
    reopenToProgress: "შესრულებაში დაბრუნება",
    reopenedOk: "დავალება ხელახლა გაიხსნა",
    noTaskPhotos: "დავალების ფოტო არ არის",
    noSolutionPhotos: "ამოხსნის ფოტო არ არის",
  },

  // ------------------------------------------------------------ schedule ---
  schedule: {
    title: "ცხრილი",
    subtitle: "კვირეული ცხრილი — ცარიელ უჯრაზე დაჭერით დაამატებთ გაკვეთილს",
    addSlot: "გაკვეთილის დამატება",
    editSlot: "გაკვეთილის რედაქტირება",
    addAt: "დამატება: {weekday}",
    subject: "საგანი",
    startTime: "დაწყება",
    endTime: "დასრულება",
    slotCreated: "გაკვეთილი დაემატა ცხრილში",
    slotUpdated: "გაკვეთილი განახლდა",
    slotDeleted: "გაკვეთილი ცხრილიდან მოიხსნა",
    deleteSlotConfirmTitle: "მოვხსნათ გაკვეთილი ცხრილიდან?",
    deleteSlotConfirmBody:
      "მომავალში ეს გაკვეთილი აღარ აეწყობა. უკვე ჩაწერილი გაკვეთილები რჩება.",
    overlap:
      "ამ დროს უკვე დგას „{subject}“ ({from}–{to}). ერთ დღეში გაკვეთილები არ უნდა ემთხვეოდეს.",
    timeOrder: "დასრულების დრო დაწყებაზე გვიან უნდა იყოს",
    noSubjects: "ცხრილის ასაწყობად ჯერ საგნები დაამატეთ",
    goToSubjects: "საგნებზე გადასვლა",
    emptyDay: "—",
    weekdayHeader: "დღე",
    timeHeader: "დრო",

    // versioning (effective_from / effective_to)
    asOf: "ცხრილი თარიღისთვის",
    asOfToday: "დღევანდელი ცხრილი",
    showToday: "დღევანდელზე დაბრუნება",
    effectiveFrom: "მოქმედებს {from}-დან",
    effectiveRange: "მოქმედებდა {from}-დან {to}-მდე",
    pastNotice:
      "თქვენ უყურებთ წარსულ ცხრილს. აქ ცვლილება ისტორიას არ შეცვლის — შეიქმნება ახალი ვერსია.",
    newVersion: "ახალი ცხრილი თარიღიდან",
    newVersionTitle: "ახალი ცხრილის ვერსია",
    newVersionExplain:
      "მოქმედი ცხრილი დაიხურება არჩეულ თარიღამდე, ხოლო მისი ასლი გაიხსნება ახალ ვერსიად. ისტორია არ იშლება — ძველი გაკვეთილები რჩება ისე, როგორც იყო.",
    newVersionFrom: "მოქმედებს თარიღიდან",
    newVersionCreated: "ახალი ვერსია შექმნილია — ახლა შეგიძლიათ შეცვალოთ",
    newVersionTooEarly: "თარიღი დღევანდელზე ან ნაჩვენებ თარიღზე ადრე ვერ იქნება",
    newVersionEmpty: "ამ თარიღისთვის ცხრილი ცარიელია — უბრალოდ დაამატეთ გაკვეთილები",
  },

  // ------------------------------------------------------------ settings ---
  settings: {
    title: "პარამეტრები",
    subtitle: "ანგარიში და აპლიკაციის იერსახე",
    accountTitle: "ანგარიში",
    displayName: "სახელი",
    emailHint: "ელფოსტა შესვლის იდენტიფიკატორია და აქედან არ იცვლება",
    accountSaved: "ანგარიში განახლდა",
    appearanceTitle: "იერსახე",
    themeLabel: "თემა",
    childrenTitle: "ბავშვები",
    childrenHint: "მოწვევის კოდები, PIN-ის ბლოკი და ინტერფეისის რეჟიმი",
    laterTitle: "მოგვიანებით",
    laterBody: "შეტყობინებები და რეპორტები მომდევნო ფაზაში დაემატება.",
  },

  // -------------------------------------------------------------- status ---
  // assignments.status — keep in sync with the DB enum.
  status: {
    assigned: "მინიჭებული",
    in_progress: "შესრულებაში",
    submitted: "ჩაბარებული",
    approved: "დადასტურებული",
    redo: "გადასაკეთებელი",
  },

  // ------------------------------------------------------------ subjects ---
  subjects: {
    title: "საგნები და თემები",
    subtitle: "საგნები, ფერები, მასწავლებლები და თემების სია",
    empty: "საგანი ჯერ არ დამატებულა",
    emptyHint: "საგნების გარეშე ცხრილს ვერ ავაწყობთ",
    add: "საგნის დამატება",
    edit: "საგნის რედაქტირება",
    name: "საგნის სახელი",
    color: "ფერი",
    teacher: "მასწავლებელი",
    teacherNone: "მასწავლებელი მითითებული არ არის",
    moveUp: "ზემოთ აწევა",
    moveDown: "ქვემოთ ჩაწევა",
    created: "საგანი დაემატა",
    updated: "საგანი განახლდა",
    deleted: "საგანი წაიშალა",
    reordered: "რიგითობა შეიცვალა",
    duplicateName: "ამ სახელით საგანი უკვე არსებობს",
    deleteConfirmTitle: "წავშალოთ საგანი „{name}“?",
    deleteConfirmBody: "საგანი და მისი თემები სამუდამოდ წაიშლება.",
    deleteUsageWarning:
      "ყურადღება: ამ საგანს უკავშირდება {lessons} გაკვეთილი, {assignments} დავალება და {slots} სლოტი ცხრილში. ცხრილის სლოტები წაიშლება; გაკვეთილები და დავალებები დარჩება, მაგრამ საგნის გარეშე.",
    usageChecking: "მოწმდება…",

    // topics
    topicsTitle: "თემები",
    topicsEmpty: "თემები ჯერ არ დამატებულა",
    topicAdd: "თემის დამატება",
    topicName: "თემის სახელი",
    topicParent: "ზედა თემა",
    topicParentNone: "ზედა თემის გარეშე",
    topicCreated: "თემა დაემატა",
    topicUpdated: "თემა განახლდა",
    topicDeleted: "თემა წაიშალა",
    topicDeleteConfirmTitle: "წავშალოთ თემა „{name}“?",
    topicDeleteConfirmBody: "ქვეთემებიც წაიშლება. დავალებები დარჩება, თემის გარეშე.",
    topicNestingLimit: "მხოლოდ ერთი დონის ჩადგმაა დაშვებული",
  },

  // --------------------------------------------------------------- theme ---
  theme: {
    toggle: "თემის შეცვლა",
    light: "ნათელი",
    dark: "ბნელი",
    system: "სისტემური",
  },

  // ---------------------------------------------------------- validation ---
  validation: {
    codeLength: "კოდი უნდა შედგებოდეს 6 სიმბოლოსგან",
    colorInvalid: "ფერი უნდა იყოს HEX ფორმატში, მაგ. #4f46e5",
    commentRequired: "კომენტარი სავალდებულოა",
    dateInvalid: "თარიღი არასწორია",
    emailInvalid: "ელფოსტა არასწორია",
    gradeRange: "კლასი უნდა იყოს 1-დან 12-მდე",
    minutesRange: "დრო უნდა იყოს 0-დან 1440 წუთამდე",
    nameMin: "სახელი უნდა შეიცავდეს მინიმუმ 2 სიმბოლოს",
    ratingRange: "შეფასება უნდა იყოს 1-დან 5-მდე",
    passwordMin: "პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს",
    passwordsDoNotMatch: "პაროლები არ ემთხვევა",
    pinDigits: "PIN უნდა შედგებოდეს ზუსტად 4 ციფრისგან",
    pinsDoNotMatch: "PIN-კოდები არ ემთხვევა",
    required: "სავალდებულო ველი",
    timeInvalid: "დრო არასწორია (სწორი ფორმატია 08:30)",
    titleRequired: "სათაური სავალდებულოა",
    tooLong: "ტექსტი ძალიან გრძელია",
    weekdayInvalid: "კვირის დღე არასწორია",
  },

  // ------------------------------------------------------------- weekday ---
  // ISO 8601 weekday numbers: 1 = Monday … 7 = Sunday.
  weekday: {
    long1: "ორშაბათი",
    long2: "სამშაბათი",
    long3: "ოთხშაბათი",
    long4: "ხუთშაბათი",
    long5: "პარასკევი",
    long6: "შაბათი",
    long7: "კვირა",
    short1: "ორშ",
    short2: "სამ",
    short3: "ოთხ",
    short4: "ხუთ",
    short5: "პარ",
    short6: "შაბ",
    short7: "კვი",
  },
} as const;

/* -------------------------------------------------------------------------- */
/*  typed lookup                                                              */
/* -------------------------------------------------------------------------- */

type Dict = { readonly [key: string]: string | Dict };

type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends Dict
      ? `${K}.${LeafPaths<T[K]>}`
      : never;
}[keyof T & string];

/** Every valid dot-path into `ka`, e.g. `"auth.loginTitle"`. */
export type KaKey = LeafPaths<typeof ka>;

/** Values accepted for `{placeholder}` interpolation. */
export type KaParams = Record<string, string | number>;

/**
 * Look up a Georgian string by dot-path and interpolate `{placeholders}`.
 *
 *   t("auth.loginTitle")                    // "შესვლა"
 *   t("auth.pinLocked", { minutes: 15 })    // "… სცადე 15 წუთში."
 */
export function t(key: KaKey, params?: KaParams): string {
  let node: string | Dict = ka;

  for (const part of key.split(".")) {
    if (typeof node === "string") break;
    const next: string | Dict | undefined = node[part];
    if (next === undefined) return key;
    node = next;
  }

  if (typeof node !== "string") return key;
  if (!params) return node;

  return node.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Georgian label for an `assignments.status` value. Typed against the DB enum,
 * so adding a status to the schema without a translation fails the build.
 */
export function statusLabel(status: AssignmentStatus): string {
  return ka.status[status];
}
