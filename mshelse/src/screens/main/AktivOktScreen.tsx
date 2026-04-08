import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, TextInput, Image, Modal, ActivityIndicator
} from 'react-native';
import { collection, addDoc, doc, updateDoc, increment, serverTimestamp, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import VideoSpiller from '../../components/VideoSpiller';
import AnatomyViewer from '../../components/AnatomyViewer';
import { colors } from '../../theme/colors';
import { vurderProgresjon } from '../../services/progresjon';

const TRACKING_LABEL: Record<string, string> = {
  activation_quality: 'Kontaktkvalitet (0–10)',
  contact_reps:       'Reps med god kontakt',
  sets_reps:          'Antall reps',
  sets_reps_weight:   'Reps',
  mobility:           'Bevegelsesfølelse (0–10)',
  rpe:                'Anstrengelse (0–10)',
  side_diff:          'Sideforskjell (0–10)',
  completed:          'Fullført',
};

const TRACKING_INFO: Record<string, { tittel: string; tekst: string; eksempel?: string }> = {
  activation_quality: {
    tittel: 'Kontaktkvalitet',
    tekst: 'Hvor godt klarer du å aktivere riktig muskel uten at andre tar over? Fokuser helt på den muskelen øvelsen gjelder – klem den så hardt du kan uten å bruke resten av kroppen.',
    eksempel: 'Eksempel: 3 = du kjenner litt, men nabomuskler hjelper mye. 8 = tydelig isolert kontakt gjennom hele settet.',
  },
  contact_reps: {
    tittel: 'Reps med god kontakt',
    tekst: 'Tell kun repetisjonene der du kjenner at riktig muskel jobber. Stopp telleren – eller avslutt settet – i det du merker at en annen muskel begynner å ta over.',
    eksempel: 'Eksempel: 12 reps totalt, men du mister kontakten på rep 9 → logg 8.',
  },
  rpe: {
    tittel: 'Anstrengelse (RPE)',
    tekst: 'Hvor hardt kjennes belastningen totalt etter settet? Ikke bare muskeltretthet – ta med pust, generell innsats og om du hadde mer å gi.',
    eksempel: '1–3 = lett. 4–6 = moderat, du jobber men kan snakke. 7–8 = hardt. 9–10 = nær maks.',
  },
  rpe_rir: {
    tittel: 'Reps i reserve (RIR)',
    tekst: 'Hvor mange reps hadde du igjen etter settet? Tenk: «Hvis jeg måtte, hadde jeg klart X reps til». 0 = absolutt ingenting igjen. 3 = god margin (progresjon-terskel).',
    eksempel: '0 = RPE 10. 1 = RPE 9. 2 = RPE 8. 3 = RPE 7 (progresjon). 4 = lett.',
  },
  mobility: {
    tittel: 'Bevegelsesfølelse',
    tekst: 'Hvordan oppleves bevegelsen? Fokuser på kvalitet – er den fri og smertefri, eller stiv og begrenset? Ikke vurder styrke, kun bevegelighet og komfort.',
    eksempel: '1–3 = stiv/ubehagelig. 5–6 = noe friksjon men ok. 8–10 = fri, smertefri og lett.',
  },
  sets_reps: {
    tittel: 'Antall reps',
    tekst: 'Tell alle repetisjonene du fullfører i settet, uavhengig av kvalitet. Enkelt og greit.',
  },
  sets_reps_weight: {
    tittel: 'Reps',
    tekst: 'Antall repetisjonene du fullfører med valgt motstand eller vekt.',
  },
  side_diff: {
    tittel: 'Sideforskjell',
    tekst: 'Hvor stor er forskjellen mellom høyre og venstre side? 0 = ingen forskjell, 10 = stor og tydelig forskjell. Målet over tid er å få denne ned mot null.',
    eksempel: 'Eksempel: venstre side føles halvparten så sterk → logg 5.',
  },
  completed: {
    tittel: 'Fullført sett',
    tekst: 'Marker settet som gjennomført. Brukes på øvelser der selve gjennomføringen er det viktigste – ingen tall å telle.',
  },
};

const GRC_VALG = [
  { verdi: 3,  tekst: 'Mye bedre' },
  { verdi: 2,  tekst: 'Ganske bedre' },
  { verdi: 1,  tekst: 'Litt bedre' },
  { verdi: 0,  tekst: 'Uendret' },
  { verdi: -1, tekst: 'Litt verre' },
  { verdi: -2, tekst: 'Ganske verre' },
  { verdi: -3, tekst: 'Mye verre' },
];

export default function AktivOktScreen({ navigation, route }: any) {
  const program = route?.params?.program;
  const assessment = route?.params?.assessment || null;
  const ovelser = program?.ovelser || [];
  const fullfort = program?.okterFullfort || 0;
  const totalt = program?.okterTotalt || 0;
  const erFørsteOkt = fullfort === 0;
  const erSisteOkt = fullfort + 1 >= totalt;
  // Midtveis: mellom 45–55% av totalt, ikke allerede gjort
  const erMidtveis = !program?.midtveisGjort &&
    totalt >= 4 &&
    fullfort + 1 >= Math.floor(totalt * 0.45) &&
    fullfort + 1 <= Math.ceil(totalt * 0.55);
  const harBaselineSporsmal = (program?.baselineSporsmal || []).length > 0;

  const [ovelseIndex, setOvelseIndex] = useState(0);
  const [settIndex, setSettIndex] = useState(0);
  const [loggede, setLoggede] = useState<any[]>([]);
  const [settLogg, setSettLogg] = useState<any[]>([]);
  const [smerte, setSmerte] = useState(5);
  const [notat, setNotat] = useState('');
  const [ferdig, setFerdig] = useState(false);
  const [visSjekkInn, setVisSjekkInn] = useState(false);
  const [visMidtveis, setVisMidtveis] = useState(false);
  const [visBaseline, setVisBaseline] = useState(erFørsteOkt && harBaselineSporsmal);
  const [lagrer, setLagrer] = useState(false);
  const [hvileTimer, setHvileTimer] = useState<number | null>(null);
  const [hvilerNå, setHvilerNå] = useState(false);
  const [repVerdier, setRepVerdier] = useState<Record<string, number>>({});
  const [visDetaljer, setVisDetaljer] = useState(false);
  const [ovelseData, setOvelseData] = useState<Record<string, any>>({});
  const [grc, setGrc] = useState<number | null>(null);
  const [sjekkInnSvar, setSjekkInnSvar] = useState<Record<string, string>>({});
  const [midtveisSvar, setMidtveisSvar] = useState<Record<string, string>>({});
  const [baselineSvar, setBaselineSvar] = useState<Record<string, string>>({});
  const [visTempoInfo, setVisTempoInfo] = useState(false);
  const [visAvsluttModal, setVisAvsluttModal] = useState(false);
  const [klarForProgresjon, setKlarForProgresjon] = useState(false);
  const [tidligereLogger, setTidligereLogger] = useState<any[]>([]);
  const [visInfoModal, setVisInfoModal] = useState<string | null>(null); // tracking type key
  const [visChatModal, setVisChatModal] = useState(false);
  const [chatSporsmal, setChatSporsmal] = useState('');
  const [chatSvar, setChatSvar] = useState<string | null>(null);
  const [chatLaster, setChatLaster] = useState(false);
  const [chatVenter, setChatVenter] = useState(false);

  const gjeldende = ovelser[ovelseIndex];
  const antallSett = gjeldende?.sets || 3;
  const gjeldendeData = ovelseData[gjeldende?.exerciseId] || null;
  const trackingTypes: string[] =
    gjeldendeData?.tracking_types ||
    (gjeldendeData?.tracking_type ? [gjeldendeData.tracking_type] : null) ||
    gjeldende?.tracking_types ||
    (gjeldende?.tracking_type ? [gjeldende.tracking_type] : ['completed']);

  useEffect(() => { hentOvelseData(); hentTidligereLogger(); }, []);
  useEffect(() => { setVisDetaljer(false); setRepVerdier({}); }, [ovelseIndex]);
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function hentOvelseData() {
    const ids = [...new Set(ovelser.map((o: any) => o.exerciseId).filter(Boolean))];
    if (ids.length === 0) return;
    try {
      const snap = await getDocs(collection(db, 'exercises'));
      const map: Record<string, any> = {};
      snap.docs.forEach(d => {
        if (ids.includes(d.id)) map[d.id] = { id: d.id, ...d.data() };
      });
      setOvelseData(map);
    } catch (e) { console.error(e); }
  }

  async function hentTidligereLogger() {
    const user = auth.currentUser;
    if (!user || !program?.id) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'users', user.uid, 'logger'), orderBy('dato', 'desc'), limit(10))
      );
      const logger = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((l: any) => l.programId === program.id && l.fullfort);
      setTidligereLogger(logger);
    } catch (e) { console.error(e); }
  }

  function standardHvile(types: string[]): number {
    if (types.includes('sets_reps_weight')) return 90;
    if (types.includes('sets_reps')) return 60;
    if (types.includes('rpe')) return 45;
    if (types.includes('contact_reps') || types.includes('side_diff')) return 30;
    // activation_quality, mobility, completed → kort
    return 15;
  }

  function startHvile(sek: number) {
    if (timerRef.current) clearInterval(timerRef.current);
    setHvileTimer(sek);
    setHvilerNå(true);
    timerRef.current = setInterval(() => {
      setHvileTimer(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setHvilerNå(false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stoppHvile() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setHvilerNå(false);
    setHvileTimer(null);
  }

  function avansert(gjeldendeSett: any[]) {
    const hvile = gjeldende?.hvile || gjeldendeData?.hvile || standardHvile(trackingTypes);
    if (settIndex + 1 < antallSett) {
      setSettIndex(settIndex + 1);
      startHvile(hvile);
    } else {
      const ovelseLogg = {
        exerciseId: gjeldende?.exerciseId || `ovelse_${ovelseIndex}`,
        navn: gjeldende?.navn || `Øvelse ${ovelseIndex + 1}`,
        tracking_types: trackingTypes,
        formaalLabel: gjeldende?.formaalLabel || '',
        sett: gjeldendeSett,
      };
      const nyeLoggede = [...loggede, ovelseLogg];
      setLoggede(nyeLoggede);
      setSettLogg([]);
      setSettIndex(0);
      setRepVerdier({});
      if (ovelseIndex + 1 < ovelser.length) {
        setOvelseIndex(ovelseIndex + 1);
        const nesteOvelse = ovelser[ovelseIndex + 1];
        const nesteTypes: string[] = nesteOvelse?.tracking_types ||
          (nesteOvelse?.tracking_type ? [nesteOvelse.tracking_type] : ['completed']);
        startHvile(Math.max(hvile, standardHvile(nesteTypes)));
      } else {
        setFerdig(true);
      }
    }
  }

  function loggSett() {
    const verdier: Record<string, number> = {};
    trackingTypes.forEach(t => {
      if (t !== 'completed') {
        const erRIRType = t === 'rpe' && trackingTypes.includes('sets_reps_weight');
        verdier[t] = erRIRType ? 10 - (repVerdier[t] || 0) : (repVerdier[t] || 0);
      }
    });
    const nyttSett = {
      sett: settIndex + 1,
      tracking_types: trackingTypes,
      verdier: trackingTypes.includes('completed') ? {} : verdier,
      hoppetOver: false,
    };
    const oppdatert = [...settLogg, nyttSett];
    setSettLogg(oppdatert);
    setRepVerdier({});
    avansert(oppdatert);
  }

  function hoppOverSett() {
    setRepVerdier({});
    avansert(settLogg);
  }

  async function lagreOkt(sjekkInnData?: any, fraSkjerm: 'ferdig' | 'midtveis' | 'sjekkin' = 'ferdig') {
    const user = auth.currentUser;
    if (!user) return;
    setLagrer(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'logger'), {
        dato: serverTimestamp(),
        programId: program?.id || null,
        programTittel: program?.tittel || 'Økt',
        fullfort: true,
        skippetArsak: null,
        smerte,
        notat: notat.trim(),
        ovelser: loggede,
        ...(sjekkInnData ? { sjekkInn: sjekkInnData } : {}),
      });
      if (program?.id) {
        const nyFullfort = (program.okterFullfort || 0) + 1;
        await updateDoc(doc(db, 'users', user.uid, 'programs', program.id), {
          okterFullfort: increment(1),
          ...(nyFullfort >= (program.okterTotalt || 0) ? { aktiv: false } : {}),
        });

        // Sjekk progresjon med nåværende økt inkludert
        const oppdatertProgram = { ...program, okterFullfort: nyFullfort };
        const alleLogger = [
          { programId: program.id, fullfort: true, smerte, ovelser: loggede },
          ...tidligereLogger,
        ];
        const vurdering = vurderProgresjon(oppdatertProgram, alleLogger);
        if (vurdering.klar || vurdering.tidligProgresjon) {
          if (fraSkjerm === 'ferdig') {
            setKlarForProgresjon(true);
            return;
          } else {
            navigation.navigate('Reassessment', { program, forrigeAssessment: assessment });
            return;
          }
        }
      }
      navigation.navigate('MainTabs');
    } catch (e) {
      console.error(e);
    } finally {
      setLagrer(false);
    }
  }

  async function spørOmØvelse() {
    if (!chatSporsmal.trim() || chatLaster) return;
    setChatLaster(true);
    setChatSvar(null);
    setChatVenter(false);
    const venterTimer = setTimeout(() => setChatVenter(true), 5000);
    try {
      const system = [
        `Du er Quang Hua, manuellterapeut med 11 års klinisk erfaring. En pasient gjør øvelsen "${gjeldende?.navn}" og har stilt deg et spørsmål.`,
        gjeldendeData?.kliniskNotat
          ? `\nKlinisk bakgrunnsinformasjon om øvelsen (bruk dette til å resonnere – ikke siter det direkte):\n${gjeldendeData.kliniskNotat}`
          : '',
        `\nØvelsens instruksjon: ${gjeldende?.instruksjon || ''}`,
        gjeldende?.personligKontekst
          ? `\nKlinisk kontekst for denne pasienten: ${gjeldende.personligKontekst}`
          : '',
        `\nProgram-akt: ${program?.akt || 1}`,
        `\nSvar direkte og presist på norsk. Bruk klinisk kunnskap men skriv som om du snakker med en pasient – ikke akademisk, ikke overforenklet. Ingen unødvendige forbehold.`,
      ].join('');
      const res = await fetch('https://mshelse-server.onrender.com/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system,
          messages: [{ role: 'user', content: chatSporsmal.trim() }],
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
        }),
      });
      if (!res.ok) { setChatSvar('Serveren svarte ikke. Prøv igjen.'); return; }
      const data = await res.json();
      setChatSvar(data.content?.[0]?.text || 'Fikk ikke svar. Prøv igjen.');
    } catch {
      setChatSvar('Noe gikk galt. Prøv igjen.');
    } finally {
      clearTimeout(venterTimer);
      setChatLaster(false);
      setChatVenter(false);
    }
  }

  function avbrytOkt() {
    stoppHvile();
    setVisAvsluttModal(true);
  }

  async function bekreftHoppOver() {
    setVisAvsluttModal(false);
    const user = auth.currentUser;
    if (!user) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'logger'), {
        dato: serverTimestamp(),
        programId: program?.id || null,
        programTittel: program?.tittel || 'Økt',
        fullfort: false,
        skippetArsak: 'other',
        smerte: null,
        notat: '',
        ovelser: [],
      });
      if (program?.id) {
        const nyFullfort = (program.okterFullfort || 0) + 1;
        await updateDoc(doc(db, 'users', user.uid, 'programs', program.id), {
          okterFullfort: increment(1),
          ...(nyFullfort >= (program.okterTotalt || 0) ? { aktiv: false } : {}),
        });
      }
    } catch (e) { console.error(e); }
    navigation.navigate('MainTabs');
  }

  const fremgang = ovelser.length > 0
    ? Math.round(((ovelseIndex + (settIndex / antallSett)) / ovelser.length) * 100)
    : 0;

  // ── BASELINE (første økt) ─────────────────────────────────────
  if (visBaseline) {
    const baselineSporsmal = program?.baselineSporsmal || [];
    const alleBesvart = baselineSporsmal.every((q: any) => (baselineSvar[q.id] || '').trim().length > 0);
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => navigation.navigate('MainTabs')}>
            <Text style={s.avbryt}>Avbryt</Text>
          </TouchableOpacity>
          <Text style={s.topbarTittel}>Før du starter</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={s.ferdigInner}>
          <View style={s.sjekkInnHeader}>
            <Text style={s.sjekkInnEmoji}>📋</Text>
            <Text style={s.ferdigTittel}>Baseline-måling</Text>
            <Text style={s.sjekkInnSub}>
              Svar på disse spørsmålene nå – de stilles igjen etter programmet
              slik at du kan se konkret fremgang.
            </Text>
          </View>

          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>FUNKSJONELLE MÅL</Text>
            {baselineSporsmal.map((q: any) => (
              <View key={q.id} style={s.sporsmalKort}>
                <Text style={s.sporsmalTekst}>{q.sporsmal}</Text>
                <TextInput
                  style={s.sporsmalInput}
                  value={baselineSvar[q.id] || ''}
                  onChangeText={v => setBaselineSvar(prev => ({ ...prev, [q.id]: v }))}
                  placeholder="Skriv ditt svar..."
                  placeholderTextColor={colors.muted2}
                  multiline
                />
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[s.btnPrimary, !alleBesvart && s.btnDisabled]}
            disabled={!alleBesvart || lagrer}
            onPress={async () => {
              const user = auth.currentUser;
              if (user && program?.id) {
                try {
                  const oppdatertBaseline = (program.baselineSporsmal || []).map((q: any) => ({
                    ...q,
                    svar: baselineSvar[q.id] || '',
                  }));
                  await updateDoc(
                    doc(db, 'users', user.uid, 'programs', program.id),
                    { baselineSporsmal: oppdatertBaseline }
                  );
                } catch (e) { console.error(e); }
              }
              setVisBaseline(false);
            }}
          >
            <Text style={s.btnPrimaryTekst}>
              {lagrer ? 'Lagrer...' : 'Start første økt →'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── MIDTVEIS-SJEKK ────────────────────────────────────────────
  if (visMidtveis) {
    const baselineSporsmal = program?.baselineSporsmal || [];
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.ferdigInner}>
          <View style={s.sjekkInnHeader}>
            <Text style={s.sjekkInnEmoji}>📊</Text>
            <Text style={s.ferdigTittel}>Halvveis</Text>
            <Text style={s.sjekkInnSub}>
              Du er omtrent halvveis i {program?.tittel}. Hvordan går det?
            </Text>
          </View>

          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>TOTALT SETT – SAMMENLIGNET MED START</Text>
            <View style={s.grcListe}>
              {GRC_VALG.map(v => (
                <TouchableOpacity
                  key={v.verdi}
                  style={[s.grcKnapp, grc === v.verdi && s.grcKnappAktiv]}
                  onPress={() => setGrc(v.verdi)}
                >
                  <Text style={[s.grcTekst, grc === v.verdi && s.grcTekstAktiv]}>{v.tekst}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {baselineSporsmal.length > 0 && (
            <View style={s.seksjon}>
              <Text style={s.seksjonTittel}>FUNKSJONELLE MÅL</Text>
              {baselineSporsmal.map((q: any) => (
                <View key={q.id} style={s.sporsmalKort}>
                  <Text style={s.sporsmalTekst}>{q.sporsmal}</Text>
                  {q.svar ? (
                    <View style={s.sammenligningRad}>
                      <View style={s.sammenligningKolonne}>
                        <Text style={s.sammenligningLabel}>START</Text>
                        <Text style={s.sammenligningVerdi}>{q.svar}</Text>
                      </View>
                      <View style={s.sammenligningPil}>
                        <Text style={s.sammenligningPilTekst}>→</Text>
                      </View>
                      <View style={[s.sammenligningKolonne, { flex: 2 }]}>
                        <Text style={s.sammenligningLabel}>NÅ</Text>
                        <TextInput
                          style={s.sporsmalInputLiten}
                          value={midtveisSvar[q.id] || ''}
                          onChangeText={v => setMidtveisSvar(prev => ({ ...prev, [q.id]: v }))}
                          placeholder="Ditt svar..."
                          placeholderTextColor={colors.muted2}
                          multiline
                        />
                      </View>
                    </View>
                  ) : (
                    <TextInput
                      style={s.sporsmalInput}
                      value={midtveisSvar[q.id] || ''}
                      onChangeText={v => setMidtveisSvar(prev => ({ ...prev, [q.id]: v }))}
                      placeholder="Ditt svar nå..."
                      placeholderTextColor={colors.muted2}
                      multiline
                    />
                  )}
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[s.btnPrimary, grc === null && s.btnDisabled]}
            disabled={grc === null || lagrer}
            onPress={async () => {
              if (grc === null) return;
              const user = auth.currentUser;
              // Lagre midtveis-svar på programmet
              if (user && program?.id) {
                try {
                  const oppdatertBaseline = (program.baselineSporsmal || []).map((q: any) => ({
                    ...q,
                    midtveis: midtveisSvar[q.id] || '',
                  }));
                  await updateDoc(doc(db, 'users', user.uid, 'programs', program.id), {
                    baselineSporsmal: oppdatertBaseline,
                    midtveisGjort: true,
                    midtveisGrc: grc,
                  });
                } catch (e) { console.error(e); }
              }
              await lagreOkt(undefined, 'midtveis');
            }}
          >
            <Text style={s.btnPrimaryTekst}>{lagrer ? 'Lagrer...' : 'Lagre og fortsett'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── SJEKK-INN (siste økt) ─────────────────────────────────────
  if (visSjekkInn) {
    const baselineSporsmal = program?.baselineSporsmal || [];
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.ferdigInner}>
          <View style={s.sjekkInnHeader}>
            <Text style={s.sjekkInnEmoji}>🎉</Text>
            <Text style={s.ferdigTittel}>Program fullført</Text>
            <Text style={s.sjekkInnSub}>
              Ta et minutt og reflekter over fremgangen din i {program?.tittel}.
            </Text>
          </View>

          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>TOTALT SETT – SAMMENLIGNET MED START</Text>
            <View style={s.grcListe}>
              {GRC_VALG.map(v => (
                <TouchableOpacity
                  key={v.verdi}
                  style={[s.grcKnapp, grc === v.verdi && s.grcKnappAktiv]}
                  onPress={() => setGrc(v.verdi)}
                >
                  <Text style={[s.grcTekst, grc === v.verdi && s.grcTekstAktiv]}>{v.tekst}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {baselineSporsmal.length > 0 && (
            <View style={s.seksjon}>
              <Text style={s.seksjonTittel}>FUNKSJONELLE MÅL – ALLE TRE TIDSPUNKTER</Text>
              {baselineSporsmal.map((q: any) => (
                <View key={q.id} style={s.sporsmalKort}>
                  <Text style={s.sporsmalTekst}>{q.sporsmal}</Text>
                  {/* Tre kolonner side om side */}
                  <View style={s.treKolonner}>
                    <View style={s.kolonne}>
                      <Text style={s.kolonneLabel}>START</Text>
                      <Text style={s.kolonneVerdi}>{q.svar || '–'}</Text>
                    </View>
                    {q.midtveis ? (
                      <View style={s.kolonne}>
                        <Text style={s.kolonneLabel}>HALVVEIS</Text>
                        <Text style={s.kolonneVerdi}>{q.midtveis}</Text>
                      </View>
                    ) : null}
                    <View style={[s.kolonne, s.kolonneAktiv]}>
                      <Text style={[s.kolonneLabel, { color: colors.green }]}>NÅ</Text>
                      <TextInput
                        style={s.sporsmalInputLiten}
                        value={sjekkInnSvar[q.id] || ''}
                        onChangeText={v => setSjekkInnSvar(prev => ({ ...prev, [q.id]: v }))}
                        placeholder="Ditt svar..."
                        placeholderTextColor={colors.muted2}
                        multiline
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>NOTAT (valgfritt)</Text>
            <TextInput
              style={s.notatInput}
              value={notat}
              onChangeText={setNotat}
              placeholder="Andre tanker om programperioden..."
              placeholderTextColor={colors.muted2}
              multiline
            />
          </View>

          <TouchableOpacity
            style={[s.btnPrimary, grc === null && s.btnDisabled]}
            onPress={() => {
              if (grc === null) return;
              lagreOkt({
                globalRating: grc,
                svar: baselineSporsmal.map((q: any) => ({
                  id: q.id,
                  sporsmal: q.sporsmal,
                  baseline: q.svar,
                  midtveis: q.midtveis,
                  svar: sjekkInnSvar[q.id] || '',
                })),
              }, 'sjekkin');
            }}
            disabled={grc === null || lagrer}
          >
            <Text style={s.btnPrimaryTekst}>{lagrer ? 'Lagrer...' : 'Fullfør program'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── FERDIG ────────────────────────────────────────────────────
  if (ferdig) {
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.ferdigInner}>
          <View style={s.ferdigIkon}>
            <Text style={s.ferdigIkonTekst}>✓</Text>
          </View>
          <Text style={s.ferdigTittel}>Økt fullført</Text>
          <Text style={s.ferdigSub}>{program?.tittel || 'Økt'}</Text>

          {klarForProgresjon && !erSisteOkt && (
            <View style={s.progresjonFerdigBoks}>
              <Text style={s.progresjonFerdigLabel}>KLAR FOR NESTE STEG</Text>
              <Text style={s.progresjonFerdigTekst}>
                {(program?.akt || 1) === 1
                  ? 'Smerten er under kontroll og øvelsene sitter godt. På tide å legge på litt mer.'
                  : 'Du holder kontakten gjennom flere reps nå enn da du startet. Musklene begynner å ta over der de skal.'}
              </Text>
              <TouchableOpacity
                style={s.progresjonFerdigKnapp}
                onPress={() => navigation.navigate('Reassessment', {
                  program,
                  forrigeAssessment: assessment,
                })}
              >
                <Text style={s.progresjonFerdigKnappTekst}>Ta en kort statussjekk →</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={s.seksjon}>
              <Text style={s.seksjonTittel}>
                {(program?.akt || 1) >= 2 ? 'SMERTENIVÅ (registreres for oppfølging)' : 'SMERTENIVÅ ETTER ØKTEN'}
              </Text>
              <View style={s.smerterad}>
                {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[s.smerteKnapp, smerte === n && s.smerteKnappAktiv]}
                    onPress={() => setSmerte(n)}
                  >
                    <Text style={[s.smerteTekst, smerte === n && s.smerteTekstAktiv]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>NOTAT (valgfritt)</Text>
            <TextInput
              style={s.notatInput}
              value={notat}
              onChangeText={setNotat}
              placeholder="Hvordan kjentes det?"
              placeholderTextColor={colors.muted2}
              multiline
            />
          </View>

          {!klarForProgresjon && (
            <TouchableOpacity
              style={s.btnPrimary}
              onPress={() => {
                if (erSisteOkt) setVisSjekkInn(true);
                else if (erMidtveis && harBaselineSporsmal) setVisMidtveis(true);
                else lagreOkt();
              }}
              disabled={lagrer}
            >
              <Text style={s.btnPrimaryTekst}>
                {lagrer ? 'Lagrer...' :
                 erSisteOkt ? 'Avslutt program →' :
                 (erMidtveis && harBaselineSporsmal) ? 'Midtveis-sjekk →' :
                 'Lagre økt'}
              </Text>
            </TouchableOpacity>
          )}

          {klarForProgresjon && (
            <TouchableOpacity
              style={s.btnSekundar}
              onPress={() => navigation.navigate('MainTabs')}
            >
              <Text style={s.btnSekundarTekst}>Tilbake til hjem</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── AKTIV ØKT ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={avbrytOkt}>
          <Text style={s.avbryt}>Avslutt</Text>
        </TouchableOpacity>
        <View style={s.topbarMidtre}>
          <Text style={s.topbarProgram}>{program?.tittel || 'Økt'}</Text>
          <Text style={s.topbarOvelse}>{gjeldende?.navn || `Øvelse ${ovelseIndex + 1}`}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <View style={s.progresjonBar}>
        <View style={[s.progresjonFill, { width: `${fremgang}%` as any }]} />
      </View>

      {(program?.frekvensPerDag || 1) > 1 && (() => {
        const iDagStr = new Date().toDateString();
        const gjortIDag = tidligereLogger.filter(l => {
          const dato = l.dato?.toDate ? l.dato.toDate() : new Date(l.dato);
          return dato.toDateString() === iDagStr;
        }).length;
        const mål = program.frekvensPerDag;
        return (
          <View style={{ backgroundColor: colors.surface2, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, color: gjortIDag >= mål ? colors.green : colors.muted, fontWeight: '500' }}>
              {gjortIDag >= mål ? `Alle ${mål} ganger gjort i dag ✓` : `${gjortIDag} av ${mål} ganger gjort i dag`}
            </Text>
          </View>
        );
      })()}

      <ScrollView contentContainerStyle={s.inner}>

        {/* Video øverst */}
        {gjeldendeData?.videoUrl && <VideoSpiller url={gjeldendeData.videoUrl} />}

        {/* Sett-info + reps/hold/tempo */}
        <View style={s.settInfoBoks}>
          <Text style={s.settInfoTekst}>
            Sett {settIndex + 1} av {antallSett}
          </Text>
          <View style={s.settMetaRad}>
            <Text style={s.settMetaTekst}>{gjeldende?.reps || '–'} reps</Text>
            {(gjeldende?.hold || gjeldendeData?.hold) ? (
              <View style={s.settMetaChip}>
                <Text style={s.settMetaChipTekst}>Hold {gjeldende?.hold || gjeldendeData?.hold}s</Text>
              </View>
            ) : null}
            {(gjeldende?.tempo || gjeldendeData?.tempo) ? (
              <View style={s.settMetaRad}>
                <View style={s.settMetaChip}>
                  <Text style={s.settMetaChipTekst}>Tempo {gjeldende?.tempo || gjeldendeData?.tempo}</Text>
                </View>
                <TouchableOpacity style={s.tempoInfoKnapp} onPress={() => setVisTempoInfo(true)}>
                  <Text style={s.tempoInfoKnappTekst}>?</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>

        {/* Tempo-forklaring modal */}
        {visTempoInfo && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setVisTempoInfo(false)}>
          <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setVisTempoInfo(false)}>
            <View style={s.modalKort}>
              <Text style={s.modalTittel}>Hva betyr tempo?</Text>
              <Text style={s.modalTekst}>
                Tempo skrives som tre tall, f.eks. <Text style={s.modalFremhev}>3-0-1</Text>
              </Text>
              <View style={s.tempoRad}>
                <View style={s.tempoKolonne}>
                  <Text style={s.tempoTall}>{(gjeldende?.tempo || gjeldendeData?.tempo || '–').split('-')[0]}</Text>
                  <Text style={s.tempoLabel}>Ned / eksentisk</Text>
                  <Text style={s.tempoHint}>Senkefasen</Text>
                </View>
                <View style={s.tempoKolonne}>
                  <Text style={s.tempoTall}>{(gjeldende?.tempo || gjeldendeData?.tempo || '–').split('-')[1] ?? '–'}</Text>
                  <Text style={s.tempoLabel}>Pause i bunn</Text>
                  <Text style={s.tempoHint}>Sekunder stopp</Text>
                </View>
                <View style={s.tempoKolonne}>
                  <Text style={s.tempoTall}>{(gjeldende?.tempo || gjeldendeData?.tempo || '–').split('-')[2] ?? '–'}</Text>
                  <Text style={s.tempoLabel}>Opp / konsentrisk</Text>
                  <Text style={s.tempoHint}>Løftfasen</Text>
                </View>
              </View>
              <Text style={s.modalEksempel}>
                Eksempel: <Text style={s.modalFremhev}>3-0-1</Text> betyr 3 sek ned, ingen pause, 1 sek opp.
              </Text>
              <TouchableOpacity style={s.modalLukkKnapp} onPress={() => setVisTempoInfo(false)}>
                <Text style={s.modalLukkTekst}>Forstått</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
        )}

        {/* Instruksjon */}
        {gjeldende?.instruksjon && (
          <View style={s.instruksjonKort}>
            <Text style={s.instruksjonTekst}>{gjeldende.instruksjon}</Text>
          </View>
        )}

        {/* Spør AI om øvelsen */}
        {gjeldende?.instruksjon && (
          <TouchableOpacity
            style={s.chatChip}
            onPress={() => { setChatSvar(null); setChatSporsmal(''); setVisChatModal(true); }}
          >
            <Text style={s.chatChipTekst}>Spør om øvelsen →</Text>
          </TouchableOpacity>
        )}

        {/* Personlig kontekst – tilpasset brukerens kartlegging */}
        {gjeldende?.personligKontekst && (
          <View style={s.personligKontekstKort}>
            <View style={s.personligKontekstHeader}>
              <Text style={s.personligKontekstIkon}>◎</Text>
              <Text style={s.personligKontekstLabel}>FOR DEG SPESIELT</Text>
            </View>
            <Text style={s.personligKontekstTekst}>{gjeldende.personligKontekst}</Text>
          </View>
        )}

        {/* Kollapsbar – vanlige feil */}
        {gjeldendeData?.feilVideoUrl && (
          <TouchableOpacity style={s.visMerKnapp} onPress={() => setVisDetaljer(v => !v)}>
            <Text style={s.visMerTekst}>{visDetaljer ? '∧ Skjul' : '∨ Vanlig feil'}</Text>
          </TouchableOpacity>
        )}

        {visDetaljer && gjeldendeData?.feilVideoUrl && (
          <View style={s.detaljerSeksjon}>
            <View style={s.feilLabel}>
              <View style={s.feilDot} />
              <Text style={s.feilLabelTekst}>Vanlig feil – unngå dette</Text>
            </View>
            <VideoSpiller url={gjeldendeData.feilVideoUrl} />
          </View>
        )}

        {/* Anatomi – alltid synlig */}
        {(gjeldendeData?.anatomi || gjeldendeData?.muskelgrupper) && (
          <View style={s.anatomiWrapper}>
            <Text style={s.anatomiLabel}>MUSKLER SOM AKTIVERES</Text>
            <AnatomyViewer
              anatomi={gjeldendeData.anatomi || { anterior: [], posterior: [] }}
              muskelgrupper={gjeldendeData.muskelgrupper}
              kompakt
            />
          </View>
        )}

        {hvilerNå && hvileTimer !== null && (
          <View style={s.hvileKort}>
            <Text style={s.hvileTittel}>HVILE</Text>
            <Text style={s.hvileTimer}>{hvileTimer}s</Text>
            <View style={s.hvileJusterRad}>
              <TouchableOpacity
                style={s.hvileJusterKnapp}
                onPress={() => setHvileTimer(prev => prev !== null ? Math.max(5, prev - 15) : null)}
              >
                <Text style={s.hvileJusterTekst}>−15s</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.hvileJusterKnapp}
                onPress={() => setHvileTimer(prev => prev !== null ? prev + 15 : null)}
              >
                <Text style={s.hvileJusterTekst}>+15s</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={stoppHvile}>
              <Text style={s.hoppOverHvile}>Hopp over hvile</Text>
            </TouchableOpacity>
          </View>
        )}

        {!hvilerNå && (
          <View style={s.loggSeksjon}>
            {trackingTypes.filter(t => t !== 'completed').map(type => {
              const erRIR = type === 'rpe' && trackingTypes.includes('sets_reps_weight');
              const erBegrenset = ['activation_quality', 'mobility', 'side_diff'].includes(type);
              const maks = erRIR ? 4 : erBegrenset ? 10 : 999;
              const infoKey = erRIR ? 'rpe_rir' : type;
              const harInfo = !!TRACKING_INFO[infoKey];
              return (
                <View key={type} style={s.trackingSeksjon}>
                  <View style={s.trackingLabelRad}>
                    <Text style={s.seksjonTittel}>{erRIR ? 'Reps i reserve (0–4)' : TRACKING_LABEL[type] || type}</Text>
                    {harInfo && (
                      <TouchableOpacity style={s.infoChip} onPress={() => setVisInfoModal(infoKey)}>
                        <Text style={s.infoChipTekst}>?</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={s.repStepper}>
                    <TouchableOpacity
                      style={s.stepperKnapp}
                      onPress={() => setRepVerdier(prev => ({ ...prev, [type]: Math.max(0, (prev[type] || 0) - 1) }))}
                    >
                      <Text style={s.stepperKnappTekst}>−</Text>
                    </TouchableOpacity>
                    <Text style={s.stepperVerdi}>{repVerdier[type] || 0}</Text>
                    <TouchableOpacity
                      style={s.stepperKnapp}
                      onPress={() => setRepVerdier(prev => ({ ...prev, [type]: Math.min(maks, (prev[type] || 0) + 1) }))}
                    >
                      <Text style={s.stepperKnappTekst}>+</Text>
                    </TouchableOpacity>
                  </View>
                  {(erBegrenset || erRIR) && (
                    <Text style={s.stepperMaks}>{erRIR ? 'maks 4' : 'maks 10'}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>

      {!hvilerNå && (
        <View style={s.bunntBar}>
          <TouchableOpacity style={s.btnSekundar} onPress={hoppOverSett}>
            <Text style={s.btnSekundarTekst}>Hopp over</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnPrimary, { flex: 1 }]} onPress={loggSett}>
            <Text style={s.btnPrimaryTekst}>
              {settIndex + 1 < antallSett ? 'Sett fullført →' :
               ovelseIndex + 1 < ovelser.length ? 'Neste øvelse →' : 'Fullfør økt'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Info-modal for tracking-typer */}
      {visInfoModal !== null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setVisInfoModal(null)}>
          <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setVisInfoModal(null)}>
            <View style={s.infoModalKort} onStartShouldSetResponder={() => true}>
              {TRACKING_INFO[visInfoModal] && (
                <>
                  <Text style={s.infoModalTittel}>{TRACKING_INFO[visInfoModal].tittel}</Text>
                  <Text style={s.infoModalTekst}>{TRACKING_INFO[visInfoModal].tekst}</Text>
                  {TRACKING_INFO[visInfoModal].eksempel && (
                    <Text style={s.infoModalEksempel}>{TRACKING_INFO[visInfoModal].eksempel}</Text>
                  )}
                </>
              )}
              <TouchableOpacity style={s.infoModalLukkKnapp} onPress={() => setVisInfoModal(null)}>
                <Text style={s.infoModalLukkTekst}>Skjønt</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Avslutt-bekreftelse modal */}
      {visAvsluttModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setVisAvsluttModal(false)}>
          <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setVisAvsluttModal(false)}>
            <View style={s.modalKort} onStartShouldSetResponder={() => true}>
            <Text style={s.modalTittel}>Avslutt økt?</Text>
            <Text style={s.modalTekst}>Øvelsene du har logget så langt lagres ikke.</Text>
            <TouchableOpacity style={s.avsluttHoppKnapp} onPress={bekreftHoppOver}>
              <Text style={s.avsluttHoppTekst}>Hopp over denne økten</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.avsluttAvbrytKnapp}
              onPress={() => { setVisAvsluttModal(false); navigation.navigate('MainTabs'); }}
            >
              <Text style={s.avsluttAvbrytTekst}>Avbryt uten å logge</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalLukkKnapp} onPress={() => setVisAvsluttModal(false)}>
              <Text style={s.modalLukkTekst}>Fortsett økt</Text>
            </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {visChatModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setVisChatModal(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalKort}>
              <Text style={s.modalTittel}>Spør om {gjeldende?.navn}</Text>
              <TextInput
                style={s.chatInput}
                value={chatSporsmal}
                onChangeText={setChatSporsmal}
                placeholder="Hva lurer du på?"
                placeholderTextColor={colors.muted2}
                multiline
              />
              {chatLaster && (
                <View style={{ gap: 6 }}>
                  <ActivityIndicator color={colors.muted} style={{ alignSelf: 'flex-start' }} />
                  {chatVenter && <Text style={{ fontSize: 12, color: colors.muted2, fontWeight: '300' }}>Starter opp server – kan ta 30–60 sek…</Text>}
                </View>
              )}
              {chatSvar && (
                <View style={s.chatSvarBoks}>
                  <Text style={s.chatSvarTekst}>{chatSvar}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[s.btnPrimary, (!chatSporsmal.trim() || chatLaster) && { opacity: 0.4 }]}
                onPress={spørOmØvelse}
                disabled={!chatSporsmal.trim() || chatLaster}
              >
                <Text style={s.btnPrimaryTekst}>Send</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalLukkKnapp} onPress={() => setVisChatModal(false)}>
                <Text style={s.modalLukkTekst}>Lukk</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  topbarMidtre: { flex: 1, alignItems: 'center', gap: 2 },
  topbarProgram: { fontSize: 11, color: colors.muted, fontWeight: '400', letterSpacing: 0.6 },
  topbarOvelse: { fontSize: 15, fontWeight: '500', color: colors.text, textAlign: 'center' },
  topbarTittel: { fontSize: 15, fontWeight: '500', color: colors.text },
  avbryt: { fontSize: 13, color: colors.danger, width: 60 },
  progresjonBar: { height: 2, backgroundColor: colors.border, overflow: 'hidden' },
  progresjonFill: { height: '100%', backgroundColor: colors.green },
  inner: { paddingBottom: 120, gap: 0 },

  settInfoBoks: { padding: 16, gap: 6 },
  settInfoTekst: { fontSize: 13, color: colors.text, fontWeight: '400' },
  settMetaRad: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  settMetaTekst: { fontSize: 20, color: colors.text, fontWeight: '400' },
  settMetaChip: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  settMetaChipTekst: { fontSize: 13, color: colors.text, fontWeight: '400' },
  tempoInfoKnapp: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center' },
  tempoInfoKnappTekst: { fontSize: 11, color: colors.muted2, fontWeight: '500' },

  // Tempo modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, width: '100%', gap: 14 },
  modalTittel: { fontSize: 16, fontWeight: '500', color: colors.text },
  modalTekst: { fontSize: 14, color: colors.muted, fontWeight: '300', lineHeight: 22 },
  modalFremhev: { color: colors.text, fontWeight: '500' },
  tempoRad: { flexDirection: 'row', gap: 8 },
  tempoKolonne: { flex: 1, backgroundColor: colors.surface2, borderRadius: 10, padding: 10, alignItems: 'center', gap: 4 },
  tempoTall: { fontSize: 26, fontWeight: '300', color: colors.text },
  tempoLabel: { fontSize: 11, color: colors.muted, fontWeight: '500', textAlign: 'center', letterSpacing: 0.3 },
  tempoHint: { fontSize: 10, color: colors.muted2, fontWeight: '300', textAlign: 'center' },
  modalEksempel: { fontSize: 13, color: colors.muted2, fontWeight: '300', lineHeight: 20 },
  modalLukkKnapp: { backgroundColor: colors.accent, borderRadius: 10, padding: 13, alignItems: 'center' },
  modalLukkTekst: { color: colors.bg, fontSize: 14, fontWeight: '600' },
  avsluttHoppKnapp: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 10, padding: 13, alignItems: 'center' },
  avsluttHoppTekst: { color: colors.text, fontSize: 14, fontWeight: '400' },
  avsluttAvbrytKnapp: { padding: 10, alignItems: 'center' },
  avsluttAvbrytTekst: { color: colors.danger, fontSize: 13, fontWeight: '300' },

  ovelseHeader: { gap: 4, padding: 16 },
  ovelseNummer: { fontSize: 11, color: colors.muted, fontWeight: '300', letterSpacing: 0.6 },
  ovelseNavn: { fontSize: 22, fontWeight: '400', color: colors.text, lineHeight: 30 },
  settInfo: { fontSize: 13, color: colors.muted, fontWeight: '300' },
  settChips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  settChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface },
  settChipFullfort: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  settChipHoppet: { backgroundColor: colors.surface2, borderColor: colors.muted2, opacity: 0.5 },
  settChipAktiv: { backgroundColor: colors.accent, borderColor: colors.accent },
  settChipTekst: { fontSize: 12, color: colors.muted },
  settChipTekstFullfort: { color: colors.green },
  settChipTekstHoppet: { color: colors.muted2 },
  settChipTekstAktiv: { color: colors.bg, fontWeight: '600' },
  chatChip: { alignSelf: 'flex-start', marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  chatChipTekst: { fontSize: 12, color: colors.text, fontWeight: '400' },
  chatInput: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 10, padding: 12, fontSize: 14, color: colors.text, minHeight: 60, textAlignVertical: 'top' },
  chatSvarBoks: { backgroundColor: colors.surface2, borderRadius: 10, padding: 12 },
  chatSvarTekst: { fontSize: 14, color: colors.text, fontWeight: '300', lineHeight: 22 },
  instruksjonKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, margin: 16, marginTop: 0 },
  instruksjonTekst: { fontSize: 14, color: colors.text, fontWeight: '400', lineHeight: 23 },
  personligKontekstKort: { backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 14, padding: 14, margin: 16, marginTop: 0, gap: 8 },
  personligKontekstHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  personligKontekstIkon: { fontSize: 12, color: colors.green },
  personligKontekstLabel: { fontSize: 9, color: colors.green, fontWeight: '600', letterSpacing: 1.0 },
  personligKontekstTekst: { fontSize: 13, color: colors.text, fontWeight: '300', lineHeight: 21 },
  stepperMaks: { fontSize: 11, color: colors.muted2, textAlign: 'center', fontWeight: '300' },
  visMerKnapp: { borderWidth: 1, borderColor: colors.border2, borderRadius: 10, padding: 12, alignItems: 'center', margin: 16, marginTop: 0 },
  visMerTekst: { fontSize: 13, color: colors.muted, fontWeight: '400' },
  detaljerSeksjon: { gap: 12, paddingHorizontal: 16 },
  feilLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  feilDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  feilLabelTekst: { fontSize: 12, color: colors.danger, fontWeight: '500', letterSpacing: 0.4 },
  anatomiWrapper: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 8 },
  anatomiLabel: { fontSize: 11, color: colors.muted, fontWeight: '500', letterSpacing: 0.8 },
  anatomiImage: { width: '100%', height: 180 },
  hvileKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 20, alignItems: 'center', gap: 12 },
  hvileTittel: { fontSize: 11, color: colors.muted2, fontWeight: '500', letterSpacing: 1.0 },
  hvileTimer: { fontSize: 56, fontWeight: '200', color: colors.text },
  hvileJusterRad: { flexDirection: 'row', gap: 10 },
  hvileJusterKnapp: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface2 },
  hvileJusterTekst: { fontSize: 13, color: colors.muted, fontWeight: '400' },
  hoppOverHvile: { fontSize: 13, color: colors.muted2, fontWeight: '300', textDecorationLine: 'underline' },
  loggSeksjon: { gap: 16, padding: 16 },
  trackingSeksjon: { gap: 12 },
  trackingLabelRad: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoChip: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center' },
  infoChipTekst: { fontSize: 10, color: colors.muted2, fontWeight: '600' },
  infoModalKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, width: '100%', gap: 12 },
  infoModalTittel: { fontSize: 16, fontWeight: '500', color: colors.text },
  infoModalTekst: { fontSize: 14, color: colors.muted, fontWeight: '300', lineHeight: 22 },
  infoModalEksempel: { fontSize: 13, color: colors.muted2, fontWeight: '300', lineHeight: 20, fontStyle: 'italic', borderLeftWidth: 2, borderLeftColor: colors.border2, paddingLeft: 10 },
  infoModalLukkKnapp: { backgroundColor: colors.accent, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  infoModalLukkTekst: { color: colors.bg, fontSize: 14, fontWeight: '600' },
  seksjonTittel: { fontSize: 11, color: colors.muted, fontWeight: '500', letterSpacing: 1.0 },
  completedWrapper: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, alignItems: 'center' },
  completedTekst: { fontSize: 14, color: colors.muted, fontWeight: '400' },
  repStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  stepperKnapp: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center' },
  stepperKnappTekst: { fontSize: 24, color: colors.text, fontWeight: '300' },
  stepperVerdi: { fontSize: 48, fontWeight: '300', color: colors.text, minWidth: 80, textAlign: 'center' },
  bunntBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 28, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  btnPrimary: { backgroundColor: colors.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
  btnPrimaryTekst: { color: colors.bg, fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.35 },
  btnSekundar: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 10, padding: 14, paddingHorizontal: 18, alignItems: 'center' },
  btnSekundarTekst: { color: colors.muted, fontSize: 14, fontWeight: '400' },
  ferdigInner: { padding: 24, paddingBottom: 60, gap: 20, alignItems: 'center' },
  ferdigIkon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.greenDim, borderWidth: 2, borderColor: colors.greenBorder, alignItems: 'center', justifyContent: 'center' },
  ferdigIkonTekst: { fontSize: 28, color: colors.green },
  ferdigTittel: { fontSize: 26, fontWeight: '300', color: colors.text },
  ferdigSub: { fontSize: 14, color: colors.muted, fontWeight: '300' },
  progresjonFerdigBoks: { width: '100%', backgroundColor: colors.greenDim, borderWidth: 1.5, borderColor: colors.green, borderRadius: 14, padding: 14, gap: 10 },
  progresjonFerdigLabel: { fontSize: 10, color: colors.green, fontWeight: '600', letterSpacing: 0.8 },
  progresjonFerdigTekst: { fontSize: 13, color: colors.text, fontWeight: '300', lineHeight: 20 },
  progresjonFerdigKnapp: { backgroundColor: colors.green, borderRadius: 8, padding: 12, alignItems: 'center' },
  progresjonFerdigKnappTekst: { fontSize: 14, color: '#fff', fontWeight: '600' },
  seksjon: { width: '100%', gap: 10 },
  smerterad: { flexDirection: 'row', justifyContent: 'space-between' },
  smerteKnapp: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center' },
  smerteKnappAktiv: { backgroundColor: colors.green, borderColor: colors.green },
  smerteTekst: { fontSize: 11, color: colors.muted },
  smerteTekstAktiv: { color: '#fff', fontWeight: '600' },
  notatInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 10, padding: 12, fontSize: 14, color: colors.text, minHeight: 80, textAlignVertical: 'top', width: '100%' },
  sjekkInnHeader: { gap: 8, alignItems: 'center', width: '100%' },
  sjekkInnEmoji: { fontSize: 40 },
  sjekkInnSub: { fontSize: 14, color: colors.muted, fontWeight: '400', textAlign: 'center', lineHeight: 22 },
  sjekkInnSporsmal: { fontSize: 15, color: colors.text, fontWeight: '400', lineHeight: 22 },
  sjekkInnHint: { fontSize: 12, color: colors.muted2, fontWeight: '300', lineHeight: 18 },
  grcListe: { gap: 8 },
  grcKnapp: { padding: 13, borderRadius: 10, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface, alignItems: 'center' },
  grcKnappAktiv: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  grcTekst: { fontSize: 14, color: colors.muted, fontWeight: '400' },
  grcTekstAktiv: { color: colors.green, fontWeight: '500' },
  sporsmalKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 10 },
  sporsmalTekst: { fontSize: 14, color: colors.text, fontWeight: '400', lineHeight: 22 },
  baselineSvar: { fontSize: 12, color: colors.muted, fontWeight: '300', fontStyle: 'italic' },
  sporsmalInput: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 10, fontSize: 14, color: colors.text, minHeight: 60, textAlignVertical: 'top' },
  sporsmalInputLiten: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 8, fontSize: 13, color: colors.text, minHeight: 48, textAlignVertical: 'top' },

  // Sammenligning side om side
  sammenligningRad: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sammenligningKolonne: { flex: 1, gap: 4 },
  sammenligningLabel: { fontSize: 9, color: colors.muted2, fontWeight: '500', letterSpacing: 0.8 },
  sammenligningVerdi: { fontSize: 13, color: colors.muted, fontWeight: '300', lineHeight: 18 },
  sammenligningPil: { paddingTop: 14 },
  sammenligningPilTekst: { fontSize: 14, color: colors.muted2 },

  // Tre kolonner (start / halvveis / nå)
  treKolonner: { flexDirection: 'row', gap: 8 },
  kolonne: { flex: 1, gap: 4, backgroundColor: colors.surface2, borderRadius: 8, padding: 8 },
  kolonneAktiv: { backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder },
  kolonneLabel: { fontSize: 9, color: colors.muted2, fontWeight: '500', letterSpacing: 0.8 },
  kolonneVerdi: { fontSize: 12, color: colors.muted, fontWeight: '300', lineHeight: 17 },
});
