import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, TextInput, ActivityIndicator
} from 'react-native';
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { colors } from '../../theme/colors';

const DAGER = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const UKER = [2, 3, 4, 6, 8];

const BACKEND = 'https://mshelse-server.onrender.com';

export default function ProgramBuilderScreen({ navigation, route }: any) {
  const eksisterendeProgram = route?.params?.program || null;
  const fraAssessment = route?.params?.fraAssessment || null;
  const fraReassessment = route?.params?.fraReassessment || null;
  const forrigeAssessment = route?.params?.forrigeAssessment || null;

  const starterAkt = eksisterendeProgram?.akt
    || fraReassessment?.akt
    || fraAssessment?.triage?.start_act
    || 1;

  const [tittel, setTittel] = useState(eksisterendeProgram?.tittel || '');
  const [valgteDager, setValgteDager] = useState<string[]>(eksisterendeProgram?.dager || ['Man', 'Ons', 'Fre']);
  const [uker, setUker] = useState(eksisterendeProgram?.uker || 4);
  const [akt, setAkt] = useState(starterAkt);
  const [ovelser, setOvelser] = useState<any[]>(eksisterendeProgram?.ovelser || []);
  const [tilgjengeligeOvelser, setTilgjengeligeOvelser] = useState<any[]>([]);
  const [visOvelsePicker, setVisOvelsePicker] = useState(false);
  const [lagrer, setLagrer] = useState(false);
  const [laster, setLaster] = useState(false);
  const [genererer, setGenererer] = useState(false);
  const [genFeil, setGenFeil] = useState<string | null>(null);
  const [venterPaRender, setVenterPaRender] = useState(false);
  const [genererHarKjørt, setGenererHarKjørt] = useState(false);
  const [valideringFeil, setValideringFeil] = useState<string | null>(null);

  useEffect(() => {
    hentOvelser();
  }, []);

  useEffect(() => {
    const skalGenerere = (fraReassessment || fraAssessment) && tilgjengeligeOvelser.length > 0 && !genererHarKjørt;
    if (skalGenerere) {
      setGenererHarKjørt(true);
      genererProgram(tilgjengeligeOvelser);
    }
  }, [tilgjengeligeOvelser]);

  async function hentOvelser() {
    setLaster(true);
    try {
      const snap = await getDocs(query(collection(db, 'exercises'), orderBy('name')));
      setTilgjengeligeOvelser(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLaster(false);
    }
  }

  async function genererProgram(ovelserListe: any[]) {
    setGenererer(true);
    setGenFeil(null);
    setVenterPaRender(false);
    const timer = setTimeout(() => setVenterPaRender(true), 5000);
    try {
      const body = fraReassessment
        ? { reassessment: fraReassessment, forrigeAssessment, ovelser: ovelserListe }
        : { fraAssessment, ovelser: ovelserListe };

      const res = await fetch(`${BACKEND}/api/generer-program`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 400 && err.error?.includes('Ingen øvelser')) {
          setGenFeil('tom_bibliotek');
        } else {
          setGenFeil('server_feil');
        }
        return;
      }
      const program = await res.json();
      if (program.tittel) setTittel(program.tittel);
      if (program.akt) setAkt(program.akt);
      if (program.uker) setUker(program.uker);
      if (program.dager?.length) setValgteDager(program.dager);
      if (program.ovelser?.length) setOvelser(program.ovelser);
    } catch (e) {
      console.error(e);
      setGenFeil('server_feil');
    } finally {
      clearTimeout(timer);
      setGenererer(false);
      setVenterPaRender(false);
    }
  }

  function toggleDag(dag: string) {
    setValgteDager(prev =>
      prev.includes(dag) ? prev.filter(d => d !== dag) : [...prev, dag]
    );
  }

  function leggTilOvelse(ovelse: any) {
    const formaal = ovelse.purposes?.[0] || null;
    setOvelser(prev => [...prev, {
      exerciseId: ovelse.id,
      navn: ovelse.name,
      purposeId: formaal?.id || 'default',
      formaalLabel: formaal?.label || '',
      instruksjon: formaal?.instruction || '',
      // Støtt både ny tracking_types og gammel tracking_type
      tracking_types: formaal?.tracking_types || (formaal?.tracking_type ? [formaal.tracking_type] : ['completed']),
      tracking_type: formaal?.tracking_types?.[0] || formaal?.tracking_type || 'completed',
      sets: 3,
      reps: 10,
      hold: ovelse.hold || null,
      tempo: ovelse.tempo || null,
    }]);
    setVisOvelsePicker(false);
  }

  function fjernOvelse(index: number) {
    setOvelser(prev => prev.filter((_, i) => i !== index));
  }

  function oppdaterOvelse(index: number, felt: string, verdi: any) {
    setOvelser(prev => prev.map((o, i) => i === index ? { ...o, [felt]: verdi } : o));
  }

  // Fix 2: byttFormaal slår nå opp i tilgjengeligeOvelser via exerciseId
  function byttFormaal(ovelseIndex: number, exerciseId: string, purposeId: string) {
    const tilgjOvelse = tilgjengeligeOvelser.find(o => o.id === exerciseId);
    const formaal = tilgjOvelse?.purposes?.find((p: any) => p.id === purposeId);
    if (!formaal) return;
    setOvelser(prev => prev.map((o, i) => i === ovelseIndex ? {
      ...o,
      purposeId,
      formaalLabel: formaal.label,
      instruksjon: formaal.instruction,
      tracking_types: formaal.tracking_types || (formaal.tracking_type ? [formaal.tracking_type] : ['completed']),
      tracking_type: formaal.tracking_types?.[0] || formaal.tracking_type || 'completed',
    } : o));
  }

  async function genererBaselineSporsmal(assessment: any): Promise<any[]> {
    try {
      const prompt = `Du er en klinisk fysioterapeut. Basert på denne kartleggingen, lag 2–3 korte funksjonelle spørsmål som måler brukerens funksjon NÅ – før rehabiliteringen starter. Spørsmålene skal kunne stilles igjen etter programmet for direkte sammenligning.

Kartlegging: ${assessment.tittel}
Mål: ${assessment.triage?.goal || ''}
Akt: ${assessment.triage?.start_act || 1}
Smertenivå: ${assessment.triage?.pain_level || 0}/10

Eksempler på gode spørsmål:
- "Kan du gå 20 minutter uten å stoppe pga smerte?"
- "Kan du sitte 1 time uten å måtte reise deg?"
- "Kjenner du stivhet om morgenen? (0=ingen, 10=veldig stiv)"

Svar KUN med JSON-array, ingen forklaringer:
[{"id":"q1","sporsmal":"..."},{"id":"q2","sporsmal":"..."}]`;

      const res = await fetch('https://mshelse-server.onrender.com/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: 'Svar kun med gyldig JSON-array. Ingen forklaringer eller markdown.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      const tekst = data.content?.[0]?.text?.trim() || '[]';
      const parsed = JSON.parse(tekst);
      return parsed.map((q: any) => ({ ...q, svar: null }));
    } catch (e) {
      console.error('Baseline-spørsmål feilet:', e);
      return [];
    }
  }

  async function lagre() {
    if (!tittel.trim()) { setValideringFeil('Programmet må ha et navn.'); return; }
    if (valgteDager.length === 0) { setValideringFeil('Velg minst én treningsdag.'); return; }
    setValideringFeil(null);
    const user = auth.currentUser;
    if (!user) return;
    setLagrer(true);

    // Generer baseline-spørsmål hvis program er basert på assessment
    let baselineSporsmal: any[] = [];
    if (fraAssessment && !eksisterendeProgram) {
      baselineSporsmal = await genererBaselineSporsmal(fraAssessment);
    }

    const data = {
      tittel: tittel.trim(),
      dager: valgteDager,
      uker,
      akt,
      ovelser,
      aktiv: true,
      okterFullfort: 0,
      okterTotalt: valgteDager.length * uker,
      uke: 1,
      source: 'user_created' as const,
      assessmentId: fraAssessment?.id || null,
      baselineSporsmal,
    };

    try {
      if (eksisterendeProgram) {
        await updateDoc(doc(db, 'users', user.uid, 'programs', eksisterendeProgram.id), data);
      } else {
        await addDoc(collection(db, 'users', user.uid, 'programs'), {
          ...data,
          opprettet: serverTimestamp(),
        });
      }
      navigation.navigate('MainTabs');
    } catch (e) {
      setValideringFeil('Noe gikk galt ved lagring. Prøv igjen.');
      console.error(e);
    } finally {
      setLagrer(false);
    }
  }

  if (genererer) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.tilbake}>Avbryt</Text>
          </TouchableOpacity>
          <Text style={s.topbarTittel}>Setter opp program</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.genererCenter}>
          <ActivityIndicator color={colors.green} size="large" />
          <Text style={s.genererTittel}>AI setter sammen program…</Text>
          <Text style={s.genererSub}>Velger øvelser og tilpasser til din situasjon</Text>
          {venterPaRender && (
            <Text style={s.genererVenter}>Kobler til server – kan ta 30–60 sek første gang…</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (genFeil === 'tom_bibliotek') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.tilbake}>← Tilbake</Text>
          </TouchableOpacity>
          <Text style={s.topbarTittel}>Nytt program</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.genererCenter}>
          <Text style={s.genererTittel}>Øvelsesbiblioteket er tomt</Text>
          <Text style={s.genererSub}>
            Legg til øvelser via admin-panelet i Profil-fanen, så kan AI sette sammen et program.
          </Text>
          <TouchableOpacity
            style={s.genererKnapp}
            onPress={() => navigation.navigate('AdminOvelse')}
          >
            <Text style={s.genererKnappTekst}>Gå til admin-panel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.genererSekundar}
            onPress={() => setGenFeil(null)}
          >
            <Text style={s.genererSekundarTekst}>Bygg program manuelt i stedet</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (genFeil === 'server_feil') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.tilbake}>← Tilbake</Text>
          </TouchableOpacity>
          <Text style={s.topbarTittel}>Nytt program</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.genererCenter}>
          <Text style={s.genererTittel}>Noe gikk galt</Text>
          <Text style={s.genererSub}>Klarte ikke å generere program. Sjekk internettforbindelsen og prøv igjen.</Text>
          <TouchableOpacity
            style={s.genererKnapp}
            onPress={() => genererProgram(tilgjengeligeOvelser)}
          >
            <Text style={s.genererKnappTekst}>Prøv igjen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.genererSekundar}
            onPress={() => setGenFeil(null)}
          >
            <Text style={s.genererSekundarTekst}>Bygg program manuelt i stedet</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (visOvelsePicker) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => setVisOvelsePicker(false)}>
            <Text style={s.tilbake}>← Tilbake</Text>
          </TouchableOpacity>
          <Text style={s.topbarTittel}>Velg øvelse</Text>
          <View style={{ width: 60 }} />
        </View>
        {laster ? (
          <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
        ) : (
          <ScrollView contentContainerStyle={s.inner}>
            {tilgjengeligeOvelser.length === 0 ? (
              <View style={s.tomKort}>
                <Text style={s.tomTekst}>Ingen øvelser i biblioteket ennå</Text>
                <Text style={s.tomSub}>Legg til øvelser via admin-panelet i profil</Text>
              </View>
            ) : (
              <View style={s.kort}>
                {tilgjengeligeOvelser.map((o, i) => (
                  <TouchableOpacity
                    key={o.id}
                    style={[s.ovelseRad, i < tilgjengeligeOvelser.length - 1 && s.ovelseRadBorder]}
                    onPress={() => leggTilOvelse(o)}
                  >
                    <View style={s.ovelseInfo}>
                      <Text style={s.ovelseNavn}>{o.name}</Text>
                      <Text style={s.ovelseMeta}>
                        {(o.bodyParts || []).join(', ')}
                        {o.purposes?.length ? ` · ${o.purposes.length} formål` : ''}
                      </Text>
                    </View>
                    <Text style={s.pil}>+</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.tilbake}>Avbryt</Text>
        </TouchableOpacity>
        <Text style={s.topbarTittel}>{eksisterendeProgram ? 'Rediger program' : 'Nytt program'}</Text>
        <TouchableOpacity onPress={lagre} disabled={lagrer}>
          {lagrer ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={s.lagreKnapp}>Lagre</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.inner}>

        {fraReassessment && (
          <View style={s.reassessmentBoks}>
            <Text style={s.assessmentLabel}>AI-GENERERT PROGRAM</Text>
            <Text style={s.assessmentTittel}>{fraReassessment.program_hint?.fokus || `Akt ${fraReassessment.akt} program`}</Text>
            <Text style={s.assessmentMeta}>
              {fraReassessment.konklusjon === 'neste_akt' ? 'Neste akt' :
               fraReassessment.konklusjon === 'intensiver' ? 'Økt vanskelighetsgrad' : 'Nytt program'}
              {' · Gjennomgå og juster etter behov'}
            </Text>
          </View>
        )}

        {fraAssessment && !fraReassessment && (
          <View style={s.assessmentBoks}>
            <Text style={s.assessmentLabel}>BASERT PÅ KARTLEGGING</Text>
            <Text style={s.assessmentTittel}>{fraAssessment.tittel}</Text>
            <Text style={s.assessmentMeta}>Akt {fraAssessment.triage?.start_act} · {fraAssessment.confidence}% confidence</Text>
          </View>
        )}

        <View style={s.feltGruppe}>
          <Text style={s.feltLabel}>NAVN</Text>
          <TextInput
            style={s.input}
            value={tittel}
            onChangeText={setTittel}
            placeholder="f.eks. Hoftstabilitet fase 1"
            placeholderTextColor={colors.muted2}
          />
        </View>

        <View style={s.feltGruppe}>
          <Text style={s.feltLabel}>AKT</Text>
          <View style={s.chipRad}>
            {[1, 2, 3].map(a => (
              <TouchableOpacity
                key={a}
                style={[s.chip, akt === a && s.chipAktiv]}
                onPress={() => setAkt(a)}
              >
                <Text style={[s.chipTekst, akt === a && s.chipTekstAktiv]}>Akt {a}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.feltGruppe}>
          <Text style={s.feltLabel}>TRENINGSDAGER</Text>
          <View style={s.dagRad}>
            {DAGER.map(dag => (
              <TouchableOpacity
                key={dag}
                style={[s.dagKnapp, valgteDager.includes(dag) && s.dagKnappAktiv]}
                onPress={() => toggleDag(dag)}
              >
                <Text style={[s.dagTekst, valgteDager.includes(dag) && s.dagTekstAktiv]}>{dag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.feltGruppe}>
          <Text style={s.feltLabel}>VARIGHET</Text>
          <View style={s.chipRad}>
            {UKER.map(u => (
              <TouchableOpacity
                key={u}
                style={[s.chip, uker === u && s.chipAktiv]}
                onPress={() => setUker(u)}
              >
                <Text style={[s.chipTekst, uker === u && s.chipTekstAktiv]}>{u} uker</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.feltGruppe}>
          <Text style={s.feltLabel}>ØVELSER</Text>
          {ovelser.length === 0 ? (
            <View style={s.tomKort}>
              <Text style={s.tomTekst}>Ingen øvelser lagt til</Text>
            </View>
          ) : (
            <View style={s.kort}>
              {ovelser.map((o, i) => {
                // Fix 2: Slå opp full øvelse fra tilgjengeligeOvelser for formålsbytte
                const tilgjOvelse = tilgjengeligeOvelser.find(t => t.id === o.exerciseId);
                const harFlereFormaal = (tilgjOvelse?.purposes?.length || 0) > 1;

                return (
                  <View key={i} style={[s.programOvelseRad, i < ovelser.length - 1 && s.ovelseRadBorder]}>
                    <View style={s.programOvelseInfo}>
                      <Text style={s.ovelseNavn}>{o.navn}</Text>
                      {o.formaalLabel ? <Text style={s.ovelseMeta}>{o.formaalLabel}</Text> : null}

                      {/* Fix 2: Formålsvelger synlig når øvelsen har flere formål */}
                      {harFlereFormaal && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.formaalScroll}>
                          {tilgjOvelse.purposes.map((p: any) => (
                            <TouchableOpacity
                              key={p.id}
                              style={[s.formaalChip, o.purposeId === p.id && s.formaalChipAktiv]}
                              onPress={() => byttFormaal(i, o.exerciseId, p.id)}
                            >
                              <Text style={[s.formaalChipTekst, o.purposeId === p.id && s.formaalChipTekstAktiv]}>
                                {p.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      )}

                      {/* Fix 7: Reps-stepper lagt til ved siden av sett-stepper */}
                      <View style={s.settsRad}>
                        <View style={s.settStepper}>
                          <TouchableOpacity onPress={() => oppdaterOvelse(i, 'sets', Math.max(1, o.sets - 1))}>
                            <Text style={s.stepperMini}>−</Text>
                          </TouchableOpacity>
                          <Text style={s.stepperMiniVerdi}>{o.sets} sett</Text>
                          <TouchableOpacity onPress={() => oppdaterOvelse(i, 'sets', o.sets + 1)}>
                            <Text style={s.stepperMini}>+</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={s.settStepper}>
                          <TouchableOpacity onPress={() => oppdaterOvelse(i, 'reps', Math.max(1, (o.reps || 10) - 1))}>
                            <Text style={s.stepperMini}>−</Text>
                          </TouchableOpacity>
                          <Text style={s.stepperMiniVerdi}>{o.reps || 10} reps</Text>
                          <TouchableOpacity onPress={() => oppdaterOvelse(i, 'reps', (o.reps || 10) + 1)}>
                            <Text style={s.stepperMini}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => fjernOvelse(i)}>
                      <Text style={s.fjernTekst}>×</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
          <TouchableOpacity style={s.leggTilOvelseKnapp} onPress={() => setVisOvelsePicker(true)}>
            <Text style={s.leggTilOvelseTekst}>+ Legg til øvelse</Text>
          </TouchableOpacity>
        </View>

        {valideringFeil && (
          <View style={s.valideringFeilBoks}>
            <Text style={s.valideringFeilTekst}>{valideringFeil}</Text>
          </View>
        )}

        <View style={s.oppsummering}>
          <Text style={s.oppsummeringTekst}>
            {valgteDager.length} dager/uke · {uker} uker · {valgteDager.length * uker} økter totalt
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  topbarTittel: { fontSize: 15, fontWeight: '500', color: colors.text },
  tilbake: { fontSize: 13, color: colors.muted, width: 60 },
  lagreKnapp: { fontSize: 13, color: colors.accent, fontWeight: '600', width: 60, textAlign: 'right' },
  inner: { padding: 16, paddingBottom: 60, gap: 20 },
  reassessmentBoks: { backgroundColor: colors.greenDim, borderWidth: 1.5, borderColor: colors.green, borderRadius: 14, padding: 14, gap: 4 },
  genererCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  genererTittel: { fontSize: 18, fontWeight: '300', color: colors.text, textAlign: 'center' },
  genererSub: { fontSize: 14, color: colors.muted, fontWeight: '300', textAlign: 'center', lineHeight: 22 },
  genererVenter: { fontSize: 12, color: colors.muted2, fontWeight: '300', textAlign: 'center', lineHeight: 20, marginTop: 8 },
  genererKnapp: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 28, paddingVertical: 13, alignItems: 'center' },
  genererKnappTekst: { color: colors.bg, fontSize: 15, fontWeight: '600' },
  genererSekundar: { padding: 10, alignItems: 'center' },
  genererSekundarTekst: { color: colors.muted, fontSize: 13, fontWeight: '300', textDecorationLine: 'underline' },
  assessmentBoks: { backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 14, padding: 14, gap: 4 },
  assessmentLabel: { fontSize: 10, color: colors.green, fontWeight: '500', letterSpacing: 0.8 },
  assessmentTittel: { fontSize: 15, color: colors.text, fontWeight: '400' },
  assessmentMeta: { fontSize: 12, color: colors.muted, fontWeight: '400' },
  feltGruppe: { gap: 10 },
  feltLabel: { fontSize: 11, color: colors.muted, fontWeight: '500', letterSpacing: 1.0 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 12, fontSize: 15, color: colors.text },
  chipRad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface },
  chipAktiv: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  chipTekst: { fontSize: 13, color: colors.muted },
  chipTekstAktiv: { color: colors.green, fontWeight: '500' },
  dagRad: { flexDirection: 'row', gap: 6 },
  dagKnapp: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface, alignItems: 'center' },
  dagKnappAktiv: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  dagTekst: { fontSize: 11, color: colors.muted, fontWeight: '400' },
  dagTekstAktiv: { color: colors.green, fontWeight: '500' },
  kort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  ovelseRad: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  ovelseRadBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  programOvelseRad: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10 },
  ovelseInfo: { flex: 1 },
  programOvelseInfo: { flex: 1, gap: 6 },
  ovelseNavn: { fontSize: 15, fontWeight: '500', color: colors.text },
  ovelseMeta: { fontSize: 12, color: colors.muted, fontWeight: '400' },
  pil: { fontSize: 18, color: colors.green, fontWeight: '500' },
  fjernTekst: { fontSize: 20, color: colors.muted2, paddingHorizontal: 4 },

  // Fix 7: sett + reps side om side
  settsRad: { flexDirection: 'row', gap: 8, marginTop: 4 },
  settStepper: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  stepperMini: { fontSize: 16, color: colors.text, paddingHorizontal: 4 },
  stepperMiniVerdi: { fontSize: 12, color: colors.text, fontWeight: '400', minWidth: 44, textAlign: 'center' },

  // Fix 2: formålsvelger per øvelse
  formaalScroll: { marginTop: 4, marginBottom: 2 },
  formaalChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface2, marginRight: 6 },
  formaalChipAktiv: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  formaalChipTekst: { fontSize: 11, color: colors.muted },
  formaalChipTekstAktiv: { color: colors.green },

  leggTilOvelseKnapp: { borderWidth: 1, borderColor: colors.border2, borderRadius: 10, borderStyle: 'dashed', padding: 14, alignItems: 'center' },
  leggTilOvelseTekst: { fontSize: 14, color: colors.muted, fontWeight: '400' },
  tomKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, alignItems: 'center', gap: 6 },
  tomTekst: { fontSize: 14, color: colors.muted, fontWeight: '400' },
  tomSub: { fontSize: 12, color: colors.muted2, fontWeight: '400', textAlign: 'center' },
  valideringFeilBoks: { backgroundColor: colors.dangerDim, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: 10, padding: 12 },
  valideringFeilTekst: { fontSize: 13, color: colors.danger, fontWeight: '400', textAlign: 'center' },
  oppsummering: { backgroundColor: colors.surface2, borderRadius: 8, padding: 12, alignItems: 'center' },
  oppsummeringTekst: { fontSize: 13, color: colors.muted, fontWeight: '300' },
});
