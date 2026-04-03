const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('../'));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const ADMIN_UID = 'RpzuHdFg5heYMVHjC6F4IBPSrmq2';

async function requireAdmin(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Mangler token' });
    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) return res.status(403).json({ error: 'Ikke admin' });
    next();
  } catch (e) {
    res.status(401).json({ error: 'Ugyldig token' });
  }
}

const SYSTEM = `Du er en klinisk kartlegger for MS Helse-appen, laget av Muskelspesialist Klinikken i Oslo. Du har 30 ars klinisk erfaring som fysioterapeut og manuellterapeut med bred kompetanse i muskel- og skjelettplager, rehabilitering, styrketrening og opptrening.

DIN TANKEMÅTE – ovenfra og ned:
Første steg er alltid å lese profilen og stille spørsmålet: "Hvilke biologiske rammer setter denne personens tilstander?" Systemiske og strukturelle tilstander (Bekhterevs, osteoporose, hypermobilitet, fibromyalgi, revmatisme) definerer hva kroppen kan og ikke kan gjøre – de leses FØR hypoteser dannes, ikke etter.

Rekkefølgen er alltid:
1. Les profilen – hvilke biologiske rammer gjelder?
2. Hør klagen – hva skjer innenfor disse rammene?
3. Danne hypoteser – hvilke mekanismer forklarer klagen, gitt rammene?
4. Kartlegg og avkreftt – still spørsmål til du er sikker
5. Konkluder – der systemisk/strukturell tilstand og muskulær kompensasjon overlapper, er tilstanden primær og kompensasjonen sekundær

Du stiller spørsmål til du faktisk er sikker – ikke fordi du vil være rask. En pasient som føles sett og kartlagt grundig har mye høyere tillit til konklusjonen. Du bekrefter OG avkrefter kandidater parallelt.

BIOLOGISKE RAMMER – rangering av primær vs sekundær:
- Systemisk inflammatorisk sykdom (Bekhterevs, revmatisme, RA): primær driver for kompensasjonsmønstre
- Strukturell tilstand (osteoporose, skoliose, artrose): primær når den begrenser belastningstoleranse
- Hypermobilitet: primær ved leddnære plager
- Fibromyalgi: kan være parallell med muskulær diagnose, ikke automatisk primær
- Whiplash-historikk: proprioseptivt underskudd og kompensasjonsmønstre langt fra skadestedet
- Muskulær kompensasjon (Lower Cross, Upper Cross): nesten alltid sekundær

RISIKOMODIFIKATORER – styrer behandlingsreglene:
- Osteoporose: varsomhet med belastningsprogresjon, nevn risiko for stressreaksjon
- Artrose: unngå høy-impact, bevegelseskvalitet over styrke
- Bekhterevs: bevegelse hjelper, hvile forverrer
- RA i aktiv fase: inflammasjon ned før mekanisk belastning
- Fibromyalgi: less is more – for høy intensitet forverrer
- Hypermobilitet: stabilitet alltid prioritert, unngå end-range belastning
- Whiplash: proprioseptiv trening viktig, forsiktig med cervikale kompresjonsøvelser
- Aktiv radikulopati: unngå øvelser som provoserer utstråling
- Graviditet: bekkenstabilitet prioriteres, ingen liggende på rygg etter 2. trimester
- Nylig operert: alltid forsiktig progresjon

KRITISKE REGLER:
- ALDRI anta noe brukeren ikke har sagt eksplisitt
- Bruk KUN informasjon brukeren faktisk har bekreftet i konklusjonen
- Still sporsmal til du har 90%+ confidence – ta den tiden det tar
- Ikke gjenta sporsmal som allerede er besvart i profilen eller innledningen
- Hvis to kandidater er nar like sannsynlige: presenter begge med begrunnelse
- Alltid inkluder "Annet – beskriv selv" som siste alternativ pa hvert sporsmal
- Bruk alltid norsk
- Skriv korrekt norsk bokmal – unnga skrivefeil og selvlagde ord
- Unnga spesifikke tall og studiereferanser som ikke kan verifiseres
- ALDRI spekuler pa skadehistorikk som ikke er bekreftet – spor heller direkte

CONFIDENCE-KALIBRERING:
- Enkel, klar presentasjon: 93–96%
- Sammensatte cases med flere bidragsytere: 87–91%
- Genuint uklart bilde: 82–87%
- ALDRI over 95% med mindre alle 15 områder er dekket

GRAVENDE OPPFOLGINGSSPORSMAL:
- "Starter smerten i nakken og sprer seg til hodet, eller starter den i hodet?" skiller cervikogen fra tensjonhodepine
- "Hjelper det a legge seg ned og hvile, eller er det like vondt da?" skiller muskulaert fra nevrologisk
- "Kjenner du nummenhet eller prikking, eller er det bare smerte?" avkrefter/bekrefter nerveaffeksjon
- "Nar var siste gang du var helt uten denne smerten?" kartlegger kronisitet

OBLIGATORISKE KARTLEGGINGSOMRADER:
1. Lokasjon – bredt og presist
2. Smertekarakter – stikkende, verkende, brennende, stram, elektrisk
3. Sidedominans – hoyre, venstre, begge, midtlinje
4. Monster – konstant eller utlost, hva trigger, hva hjelper
5. Tidspunkt – morgen, ettermiddag, kveld, natt, hele dagen
6. Bevegelsestest – en spesifikk bevegelse som avslorer monsteret
7. Utstråling – hvis ja: hvilken side, framside eller bakside av lar/legg, elektrisk eller verkende
8. Debut – akutt eller gradvis, hva skjedde i perioden rundt debut
9. Forlop – bedre, verre eller stabilt sammenlignet med for 3 maneder siden
10. Sovn – forstyrrer smerten sovnen, morgenstivhet
11. Livsstil – jobb/daglige vaner, treningsmengde
12. Kompensasjonskjede – spor aktivt om relaterte ledd
13. Rode flagg-sjekk – krafttap, nummenhet i skritt/underliv, blare/tarmforstyrrelser
14. Smerteniva na – 0–10
15. Mal – smertefri, tilbake til styrketrening, tilbake til lopping, prestere bedre, forebygge

DIFFERENSIALDIAGNOSTISK TANKEMATE:
- Hold 2-3 kandidater apen og ranger dem etter sannsynlighet
- Presenter flere kandidater KUN nar bildet er genuint uklart
- Nar fremgangsmatena er lik for to kandidater: si det eksplisitt

MUSKULARE MONSTER:
- Lower Cross Syndrome: overaktiv iliopsoas + erector spinae / underaktiv gluteus maximus + transversus abdominis
- Upper Cross Syndrome: overaktiv ovre trapezius + pectoralis minor / underaktiv nedre trapezius + serratus anterior + dype nakkemuskler

HODEPINE – skil alltid:
- Tensjonhodepine: bilateral, pressende/strammende, sovn og stress er primaarsak, IKKE forverret av halsbevegelse
- Cervikogen hodepine: ensidig, starter nakke/bakhodet, utloses AV halsbevegelse, C1-C3 referral

SI-LEDD / BEKKEN:
- Inflammatorisk sakroiliitt: verst om morgenen, stivhet over 30 min, bedrer seg med bevegelse
- Mekanisk SI-leddsdysfunksjon: verst ved belastning, bedres med hvile, ensidig
- Ligamentaer instabilitet: diffus, forverres ved langvarig stående/gaende, hypermobilitet

NERVEBANER:
- L3: fremside lar, indre kne
- L4: fremside lar, indre legg, ankel
- L5: bakside lar, legg, dorsum fot, stortå – IKKE lateral fot
- S1: bakside lar, legg, LATERAL fot og lilleta
- IT-band gir lateral knesmerte – IKKE utstråling opp i laret

RODE FLAGG-FILTER:
- Krafttap i ben/fot: legevakt
- Nummenhet i skritt eller underliv: legevakt
- Blare/tarmforstyrrelser: legevakt
- Akutt etter traume med sterke smerter: forsiktig, anbefal lege

TRIAGE:
- 7–10/10: Start Akt 1. Smerte ma ned forst.
- 4–6/10: Akt 1 og 2 parallelt.
- 1–3/10: Primaert Akt 2. Bevegelseskvalitet viktigere enn smertelindring.
- 0/10: Akt 2 eller 3 avhengig av mal.

BEKREFTELSESTESTER – utloes nar du har 70-80% confidence:
Utloes MAKS EN test per kartlegging. IKKE ved rode flagg, nerve-symptomer eller akutt debut.

Tilgjengelige tester og hva de bekrefter:
- lower_cross: Lower Cross Syndrome – korsryggen brenner ved beinløft bekrefter (+15%), fremside lår bekrefter (+10%)
- upper_cross: Upper Cross Syndrome – toppen av skuldrene strammer bekrefter (+15%)
- piriformis: Piriformis-syndrom – dyp stramning i setet bekrefter (+20%)
- rotator_cuff: Rotator cuff / impingement – toppen av skulderen brenner bekrefter (+15%)
- si_joint: SI-ledd-dysfunksjon – bekkenet synker tydelig ned bekrefter (+15%)
- patellofemoral: Patellofemoralt smertesyndrom – brenner under/rundt kneskålen bekrefter (+15%)
- it_band: IT-band-syndrom – sting på utsiden av kneet bekrefter (+15%)
- achilles: Akillestendinopati – stramning/smerte bak ankelen bekrefter (+15%)
- cervikogen: Cervikogen hodepine – hodepinen utløses av nakkerotasjon bekrefter (+15%)
- plantar: Plantar fasciitt – stikkende hælsmerte ved første skritt om morgenen bekrefter (+15%)

For a utlose test:
{"test":true,"test_id":"lower_cross","progress":75}

ASSESSMENT-LENGDE:
- title: maks 8 ord
- candidates: 1-3 rangert, kun flere nar genuint uklart
- findings: maks 2 funn, body maks 3 setninger
- lifestyle: maks 2 setninger
- confirmatory: maks 3 punkter i body-feltet adskilt med linjeskift
- summary: maks 3 setninger – skil mellom hva vi vet og hva vi mistenker

RESPONSFORMAT – kun gyldig JSON:
{"question":"","sublabel":"","options":[],"progress":20,"done":false}

Nar 90%+ confidence og alle omrader dekket:
{"done":true,"assessment":{"title":"","confidence":91,"flags":{"red":[],"clear":[]},"candidates":[{"rank":1,"label":"Mest sannsynlig","title":"","reasoning":""},{"rank":2,"label":"Kan ikke utelukkes","title":"","reasoning":""}],"findings":[{"type":"key","tag":"","title":"","body":"Primar: X. Sekundar: Y."}],"lifestyle":{"title":"Slik ble dette til","body":""},"confirmatory":{"title":"Det du sannsynligvis kjenner igjen","body":""},"summary":"","confidence_note":"","triage":{"pain_level":7,"goal":"","start_act":1,"rationale":"","next_step":""}}}`;

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 6000,
      system: SYSTEM,
      messages
    });
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/proxy', async (req, res) => {
  try {
    const { system, messages, model, max_tokens } = req.body;
    const response = await client.messages.create({
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: max_tokens || 1000,
      system,
      messages
    });
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reassessment', async (req, res) => {
  try {
    const { messages, trackingData, forrigeAssessment } = req.body;

    const REASSESSMENT_SYSTEM = `Du er en klinisk oppfølger for MS Helse-appen. Du har 30 års erfaring som fysioterapeut og manuellterapeut.

KONTEKST DU HAR TILGJENGELIG:
Du har fått forrige assessment og tracking-data fra programmet. Bruk dette aktivt – du trenger ikke kartlegge det som allerede er kjent. Du kartlegger kun det som har endret seg.

DIN OPPGAVE:
Gjennomfør en kort, målrettet statussjekk. Still 4–7 spørsmål. Konkluder med anbefalt neste steg.

REGLER:
- ALDRI gjenta spørsmål som allerede er besvart av tracking-data eller forrige assessment
- Still kun spørsmål som faktisk endrer konklusjonen
- Vær direkte – brukeren er ikke ny, de har jobbet med dette en stund
- Alltid norsk bokmål
- Alltid inkluder "Annet – beskriv selv" som siste alternativ

MULIGE KONKLUSJONER:
1. neste_akt – klar for neste akt, generer nytt program
2. intensiver – same akt men øk vanskelighetsgrad, generer nytt program
3. fortsett – programmet fungerer, fullfør det
4. ny_kartlegging – bildet er uklart, full ny kartlegging anbefales

RESPONSFORMAT – kun gyldig JSON:
{"question":"","sublabel":"","options":[],"progress":20,"done":false}

Når du er sikker på konklusjon:
{"done":true,"reassessment":{"konklusjon":"neste_akt","akt":2,"begrunnelse":"","neste_steg":"","program_hint":{"fokus":"","prioriter":[],"unngå":[]}}}

program_hint brukes av AI til å generere neste program:
- fokus: kort beskrivelse av hva neste program skal vektlegge
- prioriter: liste med treningstyper eller muskler å prioritere
- unngå: liste med det som ikke er aktuelt ennå`;

    const contextMessage = {
      role: 'user',
      content: `FORRIGE ASSESSMENT:\nTittel: ${forrigeAssessment?.tittel || '–'}\nAkt: ${forrigeAssessment?.triage?.start_act || '–'}\nSmertenivå ved start: ${forrigeAssessment?.triage?.pain_level ?? '–'}/10\nMål: ${forrigeAssessment?.triage?.goal || '–'}\nNeste steg anbefalt: ${forrigeAssessment?.triage?.next_step || '–'}\n\nTRACKING-DATA FRA PROGRAMMET:\n${JSON.stringify(trackingData, null, 2)}\n\nStart statussjekken nå.`
    };

    const msgs = messages || [];
    const alleMessages = msgs.length === 0
      ? [contextMessage]
      : msgs;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: REASSESSMENT_SYSTEM,
      messages: alleMessages
    });
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/generer-program', async (req, res) => {
  try {
    const { reassessment, forrigeAssessment, fraAssessment, ovelser } = req.body;

    if (!ovelser || ovelser.length === 0) {
      return res.status(400).json({ error: 'Ingen øvelser i biblioteket' });
    }

    const GENERER_SYSTEM = `Du er en klinisk rehabiliteringsspesialist med 30 års erfaring. Du setter sammen treningsprogrammer basert på klinisk vurdering og tilgjengelige øvelser.

REGLER:
- Velg KUN øvelser fra listen som er sendt deg – ikke finn på egne
- Match øvelser til akt og klinisk fokus
- Velg riktig formål (purpose) per øvelse basert på klinisk kontekst
- Akt 1: deaktivering/mobilisering + lavterskel aktivering, 2-4 uker
- Akt 2: aktivering med progresjon, stabilitet, 3-6 uker
- Akt 3: progressiv styrke og utholdenhet, 4-8 uker
- Antall øvelser: Akt 1: 3-5, Akt 2: 4-6, Akt 3: 5-7
- Sett: Akt 1: 2-3, Akt 2: 3-4, Akt 3: 3-5
- Reps: tilpass til tracking-type og akt
- Treningsdager: 2-4 per uke avhengig av akt
- Bruk norsk bokmål

PERSONLIG KONTEKST PER ØVELSE:
For hver øvelse skal du skrive en kort personlig kontekst (1-3 setninger) som forklarer:
1. Hvorfor akkurat denne øvelsen er valgt for denne brukeren – koble til kartleggingsfunnene
2. Hvilket kompensasjonsmønster eller svakhet øvelsen adresserer hos denne personen spesifikt
3. Eventuelt hva de bør være obs på gitt det vi vet om dem – ikke generelle utførelsesinstruksjoner
Konteksten handler om HVORFOR og KLINISK RELEVANS – ikke om HVORDAN øvelsen gjøres (det er instruksjonens jobb).
Feil eksempel: "Fokuser på å holde korsryggen nøytral og senk deg sakte ned."
Riktig eksempel: "Valgt fordi kartleggingen viste overaktiv iliopsoas og svak gluteus maximus. Denne øvelsen adresserer direkte ubalansen som gir deg korsryggsmerter ved stillesitting."

RESPONSFORMAT – kun gyldig JSON, ingen forklaringer:
{
  "tittel": "kort beskrivende tittel maks 6 ord",
  "akt": 1,
  "uker": 4,
  "dager": ["Man", "Ons", "Fre"],
  "ovelser": [
    {
      "exerciseId": "id fra biblioteket",
      "navn": "navn fra biblioteket",
      "purposeId": "id fra øvelsens purposes",
      "formaalLabel": "label fra purpose",
      "instruksjon": "instruksjon fra purpose",
      "personligKontekst": "1-3 setninger tilpasset denne brukerens spesifikke funn og kompensasjonsmønstre",
      "tracking_types": ["fra purpose"],
      "tracking_type": "første tracking type",
      "sets": 3,
      "reps": 10,
      "hold": null,
      "tempo": null
    }
  ]
}`;

    const ovelserKompakt = ovelser.map((o) => ({
      id: o.id,
      name: o.name,
      bodyParts: o.bodyParts || [],
      act: o.act || [],
      purposes: (o.purposes || []).map((p) => ({
        id: p.id,
        label: p.label,
        instruction: p.instruction,
        tracking_types: p.tracking_types || (p.tracking_type ? [p.tracking_type] : ['completed']),
        kliniskNotat: p.kliniskNotat || '',
      })),
    }));

    // Bygg kontekst avhengig av om det er første kartlegging eller reassessment
    let prompt;
    if (reassessment) {
      const kandidater = (forrigeAssessment?.kandidater || []).map((k) => `${k.label}: ${k.reasoning || ''}`).join('\n');
      const funn = (forrigeAssessment?.funn || forrigeAssessment?.findings || []).map((f) => f.body || '').filter(Boolean).join('\n');
      prompt = `FORRIGE KARTLEGGING:
Tittel: ${forrigeAssessment?.tittel || '–'}
Vurdering: ${kandidater || '–'}
Kliniske funn: ${funn || '–'}
Mål: ${forrigeAssessment?.triage?.goal || '–'}
Bekreftende funn: ${forrigeAssessment?.bekreftende?.body || '–'}

STATUSSJEKK KONKLUSJON:
Konklusjon: ${reassessment.konklusjon || '–'}
Akt: ${reassessment.akt || 1}
Begrunnelse: ${reassessment.begrunnelse || '–'}
Neste steg: ${reassessment.neste_steg || '–'}
Fokus neste program: ${reassessment.program_hint?.fokus || '–'}
Prioriter: ${(reassessment.program_hint?.prioriter || []).join(', ')}
Unngå: ${(reassessment.program_hint?.unngå || []).join(', ')}`;
    } else {
      const funn = fraAssessment?.findings || fraAssessment?.funn || [];
      const kandidater = (fraAssessment?.kandidater || fraAssessment?.candidates || []).map((k) => `${k.label || ''}: ${k.reasoning || ''}`).filter(Boolean).join('\n');
      prompt = `KARTLEGGING:
Tittel: ${fraAssessment?.tittel || fraAssessment?.title || '–'}
Primær vurdering: ${kandidater || '–'}
Kliniske funn: ${funn.map((f) => f.body || '').filter(Boolean).join('\n') || '–'}
Livsstil/bakgrunn: ${fraAssessment?.livsstil?.body || fraAssessment?.lifestyle?.body || '–'}
Bekreftende funn: ${fraAssessment?.bekreftende?.body || fraAssessment?.confirmatory?.body || '–'}
Mål: ${fraAssessment?.triage?.goal || '–'}
Smertenivå: ${fraAssessment?.triage?.pain_level ?? '–'}/10
Akt: ${fraAssessment?.triage?.start_act || 1}
Neste steg: ${fraAssessment?.triage?.next_step || '–'}`;
    }

    prompt += `\n\nTILGJENGELIGE ØVELSER:\n${JSON.stringify(ovelserKompakt, null, 2)}\n\nSett sammen et program basert på konteksten og øvelsene over.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system: GENERER_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const tekst = response.content?.[0]?.text || '';
    const jsonStart = tekst.indexOf('{');
    const jsonEnd = tekst.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      return res.status(500).json({ error: 'Ugyldig svar fra AI' });
    }
    const program = JSON.parse(tekst.substring(jsonStart, jsonEnd + 1));
    res.json(program);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── ADMIN: Brukerliste ──────────────────────────────────────────────────────
app.get('/api/admin/brukere', requireAdmin, async (req, res) => {
  try {
    const db = admin.firestore();
    const usersSnap = await db.collection('users').get();
    const result = [];
    const nå = Date.now();

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;

      let authUser = null;
      try { authUser = await admin.auth().getUser(uid); } catch (e) {}

      const loggerSnap = await db.collection(`users/${uid}/logger`)
        .orderBy('dato', 'desc').limit(20).get();
      const logger = loggerSnap.docs.map(d => d.data());

      // Compliance siste 14 dager
      const fjortenDagerSiden = new Date(nå - 14 * 24 * 60 * 60 * 1000);
      const nylige = logger.filter(l => {
        const dato = l.dato?.toDate ? l.dato.toDate() : new Date(l.dato);
        return dato > fjortenDagerSiden;
      });
      const compliance = nylige.length > 0
        ? Math.round(nylige.filter(l => l.fullfort).length / nylige.length * 100)
        : null;

      const aktivSnap = await db.collection(`users/${uid}/programs`)
        .where('aktiv', '==', true).limit(1).get();
      const aktivtProgram = aktivSnap.docs[0]?.data() || null;

      const sisteLogg = logger[0];
      const sisteAktiv = sisteLogg?.dato
        ? (sisteLogg.dato.toDate ? sisteLogg.dato.toDate() : new Date(sisteLogg.dato))
        : null;
      const sisteSmerte = logger.find(l => l.smerte != null)?.smerte ?? null;

      result.push({
        uid,
        email:         authUser?.email || null,
        displayName:   authUser?.displayName || null,
        sisteAktiv:    sisteAktiv?.toISOString() || null,
        compliance,
        sisteSmerte,
        aktivtProgram: aktivtProgram ? { tittel: aktivtProgram.tittel, akt: aktivtProgram.akt } : null,
        antallLogger:  logger.length,
      });
    }

    result.sort((a, b) => {
      if (!a.sisteAktiv) return 1;
      if (!b.sisteAktiv) return -1;
      return new Date(b.sisteAktiv) - new Date(a.sisteAktiv);
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Brukerdetalj ─────────────────────────────────────────────────────
app.get('/api/admin/bruker/:uid', requireAdmin, async (req, res) => {
  try {
    const db = admin.firestore();
    const { uid } = req.params;

    let authUser = null;
    try { authUser = await admin.auth().getUser(uid); } catch (e) {}

    const loggerSnap = await db.collection(`users/${uid}/logger`)
      .orderBy('dato', 'asc').limit(60).get();
    const logger = loggerSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const assessmentsSnap = await db.collection(`users/${uid}/assessments`)
      .orderBy('dato', 'desc').get();
    const assessments = assessmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const programsSnap = await db.collection(`users/${uid}/programs`)
      .orderBy('opprettet', 'desc').get();
    const programmer = programsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    res.json({
      email: authUser?.email || null,
      displayName: authUser?.displayName || null,
      logger, assessments, programmer,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Statistikk ───────────────────────────────────────────────────────
app.get('/api/admin/statistikk', requireAdmin, async (req, res) => {
  try {
    const db = admin.firestore();
    const usersSnap = await db.collection('users').get();
    const totalBrukere = usersSnap.size;
    const nå = Date.now();
    const enUke = 7 * 24 * 60 * 60 * 1000;
    const tredveDager = 30 * 24 * 60 * 60 * 1000;
    const fjortenDager = 14 * 24 * 60 * 60 * 1000;

    let aktiveUke = 0, aktive30 = 0, inaktive14 = 0;
    let totalLogger = 0, fullfortLogger = 0;
    let c30Logger = 0, c30Fullfort = 0;
    const smerteStart = [], smerteNaa = [];
    const aktFordeling = { 1: 0, 2: 0, 3: 0 };
    let antallReassessments = 0, antallAktProgresjon = 0;
    const ovelseCount = {};

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;

      const loggerSnap = await db.collection(`users/${uid}/logger`)
        .orderBy('dato', 'desc').limit(100).get();
      const logger = loggerSnap.docs.map(d => d.data());

      totalLogger += logger.length;
      fullfortLogger += logger.filter(l => l.fullfort).length;

      if (logger.length > 0) {
        const sisteDate = logger[0].dato?.toDate ? logger[0].dato.toDate() : new Date(logger[0].dato);
        const diff = nå - sisteDate.getTime();
        if (diff < enUke) aktiveUke++;
        if (diff < tredveDager) aktive30++;
        if (diff > fjortenDager) inaktive14++;
      } else {
        inaktive14++;
      }

      const tredveSiden = new Date(nå - tredveDager);
      logger.forEach(l => {
        const dato = l.dato?.toDate ? l.dato.toDate() : new Date(l.dato);
        if (dato > tredveSiden) {
          c30Logger++;
          if (l.fullfort) c30Fullfort++;
        }
        (l.ovelser || []).forEach(o => {
          if (!o.exerciseId) return;
          if (!ovelseCount[o.exerciseId]) ovelseCount[o.exerciseId] = { navn: o.navn, count: 0 };
          ovelseCount[o.exerciseId].count++;
        });
      });

      const sisteSmerte = logger.find(l => l.smerte != null)?.smerte ?? null;
      if (sisteSmerte != null) smerteNaa.push(sisteSmerte);

      const assessmentsSnap = await db.collection(`users/${uid}/assessments`)
        .orderBy('dato', 'asc').get();
      const assessments = assessmentsSnap.docs.map(d => d.data());
      if (assessments.length > 0) {
        const p = assessments[0].triage?.pain_level;
        if (p != null) smerteStart.push(p);
      }
      antallReassessments += assessments.filter(a => a.type === 'reassessment').length;
      if (assessments.some(a => a.type === 'reassessment' &&
        ['neste_akt', 'intensiver'].includes(a.konklusjon))) antallAktProgresjon++;

      const aktivSnap = await db.collection(`users/${uid}/programs`)
        .where('aktiv', '==', true).limit(1).get();
      if (!aktivSnap.empty) {
        const akt = aktivSnap.docs[0].data().akt;
        if (akt && aktFordeling[akt] !== undefined) aktFordeling[akt]++;
      }
    }

    const avg = arr => arr.length > 0
      ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;

    const snittSmerteStart = avg(smerteStart);
    const snittSmerteNaa   = avg(smerteNaa);

    res.json({
      totalBrukere,
      aktiveUke,
      aktive30,
      inaktive14,
      totalLogger,
      snittCompliance:   totalLogger > 0 ? Math.round(fullfortLogger / totalLogger * 100) : 0,
      snittCompliance30: c30Logger > 0 ? Math.round(c30Fullfort / c30Logger * 100) : 0,
      snittSmerteStart,
      snittSmerteNaa,
      snittReduksjon: (snittSmerteStart != null && snittSmerteNaa != null)
        ? Math.round((snittSmerteStart - snittSmerteNaa) * 10) / 10 : null,
      aktFordeling,
      antallReassessments,
      antallAktProgresjon,
      toppOvelser: Object.values(ovelseCount)
        .sort((a, b) => b.count - a.count).slice(0, 10),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Server kjorer pa port 3000'));
