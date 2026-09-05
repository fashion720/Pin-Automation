# Pin Batch — Auto Pin Generator

Article ka link do → article ki images aur context se 8 reference-inspired Pinterest designs ke saath batch pins ban jayengi → Excel/CSV export ho jayegi bulk upload ke liye.

Stack: **Next.js (frontend + backend ek hi app)**, **Sharp** (image compositing),
**Cheerio** (scraping), **Gemini API** (overlay text/keywords), local JSON
file storage (dev ke liye).

---

## 1. Local setup

```bash
npm install
cp .env.example .env.local
```

`.env.local` mein apni Gemini API key **aur R2 credentials** daalo (R2 setup
steps neeche section 3 mein hain — ab posts/templates ki list bhi R2 pe
store hoti hai, isliye local test ke liye bhi R2 pehle se chalu hona
zaroori hai, sirf images ke liye nahi):

```
GEMINI_API_KEY=your_key_here
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_URL_BASE=...
```

Phir run karo:

```bash
npm run dev
```

`http://localhost:3000` khol lo. `/create` pe jaake sirf article link daalo,
"Create all Pinterest pins" dabao — article ki images ko 8 different
reference-inspired compositions mein use karke alag overlay copy, typography
and CTA treatments ke saath pins ban jayengi. Layout cards optional filtering
ke liye hain; Canva upload zaroori nahi hai.

Home page (`/`) pe saari posts cards mein dikhengi. Top-right ka **Claude CSV** button saari existing pins ka data-rich, unscheduled CSV download karta hai. Is file ko Claude ko dekar final Pinterest scheduling/board mapping karwa sakte ho.

---

## 2. Templates

### Built-in templates

8 ready-made templates already included (design/layout tumhari reference
Pinterest pins se analyze karke banaye hain):

| Template | Layout |
|---|---|
| `layout-1` | Collage (4 images) |
| `layout-2` | Split screen (2 images) |
| `layout-3` | Single image + text overlay |
| `layout-4` | Single image — bold bottom headline + CTA |
| `layout-5` | Single image — top serif headline + CTA + footer |
| `layout-6` | Collage (4) — center dark box + CTA + footer bar |
| `layout-7` | Top text panel + split 2 images + CTA + footer |
| `layout-8` | Single image top + text panel below + CTA + footer |

Ye 8 built-in designs article ki scraped images ko runtime par fill karte
hain — Canva file dena required nahi. Har design mein reference-inspired
image placement, overlay panel, colors, typography role, line wrapping aur CTA
position code mein defined hai. Agar kabhi apna custom design add karna ho to
`/templates/new` optional route hai; normal URL-only workflow ko uski zaroorat
nahi.

### Typography system (production-safe + reference-inspired)

Text/CTA/footer render karne ke liye fonts image ke andar embed hote hain, isliye server ke system fonts par dependency nahi hai. The project bundles **Poppins** for clean utility text, **Oswald 700** for tall condensed Pinterest-style display headlines, and **DM Serif Display** for premium editorial headlines. The renderer also uses per-template line limits, deliberate line-height, letter spacing, uppercase controls, and separate CTA/footer weights so long titles do not collapse into tiny or uneven text.

The font binaries and their SIL Open Font License files live under `src/lib/fonts/`. `Oswald-Latin-700.woff` is a static webfont asset because Satori's font parser is not reliable with the variable Oswald file in this server-rendered pipeline. `next.config.ts` keeps Satori/HarfBuzz/Yoga external and retains `outputFileTracingIncludes`, so the fonts and WASM dependencies are available in production deployments.

The eight built-in PNGs provide the color/panel scaffolding, while the article photos are inserted automatically into their configured slots at generation time. Exact Flow/Canva pixel matching is not required for the normal workflow; the output is generated from the article URL and the reference-derived composition rules. Custom template uploads remain optional.


### Post view / edit / delete

Posts ke detail page par kisi bhi generated pin par click karke **Pin editor** kholo. Yahan overlay text, headline font (Poppins / Oswald / DM Serif), text color, panel color, font size, line-height, letter spacing, panel opacity, text shadow, uppercase treatment, CTA label, CTA font, CTA/text colors, button width/height aur button font size change kiye ja sakte hain. **Improve contrast** quick preset readability improve karta hai, aur **Save & regenerate pin** original article images ke saath naya PNG render karke save karta hai. Reset style template defaults par wapas laata hai. Manual uploads mein metadata save hota hai, image regeneration nahi hoti.

### Claude-ready CSV and optional scheduling

Top navigation ka **Claude CSV** export ek row per pin deta hai — chahe 6 pins hon ya 80. Har row mein `Title`, `Media URL`, `Pinterest board` (blank), `Description`, `Link`, `Publish date` (blank), `Destination Link`, `Tags`, `Alt text`, `Overlay text`, `Template`, `Article title`, `Article URL`, `Source image URLs`, `Pin ID`, `Post ID` aur saved style metadata hota hai. Is export mein board aur schedule jaan-boojh kar blank rehte hain, taaki Claude baad mein final board mapping aur dates set kar sake.

`/schedule` optional Pinterest scheduling CSV banata hai. Wahan selected pins ko 6–10 ke batch mein schedule kar sakte ho, lekin same article ke pins ke beech day-gap apply hota hai. Agar aapko Claude ke liye saari pins ka raw data chahiye, **Claude CSV** use karo; scheduler selection limit ki zaroorat nahi.

### Batches / folders

Home page par **Your batches** cards account ya category ke folders ki tarah kaam karte hain. `/create` par post banane se pehle existing batch select karo, ya `+ New batch` se naya folder banao — jaise `Home Decor · Account 1` aur `Fashion · Account 2`. Generated aur manual-uploaded posts dono selected batch ke andar save hote hain.

Kisi batch ko open karne par us folder ke sirf wahi posts aur pins dikhte hain. **Download this batch CSV** sirf us batch ka data-rich Claude CSV nikaalta hai; doosre accounts ke pins mix nahi hote. Naya batch `Pending` status se start hota hai. CSV Pinterest par upload karne ke baad batch ke andar **Mark Pins Created** press karo; status `Pins Created` ho jayega, taaki baad mein foran pata chale ke kaunse batches process ho chuke hain. Ye status sirf organization ke liye hai — aap kisi bhi waqt unwanted batch, post ya individual pin delete kar sakte ho. Iska matlab hai ke ek article ki 8 generated pins mein se best pins rakh kar baqi foran remove ki ja sakti hain.

Home page (`/`) pe kisi bhi post card pe click karo — poori post ka
detail page khulega jahan:
- Har pin pe click karke bari image dekh sakte ho (lightbox)
- Overlay text edit karke **Save** karo — agar pin template se generate
  hui thi, image dobara render hogi nayi text ke saath (wahi original
  scraped photos use hoke); manual-upload pins mein sirf text/CSV data
  update hota hai, image same rehti hai.
- **Delete pin** — sirf ek pin hata sakte ho poori post delete kiye bagair.
- **Delete post** — poori post (sab pins samet) hata do.

`layout-5`, `layout-6`, `layout-7`, `layout-8` mein footer branding
("outfitedits.com") hai. Isko badalne ke liye code edit karne ki
zaroorat nahi — `.env.local` (aur Vercel env vars) mein ye add karo:

```
FOOTER_BRAND_TEXT=apnabrand.com
```

Iske baad generate hone wali har pin mein yehi text use hoga, template
ke andar hardcoded default ki jagah. Vercel pe env var change karne ke
baad redeploy zaroor karna (Vercel khud redeploy nahi karta).

Optional custom mode ke liye `/templates` pe jaao → **+ New template** → apna
PNG/JPG upload karo → mouse se image/text slots draw karo → **Save template**.
Lekin article URL se built-in 8 designs generate karne ke liye ye step skip karo.

Bas — pixels khud calculate ho jaate hain jab tum drag karte ho, koi
number type nahi karna. Ye template turant `/create` ke layout-picker
mein bhi dikhne lag jayega.

Built-in 8 designs article-based generation ke liye ready hain; custom
uploads sirf tab use karo jab tum apna additional composition banana chaho.

---

## 3. Kya kya kaam kar raha hai (backend logic)

- **`/api/scrape`** — article link se images + har image ke aas-paas ka
  heading/paragraph nikalta hai (context ke liye).
- **`/api/generate`** — URL-only pipeline: scrape → har selected design ke
  liye Gemini se layout-aware, distinct overlay text + keywords → Sharp se
  article images ko configured slots mein fill → typography/CTA/footer render
  → image save → post/pins DB mein save. `layoutIds` omit karne par built-in
  ke sabhi 8 designs automatically generate hote hain.
- **`/api/posts`** — home page ke cards ke liye saari posts.
- **`/api/posts/manual`** — jab tum khud ki bani hui pins directly upload
  karte ho (template ke bagair) — `/create` pe "Upload my own pins" tab.
- **`/api/upload-presign`** — browser ko ek short-lived signed R2 URL
  deta hai taake bari image files seedha R2 pe upload ho jaayein, hamare
  server se guzre bagair (isi se "Request Entity Too Large" wala masla
  fix hota hai — bari files kabhi hamare Next.js server ke through nahi
  jaatin).
- **`/api/templates`** — templates list karta hai aur naya custom
  template save karta hai (image pehle se R2 pe upload ho chuki hoti hai,
  ye route sirf chhota sa JSON — naam + slot coordinates + link — leta hai).
- **`/api/batches`** aur **`/api/batches/[id]`** — account/category folders
  create, list, inspect, status update aur batch deletion manage karte hain.

- **`/api/export`** — default GET par har pin ki rich Claude handoff CSV row
  deta hai; `?batchId=...` se export ek hi batch tak scoped hota hai. Board aur
  publish date blank rehte hain. POST mein `mode: "pinterest"` bhejne par
  selected pins ko article-aware spacing ke saath Pinterest import CSV banata
  hai.

⚠️ **R2 bucket mein CORS enable karna zaroori hai** taake browser seedha
upload kar sake — bina iske template/pin upload pages "CORS error" denge.
Bucket → Settings → CORS Policy mein ye add karo:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"]
  }
]
```

(Deploy karne ke baad `"AllowedOrigins"` ko apne asli domain tak tight kar
sakte ho.)

---

## 4. Cloudflare R2 — public image links (zaroori, Pinterest ke liye)

Pinterest ka bulk uploader sirf **permanent public URLs** accept karta hai —
`localhost` ya koi bhi temporary link reject ho jayega. Isliye images ab
seedha **Cloudflare R2** pe upload hoti hain aur wahi public link CSV mein
jaata hai.

**One-time setup (~5 min):**

1. Cloudflare dashboard → **R2** → Create bucket (koi bhi naam, e.g. `pin-batch`).
2. Bucket → **Settings** → **Public access** → enable karo (free `r2.dev`
   subdomain milega, ya apna custom domain laga sakte ho). Ye base URL copy
   kar lo.
3. Cloudflare dashboard → R2 → **Manage API tokens** → naya token banao
   "Object Read & Write" permission ke saath, isi bucket ke liye. Account ID,
   Access Key ID, Secret Access Key copy kar lo.
4. `.env.local` mein bharo:

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=pin-batch
R2_PUBLIC_URL_BASE=https://pub-xxxxxxxx.r2.dev
```

Bas — ab jab bhi koi pin generate hogi, `src/lib/storage.ts` khud R2 pe
upload karega aur CSV mein wahi permanent `https://...` link jayega, jise
Pinterest fetch kar sakega.

---

## 5. Deploy (free)

**Vercel** pe deploy karo (Next.js ke liye best, free tier kaafi hai):

```bash
npm install -g vercel
vercel
```

Vercel dashboard mein sab env vars add karna mat bhoolna — `GEMINI_API_KEY`
aur upar wale sab 5 `R2_*` variables.

⚠️ **Data storage:** posts aur templates ki list bhi ab R2 pe (`data/posts.json`,
`data/custom-templates.json` naam ke objects, tumhare images wale bucket ke
andar hi) store hoti hai — local filesystem bilkul use nahi hota ab, isliye
Vercel ka read-only filesystem koi masla nahi karta. Sab kuch (images +
metadata) ek hi R2 bucket mein rehta hai.
