# MS Helse – Prosjektkontekst
Sist oppdatert: 4. april 2026 (sesjon 4)

---

## REGLER FOR CLAUDE (leses ALLTID først)

## DEBUGGING-REGLER (OBLIGATORISK)

Når en bug rapporteres:
1. **Ikke skriv fix umiddelbart.** Diagnose først.
2. **List 2–4 plausible rotårsaker** – både lokale (komponent, state, props) og eksterne (Firebase, backend, async-data, config).
3. **For hver årsak:** forklar kort hvorfor den kan gi symptomet + én rask måte å verifisere på.
4. **Velg mest sannsynlig årsak eller spør** før du implementerer.
5. **Implementer minimal fix** – ingen refaktorering, ingen urelaterte forbedringer.
6. **Ved usikkerhet:** si eksplisitt fra – ikke gjet og ikke prøv tilfeldige fixes.
7. **Etter 2 mislykkede forsøk:** revurder om problemet er isolert – sjekk parent-komponenter, dataflyt, Firebase/backend, konfig.

**Scope:** Les kun filer direkte relatert til problemet. Ikke modifiser flere filer enn rotårsaken krever.

**Output:** Kortfattet. Kun relevante kodeendringer – ikke hele filer med mindre eksplisitt bedt om det.

**React/TSX-heuristikk:** Sjekk alltid state/props/async/dependency arrays FØR du antar CSS-problem.

---

## REGLER FOR CLAUDE (leses ALLTID først)

1. **Ikke overskriv implementerte features.** Les SKJERM-FASIT før du redigerer noen fil. Hvis en opplastet fil mangler features som står i fasiten, legg dem TILBAKE – si eksplisitt: "Denne filen mangler X. Vil du at jeg legger det tilbake?"
2. **Spør ved tvil.** Hvis opplastet fil ser eldre ut enn fasiten, spør alltid før du handler.
3. **Oppdater fasiten.** Når sesjon er ferdig og Quang ber om det, oppdater denne filen. Terse – én linje per feature.
4. **Alert.alert virker ikke i Expo web-build.** Bruk alltid inline state-basert feilmelding.
5. **Alle navigate-kall til AktivOkt og Reassessment må sende `assessment` med.**
6. **progresjon.ts** ligger i `src/services/progresjon.ts` – importeres av HjemScreen og AktivOktScreen.
7. **navigation.reset** brukes (ikke navigate) ved navigasjon tilbake til Hjem fra ProgramBuilder og ReassessmentScreen.
8. **Reassessment-dokumenter** lagres med `type: 'reassessment'` og feltene `tittel`, `triage`, `konklusjon`, `begrunnelse`, `neste_steg`, `program_hint`. Ved `neste_akt` eller `intensiver` settes gammelt program `aktiv: false`.
9. **index.js er ren JavaScript** – ingen TypeScript-annotasjoner. Kjør `node --check index.js` før push.
10. **Øvelses-struktur er flat** – ingen `purposes[]`. Feltene `instruksjon`, `tracking_types`, `motstandsType`, `kliniskNotat` ligger direkte på rotnivå i Firestore `exercises`-dokumentet. `formaalLabel` eksisterer i eldre data men brukes ikke lenger i UI.
13. **`frekvensPerDag` ligger på program, ikke øvelse.** Felt i Firestore `programs/{id}`. `okterTotalt = dager.length × uker × frekvensPerDag`. Backend kan returnere `{ programmer: [...] }` array – ProgramBuilderScreen håndterer begge formater.
14. **Deploy via `./deploy.sh`** (ikke manuell vercel-kommando). Scriptet kopierer `.vercel/` inn i `dist/` for å sikre riktig Vercel-prosjekt. Uten dette lages et nytt "dist"-prosjekt i stedet for å oppdatere mshelse.
11. **personligKontekst** vises kun i OvelseDetaljScreen hvis sendt med som param fra ProgramDetaljScreen. Aldri fra biblioteket. Handler om HVORFOR og klinisk relevans – ikke utførelsesinstruksjoner.
12. **Ikke start å generere kode** før Quang eksplisitt sier han er klar. Samle alle krav først, implementer i én batch.

---

## VISJON

MS Helse skal ikke bare være hakket bedre enn konkurrentene – andre apper skal ikke kunne måle seg med den. Det er ikke en enkel rehab-app. Det er en presisjonsplattform som skal være bedre enn mange personlige trenere, coacher og fysioterapeuter.

**Tre ting ingen andre gjør:**
1. AI-kartlegging som resonnerer klinisk om deg spesifikt – ikke 5 generiske spørsmål
2. Personlig kontekst per øvelse basert på dine kompensasjonsmønstre
3. Presis muskelanatomi med dype og overfladiske muskler, splittvisning og rollefarger

Appen skal følge brukeren fra dag én med smerte gjennom hele rehabiliteringsreisen og videre inn i Akt 3 – progressiv styrke og livslang trening.

---

## OM QUANG
- Selvstendig, Oslo, ENK. Driver Muskelspesialist Klinikken alene. 8 års klinisk erfaring.
- Firebase Admin UID: `RpzuHdFg5heYMVHjC6F4IBPSrmq2`
- **Claude opererer som ekspert med 30 års erfaring som fysioterapeut og manuellterapeut**
- Stil: direkte, profesjonell, ingen hype

---

## APPEN: MS HELSE

**Kjernemål:** Erstatter manuell øvelsesveiledning. Passiv inntekt.
**Modell:** Freemium – første kartlegging + første program gratis, deretter 99kr/mnd
**Plattform:** App Store + Google Play (React Native). Ikke PWA.
**Deploy:** Frontend → Vercel (mshelse.vercel.app) · Backend → Render.com

### Rehabiliteringsreisen
- **Akt 1 – Få kontroll:** Deaktivering/mobilisering + lavterskel aktivering. 1–6 uker. Smerte relevant.
- **Akt 2 – Rette opp:** Aktivering med progresjon, stabilitet, kompensasjonsmønstre.
- **Akt 3 – Vokse:** Progressiv styrke, utholdenhet, søvn/kosthold/stress. Livslang bruk.
- **Triage:** 7–10→Akt1 · 4–6→Akt1+2 · 1–3→Akt2 · 0→Akt2/3

---

## TEKNISK STACK

```
Mobilapp:  React Native + Expo SDK 55  ~/mshelse-server/mshelse/
Backend:   Node.js + Express           ~/mshelse-server/index.js  → Render.com
DB + Auth: Firebase Firestore + Auth   prosjekt: mshelse
Storage:   Firebase Storage            anatomy/ (Blaze-plan påkrevd)
AI:        Claude Sonnet 4             claude-sonnet-4-20250514
SVG:       react-native-svg            installert
```

**Deploy frontend:**
```bash
cd ~/mshelse-server/mshelse
npx expo export --platform web && echo "/* /index.html 200" > dist/_redirects && npx vercel deploy dist --prod
```
**Deploy backend:** `git push` i `~/mshelse-server/` → Render auto-deployer

**Viktig:** Expo SDK 55 ikke kompatibel med Expo Go – bruk web-build. Render spinner ned – 30–60s første kall.

### Nye filer
```
src/services/progresjon.ts
src/screens/main/ReassessmentScreen.tsx
src/screens/main/KartleggingDetaljScreen.tsx
src/components/AnatomyViewer.tsx
```

---

## SKJERM-FASIT (kritisk – les før du redigerer noen fil)

| Skjerm | Nøkkelfunksjoner implementert |
|--------|-------------------------------|
| **KartleggingScreen** | 3 steg: (1) Profil – kjønn/alder/aktivitet/tilstander inkl. Gravid, forhåndsutfylt fra Firestore, lagres tilbake. (2) Innledning – åpent tekstfelt min 10 tegn. (3) AI-kartlegging. Første melding inneholder profil + innledning. |
| **ProfilScreen** | Kollapsbar HELSEPROFIL: kjønn, alder, aktivitet, tilstander, andreTilstander, lagre-knapp kun ved endring. KARTLEGGINGSHISTORIKK: kartlegginger gruppert med statussjekker under (datobasert periode-matching), kartlegging navigerer til KartleggingDetalj, statussjekk ekspanderer inline. Admin-knapp for Quang. |
| **HjemScreen** | SituasjonKort: akt-badge med ?-chip (modal forklarer alle 3 akter), håndterer vanlig assessment og type:'reassessment' (konklusjon-badge + begrunnelse). Progresjonsbanner med statussjekk-knapp. Dagens økt med **frekvens-badge** ("X av Y ganger i dag") og dynamisk knapp-tekst ("Start gang 2 av 4 →" / "Gjort 4× – start en gang til →"). Aktive programmer. Focus-refresh. |
| **TrackingScreen** | **Program-filter chip-rad** øverst (Alle + ett per program fra logger, settes automatisk til aktivt program). Alle stats/logg/radar filtreres på valgt program. Ukeoversikt (X/Y for høyfrekvens). Stats (compliance fra okterFullfort/okterTotalt for valgt program). Formål-radar – 2 lag: ved filterProgram=grønn(program)+blå(alle programmer); ved Alle=grønn(siste)+gul(forrige). `RadarDiagram` har `fargeFør`-prop. Fremgang-graf – to-nivå: program-chips (synker med filterProgram) → øvelse-liste (variant C) → datobasert graf, daglig aggregering for høyfrekvens. Logg – **ukegruppert**, for høyfrekvens også **daggruppert** innen uke. Focus-refresh. |
| **AktivOktScreen** | Video øverst. Hold/tempo fra program ELLER Firestore fallback. Tempo-? popup. Hvile: clearInterval-fix, ±15s, stoppHvile(). Avslutt: modal utenfor ScrollView. Progresjonsbanner → Reassessment. assessment-param sendes videre. lagreOkt(sjekkInnData, fraSkjerm). TRACKING_INFO konstant + ?-chip ved alle tracking-labels. **RIR for sets_reps_weight:** når `rpe`+`sets_reps_weight` i tracking_types → vises som "Reps i reserve (0–4)", konverteres til RPE (10−RIR) ved lagring. Viser `personligKontekst` som grønn "FOR DEG SPESIELT"-boks under instruksjon. AnatomyViewer kompakt alltid synlig med muskelgrupper. **`completed` og andre tracking-typer vises parallelt** (ikke ternary – tidligere bug). Frekvens-strip under progress bar for høyfrekvens-programmer. |
| **AktivOktScreen** | Video øverst. Hold/tempo fra program ELLER Firestore fallback. Tempo-? popup. Hvile: clearInterval-fix, ±15s, stoppHvile(). Avslutt: modal utenfor ScrollView. Progresjonsbanner → Reassessment. assessment-param sendes videre. lagreOkt(sjekkInnData, fraSkjerm). TRACKING_INFO konstant + ?-chip ved alle tracking-labels. **RIR for sets_reps_weight:** når `rpe`+`sets_reps_weight` i tracking_types → vises som "Reps i reserve (0–4)", konverteres til RPE (10−RIR) ved lagring. Viser `personligKontekst` som grønn "FOR DEG SPESIELT"-boks under instruksjon. AnatomyViewer kompakt alltid synlig med muskelgrupper. **`completed` og andre tracking-typer vises parallelt** (ikke ternary). Frekvens-strip under progress bar for høyfrekvens-programmer. |
| **ReassessmentScreen** | Henter logger, bygger trackingOppsummering, sender til /api/reassessment. Lagrer med type:'reassessment' + SituasjonKort-feltene. Deaktiverer gammelt program ved neste_akt/intensiver. navigation.reset ved tilbake til Hjem. Feilskjerm med "Prøv igjen". |
| **KartleggingDetaljScreen** | Viser full konklusjonsside: kandidater, funn, livsstil, bekreftende, oppsummering, triage for vanlig assessment. Begrunnelse, neste_steg, program_hint for reassessment. |
| **ProgramBuilderScreen** | Auto-generering ved fraReassessment/fraAssessment. genererHarKjørt-flag. Loading/feilskjerm. navigation.reset til Hjem ved lagring. Leser flat øvelsesstruktur (ingen purposes[]). **FREKVENS PER DAG** chip-rad (1×–5×). Håndterer `data.programmer` array fra AI (lagrer alle programmer direkte). Viser "AI genererte X programmer: …" ved flere programmer. |
| **ProgramScreen** | Grønn AI Coach-boks med akt-info og tittel på kartlegging. Sender normalisert assessment til ProgramBuilder. Dato (startet) per program. Inline slett-bekreftelse (ingen Alert). Aktive + arkiverte programmer. |
| **ProgramDetaljScreen** | Dato under tittel. Inline slett-bekreftelse i bunntBar. Sender personligKontekst med til OvelseDetalj. |
| **OvelseDetaljScreen** | Viser personligKontekst som grønn "FOR DEG SPESIELT"-boks hvis sendt med som param (kun fra program). Viser instruksjon fra flat struktur med fallback til purposes[0].instruction for gammel data. AnatomyViewer med muskelgrupper. **"OM ØVELSEN"**-seksjon: akt-tags med semantisk farge + ?-chip (forklarer akt 1/2/3), tracking-type-chips + ?-chip (forklarer tracking-metoden). Ingen bodyParts-tags. IKKE fra biblioteket. |
| **AdminOvelseScreen** | Flat struktur. Inline visMelding() istedenfor Alert.alert. Feltene: navn, videoUrl, hold, tempo, kroppsdeler, akt, instruksjon, tracking-typer, motstandstype, kliniskNotat, anatomi-mapping. AI-generer klinisk notat + anatomi-mapping (sender kun Outer-filer til AI). Anatomi-chips med rolle-toggle (P/K/S syklus) og type-toggle (○/◉ overfladisk↔dyp). Forhåndsvisning alltid synlig. 🫀-indikator i liste. **Kopier øvelse:** "Kopier"-knapp per rad, pre-fyller form med alle felt + "(kopi)" i navn, lagres som ny øvelse. |
| **BiblioteKScreen** | Øvelsesliste. Søkefelt. Kroppsdel-filter (horizontal scroll). **Akt-filter i fast rad** (alltid synlig): "Alle akter", "Akt 1", "Akt 2", "Akt 3" – kan kombineres med kroppsdel-filter. Akt-tags med semantisk farge (rød=1, gul=2, grønn=3). |
| **RootNavigator** | Registrerer ReassessmentScreen og KartleggingDetaljScreen. |

---

## BACKEND-ENDEPUNKTER

| Endepunkt | Formål |
|-----------|--------|
| `POST /api/chat` | Kartlegging – Sonnet 4, max_tokens 6000 |
| `POST /api/reassessment` | Statussjekk – 4–7 spørsmål, konkluderer med neste_akt/intensiver/fortsett/ny_kartlegging |
| `POST /api/generer-program` | AI-programgenerering – genererer `personligKontekst` per øvelse basert på funn og kompensasjonsmønstre. Krever øvelser i body. |
| `POST /api/proxy` | Generelt proxy for Haiku (baseline-spørsmål etc.) |

---

## PERSONLIG KONTEKST PER ØVELSE

AI-en genererer et `personligKontekst`-felt per øvelse i programmet – 1-3 setninger som forklarer:
- **Hvorfor** akkurat denne øvelsen er valgt (koble til kartleggingsfunn)
- **Hvilket kompensasjonsmønster** øvelsen adresserer for denne brukeren
- **Hva de bør være obs på** – ikke generelle utførelsesinstruksjoner

Vises som grønn "FOR DEG SPESIELT"-boks:
- I **AktivOktScreen** under instruksjonsteksten
- I **OvelseDetaljScreen** hvis sendt med som param fra ProgramDetaljScreen

---

## ANATOMI-SYSTEM

**Status:** ~280 PNG-filer i Firebase Storage (`anatomy/`). Kun Outer og Inner – ingen Outer-Inner-filer (slettet, vieweren klipper selv).

**Bucket:** `mshelse.firebasestorage.app`

**Storage-regler:** `anatomy/` er offentlig lesbar (`allow read, list: if true`). Resten krever auth.

**Filnavnformat:**
```
Muscle Group=- [Navn], View=[Anterior|Posterior], Dissection=Outer Muscles.png
Muscle Group=- [Navn], View=[Anterior|Posterior], Dissection=Inner Muscles.png
```

**To bildetyper:**
- **Outer** = overfladisk muskellag (grå kropp + rød muskel, hvit bakgrunn)
- **Inner** = dypt lag (skjelett + rød muskel, hvit bakgrunn)

**PNG-ene har hvit bakgrunn** – ikke transparent. Eksport fra Figma (Human Anatomy Component System) med fill fjernet ga fortsatt hvit pga innebygde lag i community-filen.

**AnatomyViewer (`src/components/AnatomyViewer.tsx`):**
- Props: `anatomi: AnatomiData`, `muskelgrupper?: MuskelGrupper`, `kompakt?: boolean`, `muskelFiler?: string[]`
- Eksporterer `matchMuskelFil()` for bruk i AdminOvelseScreen
- `normaliserFilnavn()` fikser `=Quadriceps` → `=- Quadriceps` automatisk
- Kort-container: `backgroundColor: '#F2F2F2'`, `borderRadius: 14`, `overflow: 'hidden'` (ingen borderWidth/borderColor)
- `mix-blend-mode: darken` for stabling av flere muskler
- Canvas API fjerner hvit bakgrunn runtime: piksler med `brightness > 200 && saturation < 30` → transparente. CORS på Firebase Storage er satt (`gsutil cors set`).
- Rollefarger via **direkte fargebytting på pikseldata** (ikke hue-rotate): røde piksler (`r > 150 && r > g*1.5 && r > b*1.5`) erstattes med målfargen skalert på lysstyrke. `ROLLE_RGB`: primer=(224,85,85), sekundær=(212,168,42), stabilisator=(74,144,217).
- `AnatomiBilde` har valgfritt `rolle`-felt ('primer'|'sekundar'|'stabilisator')
- `bestemRolle()` sjekker `entry.rolle` først, deretter fuzzy match mot muskelgrupper som fallback
- Tre muskelroller i muskelliste: rød=primær, gul=sekundær, blå=stabilisator
- Splittet visning: venstre halvdel klipper Outer, høyre halvdel klipper Inner (via `overflow: hidden` + offset)
- Web: bruker native `<img>` og `<div>` istedenfor RN Image
- Cache-nøkkel: `url|||rolle` (én canvas-prosessering per bilde+rolle, deretter instant)

**⚠️ IKKE PRØV mørk bakgrunn på anatomikortet:** `darken` blend krever lys bakgrunn. `lighten` på mørk bakgrunn feiler fordi grå kropp (~191/kanal) dominerer muskelfarger (spesielt stabilisator-blå r=74). Canvas-kompositt er mulig men komplekst – ikke prioritert.

**Firestore-felt på øvelse:**
```
anatomi: {
  anterior: [{ bilde: "...", type: "overfladisk", rolle: "primer" }],
  posterior: [{ bilde: "...", type: "dyp", rolle: "sekundar" }]
}
muskelgrupper: { primer[], sekundar[], stabilisator[] }
```

**AdminOvelseScreen – anatomi-logikk:**
- `unikeMuskler()` og `finnBesteFiler()` bruker eksakt view-match
- `finnBesteFiler()` returnerer Outer (overfladisk) som standard
- `muskelVisning()` returnerer `'begge'` når Outer+Inner finnes, `'outer'`, `'inner'`, eller `'ingen'`
- Rolle-toggle: rund knapp (P/K/S) sykler primer→sekundar→stabilisator, fargekodet
- Type-toggle: ○/◉ knapp bytter mellom Outer/Inner fil (bytter `bilde` + `type`)
- AI-generer sender kun Outer-filer i prompt (kortere), ber om `rolle` i JSON-output
- `bestemRolleFraPicker()` prøver fuzzy match mot muskelgrupper-feltene

---

## ØVELSES-DATASTRUKTUR (FLAT)

```
exercises/{id}
  name, videoUrl
  bodyParts[], act: [1]|[2]|[3]|[1,2,3], hold, tempo
  instruksjon: "Steg-for-steg instruksjon..."
  tracking_types: ["activation_quality"]
  tracking_type: "activation_quality"
  motstandsType: [] (kun ved sets_reps_weight)
  kliniskNotat: "Klinisk notat for AI..."
  muskelgrupper: { primer[], sekundar[], stabilisator[] }
  anatomi: { anterior: [...], posterior: [...] }
```

**Merk:** OvelseDetaljScreen har fallback til `purposes[0].instruction` og `formaalLabel` for gammel data i Firestore.

---

## PROGRESJON-LOGIKK (progresjon.ts)

AND-logikk – ALLE kliniske typer må nå terskel over siste 2–3 logger:
`activation_quality` ≥ 8 · `mobility` ≥ 8 · `contact_reps` ≥ 85% rep-mål · `rpe` ≤ 7 OG fall ≥ 1.5 · `side_diff` ≤ 3
`sets_reps`, `sets_reps_weight`, `completed` ignoreres klinisk.
Akt 1 ekstra: smerte = 0. Trigger: ≥ 40% fullført, ≥ 2 **unike treningsdager** (ikke antall sesjoner – gruppert på `dato.toDateString()` for høyfrekvens-støtte).

---

## KARTLEGGINGS-SYSTEMPROMPT (V13)

15 obligatoriske kartleggingsområder · Ovenfra-ned resonnering · 10 bekreftelsestester · Helseprofil + innledning injisert i første melding
Confidence: Enkel 93–96% · Sammensatt 87–91% · Uklart 82–87%

---

## FIREBASE DATASTRUKTUR

```
users/{uid}
  helseProfil: { biologiskKjonn, aldersgruppe, aktivitetsniva, tilstander[], andreTilstander }

users/{uid}/assessments/{id}
  tittel, confidence, triage: { pain_level, goal, start_act, next_step }
  kandidater[], funn[], livsstil, bekreftende, oppsummering, painTrackingType
  type: 'reassessment' (kun statussjekker) + konklusjon, begrunnelse, neste_steg, program_hint

users/{uid}/programs/{id}
  tittel, akt, uker, dager[], ovelser[]
  ovelser[]: { exerciseId, navn, instruksjon, personligKontekst,
               tracking_types[], tracking_type, sets, reps, hold, tempo }
  aktiv, okterFullfort, okterTotalt, frekvensPerDag, source, assessmentId, opprettet
  baselineSporsmal: [{ id, sporsmal, svar, midtveis }]
  midtveisGjort, midtveisGrc

users/{uid}/logger/{id}
  dato, programId, programTittel, fullfort, skippetArsak, smerte: 0–10|null, notat
  ovelser[]: { exerciseId, navn, tracking_types[],
               sett[]: { sett, tracking_types[], verdier: Record<string,number>, hoppetOver } }
  sjekkInn: { globalRating: -3..3, svar[] }

exercises/{id}
  name, videoUrl
  bodyParts[], act: [1]|[2]|[3]|[1,2,3], hold, tempo
  instruksjon, tracking_types[], tracking_type
  motstandsType[], kliniskNotat
  muskelgrupper: { primer[], sekundar[], stabilisator[] }
  anatomi: { anterior: [{ bilde, type, rolle? }], posterior: [...] }
```

**Feltkompatibilitet:** Firestore lagrer `funn`/`oppsummering`. Backend leser begge med fallback.

---

## TRACKING-TYPER

| Type | Radar-kategori | Terskel |
|------|---------------|---------|
| `activation_quality` | Aktivering | ≥ 8 |
| `completed` | Aktivering | – |
| `contact_reps` | Stabilitet | ≥ 85% rep-mål |
| `side_diff` | Stabilitet | ≤ 3 |
| `mobility` | Mobilitet | ≥ 8 |
| `sets_reps` | Styrke | ignorert |
| `sets_reps_weight` | Styrke | ignorert |
| `rpe` | Utholdenhet | ≤ 7 + fall ≥ 1.5 |

---

## DESIGN

```typescript
bg:'#0A0A0A' surface:'#141414' surface2:'#1C1C1C'
border:'#262626' border2:'#333333'
text:'#F2F2F2' muted:'#959595' muted2:'#626262' accent:'#FFFFFF'
green:'#52A870' greenDim:'rgba(82,168,112,0.12)' greenBorder:'rgba(82,168,112,0.32)'
yellow:'#D4A82A' yellowDim:'rgba(212,168,42,0.12)' yellowBorder:'rgba(212,168,42,0.32)'
danger:'#C0392B' dangerDim:'rgba(192,57,43,0.12)' dangerBorder:'rgba(192,57,43,0.32)'
blue:'#4A90D9'
```
Brødtekst: 400 · Dempet: 300 · Titler: 500 · Knapper: 600 · borderRadius: 14

---

## AKT-FARGER (konsistent overalt)

```typescript
const AKT_FARGE = {
  1: { bg: colors.dangerDim, border: 'rgba(192,57,43,0.3)', tekst: colors.danger },
  2: { bg: colors.yellowDim, border: colors.yellowBorder, tekst: colors.yellow },
  3: { bg: colors.greenDim, border: colors.greenBorder, tekst: colors.green },
};
```
Brukes i: HjemScreen, ProgramScreen, BiblioteKScreen, OvelseDetaljScreen. Alltid semantisk – aldri hardkodet grønn.

---

## NESTE STEG
1. Filme og legge inn øvelsesbibliotek (~30 øvelser) via admin
2. 2–3 testbrukere via mshelse.vercel.app
3. Betalingsløsning: Stripe + ny Fiken
4. Apple Developer-konto + EAS Build
