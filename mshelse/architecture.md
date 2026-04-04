# MS Helse – Architecture & Decision Log

**Purpose:** Enable a new developer or AI to understand the full system without reading 10+ chat sessions.
**Last updated:** 4. april 2026 · Covers sessions 1–10 (claude.ai) + Claude Code sessions 1–4.

---

## 1. System Overview

MS Helse is a precision rehabilitation SaaS app built by Quang Hua, a solo muskelterapeut in Oslo with 8 years of clinical experience. The app replaces manual exercise guidance for clinic clients and is designed for passive income via freemium subscription (99kr/month).

### Architecture

```
┌──────────────┐       ┌──────────────────┐       ┌───────────────┐
│  React Native │──────▶│  Node.js/Express │──────▶│  Claude        │
│  Expo SDK 55  │       │  on Render.com   │       │  Sonnet 4     │
│  (Vercel web) │       │  index.js        │       │  (Anthropic)  │
└──────┬───────┘       └──────────────────┘       └───────────────┘
       │
       ▼
┌──────────────┐
│  Firebase     │
│  Auth         │
│  Firestore    │
│  Storage      │
└──────────────┘
```

**Frontend:** `~/mshelse-server/mshelse/` → Expo web build → Vercel (`mshelse.vercel.app`)
**Backend:** `~/mshelse-server/index.js` → GitHub push → Render auto-deploy (`mshelse-server.onrender.com`)
**Database:** Firebase Firestore (project: `mshelse`)
**Auth:** Firebase Auth
**Storage:** Firebase Storage, Blaze plan (`mshelse.firebasestorage.app`)
**AI model:** `claude-sonnet-4-20250514` (Sonnet 4)

### Why This Stack?

**React Native + Expo** was chosen over a web PWA because the target is genuine App Store + Google Play distribution. Expo SDK 55 is NOT compatible with Expo Go — all testing happens via web build on Vercel. (Session 5)

**Render.com backend** exists because Netlify's free-tier serverless functions have a 10-second timeout, which was insufficient for Claude API calls (which can take 15–30 seconds). The architecture was split: static frontend on Netlify/Vercel, Express backend on Render. Render's free tier spins down after inactivity — first API call takes 30–60 seconds. A "Venter på AI…" message appears after 5 seconds to manage user expectations. (Session 3)

**Firebase over alternatives** was chosen for multi-user data isolation — each user sees only their own data via Firestore security rules. App updates never affect stored user data. (Session 5)

**Vercel replaced Netlify** after Netlify's deploy quota was used up. (Session 6)

**Claude Sonnet 4** replaced claude-sonnet-4-6 for cost reduction while maintaining clinical quality. The eval system confirmed 90% accuracy with Sonnet 4. Haiku was tested and rejected — accuracy dropped to 60%. (Session 4)

---

## 2. The Rehabilitation Model (Clinical Core)

The entire app is structured around a three-act rehabilitation journey. This model drives the UI, the AI prompts, the progression logic, and the program generation.

### The Three Acts

**Akt 1 – Få kontroll** (Gain control): Deactivation/mobilization + low-threshold activation. 1–6 weeks. Pain is the primary metric. The patient is in a protective posture — the goal is to calm the system down.

**Akt 2 – Rette opp** (Correct): Activation with progression, stability, compensation pattern correction. Activation here is more demanding — building strength and neuromuscular connection under load.

**Akt 3 – Vokse** (Grow): Progressive strength, endurance, sleep/nutrition/stress as active tools. Lifelong use.

### Why three acts and not a simpler model?

Quang's clinical experience shows that pain relief alone is insufficient — patients who stop after pain disappears relapse. The three-act model explicitly carries users beyond pain into performance. Acts can overlap: a user might have their shoulder in Akt 1 and their hip in Akt 2 simultaneously. The akt indicator ties to a specific assessment, not the whole body. (Sessions 1, 3)

### Triage Logic

Self-reported pain level maps to starting act:
- 7–10 → Akt 1
- 4–6 → Akt 1 + 2 (parallel)
- 1–3 → Akt 2
- 0 → Akt 2 or 3 depending on goals

**Non-obvious:** Many users have no pain but stiffness. The system handles this. (Session 6)

---

## 3. Feature-by-Feature Breakdown

### 3.1 AI Clinical Assessment (`/api/chat`)

**Files involved:** `index.js` (backend system prompt), `KartleggingScreen.tsx` (frontend chat UI)

**How it works:**
1. User fills out health profile (gender, age, activity level, conditions incl. pregnancy) — stored in Firestore `users/{uid}/helseProfil`
2. User describes complaint in free text (min 10 characters)
3. Both are injected into the first message to the AI
4. AI asks questions one at a time, each with multiple-choice options + "Annet – beskriv selv" free text
5. At 70–80% confidence with a clear hypothesis, AI triggers a physical confirmation test (one per session)
6. At 90%+ confidence, AI generates a structured JSON assessment

**Why the three-step onboarding (profile → description → AI)?**
Originally (sessions 2–4), the AI started asking from scratch. Accuracy was lower because it wasted questions on basic demographics. Adding the profile injection gave the AI biological context upfront. The open description was added because the AI was significantly more accurate when it had something to work from initially — it could skip obvious questions and go deeper from the start. This was restored in session 7 after being accidentally lost during the React Native migration. (Sessions 2, 5, 7)

**System prompt evolution (v1 → v13):**
- v1–v8: Linear questioning, single conclusion
- v9: Norwegian bokmål enforcement, no unverifiable statistics
- v10: Confirmation tests added, differential diagnosis with candidates, triage
- v11: Efficiency rule ("conclude in 6–8 questions") was **explicitly removed** after Quang noted that thorough questioning builds patient trust and quick conclusions signal clinical arrogance
- v12: Top-down reasoning (biological framework → complaint → hypotheses → confirm/deny → conclude), risk modifiers for conditions like osteoporosis, Bekhterev's, pregnancy
- v13: 15 mandatory assessment areas, 10 confirmation tests, confidence calibration

**Confidence calibration (non-obvious):**
- Simple, clear cases: 93–96%
- Compound cases: 87–91%
- Genuinely unclear: 82–87%
- Never above 95% without all 15 areas covered

This calibration was tuned via the eval system (session 4) after the AI was consistently reporting 92% confidence regardless of actual case complexity.

**15 mandatory assessment areas:** Location, pain character, side dominance, pattern (constant vs triggered), timing, movement test, radiation, debut, sleep, lifestyle, other complaints, red flag check, pain level 0–10, goal, progression over 3 months.

**10 confirmation tests:** lower_cross, upper_cross, piriformis, rotator_cuff, si_joint, patellofemoral, it_band, achilles, cervikogen, plantar. Each adds +15–20% confidence. Max one test per session. Not triggered on red flags, nerve symptoms, or acute onset. (Session 4)

**Critical clinical design decision:** The AI presents a differential diagnosis (ranked candidates with probabilities), never a single definitive diagnosis. This is both clinically correct and legally safer — "dette kan høres ut som…" rather than "du har diagnose X". (Sessions 1, 4)

**Top-down reasoning hierarchy:**
1. Systemic inflammatory conditions (Bekhterev's, RA) are always evaluated as potential primary drivers
2. Structural conditions (osteoporosis, scoliosis, arthrosis) are primary when load-bearing is limited
3. Hypermobility is primary for joint-adjacent complaints
4. Muscular compensation is almost always secondary

This hierarchy was added after the eval system showed the AI was treating conditions like osteoporosis as "complications" rather than primary drivers, dropping accuracy on complex cases. (Session 4)

### 3.2 Reassessment / Status Check (`/api/reassessment`)

**Files involved:** `index.js` (backend), `ReassessmentScreen.tsx`, `progresjon.ts`

**How it works:**
1. `progresjon.ts` evaluates tracking data and determines if the user is ready for progression
2. A banner appears on HjemScreen or AktivOktScreen (after finishing a session)
3. User enters ReassessmentScreen, which fetches recent logs and builds a `trackingOppsummering`
4. AI asks 4–7 targeted questions (NOT a full reassessment from scratch)
5. AI concludes with one of: `neste_akt`, `intensiver`, `fortsett`, `ny_kartlegging`

**Why not just a new full assessment?**
The AI already has context — it knows the previous assessment, what exercises the user did, and what the tracking data shows. Repeating 15 assessment areas would be wasteful and frustrating. The short reassessment builds on existing data. (Session 7)

**Non-obvious coupling: Reassessment → Program deactivation**
When the conclusion is `neste_akt` or `intensiver`, the old program is set to `aktiv: false`. This is critical because:
- It removes the progression banner trigger (which checks active programs)
- It moves the old program to the archived list
- It allows HjemScreen to show the new reassessment as the latest assessment

If the conclusion is `fortsett` or `ny_kartlegging`, the program stays active. (Session 7)

**Reassessment documents** are stored as regular assessments with `type: 'reassessment'` and additional fields: `konklusjon`, `begrunnelse`, `neste_steg`, `program_hint`. SituasjonKort on HjemScreen checks the `type` field to render differently for reassessments vs regular assessments. (Session 7)

### 3.3 Progression Logic (`progresjon.ts`)

**File:** `src/services/progresjon.ts` — imported by HjemScreen and AktivOktScreen

**Logic:**
AND-logic — ALL clinical tracking types must reach threshold over the last 2–3 logs:
- `activation_quality` ≥ 8
- `mobility` ≥ 8
- `contact_reps` ≥ 85% of rep target
- `rpe` ≤ 7 AND drop ≥ 1.5 from first log
- `side_diff` ≤ 3

Non-clinical types (`sets_reps`, `sets_reps_weight`, `completed`) are ignored.

Akt 1 has an extra requirement: pain must be 0.

Trigger conditions: ≥ 40% of program completed, ≥ 2 logged sessions.

**Why AND-logic, not OR?**
Clinically, high activation quality alone doesn't mean readiness — a user might have good activation but still report pain. All dimensions must be met simultaneously. Pain at 0 combined with high activation quality is a much stronger signal than either alone. (Session 7)

**Why 40% minimum?**
Prevents premature triggering after just 2 sessions when the user hasn't had enough exposure to the exercises. But it also allows mid-program progression — users in Akt 1 often don't need the full program duration. (Session 7)

### 3.4 AI Program Generation (`/api/generer-program`)

**Files involved:** `index.js` (backend), `ProgramBuilderScreen.tsx`

**Two entry paths (same endpoint, different context):**

**Path A — From first assessment:**
```
KartleggingScreen → "Opprett program"
  → ProgramBuilder with fraAssessment (tittel, triage, findings, summary)
  → auto-generation starts
```

**Path B — From reassessment:**
```
ReassessmentScreen → "Lag nytt program"
  → ProgramBuilder with fraReassessment + forrigeAssessment
  → auto-generation starts
```

Both paths trigger `genererProgram` automatically on mount (guarded by `genererHarKjørt` flag to prevent re-triggering). The backend reads the exercise library from the request body and uses the assessment context to select exercises.

**The `personligKontekst` feature:**
The AI generates a 1–3 sentence `personligKontekst` per exercise in the program explaining WHY this exercise was chosen for THIS user, what compensation pattern it addresses, and what they should watch for. This is NOT execution instructions — those come from `instruksjon`.

Displayed as a green "FOR DEG SPESIELT" box in AktivOktScreen and OvelseDetaljScreen (only when navigated from a program, never from the exercise library). (Session 7, 8)

**Program parameters by akt:**
- Akt 1: 3–5 exercises, 2–3 sets, 2–4 weeks
- Akt 2: 4–6 exercises, 3–4 sets, 3–6 weeks
- Akt 3: 5–7 exercises, 3–5 sets, 4–8 weeks

### 3.5 Exercise Data Structure

**Collection:** `exercises/{id}` in Firestore

**Critical decision: Flat structure, NOT nested purposes[]**

The original design (sessions 5–6) used a `purposes[]` array where each exercise had multiple formål variants with separate instructions and tracking types. This was refactored to a flat root-level structure in session 8:

```
exercises/{id}
  name, videoUrl
  bodyParts[], act, hold, tempo
  instruksjon          ← was purposes[0].instruction
  tracking_types[]     ← was purposes[0].tracking_types
  motstandsType[]      ← was purposes[0].motstandsType
  kliniskNotat         ← was purposes[0].kliniskNotat
  muskelgrupper: { primer[], sekundar[], stabilisator[] }
  anatomi: { anterior: [...], posterior: [...] }
```

**Why flatten?**
Each variant of an exercise (e.g., "Benhev – Aktivering" vs "Benhev – Stabilitet") became its own separate Firestore document. This simplifies the admin interface, the program builder, and the tracking logic — no need to track which `purposeId` was selected. (Session 8)

**Backward compatibility:** `OvelseDetaljScreen` has a fallback to `purposes[0].instruction` and `formaalLabel` for old data that still exists in Firestore. (Session 8)

**Naming convention:** `[Exercise name] nivå [X]` — e.g., "Benhev nivå 1", "Bird dog nivå 3". Progressive exercises within the same movement pattern are separate documents at separate levels. (Session 6)

**Akt field on exercises:**
- Progressive exercises → single akt (e.g., `act: [2]`)
- Deactivation/mobilization exercises → `act: [1, 2, 3]` (relevant throughout rehabilitation)
- The akt field is a hint to the AI, NOT a hard constraint. AI selects based on `kliniskNotat` and user's assessment. (Session 6)

### 3.6 Tracking System

**Files involved:** `AktivOktScreen.tsx` (logging), `TrackingScreen.tsx` (visualization)

**8 tracking types mapped to 5 radar categories:**

| Type | Radar Category | Clinical Threshold |
|------|---------------|-------------------|
| `activation_quality` (0–10) | Aktivering | ≥ 8 |
| `completed` (boolean) | Aktivering | — |
| `contact_reps` (count) | Stabilitet | ≥ 85% of rep target |
| `side_diff` (0–10) | Stabilitet | ≤ 3 |
| `mobility` (0–10) | Mobilitet | ≥ 8 |
| `sets_reps` (count) | Styrke | ignored clinically |
| `sets_reps_weight` (kg) | Styrke | ignored clinically |
| `rpe` (0–10) | Utholdenhet | ≤ 7 + drop ≥ 1.5 |

**Why `tracking_type` over `formaalLabel` for radar categorization?**
`tracking_type` is set by the clinician when creating the exercise — it's an explicit clinical classification. `formaalLabel` is just a display string that varied in spelling and content. The radar was initially matching on `formaalLabel` and showing nothing because the library was empty. Switching to `tracking_type` as primary source fixed this. (Session 6)

**Composite tracking:** A single exercise can have multiple tracking types (stored as `tracking_types: []`). For example, nerve flossing might track both `mobility` and `activation_quality`. Each type gets its own stepper in AktivOktScreen. Data stored as `verdier: Record<string, number>` per set. Both old singular `tracking_type`/`verdi` and new `tracking_types`/`verdier` formats are supported. (Session 6)

**Three measurement points per program:**
1. **Baseline** (before first session) — AI-generated functional questions stored on program as `baselineSporsmal`
2. **Midway** (at 45–55% completion, once only) — Global Rating of Change (-3 to +3) + same questions with start answers shown for comparison. Sets `midtveisGjort: true`.
3. **Final check-in** (last session) — Three columns: START · MIDWAY · NOW

**Radar visualization:**
Two-layer radar using `react-native-svg` (Polygon, Circle, Line). Two rendering modes:
- **"Alle" selected:** green = current half-period, yellow = previous half-period (trend observation)
- **Specific program selected:** green = selected program, blue (`#4A90D9`) = all programs combined (comparison)

The `RadarDiagram` component takes a `fargeFør?: string` prop (default: `colors.yellow`) for the second polygon color. Normalized 0–10. The radar is an observation tool, not a diagnostic tool. (Session 6, Claude Code session 4)

**Program filter chips:**
A horizontal chip row ("Alle" + one chip per program from logger) appears at the top of TrackingScreen when there are multiple programs. Selecting a program filters: stats, log section, and radar. Auto-set to active program on first load. Selecting a program chip also syncs `valgtProgram` in the Fremgang graph.

**Fremgang graph:**
Two-level navigation: program chips (level 1) → exercise chips within that program (level 2, collapsible variant C) → date-based line graph. Requires ≥ 2 completed sessions to render. Same-day sessions are aggregated to a single daily average data point (prevents cluttering from high-frequency programs). (Sessions 6, 7, Claude Code session 4)

**Sparklines:** Small trend lines in the expanded log view showing per-exercise average over the last 8 sessions. Green line pointing up = progress. (Session 6)

### 3.7 Anatomy Visualization System

**Files involved:** `AnatomyViewer.tsx`, `AdminOvelseScreen.tsx`, Firebase Storage (`anatomy/`)

**PNG source:** Figma community file "Human Anatomy Component System" (CC BY 4.0, Ryan Graves). ~28 muscles × anterior/posterior views × outer/inner = ~280 PNG files after cleanup.

**Storage structure:**
```
anatomy/
  Muscle Group=- [Name], View=[Anterior|Posterior], Dissection=Outer Muscles.png
  Muscle Group=- [Name], View=[Anterior|Posterior], Dissection=Inner Muscles.png
```

Outer-Inner pre-split files were deleted in session 10 — the viewer now clips Outer to left half and Inner to right half directly.

**Three rendering modes:**
- **Single layer:** Only superficial or only deep muscles present → show full figure
- **Split view:** Both superficial AND deep muscles → left half = outer, right half = inner
- **Compact:** Used in AktivOktScreen, smaller figure dimensions

**The `rolle` field:**
Each anatomy image entry has a `rolle` field (primer/sekundar/stabilisator) that determines the CSS hue-rotate filter applied:
- Primær → red (no change, PNGs are natively red)
- Sekundær → yellow (hue-rotate ~40–60°)
- Stabilisator → blue (hue-rotate ~200° + saturate adjustment)

**Why `rolle` on the image, not fuzzy matching from `muskelgrupper`?**
Early versions tried to infer the role by matching the muscle filename against the `muskelgrupper.primer/sekundar/stabilisator` arrays. This was unreliable because muscle names in filenames didn't always match exactly. Adding `rolle` directly to each `AnatomiBilde` entry eliminated the ambiguity. (Session 10)

**Why `darken` blend mode, not `multiply`?**
`multiply` caused progressive darkening when stacking multiple muscle layers — the body figure got darker with each added muscle. `darken` keeps the lightest pixel, which prevents this accumulation. (Session 10)

**Gray rectangle fix (Claude Code session 1):**
The body's gray pixels (~#BFBFBF) visible as a gray rectangle around the figure was fixed by removing the white background from PNGs at runtime using the Canvas API: pixels with brightness > 200 AND saturation < 30 are set to transparent. This runs once per image and is cached in a module-level `canvasCache = new Map<string, string>()` keyed by `url|||rolle`. CORS was required on Firebase Storage — set via `gsutil cors set`.

**⚠️ DO NOT use dark card background for anatomy:** `darken` blend mode requires a light background. `lighten` on a dark background was attempted but the body's gray pixels (~191/channel) dominate the target muscle colors — especially stabilizer blue (r=74). This makes muscles invisible against a dark background. Canvas composite compositing is theoretically possible but was not implemented. (Claude Code session 1)

**Muscle color system — direct pixel replacement (Claude Code session 1):**
Three approaches were tried and failed before settling on the current solution:
1. CSS `filter: hue-rotate()` on `<img>` — buggy with mix-blend-mode in browsers, no effect
2. Canvas 2D `ctx.filter` property — inconsistent browser support
3. HSL hue-rotation on pixel data — yellow became orange, blue became green; Outer and Inner PNGs use slightly different reds, making rotation inconsistent

**Current approach:** Detect red pixels (`r > 150 && r > g*1.5 && r > b*1.5`) and replace with target color scaled by brightness:
```typescript
const ROLLE_RGB = {
  primer:       [224, 85,  85],
  sekundar:     [212, 168, 42],
  stabilisator: [74,  144, 217],
};
// For each red pixel: d[i] = Math.round(tR * (r/255)), etc.
```
This gives exact, consistent target colors regardless of the original red shade in the PNG. (Claude Code session 1)

**Error handling for missing anatomy files (Claude Code session 1):**
When a PNG file doesn't exist in Storage (404), `img.onerror` sets `src = '__error__'` rather than falling back to the original Firebase URL. The render function returns an invisible `<div>` for `src === '__error__'`. Without this, the browser's broken-image icon appeared centered in the figure (130×260px), which looked like a UI bug. The cache key is set to `'__error__'` so subsequent renders are instant.

**`muskelgrupper` derived from `anatomi` at save time (Claude Code session 1):**
Previously, `AdminOvelseScreen` had three separate text fields for primer/sekundar/stabilisator muscle names. These were removed because they duplicated information already encoded in the `anatomi` field via the `rolle` property on each `AnatomiBilde`. On save, the function `muskelgrupperFraAnatomi(anatomi)` derives the three arrays by iterating the anatomi entries and grouping by their `rolle`. This means the `muskelgrupper` field is always consistent with `anatomi` — they cannot drift apart.

**Coupling:** Both `AnatomyViewer.tsx` (for fuzzy-match fallback when `rolle` is missing) and `AdminOvelseScreen.tsx` (for the AI prompt's anatomy generation) read from `muskelgrupper`. The values come from `anatomi.rolle` — not from a separate admin input. (Claude Code session 1)

**Admin flow for anatomy mapping:**
1. Admin selects muscles in the picker (one per row)
2. AI can auto-generate the mapping (sends only Outer filenames to keep the prompt short, requests `rolle` in JSON output)
3. Each chip has a rolle toggle (P/K/S cycle) and type toggle (○/◉ switches between outer/inner file)
4. Preview always visible below the picker

**Why web `<img>` instead of React Native `Image`?**
React Native's `Image` component on Expo web had rendering issues with absolute positioning and blend modes. Direct `<img>` tags via `Platform.OS === 'web'` check resolved this. (Session 9)

### 3.7b High-Frequency Programs (`frekvensPerDag`) (Claude Code session 4)

**Files involved:** `ProgramBuilderScreen.tsx`, `HjemScreen.tsx`, `AktivOktScreen.tsx`, `TrackingScreen.tsx`, `index.js`

Some exercises (stretching, activation in acute phases) are prescribed 3–5× per day. This is tracked at the **program level**, not exercise level — the same exercise can be 5×/day for acute pain but 1×/day for maintenance.

**`frekvensPerDag` field on programs (Firestore):**
```
programs/{id}
  frekvensPerDag: 1 | 2 | 3 | 4 | 5   (default 1)
  okterTotalt: dager.length × uker × frekvensPerDag
```

**ProgramBuilderScreen:** Chip row "FREKVENS PER DAG" (1×–5×) added between varighet and øvelser sections. `okterTotalt` is recalculated on save.

**AI two-program response:** When the clinical context warrants it (e.g., acute phase + strength training), the backend returns `{ programmer: [...] }` (array). ProgramBuilderScreen handles both `data.programmer` (array) and the old single-program response. Shows summary "AI genererte 2 programmer: …" when multiple programs received.

**HjemScreen DagensØkt card:** Shows badge "X av Y ganger i dag" based on `dagensLogger.filter(l => l.fullfort).length` vs `frekvensPerDag`. Button text adjusts: "Start gang 2 av 4 →" / "Gjort 4× – start en gang til →".

**AktivOktScreen:** Shows a frequency strip below the progress bar for high-freq programs.

**Progression logic:** `progresjon.ts` groups logs by unique training days (not session count) to prevent 3 same-day sessions from falsely triggering progression as "3 separate days." Only unique `dato.toDateString()` values count.

**Compliance denominator:** `dager.length × frekvensPerDag` instead of just `dager.length`.

**Why on program, not exercise?**
Same exercise can be high-frequency for one user (acute pain) and normal frequency for another (maintenance). Storing it on the exercise would create duplicate exercises differing only in frequency. Program-level frequency also allows the AI to generate two distinct programs (one high-freq, one normal) without complicating the exercise library. (Claude Code session 4)

### 3.7c Tracking — RIR for Strength Exercises (Claude Code session 3)

**Affected files:** `AktivOktScreen.tsx`, `progresjon.ts` (unchanged)

When an exercise has both `rpe` and `sets_reps_weight` in `tracking_types`, the stepper shows "Reps i reserve (0–4)" instead of "Anstrengelse (0–10)".

**Why RIR instead of RPE for strength?**
Athletes naturally think in RIR first ("I had 2 reps left") and then convert mentally to RPE. Asking for RPE directly requires an extra cognitive step during rest. For rehab exercises (activation, mobility), RPE makes more sense because there's no clear "reps left" concept.

**The conversion (critical coupling):**
User inputs RIR (0–4). At save time in `loggSett()`:
```javascript
const erRIRType = t === 'rpe' && trackingTypes.includes('sets_reps_weight');
verdier[t] = erRIRType ? 10 - (repVerdier[t] || 0) : (repVerdier[t] || 0);
```
Firestore stores RPE (10 − RIR). `progresjon.ts` threshold `rpe ≤ 7` maps to `RIR ≥ 3`. **Never change the stored format** — all existing logs and `progresjon.ts` expect RPE.

**Info modal:** The `?`-chip uses key `rpe_rir` (not `rpe`) to show the RIR-specific explanation. The TRACKING_INFO object in AktivOktScreen has both `rpe` (RPE context) and `rpe_rir` (RIR context) entries.

### 3.8 Navigation Architecture

**File:** `src/navigation/RootNavigator.tsx`

**Structure:**
```
Auth Stack
  InnloggingScreen
  RegistreringScreen
  VelkomstScreen

Main Stack
  MainTabs (Bottom Tab Navigator)
    Hjem
    Bibliotek → OvelseDetalj
    Program → ProgramDetalj → AktivOkt
    Tracking
    Kartlegging
    Profil → AdminPanel → AdminOvelse
  ProgramBuilder
  Reassessment
  KartleggingDetalj
```

**Critical navigation pattern: `navigation.reset` vs `navigation.navigate`**

When navigating back to Hjem from ProgramBuilder or ReassessmentScreen, `navigation.reset` is used instead of `navigate`. This forces React Navigation to rebuild the stack from scratch, which ensures `useEffect` and focus listeners on HjemScreen fire and fetch fresh data from Firestore. Without this, SituasjonKort would show stale assessment data. (Session 7)

**The `assessment` param chain:**
Every navigate call to AktivOkt and ReassessmentScreen must pass `assessment` along. This chain flows:
```
HjemScreen → ProgramDetalj (assessment) → AktivOkt (assessment) → Reassessment (assessment)
ProgramScreen → ProgramDetalj (assessment) → AktivOkt (assessment) → Reassessment (assessment)
```

This was a significant debugging effort in session 7 — multiple screens were missing the assessment param, causing ReassessmentScreen to have no context about the previous assessment.

### 3.9 Admin Panel (Claude Code session 3)

**Files involved:** `AdminPanelScreen.tsx` (frontend), `index.js` (backend — `/api/admin/*` endpoints), `AdminOvelseScreen.tsx` (Øvelser tab navigates here), `ProfilScreen.tsx` (entry point)

**Three-tab structure:**
- **Brukere** — user list (email, last active, compliance %, pain level, akt badge) with inline expandable detail (stats grid, active program, 8-bar pain history, assessment list)
- **Statistikk** — aggregated app-wide metrics: total users, weekly active, compliance, clinical effect (% users with activation ≥ 8), akt distribution, top 10 exercises
- **Øvelser** — button that navigates to the existing `AdminOvelseScreen` (not embedded inline)

**Auth flow:**
`adminFetch(path)` in AdminPanelScreen gets the current user's Firebase ID token via `auth.currentUser.getIdToken()` and sends it as `Authorization: Bearer <token>`. The backend `requireAdmin` middleware calls `admin.auth().verifyIdToken(token)` and checks `decodedToken.uid === ADMIN_UID`. Unauthorized requests get 403.

**Why backend approach, not Firestore rules?**
Two options were evaluated: (A) Firestore security rules allowing admin reads for a specific UID, (B) Firebase Admin SDK on backend with verified ID tokens. Option B was chosen immediately (session 3) because:
- The admin UID is never in client-side code — only on Render
- Firestore rules can expose collection names through error messages
- `/api/admin/statistikk` requires server-side aggregation across all users, which is impossible with Firestore rules alone
- Easier to audit: one `requireAdmin` middleware function, not scattered rule expressions

**Backend endpoints:**
```
GET /api/admin/brukere
  → Lists all users with helseProfil + computed compliance + last active
  → Each user: uid, email, displayName, lastActive, compliance, pain, akt, activeProgram

GET /api/admin/bruker/:uid
  → Full detail: logs (last 30), assessments (all), programs (all)
  → Used by expandable detail view in Brukere tab

GET /api/admin/statistikk
  → Aggregated: totalBrukere, aktiveUke, snitteCompliance, snittSmerte,
    kliniskEffekt (% with activation≥8), aktFordeling{1,2,3},
    toppOvelser [{navn, antall}]
```

**Non-obvious: `useFocusEffect` instead of `useEffect`**
Data is fetched with `useFocusEffect` (React Navigation) on each tab switch, so the Statistikk tab always shows fresh numbers after the admin creates/edits exercises.

**`tidSiden()` helper:**
Converts ISO timestamps to "2 min siden", "3t siden", "i går", "2d siden", "1u siden" — used in the user list to show last activity at a glance.

### 3.10 Eval System (`ms-helse-eval.html`)

**File:** `ms-helse-eval.html` — runs locally via `python3 -m http.server 8081`

**Four-agent pipeline:**
1. **Case Generator** (Haiku) — creates patient profiles with known diagnoses, using predefined rotation pools for gender, age, job, condition, and activity level
2. **Patient Simulator** (Haiku) — answers questions in character, consistently matching the generated profile
3. **MS Helse Cartographer** (Sonnet 4, matching production) — runs the actual assessment
4. **Judge** (Haiku) — compares conclusions against known answers

**Why Haiku for judge, Sonnet for cartographer?**
Haiku is sufficient for structured comparison (did the AI identify the correct candidates?). But the cartographer must match production to get meaningful accuracy numbers. Testing showed that using Haiku as cartographer dropped accuracy from 90% to 60%. (Session 4)

**Accuracy progression:** 57% → 80% → 90% over prompt iterations v10–v13.

**Judge leniency:** The judge was made pragmatically lenient — clinical precision over terminological precision. Pattern/mechanism identification is sufficient for a "hit" without requiring specific muscle names. (Session 4)

---

## 4. Cross-File Couplings (Easy to Forget)

### 4.1 Assessment field names across boundaries

The AI returns `title` in its JSON response. Firestore stores it as `tittel`. KartleggingScreen sends `assessment.title` to ProgramBuilder. ProgramScreen reads `tittel` from Firestore. The backend `index.js` reads `fraAssessment?.tittel`. This was a real bug discovered during flow verification in session 7 — ProgramScreen normalized the assessment object before passing it to ProgramBuilder.

Similarly: AI returns `findings`, Firestore stores both `funn` and `oppsummering` (with backend fallback reading both).

### 4.2 SituasjonKort dual rendering

HjemScreen fetches `sisteAssessment` ordered by date descending. SituasjonKort checks `assessment.type`:
- Regular assessment → shows akt-badge, pain indicator, goal, next step, confidence bar
- `type: 'reassessment'` → shows conclusion badge + begrunnelse

If the reassessment document doesn't have the fields SituasjonKort expects (because it was saved with different field names), the card falls back to the old assessment. This was the root cause of SituasjonKort not updating after reassessment — fixed by adding `tittel` and `triage` fields to the reassessment save. (Session 7)

### 4.3 Focus-refresh pattern

HjemScreen and TrackingScreen both use React Navigation's `focus` event to refetch data. This means:
- `navigation.navigate('MainTabs')` does NOT always trigger the focus listener (if the screen was already mounted)
- `navigation.reset` forces a full remount, which always triggers `useEffect` and focus listeners

This is why rule #7 exists: "navigation.reset brukes (ikke navigate) ved navigasjon tilbake til Hjem fra ProgramBuilder og ReassessmentScreen."

### 4.4 Progresjon → Reassessment → Program lifecycle

```
progresjon.ts evaluates logs → triggers banner on HjemScreen/AktivOktScreen
  → user taps → ReassessmentScreen
    → saves assessment with type:'reassessment'
    → if neste_akt/intensiver: sets old program aktiv: false
  → user taps "Lag nytt program" → ProgramBuilder
    → auto-generates new program
    → navigation.reset to Hjem
      → HjemScreen refetches → shows new assessment + new program
```

If the old program is NOT deactivated, the progression banner re-triggers immediately because the tracking data hasn't changed. This was the "banner won't go away" bug. (Session 7)

### 4.5 personligKontekst visibility rules

`personligKontekst` exists on program exercises (generated by AI per-user). It should ONLY be visible when the user navigated from a program context:

- **AktivOktScreen:** Always shows it (user is in a program session)
- **OvelseDetaljScreen:** Shows it ONLY if `route.params.personligKontekst` is passed (from ProgramDetaljScreen)
- **BibliotekScreen → OvelseDetalj:** Never shows it (no program context)

This is a deliberate design choice — the library shows generic exercise information, while program context shows personalized clinical relevance. (Session 8)

### 4.6 Tracking data format compatibility

Old format: `tracking_type: string`, `verdi: number` (per set)
New format: `tracking_types: string[]`, `verdier: Record<string, number>` (per set)

Both formats must be supported everywhere: AktivOktScreen, TrackingScreen radar, TrackingScreen graphs, progresjon.ts. The pattern is: try `tracking_types`/`verdier` first, fall back to `tracking_type`/`verdi`. (Session 6)

### 4.7 OvelseDetaljScreen backward compatibility

Reads `instruksjon` (flat structure) with fallback to `purposes[0].instruction` (old nested structure). Similarly for `formaalLabel`. This ensures exercises created before the session 8 refactoring still display correctly. (Session 8)

### 4.8 RIR → RPE conversion coupling

`AktivOktScreen.loggSett()` stores RPE (10 − RIR) in Firestore when `erRIRType` is true. The user sees RIR (0–4), but Firestore always contains RPE (0–10). `progresjon.ts` reads `rpe` from Firestore and applies `≤ 7` threshold — this threshold is preserved because `RIR ≥ 3` = `RPE ≤ 7`.

**If you change this conversion, you must also update `progresjon.ts`.** Both sides must agree on the stored format.

### 4.9 `muskelgrupper` derived from `anatomi` at save time

`AdminOvelseScreen.tsx` no longer has separate text inputs for primer/sekundar/stabilisator. On save, `muskelgrupperFraAnatomi(anatomi)` iterates all `AnatomiBilde` entries and groups them by `rolle`. The resulting `muskelgrupper` object is written to Firestore alongside `anatomi`.

**Downstream consumers of `muskelgrupper`:**
- `AnatomyViewer.tsx` uses it for fuzzy-match fallback when `rolle` is not set on an `AnatomiBilde`
- `/api/generer-program` in `index.js` reads `muskelgrupper` from each exercise to build the AI prompt's anatomy section

If you add anatomy entries without a `rolle`, the fallback in AnatomyViewer fires. Always set `rolle` in the admin panel.

### 4.11 TrackingScreen `loggerFiltrert` downstream effects

`loggerFiltrert` is a derived variable:
```typescript
const loggerFiltrert = filterProgram
  ? logger.filter(l => l.programTittel === filterProgram)
  : logger;
```

Everything downstream reads from `loggerFiltrert` when a program is selected:
- `fullforte` count (Økter stat)
- `compliance` calculation
- `loggerFiltrert.length` (Totalt logget stat)
- Radar `radarNå` and the halvt/nyligLogger split
- Logg section: `grupperLoggerPerUke(loggerFiltrert)`
- Fremgang graph: `valgtProgram` syncs via `useEffect([filterProgram])`

`logger` (unfiltered) is still used for: `programNavn` list, `beregnRadar(logger)` for the blue "all programs" comparison polygon, and all historical normalization in `beregnRadar`. Never filter `programNavn` or the blue radar layer — they always represent the full history. (Claude Code session 4)

### 4.10 Admin Panel ↔ Backend UID coupling

`ADMIN_UID` in `index.js` is hardcoded to Quang's Firebase Auth UID (`RpzuHdFg5heYMVHjC6F4IBPSrmq2`). The `requireAdmin` middleware on all `/api/admin/*` endpoints verifies both the token signature AND that the UID matches. If Quang re-creates his Firebase account (e.g., changed email with new account), this constant must be updated on Render.

---

## 5. Decision Log: Non-Obvious Choices

### 5.1 "No efficiency rule" on AI assessment
The system prompt originally had a rule to "conclude in 6–8 questions." This was explicitly removed because thorough questioning builds patient trust, and quick conclusions signal clinical arrogance. The AI now asks as many questions as needed until 90%+ confidence. Average questions went from 6 → 10.8 after removal. (Session 4)

### 5.2 Alert.alert is banned
`Alert.alert` does nothing in Expo web builds. Every instance was replaced with inline state-based confirmation (e.g., `visMelding()`, modal components). This is a codebase-wide rule. (Sessions 7, 8)

### 5.3 index.js is pure JavaScript
The backend file had a TypeScript annotation `(f: any)` accidentally added, causing a 500 error. Rule: no TypeScript in index.js. Always run `node --check index.js` before pushing. (Session 7)

### 5.4 Radar shows observation, not targets
An expected/target profile per akt was proposed and rejected. Rehabilitation is non-linear — predicting what a user "should" train is clinically unjustifiable. The radar shows what was actually trained, with two layers (current vs previous period) for trend observation. (Session 6)

### 5.5 formaalLabel replaced by tracking_type for categorization
`formaalLabel` was a user-facing display string with inconsistent spelling. `tracking_type` is a clinical classification set by the admin. The switch happened after the radar showed empty because no `formaalLabel` strings matched the category names. (Session 6)

### 5.6 Exercise library: no nested purposes
The original `purposes[]` array made sense theoretically (one exercise with multiple clinical uses) but was complex to manage in admin, program builder, and tracking. Flattening to one document per variant simplified everything. Each variant (e.g., "Benhev – Aktivering" vs "Benhev – Stabilitet") is now its own Firestore document. (Session 8)

### 5.7 Anatomy PNGs: kept opaque backgrounds
Transparent PNG export from the Figma community file was attempted but failed — background fills are baked into nested component layers that couldn't be removed. SVG export was also rejected (file size too large with 400+ files). The solution is CSS blend modes on a light card container. (Session 10)

### 5.8 Firebase Storage bucket name
The correct bucket is `mshelse.firebasestorage.app`, NOT `mshelse.appspot.com`. This caused silent 403 errors that were hard to debug. (Session 9)

### 5.9 Outer-Inner pre-split files deleted
Figma exported pre-split Outer-Inner images, but the viewer was refactored to clip Outer to left half and Inner to right half programmatically. The pre-split files were redundant and deleted from Storage, reducing file count by ~1/3. (Session 10)

### 5.10 Chromebook development constraints
Quang works on a Chromebook Linux container where long `cat << 'EOF'` terminal commands are unreliable (they silently truncate). All long files must be created as downloadable Claude artifacts and copied manually. (Sessions 3–10)

### 5.11 Week-grouped log instead of flat list (Claude Code session 3)
`TrackingScreen` originally showed a flat list of the last 15 sessions. This was replaced with week-grouped sections (up to 8 weeks back) with a label ("Denne uken", "Forrige uke", "X uker siden") and a compliance count per week. The key helper is `getMandagIUken(date: Date)` which snaps any date to Monday at 00:00. For high-frequency programs (`frekvensPerDag > 1`), the log is additionally day-grouped within each week (day header with "X av Y" count, collapsible sessions below). This prevents 35 individual session rows condensing into 7 manageable day-headers. (Claude Code session 3, 4)

### 5.12 RIR for strength exercises, not RPE (Claude Code session 3)
For exercises with `sets_reps_weight` in `tracking_types`, the RPE stepper (0–10) is replaced with an RIR stepper (0–4). Reason: athletes and rehab patients naturally think in "reps left" first, then convert to RPE. Asking for RPE requires a mental abstraction step mid-rest. The conversion `RPE = 10 − RIR` is done at save time so all existing infrastructure (`progresjon.ts`, graphs, radar) remains unchanged. Max 4 was chosen because RIR > 4 is clinically meaningless for strength training.

### 5.13 Admin Panel uses backend (not Firestore rules) for auth
See section 3.9. Short version: stats aggregation requires server-side computation, the admin UID never appears in client code, and Firestore rules cannot enforce cross-collection aggregation logic.

### 5.14 `frekvensPerDag` on program, not exercise (Claude Code session 4)
Frequency was initially proposed as an exercise-level field. Rejected because the same exercise can be prescribed 5×/day for one patient in acute pain and 1×/day for another in maintenance. Putting it on the exercise would require duplicating exercises. Program-level frequency also allows the AI to generate two entirely separate programs (e.g., one 5×/day stretching program + one 1×/day activation program) without conflating them.

### 5.15 Radar two-layer comparison: program vs all (Claude Code session 4)
The radar originally showed current vs previous period (green/yellow) regardless of which program data represented. When a user has multiple programs, this was misleading. The new two-mode radar: "Alle" → green/yellow (current/previous period, unchanged), specific program → green (selected program) / blue (all programs). Blue gives clinical context — is this program's profile typical or atypical for this user? The `fargeFør` prop on `RadarDiagram` handles both modes without duplicating the component. (Claude Code session 4)

### 5.16 VideoSpiller platform split
YouTube embeds work differently on web vs native. `VideoSpiller.tsx` (web) uses an iframe with `rel=0`, `loop`, `modestbranding`. `VideoSpiller.native.tsx` uses `react-native-youtube-iframe` with loop. Both files coexist and React Native auto-selects based on platform. (Session 5)

---

## 6. Data Flow Diagrams

### 6.1 Assessment → Program → Session → Log

```
User fills profile + description
  → KartleggingScreen sends to /api/chat
    → AI returns { done: true, assessment: {...} }
  → KartleggingScreen saves to Firestore assessments/{id}
  → User taps "Opprett program"
    → ProgramBuilder sends exercises + assessment to /api/generer-program
      → AI selects exercises, generates personligKontekst per exercise
    → ProgramBuilder saves to Firestore programs/{id}
  → User starts session
    → AktivOktScreen reads program exercises
    → User logs sets with tracking values
    → AktivOktScreen saves to Firestore logger/{id}
      → increments program.okterFullfort
  → progresjon.ts evaluates logger data against thresholds
    → if ready: shows progression banner
      → Reassessment → new program → cycle repeats
```

### 6.2 Firestore → Screen Data Loading

```
HjemScreen (focus-refresh):
  ← assessments (orderBy dato desc, limit 1) → SituasjonKort
  ← programs (where aktiv==true) → Aktive programmer + DagensØkt
  ← progresjon.ts evaluates logs → Progresjonsbanner

TrackingScreen (focus-refresh):
  ← logger (all for active program) → Radar + Graphs + Log
  ← programs (where aktiv==true) → Compliance stats

ProfilScreen:
  ← users/{uid}/helseProfil → Collapsible profile
  ← assessments (all) → Kartleggingshistorikk (grouped with statussjekker)

AktivOktScreen:
  ← program (from route params) → Exercise list, sets, tracking types
  ← exercises/{id} (Firestore fallback for hold/tempo if missing from program)
  → logger/{id} (write on completion)
  → programs/{id} (update okterFullfort, midtveisGjort)
```

---

## 7. File Map

```
~/mshelse-server/
  index.js                              ← Backend: all API endpoints + system prompts
  .git/                                 ← GitHub: MSHelse/mshelse-server → Render
  
  mshelse/                              ← Frontend: React Native + Expo
    App.tsx
    CLAUDE.md                           ← Context file for Claude Code
    assets/logo.webp
    src/
      navigation/
        RootNavigator.tsx               ← All screen registrations
      screens/
        auth/
          InnloggingScreen.tsx
          RegistreringScreen.tsx
          VelkomstScreen.tsx
        main/
          HjemScreen.tsx                ← SituasjonKort, DagensØkt, progression banner
          BiblioteKScreen.tsx           ← Exercise library, body part filter + fixed akt filter row
          ProgramScreen.tsx             ← Active + archived programs, AI Coach box
          TrackingScreen.tsx            ← Radar, graphs, week-grouped log (most complex screen)
          KartleggingScreen.tsx         ← 3-step assessment flow
          ProfilScreen.tsx              ← Health profile + assessment history + AdminPanel entry
          OvelseDetaljScreen.tsx        ← Exercise detail with anatomy
          AdminOvelseScreen.tsx         ← Exercise admin with anatomy mapping
          AdminPanelScreen.tsx          ← Admin panel (Brukere/Statistikk/Øvelser tabs)
          AktivOktScreen.tsx            ← Active workout session
          ProgramBuilderScreen.tsx      ← AI program generation
          ProgramDetaljScreen.tsx       ← Program detail view
          ReassessmentScreen.tsx        ← Short status check flow
          KartleggingDetaljScreen.tsx   ← Full assessment detail view
      components/
        AnatomyViewer.tsx               ← Anatomy PNG renderer with blend modes
        VideoSpiller.tsx                ← Web YouTube embed
        VideoSpiller.native.tsx         ← Native YouTube player
      services/
        firebase.ts                     ← Firebase init (auth, db, storage)
        bruker.ts                       ← User helpers
        kartlegging.ts                  ← Assessment helpers
        progresjon.ts                   ← Progression evaluation logic
      theme/
        colors.ts                       ← Design tokens

  ms-helse-eval.html                    ← Standalone eval system (runs locally)
```

---

## 8. Known Technical Debt

1. **Render cold start** — 30–60s on first API call after inactivity (free tier)
3. **Expo SDK 55 + Expo Go incompatibility** — all testing is web-only until EAS Build is set up
4. **No payment integration yet** — Stripe planned after first test user round
5. **No Apple Developer account** — $99/year, needed for App Store submission
6. **Exercise library is mostly empty** — ~30 exercises need to be filmed and entered
7. **baselineSporsmal** generated by Haiku at program creation but the full baseline question flow has not been extensively tested with real users

---

## 9. Environment & Deploy Reference

**Deploy frontend:**
```bash
cd ~/mshelse-server/mshelse
./deploy.sh
# Equivalent to:
# npx expo export --platform web && echo "/* /index.html 200" > dist/_redirects && cp -r .vercel dist/ && npx vercel deploy dist --prod
```

**⚠️ Vercel project coupling:** `dist/.vercel/project.json` must reference the `mshelse` project (projectId `prj_U2dIAKyRhkmbYHNXQ9PNsjXh6boE`). Running `vercel deploy` from outside the `dist/` directory creates a new "dist" project instead. The `deploy.sh` script copies `.vercel/` into `dist/` before deploying to prevent this. (Claude Code session 4)

**Deploy backend:**
```bash
cd ~/mshelse-server
git add index.js && git commit -m "description" && git push
# Render auto-deploys from GitHub
```

**Run eval system:**
```bash
cd ~/mshelse-server
python3 -m http.server 8081
# Open http://localhost:8081/ms-helse-eval.html
```

**Firebase Admin UID:** `RpzuHdFg5heYMVHjC6F4IBPSrmq2`
**Firebase Storage bucket:** `mshelse.firebasestorage.app`
**Backend URL:** `https://mshelse-server.onrender.com`
**Frontend URL:** `https://mshelse.vercel.app`
