import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput, SafeAreaView
} from 'react-native';
import { doc, getDoc, collection, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { sendMelding } from '../../services/kartlegging';
import { colors } from '../../theme/colors';

type Melding = { rolle: 'ai' | 'bruker'; tekst: string };

const TEST_INSTRUKSJONER: Record<string, string> = {
  lower_cross: 'Legg deg flatt på ryggen. Løft begge føtter 1–2 cm over gulvet og hold i 30 sekunder. Kjenner du at korsryggen brenner eller strammer?',
  upper_cross: 'Strekk armene rett ut til siden i 90° og hold i 30 sekunder. Kjenner du at toppen av skuldrene eller nakken strammer?',
  piriformis: 'Sitt på en stol. Legg ankelen på det vonde benet over det andre kneet og trykk forsiktig ned på kneet. Kjenner du dyp stramning i setet?',
  rotator_cuff: 'Strekk armene rett frem i 90° og hold i 30 sekunder. Kjenner du at toppen av skulderen brenner?',
  si_joint: 'Stå på ett ben – det vonde benet – i 20 sekunder. Synker bekkenet tydelig ned på den andre siden?',
  patellofemoral: 'Stå på ett ben med lett bøyd kne (ca. 30°) og hold i 20 sekunder. Kjenner du at det brenner under eller rundt kneskålen?',
  it_band: 'Stå med lett bøyd kne (ca. 30°) og trykk forsiktig på utsiden av kneet rett over leddspalten. Kjenner du sting eller ømhet akkurat der?',
  achilles: 'Stå på tå på det vonde benet og hold i 10 sekunder. Kjenner du stramning eller smerte bak i ankelen eller hælen?',
  cervikogen: 'Sett haken forsiktig ned mot brystet og roter deretter hodet sakte mot den vonde siden. Utløser bevegelsen hodepinen eller stramning i bakhodet?',
  plantar: 'Ta ditt første skritt om morgenen når du setter foten ned. Kjenner du stikkende smerte under hælen de første skrittene?',
};

// Fix 9: Utleder painTrackingType fra assessment-innhold
function utledPainTrackingType(assessment: any): string {
  const kandidater = (assessment.candidates || [])
    .map((k: any) => (k.title + ' ' + k.reasoning).toLowerCase())
    .join(' ');
  const funn = (assessment.findings || [])
    .map((f: any) => (f.title + ' ' + f.body).toLowerCase())
    .join(' ');
  const tekst = kandidater + ' ' + funn;

  const inflammatoriskeOrd = ['bekhterev', 'revmatoid', 'revmatisme', 'inflammatorisk', 'artritt', 'sakroiliitt'];
  if (inflammatoriskeOrd.some(ord => tekst.includes(ord))) return 'pain_inflammatory';

  const belastningsOrd = ['belastning', 'løping', 'stående', 'gåing', 'trapping', 'vektbærende'];
  if (belastningsOrd.some(ord => tekst.includes(ord))) return 'pain_load';

  const bevegelsesOrd = ['rotasjon', 'fleksjon', 'ekstensjon', 'bevegelse forverrer', 'stivhet'];
  if (bevegelsesOrd.some(ord => tekst.includes(ord))) return 'pain_movement';

  return 'pain_mechanical';
}

const KJONN_VALG = ['Mann', 'Kvinne', 'Annet'];
const ALDER_VALG = ['Under 18', '18–29', '30–39', '40–49', '50–59', '60–69', '70+'];
const AKTIVITET_VALG = ['Lite aktivt (stillesittende)', 'Lett aktiv (gange, lett arbeid)', 'Moderat aktiv (trener 1–2 ganger/uke)', 'Aktiv (trener 3–4 ganger/uke)', 'Meget aktiv (trener 5+ ganger/uke)'];
const TILSTAND_VALG = [
  'Benskjørhet/osteoporose', 'Hypermobilitet', 'Revmatisme/leddgikt',
  'Fibromyalgi', 'Gravid', 'Nylig operert', 'Artrose', 'Migrene',
  'Tidligere prolaps', 'Tidligere whiplash', 'Skoliose', 'Bekhterevs sykdom',
];

type Steg = 'profil' | 'innledning' | 'kartlegging';

export default function KartleggingScreen({ navigation }: any) {
  const [steg, setSteg] = useState<Steg>('profil');

  // Profil-steg
  const [kjonn, setKjonn] = useState('');
  const [alder, setAlder] = useState('');
  const [aktivitet, setAktivitet] = useState('');
  const [tilstander, setTilstander] = useState<string[]>([]);
  const [andreTilstander, setAndreTilstander] = useState('');
  const [lasterProfil, setLasterProfil] = useState(true);

  // Innlednings-steg
  const [innledning, setInnledning] = useState('');

  // Kartleggings-steg
  const [meldinger, setMeldinger] = useState<Melding[]>([]);
  const [sporsmal, setSporsmal] = useState('');
  const [alternativer, setAlternativer] = useState<string[]>([]);
  const [valgte, setValgte] = useState<string[]>([]);
  const [fritekst, setFritekst] = useState('');
  const [visFritekst, setVisFritekst] = useState(false);
  const [laster, setLaster] = useState(false);
  const [ferdig, setFerdig] = useState(false);
  const [assessment, setAssessment] = useState<any>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [tregtNett, setTregtNett] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const tregtNettRef = useRef<any>(null);

  useEffect(() => { hentProfil(); }, []);

  async function hentProfil() {
    const user = auth.currentUser;
    if (!user) { setLasterProfil(false); return; }
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const profil = snap.data()?.helseProfil;
      if (profil) {
        if (profil.biologiskKjonn) setKjonn(profil.biologiskKjonn);
        if (profil.aldersgruppe) setAlder(profil.aldersgruppe);
        if (profil.aktivitetsniva) setAktivitet(profil.aktivitetsniva);
        if (profil.tilstander?.length) setTilstander(profil.tilstander);
        if (profil.andreTilstander) setAndreTilstander(profil.andreTilstander);
      }
    } catch (e) { console.error(e); }
    finally { setLasterProfil(false); }
  }

  async function lagreProfil() {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        helseProfil: { biologiskKjonn: kjonn, aldersgruppe: alder, aktivitetsniva: aktivitet, tilstander, andreTilstander: andreTilstander.trim() },
      });
    } catch (e) { console.error(e); }
  }

  function toggleTilstand(t: string) {
    setTilstander(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  async function startKartlegging() {
    await lagreProfil();
    setSteg('kartlegging');
    setLaster(true);
    tregtNettRef.current = setTimeout(() => setTregtNett(true), 5000);

    const profilDeler: string[] = [];
    if (kjonn) profilDeler.push(`Biologisk kjønn: ${kjonn}`);
    if (alder) profilDeler.push(`Alder: ${alder}`);
    if (aktivitet) profilDeler.push(`Aktivitetsnivå: ${aktivitet}`);
    if (tilstander.length) profilDeler.push(`Kjente tilstander: ${tilstander.join(', ')}`);
    if (andreTilstander.trim()) profilDeler.push(`Andre tilstander: ${andreTilstander.trim()}`);

    const profilTekst = profilDeler.length > 0 ? `\n\nBRUKERPROFIL:\n${profilDeler.join('\n')}` : '';
    const firstMsg = [{
      role: 'user',
      content: `Hei, jeg ønsker en kartlegging.${profilTekst}\n\nBRUKERENS BESKRIVELSE AV PLAGEN:\n${innledning.trim()}`,
    }];

    try {
      const svar = await sendMelding(firstMsg);
      setHistory(firstMsg);
      handleSvar(svar);
    } catch {
      setSporsmal('Kunne ikke koble til serveren. Prøv igjen.');
    } finally {
      clearTimeout(tregtNettRef.current);
      setTregtNett(false);
      setLaster(false);
    }
  }

  async function handleSvar(svar: any) {
    if (svar.done && svar.assessment) {
      setAssessment(svar.assessment);
      await lagreAssessment(svar.assessment);
      setFerdig(true);
      return;
    }
    if (svar.test && svar.test_id) {
      const instruksjon = TEST_INSTRUKSJONER[svar.test_id] || 'Følg instruksjonen og kjenn etter.';
      setSporsmal(instruksjon);
      setAlternativer(['Ja, tydelig', 'Litt, usikkert', 'Nei, kjenner ingenting']);
      setVisFritekst(false);
      return;
    }
    const opts: string[] = svar.options || [];
    setSporsmal(svar.question || '');
    setAlternativer(opts);
    setValgte([]);
    setFritekst('');
    setVisFritekst(opts.length === 0);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function sendSvar() {
    let svarTekst = '';
    if (valgte.length > 0 && fritekst.trim()) {
      svarTekst = `${valgte.join(', ')} – ${fritekst.trim()}`;
    } else if (valgte.length > 0) {
      svarTekst = valgte.join(', ');
    } else {
      svarTekst = fritekst.trim();
    }
    if (!svarTekst) return;

    const nyeMeldinger: Melding[] = [
      ...meldinger,
      { rolle: 'ai', tekst: sporsmal },
      { rolle: 'bruker', tekst: svarTekst },
    ];
    setMeldinger(nyeMeldinger);
    setLaster(true);

    const nyHistory = [
      ...history,
      { role: 'assistant', content: JSON.stringify({ question: sporsmal, options: alternativer }) },
      { role: 'user', content: svarTekst },
    ];
    setHistory(nyHistory);

    try {
      const svar = await sendMelding(nyHistory);
      handleSvar(svar);
    } catch {
      setSporsmal('Noe gikk galt. Prøv igjen.');
    } finally {
      setLaster(false);
    }
  }

  async function lagreAssessment(a: any) {
    const user = auth.currentUser;
    if (!user) return;
    try {
      // Fix 9: painTrackingType utledes fra assessment-innholdet
      const painTrackingType = utledPainTrackingType(a);

      const ref = await addDoc(collection(db, 'users', user.uid, 'assessments'), {
        dato: serverTimestamp(),
        tittel: a.title,
        confidence: a.confidence,
        triage: a.triage,
        kandidater: a.candidates,
        funn: a.findings,
        livsstil: a.lifestyle,
        bekreftende: a.confirmatory,
        oppsummering: a.summary,
        painTrackingType,
      });
      // Fix 4: Lagrer ID for viderebruk
      setAssessmentId(ref.id);
      await updateDoc(doc(db, 'users', user.uid), { sisteKartleggingId: ref.id });
    } catch (e) {
      console.error('Feil ved lagring:', e);
    }
  }

  function toggleValg(alt: string) {
    if (alt === 'Annet – beskriv selv') {
      setVisFritekst(true);
      return;
    }
    setValgte(prev => prev.includes(alt) ? prev.filter(v => v !== alt) : [...prev, alt]);
  }

  const kanSende = valgte.length > 0 || fritekst.trim().length > 0;

  // ── PROFIL-STEG ───────────────────────────────────────────────
  if (steg === 'profil') {
    if (lasterProfil) return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      </SafeAreaView>
    );
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.avbrytTekst}>Avbryt</Text>
          </TouchableOpacity>
          <Text style={s.topbarTittel}>Din profil</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.stegBar}>
          <View style={[s.stegFill, { width: '33%' }]} />
        </View>
        <ScrollView contentContainerStyle={s.profilInner}>
          <Text style={s.profilIngress}>
            Disse opplysningene hjelper AI å tilpasse kartleggingen til deg. Kan endres når som helst under Profil.
          </Text>

          <View style={s.profilFelt}>
            <Text style={s.feltLabel}>BIOLOGISK KJØNN</Text>
            <View style={s.chipRad}>
              {KJONN_VALG.map(v => (
                <TouchableOpacity key={v} style={[s.chip, kjonn === v && s.chipAktiv]} onPress={() => setKjonn(v)}>
                  <Text style={[s.chipTekst, kjonn === v && s.chipTekstAktiv]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.profilFelt}>
            <Text style={s.feltLabel}>ALDERSGRUPPE</Text>
            <View style={s.chipRad}>
              {ALDER_VALG.map(v => (
                <TouchableOpacity key={v} style={[s.chip, alder === v && s.chipAktiv]} onPress={() => setAlder(v)}>
                  <Text style={[s.chipTekst, alder === v && s.chipTekstAktiv]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.profilFelt}>
            <Text style={s.feltLabel}>AKTIVITETSNIVÅ</Text>
            <View style={s.aktivitetListe}>
              {AKTIVITET_VALG.map(v => (
                <TouchableOpacity key={v} style={[s.aktivitetRad, aktivitet === v && s.aktivitetRadAktiv]} onPress={() => setAktivitet(v)}>
                  <View style={[s.aktivitetDot, aktivitet === v && s.aktivitetDotAktiv]} />
                  <Text style={[s.aktivitetTekst, aktivitet === v && s.aktivitetTekstAktiv]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.profilFelt}>
            <Text style={s.feltLabel}>KJENTE TILSTANDER</Text>
            <Text style={s.feltSub}>Velg alle som er relevant</Text>
            <View style={s.chipRad}>
              {TILSTAND_VALG.map(t => (
                <TouchableOpacity key={t} style={[s.chip, tilstander.includes(t) && s.chipAktiv]} onPress={() => toggleTilstand(t)}>
                  <Text style={[s.chipTekst, tilstander.includes(t) && s.chipTekstAktiv]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={s.fritekstInput}
              value={andreTilstander}
              onChangeText={setAndreTilstander}
              placeholder="Andre tilstander eller diagnoser…"
              placeholderTextColor={colors.muted2}
              multiline
            />
          </View>

          <TouchableOpacity
            style={s.nesteKnapp}
            onPress={() => setSteg('innledning')}
          >
            <Text style={s.nesteKnappTekst}>Neste →</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── INNLEDNINGS-STEG ──────────────────────────────────────────
  if (steg === 'innledning') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => setSteg('profil')}>
            <Text style={s.avbrytTekst}>← Tilbake</Text>
          </TouchableOpacity>
          <Text style={s.topbarTittel}>Beskriv plagen</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.stegBar}>
          <View style={[s.stegFill, { width: '66%' }]} />
        </View>
        <ScrollView contentContainerStyle={s.profilInner}>
          <Text style={s.profilIngress}>
            Beskriv plagen din med egne ord. Hvor er det vondt, når startet det, og hva gjør det bedre eller verre?
          </Text>
          <TextInput
            style={s.innledningInput}
            value={innledning}
            onChangeText={setInnledning}
            placeholder="F.eks: Har hatt vondt i korsryggen i 3 uker, spesielt om morgenen og når jeg sitter lenge…"
            placeholderTextColor={colors.muted2}
            multiline
            autoFocus
          />
          <TouchableOpacity
            style={[s.nesteKnapp, innledning.trim().length < 10 && s.nesteKnappDisabled]}
            disabled={innledning.trim().length < 10}
            onPress={startKartlegging}
          >
            <Text style={s.nesteKnappTekst}>Start kartlegging →</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (ferdig && assessment) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topbar}>
          <View style={{ width: 50 }} />
          <Text style={s.topbarTittel}>Kartleggingsresultat</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView contentContainerStyle={s.konklusjonInner}>

          <View style={s.konklusjonHeader}>
            <Text style={s.konklusjonTittel}>{assessment.title}</Text>
            <View style={s.confRow}>
              <View style={s.confBar}>
                <View style={[s.confFill, { width: `${assessment.confidence}%` as any }]} />
              </View>
              <Text style={s.confTekst}>{assessment.confidence}%</Text>
            </View>
          </View>

          {assessment.candidates?.length > 0 && (
            <View style={s.seksjon}>
              <Text style={s.seksjonTittel}>VURDERING</Text>
              {assessment.candidates.map((k: any) => (
                <View key={k.rank} style={[s.kort, k.rank === 1 && s.kortPrimar]}>
                  <Text style={s.kortLabel}>{k.label}</Text>
                  <Text style={s.kortTittel}>{k.title}</Text>
                  <Text style={s.kortBody}>{k.reasoning}</Text>
                </View>
              ))}
            </View>
          )}

          {assessment.findings?.length > 0 && (
            <View style={s.seksjon}>
              <Text style={s.seksjonTittel}>VIKTIGE FUNN</Text>
              {assessment.findings.map((f: any, i: number) => (
                <View key={i} style={s.kort}>
                  {f.tag ? <Text style={s.kortTag}>{f.tag}</Text> : null}
                  <Text style={s.kortTittel}>{f.title}</Text>
                  <Text style={s.kortBody}>{f.body}</Text>
                </View>
              ))}
            </View>
          )}

          {assessment.lifestyle?.body ? (
            <View style={s.seksjon}>
              <Text style={s.seksjonTittel}>BAKGRUNN</Text>
              <View style={s.kort}>
                <Text style={s.kortTittel}>{assessment.lifestyle.title}</Text>
                <Text style={s.kortBody}>{assessment.lifestyle.body}</Text>
              </View>
            </View>
          ) : null}

          {assessment.confirmatory?.body ? (
            <View style={s.seksjon}>
              <Text style={s.seksjonTittel}>DET DU SANNSYNLIGVIS KJENNER IGJEN</Text>
              <View style={s.kort}>
                <Text style={s.kortBody}>{assessment.confirmatory.body}</Text>
              </View>
            </View>
          ) : null}

          {assessment.summary ? (
            <View style={s.seksjon}>
              <Text style={s.seksjonTittel}>OPPSUMMERING</Text>
              <View style={s.kort}>
                <Text style={s.kortBody}>{assessment.summary}</Text>
              </View>
            </View>
          ) : null}

          {assessment.triage && (
            <View style={s.seksjon}>
              <Text style={s.seksjonTittel}>ANBEFALING</Text>
              <View style={s.triageKort}>
                <View style={s.triageRad}>
                  <Text style={s.triageEtikett}>Startpunkt</Text>
                  <Text style={s.triageVerdi}>Akt {assessment.triage.start_act}</Text>
                </View>
                <View style={s.triageRad}>
                  <Text style={s.triageEtikett}>Smertenivå</Text>
                  <Text style={s.triageVerdi}>{assessment.triage.pain_level}/10</Text>
                </View>
                <View style={s.triageDivider} />
                <Text style={s.kortBody}>{assessment.triage.rationale}</Text>
                {assessment.triage.next_step ? (
                  <View style={s.nextStep}>
                    <Text style={s.nextStepLabel}>Neste steg</Text>
                    <Text style={s.nextStepTekst}>{assessment.triage.next_step}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {/* Fix 4: Opprett program-knapp med assessment som kontekst */}
          <View style={s.knappeRad}>
            <TouchableOpacity
              style={s.btnPrimary}
              onPress={() => navigation.navigate('ProgramBuilder', {
                fraAssessment: {
                  id: assessmentId,
                  tittel: assessment.title,
                  confidence: assessment.confidence,
                  triage: assessment.triage,
                }
              })}
            >
              <Text style={s.btnPrimaryText}>Opprett program</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnSekundar} onPress={() => navigation.navigate('MainTabs')}>
              <Text style={s.btnSekundarText}>Gå til hjem</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.avbryt}>Avbryt</Text>
        </TouchableOpacity>
        <Text style={s.topbarTittel}>Kartlegging</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView ref={scrollRef} style={s.chat} contentContainerStyle={s.chatInner}>
        {meldinger.map((m, i) => (
          <View key={i} style={[s.boble, m.rolle === 'bruker' ? s.bobleBruker : s.bobleAI]}>
            <Text style={[s.bobleTekst, m.rolle === 'bruker' ? s.bobleTekstBruker : s.bobleTekstAI]}>
              {m.tekst}
            </Text>
          </View>
        ))}
        {laster && (
          <View style={s.lasterWrapper}>
            <ActivityIndicator color={colors.muted} size="small" />
            {tregtNett && (
              <Text style={s.tregtNettTekst}>Starter opp serveren, dette tar litt tid første gang...</Text>
            )}
          </View>
        )}
      </ScrollView>

      {!laster && sporsmal ? (
        <View style={s.inputArea}>
          <Text style={s.sporsmal}>{sporsmal}</Text>

          {alternativer.length > 0 && (
            <View style={s.alternativer}>
              {alternativer.map((alt, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.altKnapp, valgte.includes(alt) && s.altKnappValgt]}
                  onPress={() => toggleValg(alt)}
                >
                  <View style={[s.altDot, valgte.includes(alt) && s.altDotValgt]} />
                  <Text style={[s.altTekst, valgte.includes(alt) && s.altTekstValgt]}>{alt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {visFritekst && (
            <TextInput
              style={s.fritekstInput}
              value={fritekst}
              onChangeText={setFritekst}
              placeholder="Skriv her..."
              placeholderTextColor={colors.muted2}
              multiline
              autoFocus={alternativer.length === 0}
            />
          )}

          <TouchableOpacity
            style={[s.sendKnapp, !kanSende && s.sendKnappDisabled]}
            onPress={sendSvar}
            disabled={!kanSende}
          >
            <Text style={s.sendTekst}>Bekreft svar</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  topbarTittel: { fontSize: 15, fontWeight: '500', color: colors.text },
  avbryt: { fontSize: 13, color: colors.muted, width: 50 },
  avbrytTekst: { fontSize: 13, color: colors.muted, width: 70 },

  // Steg-bar
  stegBar: { height: 2, backgroundColor: colors.border },
  stegFill: { height: '100%', backgroundColor: colors.green },

  // Profil og innledning
  profilInner: { padding: 20, paddingBottom: 60, gap: 20 },
  profilIngress: { fontSize: 14, color: colors.muted, fontWeight: '300', lineHeight: 22 },
  profilFelt: { gap: 10 },
  feltLabel: { fontSize: 11, color: colors.muted, fontWeight: '500', letterSpacing: 1.0 },
  feltSub: { fontSize: 12, color: colors.muted2, fontWeight: '300', marginTop: -6 },
  chipRad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface },
  chipAktiv: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  chipTekst: { fontSize: 13, color: colors.muted, fontWeight: '300' },
  chipTekstAktiv: { color: colors.green, fontWeight: '500' },
  aktivitetListe: { gap: 8 },
  aktivitetRad: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  aktivitetRadAktiv: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  aktivitetDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.border2 },
  aktivitetDotAktiv: { backgroundColor: colors.green, borderColor: colors.green },
  aktivitetTekst: { fontSize: 13, color: colors.muted, fontWeight: '300', flex: 1 },
  aktivitetTekstAktiv: { color: colors.text, fontWeight: '400' },
  innledningInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 12, padding: 14, fontSize: 15, color: colors.text, minHeight: 160, textAlignVertical: 'top', lineHeight: 24 },
  nesteKnapp: { backgroundColor: colors.accent, borderRadius: 10, padding: 15, alignItems: 'center' },
  nesteKnappDisabled: { opacity: 0.35 },
  nesteKnappTekst: { color: colors.bg, fontSize: 15, fontWeight: '600' },
  chat: { flex: 1 },
  chatInner: { padding: 16, gap: 10 },
  boble: { maxWidth: '80%', borderRadius: 12, padding: 12 },
  bobleAI: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start', borderBottomLeftRadius: 3 },
  bobleBruker: { backgroundColor: colors.surface2, alignSelf: 'flex-end', borderBottomRightRadius: 3 },
  bobleTekst: { fontSize: 14, lineHeight: 21, fontWeight: '300' },
  bobleTekstAI: { color: colors.text },
  bobleTekstBruker: { color: colors.text },
  lasterWrapper: { alignSelf: 'flex-start', padding: 12, gap: 8 },
  tregtNettTekst: { fontSize: 13, color: colors.muted2, fontWeight: '300', lineHeight: 19, maxWidth: 260 },
  inputArea: { borderTopWidth: 1, borderTopColor: colors.border, padding: 16, gap: 10, backgroundColor: colors.bg },
  sporsmal: { fontSize: 15, color: colors.text, fontWeight: '400', lineHeight: 22 },
  alternativer: { gap: 6 },
  altKnapp: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  altKnappValgt: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  altDot: { width: 8, height: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border2 },
  altDotValgt: { backgroundColor: colors.green, borderColor: colors.green },
  altTekst: { fontSize: 14, color: colors.text, fontWeight: '300', flex: 1 },
  altTekstValgt: { color: colors.green },
  fritekstInput: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 12, fontSize: 14, color: colors.text, minHeight: 80 },
  sendKnapp: { backgroundColor: colors.accent, borderRadius: 8, padding: 13, alignItems: 'center' },
  sendKnappDisabled: { opacity: 0.35 },
  sendTekst: { color: colors.bg, fontSize: 15, fontWeight: '500' },

  // Konklusjon
  konklusjonInner: { padding: 20, paddingBottom: 40, gap: 20 },
  konklusjonHeader: { gap: 10 },
  konklusjonTittel: { fontSize: 22, fontWeight: '300', color: colors.text, lineHeight: 30 },
  confRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confBar: { flex: 1, height: 3, backgroundColor: colors.border2, borderRadius: 2, overflow: 'hidden' },
  confFill: { height: '100%', backgroundColor: colors.green, borderRadius: 2 },
  confTekst: { fontSize: 13, color: colors.green, fontWeight: '500' },
  seksjon: { gap: 8 },
  seksjonTittel: { fontSize: 10, color: colors.muted, fontWeight: '500', letterSpacing: 0.8 },
  kort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 6 },
  kortPrimar: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  kortLabel: { fontSize: 11, color: colors.green, fontWeight: '500', letterSpacing: 0.6, textTransform: 'uppercase' },
  kortTag: { fontSize: 11, color: colors.muted, fontWeight: '500', letterSpacing: 0.6 },
  kortTittel: { fontSize: 15, color: colors.text, fontWeight: '400', lineHeight: 22 },
  kortBody: { fontSize: 13, color: colors.muted, fontWeight: '300', lineHeight: 20 },
  triageKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 10 },
  triageRad: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  triageEtikett: { fontSize: 13, color: colors.muted, fontWeight: '300' },
  triageVerdi: { fontSize: 15, color: colors.text, fontWeight: '500' },
  triageDivider: { height: 1, backgroundColor: colors.border },
  nextStep: { backgroundColor: colors.surface2, borderRadius: 8, padding: 12, gap: 4 },
  nextStepLabel: { fontSize: 11, color: colors.green, fontWeight: '500', letterSpacing: 0.6 },
  nextStepTekst: { fontSize: 13, color: colors.text, fontWeight: '300', lineHeight: 20 },

  // Fix 4: Knappepar nederst på resultatsiden
  knappeRad: { gap: 10, marginTop: 8 },
  btnPrimary: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: 'center' },
  btnPrimaryText: { color: colors.bg, fontSize: 15, fontWeight: '500' },
  btnSekundar: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 14, alignItems: 'center' },
  btnSekundarText: { color: colors.muted, fontSize: 14, fontWeight: '400' },
});
