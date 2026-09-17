# SCHOOL-HUB — გაშვების ინსტრუქცია

ეს ერთადერთი ნაწილია, რომელიც შენ უნდა გააკეთო. დანარჩენი კოდშია.

---

## ნაბიჯი 1 — Supabase პროექტის შექმნა (~5 წუთი)

1. გახსენი https://supabase.com და დარეგისტრირდი (GitHub-ით ან email-ით). უფასოა.
2. **New project**:
   - **Name:** `school-hub`
   - **Database Password:** დააგენერირე ღილაკით და **შეინახე პაროლის მენეჯერში**.
     ეს ბაზის პაროლია, აპლიკაციაში შესვლის პაროლი არ არის.
   - **Region:** `Central EU (Frankfurt)` — საქართველოდან ყველაზე ახლოა.
   - **Plan:** Free
3. დაელოდე ~2 წუთს, სანამ პროექტი აეწყობა.

---

## ნაბიჯი 2 — გასაღებების აღება

Supabase-ში: **Project Settings → API**. დაგჭირდება სამი მნიშვნელობა:

| სად წერია | რა არის |
|---|---|
| Project URL | `https://xxxxx.supabase.co` |
| `anon` `public` key | საჯარო გასაღები, ბრაუზერშიც მიდის |
| `service_role` `secret` key | **საიდუმლო.** მხოლოდ სერვერზე |

⚠️ `service_role` გასაღები არასდროს გააზიარო და არასდროს ჩასვა ბრაუზერის კოდში.
ის ბაზის ყველა შეზღუდვას გვერდს უვლის.

---

## ნაბიჯი 3 — გასაღებების ჩასმა

პროექტის ფესვში გააკეთე ფაილი სახელად `.env.local` (ნიმუში: `.env.local.example`)
და ჩასვი:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CHILD_AUTH_SECRET=
```

`CHILD_AUTH_SECRET` — შენ თვითონ აგენერირებ, Supabase-თან კავშირი არ აქვს.
ეს არის საიდუმლო, რომლითაც სერვერი ბავშვის შიდა პაროლს ითვლის (ბაზაში არ ინახება).
დააგენერირე ასე და შედეგი ჩასვი:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

⚠️ ამ მნიშვნელობის შეცვლა ყველა ბავშვის ლოგინს გააუქმებს — მოწვევის კოდები ხელახლა
გასაცემი გახდება. შეინახე პაროლის მენეჯერში.

`.env.local` უკვე `.gitignore`-შია — git-ში არ მოხვდება.

---

## ნაბიჯი 4 — ბაზის აწყობა

Supabase-ში გახსენი **SQL Editor** და გაუშვი `supabase/migrations/` საქაღალდის ფაილები
**ნომრების მიხედვით, სათითაოდ**: `0001_...`, `0002_...` და ა.შ.
თითოეული უნდა დასრულდეს „Success"-ით.

შემდეგ (სურვილისამებრ, სატესტო მონაცემებისთვის) გაუშვი `supabase/seed.sql`.

---

## ნაბიჯი 5 — ლოკალურად გაშვება

```bash
npm run dev
```

გახსენი http://localhost:3000

---

## ნაბიჯი 6 — ინტერნეტში ატანა (როცა მზად იქნება)

1. პროექტი აიტვირთოს GitHub-ზე (პრივატ რეპოზიტორიაში).
2. https://vercel.com → **Import Git Repository** → აირჩიე რეპო.
3. **Environment Variables** — ჩასვი `.env.local`-ის ხუთივე ცვლადი (მათ შორის
   `CHILD_AUTH_SECRET` — მის გარეშე ბავშვის ლოგინი საერთოდ არ იმუშავებს),
   ოღონდ `NEXT_PUBLIC_SITE_URL` შეცვალე Vercel-ის მისამართით.
4. Supabase → **Authentication → URL Configuration** → **Site URL** და
   **Redirect URLs** დაამატე Vercel-ის მისამართი.
5. Deploy.

ამის შემდეგ ბავშვი ტელეფონში გახსნის მისამართს, გააკეთებს „Add to Home Screen"
და აპლიკაციასავით გამოიყენებს.

---

## უსაფრთხოების შემოწმება გაშვებამდე
- [ ] `.env.local` git-ში არ არის
- [ ] `service_role` გასაღები მხოლოდ სერვერის მხარესაა
- [ ] ყველა ცხრილზე RLS ჩართულია (Supabase → Table Editor აჩვენებს გამაფრთხილებელს თუ არა)
- [ ] `evidence` bucket **private**-ია, არა public
- [ ] ერთი ბავშვის ლოგინით სცადე მეორე ბავშვის მონაცემის ნახვა — არ უნდა გამოვიდეს
