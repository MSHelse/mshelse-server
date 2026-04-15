import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, TextInput, ActivityIndicator
} from 'react-native';
import { collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { colors } from '../../theme/colors';

const BACKEND = 'https://mshelse-server.onrender.com';

export default function ReassessmentScreen({ navigation, route }: any) {
  const { program, forrigeAssessment, stagnasjon, stagnasjonJustering, stagnasjonStrength } = route?.params || {};

  const [sporsmal, setSporsmal] = useState('');
  const [sublabel, setSublabel] = useState('');
  const [alternativer, setAlternativer] = useState<string[]>([]);
  const [valgte, setValgte] = useState<string[]>([]);
  const [fritekst, setFritekst] = useState('');
  const [visFritekst, setVisFritekst] = useState(false);
  const [laster, setLaster] = useState(true);
  const [feil, setFeil] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ferdig, setFerdig] = useState(false);
  const [resultat, setResultat] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [trackingData, setTrackingData] = useState<any>(null);
  const [venterPaRender, setVenterPaRender] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    hentTrackingOgStart();
  }, []);

  async function hentTrackingOgStart() {
    const user = auth.currentUser;
    if (!user) return;
    try {
      // Hent logger for dette programmet
      const logSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'logger'), orderBy('dato', 'desc'), limit(20))
      );
      const logger = logSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((l: any) => l.programId === program?.id && l.fullfort);

      const data = byggTrackingOppsummering(logger, program);
      setTrackingData(data);
      await start(data);
    } catch (e) {
      console.error(e);
      setLaster(false);
    }
  }

  function byggTrackingOppsummering(logger: any[], prog: any) {
    if (logger.length === 0) return { compliance: 0, okter: 0, smerteTrend: [], aktivering: [], kontaktReps: [] };

    const fullfort = prog?.okterFullfort || 0;
    const totalt = prog?.okterTotalt || 1;

    // Smerte-trend (kun Akt 1)
    const smerteTrend = logger
      .filter((l: any) => l.smerte !== null && l.smerte !== undefined)
      .map((l: any) => l.smerte)
      .reverse();

    // Snitt activation_quality per økt
    const aktivering = logger.map((l: any) => {
      const verdier = (l.ovelser || []).flatMap((o: any) =>
        (o.sett || []).map((s: any) => s.verdier?.activation_quality ?? null)
      ).filter((v: any) => v !== null);
      return verdier.length > 0
        ? Math.round(verdier.reduce((a: number, b: number) => a + b, 0) / verdier.length * 10) / 10
        : null;
    }).filter((v: any) => v !== null).reverse();

    // Max contact_reps per økt
    const kontaktReps = logger.map((l: any) => {
      const reps = (l.ovelser || []).flatMap((o: any) =>
        (o.sett || []).map((s: any) => s.verdier?.contact_reps ?? null)
      ).filter((v: any) => v !== null);
      return reps.length > 0 ? Math.max(...reps) : null;
    }).filter((v: any) => v !== null).reverse();

    // Hoppede økter
    const hoppede = logger.filter((l: any) => !l.fullfort).length;

    return {
      compliance: Math.round((fullfort / totalt) * 100),
      okter: fullfort,
      totalt,
      dagersmertefri: beregnDagerSmertefri(logger),
      smerteTrend: smerteTrend.slice(-6),
      aktivering: aktivering.slice(-6),
      kontaktReps: kontaktReps.slice(-6),
      hoppede,
      program: prog?.tittel || '–',
      akt: prog?.akt || 1,
    };
  }

  function beregnDagerSmertefri(logger: any[]): number {
    let dager = 0;
    for (const l of logger) {
      if ((l.smerte ?? 10) === 0) {
        const dato = l.dato?.toDate?.();
        if (dato) {
          const diff = (Date.now() - dato.getTime()) / (1000 * 60 * 60 * 24);
          if (diff <= 30) dager = Math.max(dager, Math.floor(diff));
        }
      }
    }
    return dager;
  }

  async function start(data: any) {
    setLaster(true);
    setFeil(false);
    setVenterPaRender(false);
    const timer = setTimeout(() => setVenterPaRender(true), 5000);
    try {
      const svar = await sendMelding([], data);
      handleSvar(svar, []);
    } catch (e) {
      console.error(e);
      setFeil(true);
    } finally {
      clearTimeout(timer);
      setLaster(false);
      setVenterPaRender(false);
    }
  }

  async function sendMelding(msgs: any[], data?: any) {
    const body: any = {
      messages: msgs,
      forrigeAssessment,
      trackingData: data || trackingData,
      stagnasjon: stagnasjon || false,
      stagnasjonJustering: stagnasjonJustering || null,
      stagnasjonStrength: stagnasjonStrength || null,
    };
    const res = await fetch(`${BACKEND}/api/reassessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Server svarte ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    const tekst = json.content?.[0]?.text || '';
    const jsonStart = tekst.indexOf('{');
    const jsonEnd = tekst.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('Ugyldig svar fra server');
    return JSON.parse(tekst.substring(jsonStart, jsonEnd + 1));
  }

  function handleSvar(svar: any, currentHistory: any[]) {
    if (svar.done && svar.reassessment) {
      setFerdig(true);
      setResultat(svar.reassessment);
      lagreReassessment(svar.reassessment);
      return;
    }
    setSporsmal(svar.question || '');
    setSublabel(svar.sublabel || '');
    setAlternativer(svar.options || []);
    setProgress(svar.progress || 0);
    setValgte([]);
    setFritekst('');
    setVisFritekst(false);
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
  }

  async function sendSvar() {
    if (valgte.length === 0 && fritekst.trim() === '') return;
    const svarTekst = valgte.includes('Annet – beskriv selv') && fritekst.trim()
      ? [...valgte.filter(v => v !== 'Annet – beskriv selv'), fritekst.trim()].join(', ')
      : valgte.join(', ') || fritekst.trim();

    const nyeHistory = [
      ...history,
      { role: 'assistant', content: JSON.stringify({ question: sporsmal, options: alternativer }) },
      { role: 'user', content: svarTekst },
    ];
    setHistory(nyeHistory);
    setLaster(true);
    setFeil(false);
    setVenterPaRender(false);

    const timer = setTimeout(() => setVenterPaRender(true), 5000);
    try {
      const svar = await sendMelding(nyeHistory);
      handleSvar(svar, nyeHistory);
    } catch (e) {
      console.error(e);
      setFeil(true);
    } finally {
      clearTimeout(timer);
      setLaster(false);
      setVenterPaRender(false);
    }
  }

  async function lagreReassessment(data: any) {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'assessments'), {
        dato: serverTimestamp(),
        type: 'reassessment',
        programId: program?.id || null,
        programTittel: program?.tittel || null,
        // Feltnavn SituasjonKort forstår
        tittel: data.konklusjon === 'neste_akt'
          ? `Klar for neste steg – ${program?.tittel || ''}`
          : data.konklusjon === 'intensiver'
          ? `Øker vanskelighetsgraden – ${program?.tittel || ''}`
          : data.konklusjon === 'fortsett'
          ? `Programmet fungerer – fortsett`
          : 'Ny full kartlegging anbefales',
        confidence: null,
        triage: {
          start_act: forrigeAssessment?.triage?.start_act || null,
          goal: forrigeAssessment?.triage?.goal || null,
          pain_level: null,
          next_step: data.neste_steg || '',
          rationale: data.begrunnelse || '',
        },
        ...data,
      });
      // Deaktiver gammelt program hvis bruker går videre til neste akt eller intensiverer
      if (program?.id && (data.konklusjon === 'neste_akt' || data.konklusjon === 'intensiver')) {
        await updateDoc(doc(db, 'users', user.uid, 'programs', program.id), {
          aktiv: false,
        });
      }
    } catch (e) { console.error(e); }
  }

  function toggleValg(v: string) {
    if (v === 'Annet – beskriv selv') {
      setVisFritekst(prev => !prev);
      setValgte(prev =>
        prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
      );
      return;
    }
    setValgte(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
    );
  }

  const KONKLUSJON_TEKST: Record<string, { tittel: string; sub: string; farge: string }> = {
    neste_akt: {
      tittel: 'Klar for neste akt',
      sub: 'Kroppen er klar for mer krevende trening.',
      farge: colors.green,
    },
    intensiver: {
      tittel: 'Øk vanskelighetsgraden',
      sub: 'Samme akt, men legg på mer motstand eller reps.',
      farge: colors.yellow,
    },
    fortsett: {
      tittel: 'Fortsett som planlagt',
      sub: 'Programmet fungerer – fullfør det.',
      farge: colors.green,
    },
    ny_kartlegging: {
      tittel: 'Full kartlegging anbefales',
      sub: 'Bildet er uklart. En ny full kartlegging vil gi bedre svar.',
      farge: colors.muted,
    },
  };

  // ── RESULTAT ────────────────────────────────────────────────────
  if (ferdig && resultat) {
    const info = KONKLUSJON_TEKST[resultat.konklusjon] || KONKLUSJON_TEKST['fortsett'];
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main', state: { routes: [{ name: 'MainTabs', state: { routes: [{ name: 'Hjem' }], index: 0 } }] } }] })}>
            <Text style={s.avbryt}>Lukk</Text>
          </TouchableOpacity>
          <Text style={s.topbarTittel}>Statussjekk</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={s.resultatInner}>
          <View style={s.resultatHeader}>
            <View style={[s.resultatBadge, { borderColor: info.farge, backgroundColor: `${info.farge}18` }]}>
              <Text style={[s.resultatBadgeTekst, { color: info.farge }]}>{info.tittel}</Text>
            </View>
            <Text style={s.resultatSub}>{info.sub}</Text>
          </View>

          {resultat.begrunnelse ? (
            <View style={s.begrunnelseKort}>
              <Text style={s.begrunnelseLabel}>VURDERING</Text>
              <Text style={s.begrunnelseTekst}>{resultat.begrunnelse}</Text>
            </View>
          ) : null}

          {resultat.neste_steg ? (
            <View style={s.nesteStegKort}>
              <Text style={s.nesteStegLabel}>NESTE STEG</Text>
              <Text style={s.nesteStegTekst}>{resultat.neste_steg}</Text>
            </View>
          ) : null}

          {resultat.program_hint?.fokus ? (
            <View style={s.hintKort}>
              <Text style={s.hintLabel}>NESTE PROGRAM</Text>
              <Text style={s.hintFokus}>{resultat.program_hint.fokus}</Text>
              {(resultat.program_hint.prioriter || []).length > 0 && (
                <View style={s.hintRad}>
                  <Text style={s.hintSubLabel}>Prioriter: </Text>
                  <Text style={s.hintVerdier}>{resultat.program_hint.prioriter.join(' · ')}</Text>
                </View>
              )}
              {(resultat.program_hint.unngå || []).length > 0 && (
                <View style={s.hintRad}>
                  <Text style={s.hintSubLabel}>Ikke ennå: </Text>
                  <Text style={s.hintVerdier}>{resultat.program_hint.unngå.join(' · ')}</Text>
                </View>
              )}
            </View>
          ) : null}

          <View style={s.knappeRad}>
            {resultat.konklusjon !== 'fortsett' && resultat.konklusjon !== 'ny_kartlegging' ? (
              <TouchableOpacity
                style={s.btnPrimary}
                onPress={() => navigation.navigate('ProgramBuilder', {
                  fraReassessment: resultat,
                  forrigeAssessment,
                })}
              >
                <Text style={s.btnPrimaryTekst}>Lag nytt program →</Text>
              </TouchableOpacity>
            ) : null}

            {resultat.konklusjon === 'ny_kartlegging' ? (
              <TouchableOpacity
                style={s.btnPrimary}
                onPress={() => navigation.navigate('Kartlegging')}
              >
                <Text style={s.btnPrimaryTekst}>Start full kartlegging →</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={s.btnSekundar}
              onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main', state: { routes: [{ name: 'MainTabs', state: { routes: [{ name: 'Hjem' }], index: 0 } }] } }] })}
            >
              <Text style={s.btnSekundarTekst}>Tilbake til hjem</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── FEIL ────────────────────────────────────────────────────────
  if (feil) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.avbryt}>Avbryt</Text>
          </TouchableOpacity>
          <Text style={s.topbarTittel}>Statussjekk</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.center}>
          <Text style={s.feilTekst}>Kunne ikke koble til serveren.</Text>
          <TouchableOpacity style={s.feilKnapp} onPress={() => start(trackingData)}>
            <Text style={s.feilKnappTekst}>Prøv igjen</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── LASTER ──────────────────────────────────────────────────────
  if (laster) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.avbryt}>Avbryt</Text>
          </TouchableOpacity>
          <Text style={s.topbarTittel}>Statussjekk</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
          {venterPaRender && (
            <Text style={s.venterTekst}>Kobler til server – dette kan ta 30–60 sek første gang…</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── SPØRSMÅL ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.avbryt}>Avbryt</Text>
        </TouchableOpacity>
        <Text style={s.topbarTittel}>Statussjekk</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${progress}%` as any }]} />
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={s.inner}>
        <Text style={s.sporsmalTekst}>{sporsmal}</Text>
        {sublabel ? <Text style={s.sublabel}>{sublabel}</Text> : null}

        <View style={s.alternativListe}>
          {alternativer.map((alt, i) => {
            const valgt = valgte.includes(alt);
            return (
              <TouchableOpacity
                key={i}
                style={[s.alternativ, valgt && s.alternativValgt]}
                onPress={() => toggleValg(alt)}
              >
                <View style={[s.alternativDot, valgt && s.alternativDotValgt]} />
                <Text style={[s.alternativTekst, valgt && s.alternativTekstValgt]}>{alt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {visFritekst && (
          <TextInput
            style={s.fritekst}
            value={fritekst}
            onChangeText={setFritekst}
            placeholder="Beskriv..."
            placeholderTextColor={colors.muted2}
            multiline
            autoFocus
          />
        )}
      </ScrollView>

      <View style={s.bunntBar}>
        <TouchableOpacity
          style={[s.btnPrimary, { flex: 1 }, (valgte.length === 0 && fritekst.trim() === '') && s.btnDisabled]}
          disabled={valgte.length === 0 && fritekst.trim() === ''}
          onPress={sendSvar}
        >
          <Text style={s.btnPrimaryTekst}>Neste →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  venterTekst: { fontSize: 13, color: colors.muted, fontWeight: '300', textAlign: 'center', lineHeight: 20 },
  feilTekst: { fontSize: 15, color: colors.muted, fontWeight: '300', textAlign: 'center' },
  feilKnapp: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  feilKnappTekst: { fontSize: 14, color: colors.text, fontWeight: '400' },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  topbarTittel: { fontSize: 15, fontWeight: '500', color: colors.text },
  avbryt: { fontSize: 13, color: colors.muted, width: 60 },
  progressBar: { height: 2, backgroundColor: colors.border },
  progressFill: { height: '100%', backgroundColor: colors.green },
  inner: { padding: 24, paddingBottom: 120, gap: 20 },
  sporsmalTekst: { fontSize: 19, fontWeight: '300', color: colors.text, lineHeight: 28 },
  sublabel: { fontSize: 13, color: colors.muted, fontWeight: '300', lineHeight: 20, marginTop: -8 },
  alternativListe: { gap: 10 },
  alternativ: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  alternativValgt: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  alternativDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.border2 },
  alternativDotValgt: { backgroundColor: colors.green, borderColor: colors.green },
  alternativTekst: { flex: 1, fontSize: 15, color: colors.muted, fontWeight: '300' },
  alternativTekstValgt: { color: colors.text },
  fritekst: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 10, padding: 12, fontSize: 14, color: colors.text, minHeight: 80, textAlignVertical: 'top' },
  bunntBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 28, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  btnPrimary: { backgroundColor: colors.accent, borderRadius: 10, padding: 15, alignItems: 'center' },
  btnPrimaryTekst: { color: colors.bg, fontSize: 15, fontWeight: '600' },
  btnSekundar: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 10, padding: 14, alignItems: 'center' },
  btnSekundarTekst: { color: colors.muted, fontSize: 14, fontWeight: '400' },
  btnDisabled: { opacity: 0.35 },

  // Resultat
  resultatInner: { padding: 24, gap: 16, paddingBottom: 60 },
  resultatHeader: { gap: 10, alignItems: 'flex-start' },
  resultatBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  resultatBadgeTekst: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
  resultatSub: { fontSize: 15, color: colors.muted, fontWeight: '300', lineHeight: 23 },
  begrunnelseKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 6 },
  begrunnelseLabel: { fontSize: 10, color: colors.muted2, fontWeight: '500', letterSpacing: 0.8 },
  begrunnelseTekst: { fontSize: 14, color: colors.text, fontWeight: '300', lineHeight: 22 },
  nesteStegKort: { backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 14, padding: 14, gap: 6 },
  nesteStegLabel: { fontSize: 10, color: colors.green, fontWeight: '500', letterSpacing: 0.8 },
  nesteStegTekst: { fontSize: 14, color: colors.text, fontWeight: '300', lineHeight: 22 },
  hintKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 8 },
  hintLabel: { fontSize: 10, color: colors.muted2, fontWeight: '500', letterSpacing: 0.8 },
  hintFokus: { fontSize: 14, color: colors.text, fontWeight: '300', lineHeight: 22 },
  hintRad: { flexDirection: 'row', flexWrap: 'wrap' },
  hintSubLabel: { fontSize: 12, color: colors.muted2, fontWeight: '500' },
  hintVerdier: { fontSize: 12, color: colors.muted, fontWeight: '300', flex: 1 },
  knappeRad: { gap: 10, marginTop: 8 },
});
