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

    // the child records what was given (C2 / C3 quick add)
    kidAdd: "დავალება დამატება",
    kidAddTitle: "რა დაგვავალეს?",
    kidAddHint: "გადაიღე წიგნის გვერდი — დანარჩენი არასავალდებულოა",
    kidTitlePlaceholder: "სათაური — თუ არ დაწერ, ავტომატურად შეივსება",
    kidTaskPhoto: "დავალების ფოტო",
    kidSaveWithoutPhoto: "ფოტოს გარეშე დამატება",
    kidDone: "მზადაა",
    kidCreated: "დავალება ჩაიწერა",
    kidAutoTitle: "{subject} — {date}",
    kidAutoTitleNoSubject: "დავალება — {date}",

    // who entered the row (parent-side, quiet)
    createdByChild: "ბავშვმა ჩაწერა",
    createdByParent: "მშობელმა ჩაწერა",

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

    // oral homework: evidence may be a photo OR a recording. The photo-only
    // wording above is kept for anything that still means literally a photo.
    solutionEvidence: "ამოხსნა",
    errNoSolutionEvidence:
      "ჩასაბარებლად საჭიროა მინიმუმ ერთი ფოტო ან ხმოვანი ჩანაწერი",
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

    // audio evidence — oral homework (learn a poem, read aloud, pronunciation)
    recordAudio: "ხმის ჩაწერა",
    recordHere: "აქვე ჩაწერა",
    recordAudioHint:
      "თქვი ან წაიკითხე ხმამაღლა — ტელეფონი ჩაწერს და ჩანაწერი დაერთვება",
    stopRecording: "გაჩერება · {duration}",
    recording: "ხმოვანი ჩანაწერი",
    recordings: "ხმოვანი ჩანაწერები",
    recordingIndex: "ჩანაწერი {index} / {total}",
    recordingLimitReached: "მაქსიმუმ {count} ჩანაწერია დაშვებული",
    removeRecording: "ჩანაწერის წაშლა",
    loadingAudio: "ჩანაწერი იტვირთება…",
    audioUnavailable: "ჩანაწერი ვერ ჩაიტვირთა",
    noEvidence: "ამოხსნა ჯერ არ არის",
    recorderUnavailable:
      "ბრაუზერში ჩაწერა ვერ მოხერხდა — დააჭირე „ხმის ჩაწერას“ და ტელეფონი ჩაწერს",
    deleteRecordingConfirmTitle: "წავშალოთ ჩანაწერი?",
    deleteRecordingConfirmBody:
      "ჩანაწერი სამუდამოდ წაიშლება. საჭიროების შემთხვევაში თავიდან ჩაწერე.",

    errNotAudio: "აირჩიე ხმოვანი ჩანაწერი (m4a, mp3, ogg ან webm)",
    errAudioTooLarge: "ჩანაწერი ძალიან დიდია — მაქსიმუმ 10 MB",
    errEmptyRecording: "ჩანაწერი ცარიელია — სცადე თავიდან",

    // removing a bad take before the work is handed in
    recordingRemoved: "ჩანაწერი წაიშალა",
    errDeleteLocked:
      "ჩაბარების შემდეგ წაშლა აღარ შეიძლება — მიწერე მშობელს ჩატში",
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

    // child — sign in, nobody remembered on this device
    kidNoDevicesTitle: "აქ ჯერ არავინ შესულა",
    kidNoDevicesHelp:
      "სთხოვე მშობელს ახალი მოწვევის კოდი — ის კოდს თავის გვერდზე შექმნის.",
    kidNoDevicesAction: "კოდი მაქვს, შევდივარ",
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

    // child page (P4) — chrome
    pageOpen: "ბავშვის გვერდი",
    pageOpenHint: "რა ჩაიწერა დღეს, დავალებები და ბოლო 30 დღე",
    pageBack: "ბავშვების სია",
    pageTabToday: "დღეს",
    pageTabAssignments: "დავალებები",
    pageTabHistory: "ისტორია",
    pageTabSchedule: "ცხრილი",
    pageTabReports: "რეპორტი",

    // child page — day tab
    dayPrev: "წინა დღე",
    dayNext: "შემდეგი დღე",
    dayToday: "დღეს",
    dayNoFuture: "მომავალი დღე ჯერ არ დამდგარა",
    dayLessonsHeading: "გაკვეთილები",
    dayAssignmentsHeading: "დღის დავალებები",
    dayFilledCount: "შევსებულია {done}/{total}",
    dayAllFilled: "დღის ყველა გაკვეთილი ჩაწერილია",
    dayMissingCount: "{count} გაკვეთილი ჯერ არ ჩაწერილა",
    dayNothingRecorded: "ამ დღეს ბავშვს არაფერი ჩაუწერია",
    dayNothingRecordedHint:
      "არცერთ გაკვეთილზე არ არის შევსებული „რა გავიარეთ“ და არც „დავალება არ მოგვცეს“ მონიშნულა.",
    dayNoLessons: "ამ დღეს გაკვეთილი არ იყო",
    dayNoLessonsHint:
      "ცხრილში ამ დღეს გაკვეთილი არ დგას. ცხრილის შესაცვლელად გადადით ტაბზე „ცხრილი“.",

    // child page — the three lesson states
    lessonRecorded: "ჩაწერილია",
    lessonNoHomework: "დავალება არ მოგვცეს",
    lessonBlank: "ჯერ არაფერია ჩაწერილი",
    lessonBlankHint: "„რა გავიარეთ“ შეუვსებელია და ფოტოც არ არის",
    lessonNotOpened: "გაკვეთილი არ გახსნილა",
    lessonNotOpenedHint: "ცხრილში დგას, მაგრამ ჩანაწერი საერთოდ არ დაწყებულა",
    lessonNotes: "შენიშვნა",
    lessonNoPhoto: "წიგნის ფოტო არ არის",
    lessonAssignmentCount: "{count} დავალება",

    // child page — assignments tab
    tabAssignmentsSubtitle: "ამ ბავშვის ყველა დავალება",
    tabAssignmentsEmpty: "დავალება ვერ მოიძებნა",
    tabAssignmentsEmptyHint: "შეცვალეთ ფილტრი ან დაამატეთ ახალი დავალება",

    // child page — history tab
    historyTitle: "ბოლო 30 დღე",
    historyHint: "სად დარჩა დღე შეუვსებელი — ერთი შეხედვით",
    historyLessonsLabel: "გაკვეთილი",
    historyAssignmentsLabel: "დავალება",
    historyOpenLabel: "ღია {count}",
    historyRatio: "{done}/{total}",
    historyNoSchedule: "უგაკვეთილო დღე",
    historyNothing: "არაფერი",
    historyEmpty: "ისტორია ჯერ ცარიელია",
    historyEmptyHint:
      "ბოლო 30 დღეში არც გაკვეთილი ჩაწერილა და არც დავალება დამდგარა",
    historySummary: "{days} დღე ნაწილობრივ ან სულ არ შევსებულა",
    historySummaryClean: "ბოლო 30 დღეში გამოტოვებული დღე არ არის",
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

  // ------------------------------------------------------------- helpers ---
  helpers: {
    // /parent/helpers
    title: "დამხმარეები",
    subtitle:
      "ბებია, რეპეტიტორი ან მეორე მშობელი — ხედავს კონკრეტული ბავშვის დავალებებს, ოჯახს კი არ მართავს",
    empty: "დამხმარე ჯერ არ დაგიმატებიათ",
    emptyHint: "მოიწვიეთ ადამიანი, რომელსაც ბავშვის დავალებების ნახვა უნდა შეეძლოს",
    activeTitle: "აქტიური დამხმარეები",
    pendingTitle: "გაგზავნილი მოწვევები",
    pendingEmpty: "მოლოდინში მოწვევა არ არის",
    removedTitle: "წვდომაშეწყვეტილები",
    removedEmpty: "წვდომაშეწყვეტილი დამხმარე არ არის",
    showRemoved: "წვდომაშეწყვეტილების ჩვენება",

    // invite
    invite: "დამხმარის მოწვევა",
    inviteTitle: "ახალი დამხმარე",
    inviteSubtitle: "აირჩიეთ ბავშვი და უფლებები. ბმულს თქვენ გადასცემთ.",
    email: "email",
    emailPlaceholder: "mag. bebia@example.com",
    emailExplain:
      "ეს მისამართი უნდა დაემთხვეს იმ ანგარიშს, რომლითაც ადამიანი შემოვა.",
    inviteSend: "მოწვევის შექმნა",
    inviteCreated: "მოწვევა შეიქმნა — დააკოპირეთ ბმული და გადაუგზავნეთ",
    noEmailTitle: "წერილს სისტემა არ აგზავნის",
    noEmailBody:
      "ბმული ავტომატურად არ იგზავნება. დააკოპირეთ და თქვენ გადაუგზავნეთ — მესენჯერით, SMS-ით ან ზეპირად, როგორც ბავშვის მოწვევის კოდს.",
    linkLabel: "მოწვევის ბმული",
    linkCopy: "ბმულის კოპირება",
    linkCopied: "ბმული დაკოპირდა",
    expiresAt: "ვადა: {date}",
    expired: "ვადა გასულია",
    pendingBadge: "მოლოდინში",
    acceptedAt: "მიღებულია: {date}",

    // children + permissions
    childrenLabel: "რომელ ბავშვს ხედავს",
    childrenExplain:
      "მხოლოდ მონიშნული ბავშვები. დანარჩენ ბავშვებს დამხმარე ვერც დაინახავს და ვერც გაიგებს, რომ არსებობენ.",
    childrenRequired: "მონიშნეთ მინიმუმ ერთი ბავშვი",
    childrenCount: "{count} ბავშვი",
    permissionsLabel: "უფლებები",
    permView: "ნახვა",
    permViewExplain:
      "ხედავს დავალებებს, ფოტოებსა და მიმოწერას. ეს უფლება ყოველთვის აქვს.",
    permComment: "კომენტარი",
    permCommentExplain: "შეუძლია დავალების ჩატში მიწეროს ბავშვს.",
    permReview: "შემოწმება",
    permReviewExplain:
      "შეუძლია დავალება მონიშნოს შესრულებულად (✓) ან დააბრუნოს გადასაკეთებლად (↻) — ანუ თქვენს ნაცვლად გადაწყვიტოს, დავალება ჩათვლილია თუ არა. ჩართეთ მხოლოდ მაშინ, თუ ამ ადამიანს ამას ანდობთ.",
    permReviewOffHint: "სტანდარტულად გამორთულია",
    permNever: "ვერ შეძლებს",
    permNeverExplain:
      "ბავშვების დამატებას ან რედაქტირებას, მოწვევის კოდებს, PIN-ს, ცხრილს, საგნებს, ნიშნებს და სხვა დამხმარეების მართვას.",
    permSummaryView: "ნახვა",
    permSummaryComment: "ნახვა + კომენტარი",
    permSummaryReview: "ნახვა + კომენტარი + შემოწმება",
    permSummaryReviewOnly: "ნახვა + შემოწმება",

    // edit / revoke
    editTitle: "დამხმარის უფლებები",
    save: "შენახვა",
    saved: "უფლებები განახლდა",
    revokeInvite: "მოწვევის გაუქმება",
    revokeInviteConfirm: "გაუქმდეს მოწვევა {email}-ისთვის? ბმული მაშინვე გაუქმდება.",
    revokedInvite: "მოწვევა გაუქმდა",
    remove: "წვდომის შეწყვეტა",
    removeConfirmTitle: "შეწყდეს {name}-ის წვდომა?",
    removeConfirmBody:
      "მაშინვე დაკარგავს ბავშვის დავალებებზე წვდომას. მისი უკვე დაწერილი შეტყობინებები რჩება — სხვისი სიტყვები არ იშლება.",
    removed: "წვდომა შეწყდა",
    restore: "წვდომის აღდგენა",
    restored: "წვდომა აღდგა",

    // acceptance (/helper/invite/[token])
    acceptTitle: "მოწვევა დამხმარედ",
    acceptIntro: "{family} გიწვევთ, დაეხმაროთ დავალებების თვალყურის დევნებაში.",
    acceptForChildren: "ბავშვები: {names}",
    acceptRights: "უფლებები: {rights}",
    acceptSignedInAs: "შესული ხართ როგორც {email}",
    accept: "მოწვევის მიღება",
    accepting: "მიმდინარეობს…",
    accepted: "მოწვევა მიღებულია",
    acceptCreateTitle: "შექმენით ანგარიში",
    acceptCreateBody: "ანგარიში {email} მისამართზე შეიქმნება.",
    acceptDisplayName: "სახელი",
    acceptPassword: "პაროლი",
    acceptPasswordConfirm: "გაიმეორეთ პაროლი",
    acceptCreate: "ანგარიშის შექმნა და მოწვევის მიღება",
    acceptHaveAccount: "უკვე გაქვთ ანგარიში ამ მისამართით?",
    acceptSignIn: "შესვლა",
    errInviteNotFound: "მოწვევა ვერ მოიძებნა",
    errInviteExpired: "მოწვევას ვადა გაუვიდა. სთხოვეთ მშობელს ახალი ბმული.",
    errInviteUsed: "ეს მოწვევა უკვე გამოყენებულია",
    errInviteRevoked: "მოწვევა გაუქმებულია",
    errEmailMismatch:
      "მოწვევა გაგზავნილია {email} მისამართზე, თქვენ კი შესული ხართ სხვა ანგარიშით. გამოდით და შედით სწორი მისამართით.",
    errAlreadyParent:
      "ეს ანგარიში უკვე თავისი ოჯახის მშობელია. დამხმარედ სხვა email-ით დარეგისტრირდით.",
    errChildAccount: "ბავშვის ანგარიშით მოწვევის მიღება არ შეიძლება",
    errEmailTaken:
      "ამ მისამართზე ანგარიში უკვე არსებობს — შედით და ისევ გახსენით ეს ბმული.",
    errNoChildren: "მოწვევაში ბავშვი მითითებული არ არის",

    // the helper's own area
    homeTitle: "დავალებები",
    homeSubtitle: "თქვენთვის მინდობილი ბავშვები",
    homeEmpty: "ჯერ არცერთი ბავშვი არ გაქვთ მინდობილი",
    homeEmptyHint: "წვდომა მშობელმა უნდა მოგცეთ",
    queueTitle: "შესამოწმებელი",
    queueEmpty: "შესამოწმებელი არაფერია",
    recentTitle: "ბოლო დავალებები",
    viewOnly: "მხოლოდ ნახვა",
    viewOnlyExplain: "შემოწმების უფლება არ გაქვთ — გადაწყვეტილებას მშობელი იღებს.",
    commentOffExplain: "ჩატში წერის უფლება არ გაქვთ.",
    backToChildren: "ბავშვებზე დაბრუნება",
    signedInAsHelper: "დამხმარე",
    errUnauthorized: "ამ მოქმედების უფლება არ გაქვთ",
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
    signOutHint: "ეს მოწყობილობა დაგიმახსოვრებს — დაბრუნება PIN-კოდით შეგიძლია.",

    // assignments (C3)
    assignmentsTitle: "დავალებები",
    assignmentsEmpty: "დავალება არ გაქვს",
    assignmentsEmptyHint: "როცა დავალება დაგემატება, აქ გამოჩნდება",
    redoBannerTitle: "გადასაკეთებელია",
    redoBannerHint: "ჯერ წაიკითხე შენიშვნა, მერე გააგრძელე",
    startWork: "დაწყება",
    submitWork: "ჩაბარება",
    needSolutionPhoto: "ჯერ ატვირთე ამოხსნის ფოტო — ერთი მაინც",
    // oral homework: a photo is no longer the only way to hand work in
    needSolutionEvidence: "ჯერ დაურთე ამოხსნა — ფოტო ან ხმოვანი ჩანაწერი",
    yourRecording: "ზეპირი დავალება",
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

    // home dashboard + week grid (C1 / C6, SPEC 4a)
    viewDay: "დღე",
    viewWeek: "კვირა",
    weekTitle: "კვირის ცხრილი",
    weekPrev: "წინა კვირა",
    weekNext: "შემდეგი კვირა",
    weekThis: "ეს კვირა",
    weekRange: "{from} – {to}",
    weekEmpty: "ცხრილი ჯერ არ არის შევსებული",
    weekEmptyHint: "სთხოვე მშობელს, რომ გაკვეთილების ცხრილი შეავსოს",
    weekDayEmpty: "გაკვეთილი არ არის",
    weekLegend: "ფერების მნიშვნელობა",

    sectionOverdue: "გადაცილებული",
    sectionToRecord: "ჩასაწერი",
    sectionTomorrow: "ხვალისთვის",
    sectionUrgent: "სასწრაფო",
    sectionPrepare: "მოსამზადებელი",
    sectionReturned: "გადასაკეთებელი",

    toRecordCount: "{count} საგანი — ჩასაწერია",
    toRecordHint: "ჯერ ჩაწერე, რა დაგავალეს — ან მონიშნე, რომ არ მოგცეს",
    allRecorded: "ყველაფერი ჩაწერილია",
    recordedAlready: "უკვე ჩაწერილი",
    allRecordedOpen: "დღევანდელი გაკვეთილების ნახვა",
    nothingToday: "დღეს გაკვეთილი არ გქონია",

    forDate: "{date}-ისთვის",
    tomorrowEmpty: "შემდეგი დღისთვის არაფერია",
    prepareEmpty: "სხვა დავალება არ გაქვს",

    cellEmpty: "ჩასაწერია",
    cellNone: "დავალება არ მოგვცეს",
    cellTodo: "შესასრულებელია",
    cellSubmitted: "ჩაბარებულია",
    cellApproved: "დადასტურებულია",
    cellOverdue: "ვადაგადაცილებული",

    cellNotYet: "ეს გაკვეთილი ჯერ არ ჩატარებულა",
    cellOpenDay: "ამ დღის გახსნა",
    cellClose: "დახურვა",

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

    // the two opposite answers to "was homework given?" — the caption above
    // them is what keeps „დამატება" and „არ მოგვცეს" from reading as a pair of
    // interchangeable buttons.
    homeworkQuestion: "დავალება მოგვცეს?",

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

    // phase 2 — realtime
    dismissFailed: "მოცილება",
    liveOffline: "კავშირი შეწყვეტილია — განახლდება ავტომატურად",

    // phase 3 — /parent/chat, the parent's messenger
    parentChatTitle: "მიმოწერა",
    threadListTitle: "საუბრები",
    threadCount: "{count} საუბარი",
    threadUnreadTotal: "{count} წაუკითხავი",
    photoMessage: "ფოტო",
    pickThread: "აირჩიე საუბარი",
    pickThreadHint: "სიიდან აირჩიე დავალება — მიმოწერა აქ გაიხსნება",
    backToThreads: "საუბრებში დაბრუნება",
    filterChild: "ბავშვი",
    filterAllChildren: "ყველა ბავშვი",
    filterUnreadOnly: "მხოლოდ წაუკითხავი",
    noThreads: "მიმოწერა ჯერ არ დაწყებულა",
    noThreadsHint: "საუბარი კონკრეტულ დავალებაზე იწყება — დაწერე პირველი შეტყობინება დავალების გვერდიდან",
    noUnread: "წაუკითხავი არაფერია",
    noUnreadHint: "ყველა საუბარი წაკითხულია",
    noMatches: "ამ ფილტრით საუბარი არ არის",
    noMatchesHint: "შეცვალე ბავშვი ან გამორთე ფილტრი",
    openReview: "შემოწმების გვერდზე გადასვლა",
    openAssignment: "დავალების გვერდზე გადასვლა",
    threadNotFound: "საუბარი ვერ მოიძებნა",
  },

  // ----------------------------------------------------------------- nav ---
  nav: {
    // parent
    dashboard: "დაფა",
    inbox: "შესამოწმებელი",
    chat: "მიმოწერა",
    children: "ბავშვები",
    schedule: "ცხრილი",
    subjects: "საგნები",
    reports: "რეპორტი",
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

  // phase 2 — the in-app notification bell
  notifications: {
    title: "შეტყობინებები",
    bell: "შეტყობინებები",
    bellWithCount: "შეტყობინებები, {count} წაუკითხავი",
    markAllRead: "ყველა წაკითხულად",
    empty: "შეტყობინება არ არის",
    emptyHint: "აქ გამოჩნდება ჩაბარებები, შემოწმებები და ახალი წერილები",
    ago: "{time} წინ",

    submittedTitle: "{child}-მა დავალება ჩააბარა",
    approvedTitle: "დავალება მიღებულია",
    redoTitle: "დავალება გადასაკეთებელია",
    approvedByHelperTitle: "{actor}-მა დაადასტურა {child}-ის დავალება",
    redoByHelperTitle: "{actor}-მა დააბრუნა {child}-ის დავალება",
    messageTitle: "ახალი შეტყობინება — {author}",
    messagesTitle: "{count} ახალი შეტყობინება",
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

  // ---------------------------------------------------------------- push ---
  // Web Push (0014). `push.*` is the settings UI; the text of a delivered
  // notification is built from `notifications.*` by notificationTitle() /
  // notificationSubtitle(), so a push and the bell always say the same thing.
  push: {
    title: "შეტყობინებები ტელეფონზე",
    subtitle:
      "მიიღეთ შეტყობინება მაშინაც, როცა აპლიკაცია დახურულია — ჩაბარებული დავალება, შემოწმება და ახალი წერილი.",

    // Current state, in words rather than a browser term.
    checking: "მოწმდება…",
    stateOn: "ჩართულია ამ მოწყობილობაზე",
    stateOff: "ამ მოწყობილობაზე გამორთულია",
    stateBlocked: "ბრაუზერმა შეტყობინებები დაბლოკა",
    stateBlockedHint:
      "ჩასართავად გახსენით ბრაუზერის პარამეტრები ამ საიტისთვის და დაუშვით შეტყობინებები, შემდეგ დაარეფრეშეთ გვერდი.",
    stateUnsupported: "ეს ბრაუზერი შეტყობინებებს არ უჭერს მხარს",
    stateUnsupportedHint:
      "სცადეთ Chrome, Edge, Firefox ან Safari განახლებულ ვერსიაზე.",
    stateNeedsInstall: "ჯერ დაამატეთ აპლიკაცია მთავარ ეკრანზე",
    needsInstallHint:
      "iPhone-სა და iPad-ზე შეტყობინებები მუშაობს მხოლოდ მთავარ ეკრანზე დამატებული აპლიკაციიდან. Safari-ში დააჭირეთ გაზიარების ღილაკს, აირჩიეთ „Add to Home Screen“, გახსენით აპლიკაცია მთავარი ეკრანიდან და დაბრუნდით ამ გვერდზე.",

    enable: "შეტყობინებების ჩართვა",
    enabling: "ირთვება…",
    enabled: "შეტყობინებები ჩაირთო",
    disableThis: "ამ მოწყობილობაზე გამორთვა",
    disabled: "ამ მოწყობილობაზე გამოირთო",

    devicesTitle: "მოწყობილობები",
    devicesHint: "შეტყობინებები მოდის ყველა ჩამოთვლილ მოწყობილობაზე.",
    devicesEmpty: "ჯერ არცერთი მოწყობილობა არ არის დამატებული",
    deviceThis: "ეს მოწყობილობა",
    deviceUnknown: "უცნობი მოწყობილობა",
    deviceAdded: "დამატებულია {date}",
    deviceRemove: "წაშლა",
    deviceRemoved: "მოწყობილობა წაიშალა",

    test: "სატესტო შეტყობინების გაგზავნა",
    testing: "იგზავნება…",
    testSent: "გაიგზავნა — შეამოწმეთ ტელეფონი",
    testTitle: "სკოლა",
    testBody: "შეტყობინებები მუშაობს.",

    errGeneric: "შეტყობინებები ვერ ჩაირთო",
    errDenied: "შეტყობინებები ამ ბრაუზერში აკრძალულია",
    errNoDevice: "ჯერ ჩართეთ შეტყობინებები ამ მოწყობილობაზე",

    // ---- the same thing, said to a nine-year-old -------------------------
    kidTitle: "შეტყობინებები",
    kidSubtitle: "რომ მაშინვე გაიგო, როცა მშობელი დავალებას შეამოწმებს.",
    kidEnable: "ჩართვა",
    kidStateOn: "ჩართულია — შეტყობინება ტელეფონზე მოვა",
    kidStateOff: "გამორთულია",
    kidNeedsInstall:
      "ჯერ დაამატე აპლიკაცია მთავარ ეკრანზე და იქიდან გახსენი — მერე ეს ღილაკი იმუშავებს.",
    kidTest: "გამოცადე",
    kidTestBody: "კარგია! შეტყობინებები მუშაობს.",
    kidDisable: "გამორთვა",
  },

  // ----------------------------------------------------------------- pwa ---
  pwa: {
    appShortName: "სკოლა",
    offlineTitle: "ინტერნეტი გათიშულია",
    offlineBody: "შეამოწმე კავშირი და სცადე თავიდან.",

    // add to home screen
    installTitle: "დაამატე აპი მთავარ ეკრანზე",
    // iOS has no Georgian interface, so the menu item is quoted in the
    // English the child will actually see on the screen.
    installIosStep1: "დააჭირე გაზიარების ღილაკს ქვემოთ",
    installIosStep2: "აირჩიე «Add to Home Screen»",
    installBody: "აპი ცალკე გაიხსნება და უფრო სწრაფად იმუშავებს.",
    installAction: "დაინსტალირება",
    installDismiss: "დამალვა",
  },

  // ------------------------------------------------------------- reports ---
  reports: {
    // page chrome
    title: "რეპორტი",
    subtitle: "სწავლის ხარისხი, და არა მხოლოდ შესრულების პროცენტი",
    hint: "ყველა რიცხვი დაწკაპუნებადია — იხსნება ზუსტად ის სია, საიდანაც ის დაითვალა",

    // window picker
    windowLabel: "პერიოდი",
    windowWeek: "ეს კვირა",
    window4Weeks: "ბოლო 4 კვირა",
    windowTerm: "ეს სემესტრი",
    range: "{from} — {to}",
    previousLabel: "წინა პერიოდი: {value}",
    previousNone: "წინა პერიოდი: მონაცემის გარეშე",
    trendBetter: "უმჯობესდება",
    trendWorse: "უარესდება",
    trendFlat: "უცვლელი",

    // headline numbers
    completion: "შესრულება",
    completionHint: "დადასტურებული ÷ სულ",
    onTime: "ვადაში ჩაბარება",
    onTimeHint: "დადასტურებულიდან ვადაში ჩაბარებული",
    redoRate: "გადაკეთების წილი",
    redoRateHint: "მთავარი ხარისხის მაჩვენებელი — რამდენი დაბრუნდა",
    medianMinutes: "დრო დავალებაზე",
    medianMinutesHint: "მედიანა, წუთებში",
    avgSelfRating: "საშუალო თვითშეფასება",
    avgSelfRatingHint: "ბავშვის შეფასება 1–5",
    ofFive: "{value} / 5",
    countOf: "{part} / {total}",
    basedOn: "{count} დავალება",

    // small samples
    lowSampleTitle: "მცირე შერჩევა",
    lowSampleNote:
      "ამ პერიოდში სულ {count} დავალებაა. ასეთ რაოდენობაზე პროცენტი შემთხვევითობას ასახავს და არა ტენდენციას, ამიტომ მხოლოდ რიცხვებია ნაჩვენები.",
    lowSampleBadge: "ცოტა მონაცემია",

    // by subject
    bySubject: "საგნების მიხედვით",
    bySubjectHint: "ყველაზე პრობლემური საგანი — პირველი",
    weakestTitle: "ყველაზე მეტ ყურადღებას საჭიროებს: {subject}",
    weakestBody: "{returned} დაბრუნებული {total} დავალებიდან, შესრულება {completion}",
    weakestBadge: "ყველაზე სუსტი",
    colSubject: "საგანი",
    colTotal: "სულ",
    colCompletion: "შესრულება",
    colOnTime: "ვადაში",
    colRedo: "გადაკეთება",
    colMinutes: "წთ",
    colRating: "თვითშეფასება",
    noSubject: "საგნის გარეშე",
    subjectsEmpty: "ამ პერიოდში საგნების მიხედვით მონაცემი არ არის",

    // weak topics
    weakTopics: "სუსტი თემები",
    weakTopicsByRedo: "ყველაზე ხშირად ბრუნდება",
    weakTopicsByRating: "ყველაზე დაბალი თვითშეფასება",
    topicSamples: "{count} დავალება",
    topicReturned: "{count} დაბრუნებული",
    topicsEmpty: "სუსტი თემა ამ პერიოდში არ გამოიკვეთა",
    topicsFloorNote:
      "თემა სიაში ხვდება მხოლოდ მაშინ, თუ მასზე მინიმუმ 2 დავალებაა — ერთი ცუდი დღე ტენდენცია არ არის.",
    unknownTopic: "უსახელო თემა",

    // trend
    trend: "დინამიკა — ბოლო 8 კვირა",
    trendHint: "ზემოთ შესრულება, ქვემოთ გადაკეთება",
    trendCompletion: "შესრულება",
    trendRedo: "გადაკეთება",
    trendAria: "შესრულებისა და გადაკეთების კვირეული დინამიკა, ბოლო 8 კვირა",
    trendWeekSummary:
      "{from}–{to}: {approved}/{total} დადასტურებული, {returned} დაბრუნებული",
    trendWeekEmpty: "{from}–{to}: დავალების გარეშე",
    trendEmpty: "დინამიკისთვის ჯერ საკმარისი მონაცემი არ არის",

    // recent returns
    recentReturns: "ბოლო დაბრუნებები",
    recentReturnsHint: "კომენტარი ხშირად უფრო მეტს ამბობს, ვიდრე პროცენტი",
    recentReturnsEmpty: "ამ პერიოდში დავალება არ დაბრუნებულა — კარგი ნიშანია",
    noComment: "კომენტარის გარეშე",

    // empty states
    emptyTitle: "რეპორტისთვის მონაცემი ჯერ არ არის",
    emptyBody:
      "დაამატეთ პირველი დავალებები და შეამოწმეთ ისინი. უკვე ერთი-ორი კვირის შემდეგ აქ დაინახავთ სად არის ყველაზე მეტი გადაკეთება, რომელ საგანზე იკარგება დრო და რომელი თემა არ არის ათვისებული.",
    emptyWindowTitle: "ამ პერიოდში დავალება არ ყოფილა",
    emptyWindowBody: "აირჩიეთ უფრო ფართო პერიოდი ან დაამატეთ დავალება.",

    // drill-down list
    listTitle: "რეპორტის ამონაწერი",
    listBack: "რეპორტზე დაბრუნება",
    listEmpty: "ამ ფილტრით დავალება ვერ მოიძებნა",
    listSummary: "{count} დავალება · {range}",
    filterAll: "ყველა დავალება",
    filterApproved: "დადასტურებული",
    filterReturned: "დაბრუნებული",
    filterLate: "ვადის დარღვევით ჩაბარებული",
    filterOpen: "დაუსრულებელი",
    filterTimed: "დროით აღრიცხული",
    filterRated: "თვითშეფასებით",
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
    // solution evidence may now be a recording, so the empty state cannot
    // promise a photo
    noSolutionEvidence: "ამოხსნა ჯერ არ არის — არც ფოტო, არც ჩანაწერი",
    listenHint: "ზეპირი დავალება — მოუსმინე და შემდეგ შეაფასე",

    // ---- v2: the attempt chronology (SPEC 4b) -----------------------------
    taskTitle: "დავალება",
    taskHint: "დაწკაპუნებით — მთელ ეკრანზე",
    attemptsTitle: "ცდები",
    attemptCount: "{count} ცდა",
    attempt: "ცდა {index}",
    attemptOf: "ცდა {index} / {total}",
    attemptCurrent: "მიმდინარე ცდა",
    attemptLatest: "ბოლო ცდა",
    attemptSubmitted: "ჩააბარა {date}",
    attemptNotSubmitted: "ჯერ არ ჩაუბარებია",
    attemptAwaiting: "ახლა შესამოწმებელი",
    attemptApproved: "დადასტურდა",
    attemptRedo: "დაბრუნდა გადასაკეთებლად",
    attemptNoVerdict: "შეფასების გარეშე",
    attemptNoEvidence: "ამ ცდაში ფაილი არ დაერთო",
    attemptNoComment: "კომენტარის გარეშე",
    attemptFeedbackLost:
      "ამ ცდის თვითშეფასება აღარ ინახება — ბაზაში მხოლოდ ბოლო ცდის მონაცემებია",
    olderAttempts: "წინა ცდები",
    showAttempt: "გახსნა",
    evidenceCount: "{photos} ფოტო · {recordings} ჩანაწერი",
    photosOnly: "{count} ფოტო",
    recordingsOnly: "{count} ჩანაწერი",
    verdictBar: "გადაწყვეტილება",
    annotations: "მშობლის მინაწერი",
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
    // `laterBody` is kept (keys are never removed) but is now wrong: push
    // notifications ship in 0014 and have their own section above.
    laterBodyV2: "ელფოსტის შეტყობინებები მომდევნო ფაზაში დაემატება.",
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
