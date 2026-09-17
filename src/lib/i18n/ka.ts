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

  // -------------------------------------------------------------- common ---
  common: {
    add: "დამატება",
    back: "უკან",
    cancel: "გაუქმება",
    close: "დახურვა",
    delete: "წაშლა",
    done: "მზადაა",
    edit: "რედაქტირება",
    loading: "იტვირთება…",
    next: "შემდეგი",
    no: "არა",
    none: "არცერთი",
    optional: "არასავალდებულო",
    required: "სავალდებულო",
    retry: "თავიდან ცდა",
    save: "შენახვა",
    search: "ძებნა",
    today: "დღეს",
    yes: "დიახ",
  },

  // -------------------------------------------------------------- errors ---
  errors: {
    generic: "რაღაც ვერ მოხერხდა. სცადეთ თავიდან.",
    network: "ქსელთან კავშირი ვერ დამყარდა",
    notFound: "ვერ მოიძებნა",
    offline: "ინტერნეტი გათიშულია",
    sessionExpired: "სესიას ვადა გაუვიდა. გთხოვთ, თავიდან შეხვიდეთ.",
    tooManyRequests: "ძალიან ბევრი მცდელობა. სცადეთ ცოტა ხანში.",
    unauthorized: "წვდომა აკრძალულია",
  },

  // ----------------------------------------------------------------- kid ---
  kid: {
    comingSoon: "მალე დაემატება",
    homeGreeting: "გამარჯობა, {name}!",
    homeSubtitle: "ეს არის შენი მთავარი გვერდი",
    menu: "მენიუ",
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
  },

  // ----------------------------------------------------------------- pwa ---
  pwa: {
    appShortName: "სკოლა",
    offlineTitle: "ინტერნეტი გათიშულია",
    offlineBody: "შეამოწმე კავშირი და სცადე თავიდან.",
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
    emailInvalid: "ელფოსტა არასწორია",
    nameMin: "სახელი უნდა შეიცავდეს მინიმუმ 2 სიმბოლოს",
    passwordMin: "პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს",
    passwordsDoNotMatch: "პაროლები არ ემთხვევა",
    pinDigits: "PIN უნდა შედგებოდეს ზუსტად 4 ციფრისგან",
    pinsDoNotMatch: "PIN-კოდები არ ემთხვევა",
    required: "სავალდებულო ველი",
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
