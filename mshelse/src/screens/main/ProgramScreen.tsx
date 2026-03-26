import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, ActivityIndicator
} from 'react-native';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { colors } from '../../theme/colors';

const AKT_BESKRIVELSE: Record<number, { tittel: string; tekst: string }> = {
  1: { tittel: 'Fase 1 – Få kontroll', tekst: 'Fokus er å forstå hva som skjer og redusere smerte. Øvelsene er skånsomme og målrettede.' },
  2: { tittel: 'Fase 2 – Rette opp', tekst: 'Smerten er under kontroll. Nå jobber vi med bevegelseskvalitet og kompensasjonsmønstre.' },
  3: { tittel: 'Fase 3 – Vokse', tekst: 'Du er klar for progressiv belastning. Målet er å bli sterkere enn du var før plagene.' },
};

const AKT_FARGE: Record<number, { bg: string; border: string; tekst: string }> = {
  1: { bg: colors.dangerDim, border: 'rgba(192,57,43,0.3)', tekst: colors.danger },
  2: { bg: colors.yellowDim, border: colors.yellowBorder, tekst: colors.yellow },
  3: { bg: colors.greenDim, border: colors.greenBorder, tekst: colors.green },
};

export default function ProgramScreen({ navigation }: any) {
  const [laster, setLaster] = useState(true);
  const [programmer, setProgrammer] = useState<any[]>([]);
  const [sisteAssessment, setSisteAssessment] = useState<any>(null);

  useEffect(() => { hentData(); }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => hentData());
    return unsub;
  }, [navigation]);

  async function hentData() {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const [progSnap, assessSnap] = await Promise.all([
        getDocs(query(collection(db, 'users', user.uid, 'programs'), orderBy('opprettet', 'desc'))),
        getDocs(query(collection(db, 'users', user.uid, 'assessments'), orderBy('dato', 'desc'))),
      ]);
      setProgrammer(progSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (!assessSnap.empty) {
        setSisteAssessment({ id: assessSnap.docs[0].id, ...assessSnap.docs[0].data() });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLaster(false);
    }
  }

  const aktiveProgrammer = programmer.filter(p => p.aktiv);
  const arkiverte = programmer.filter(p => !p.aktiv);
  const akt = sisteAssessment?.triage?.start_act;
  const aktInfo = akt ? AKT_BESKRIVELSE[akt] : null;
  const aktFarge = akt ? AKT_FARGE[akt] : null;

  if (laster) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <Text style={s.tittel}>Programmer</Text>
        <TouchableOpacity style={s.nyttKnapp} onPress={() => navigation.navigate('ProgramBuilder')}>
          <Text style={s.nyttKnappTekst}>+ Nytt</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.inner}>

        {sisteAssessment && (
          <View style={s.aiBox}>
            <View style={s.aiTopRad}>
              <Text style={s.aiLabel}>AI-COACH</Text>
              {akt && aktFarge && (
                <View style={[s.aktBadge, { backgroundColor: aktFarge.bg, borderColor: aktFarge.border }]}>
                  <Text style={[s.aktBadgeTekst, { color: aktFarge.tekst }]}>Akt {akt}</Text>
                </View>
              )}
            </View>

            {aktInfo && (
              <View style={s.aiFaseKort}>
                <Text style={s.aiFaseTittel}>{aktInfo.tittel}</Text>
                <Text style={s.aiFaseTekst}>{aktInfo.tekst}</Text>
              </View>
            )}

            <Text style={s.aiBody}>
              Basert på <Text style={s.aiBodyBold}>{sisteAssessment.tittel}</Text>
              {sisteAssessment.triage?.goal ? ` – mål: ${sisteAssessment.triage.goal}` : ''}
            </Text>

            {sisteAssessment.triage?.next_step ? (
              <Text style={s.nextStep}>{sisteAssessment.triage.next_step}</Text>
            ) : null}

            <TouchableOpacity
              style={s.aiKnapp}
              onPress={() => navigation.navigate('ProgramBuilder', {
                fraAssessment: {
                  id: sisteAssessment.id,
                  tittel: sisteAssessment.tittel,
                  confidence: sisteAssessment.confidence,
                  triage: sisteAssessment.triage,
                  findings: sisteAssessment.funn || sisteAssessment.findings || [],
                  kandidater: sisteAssessment.kandidater || sisteAssessment.candidates || [],
                  livsstil: sisteAssessment.livsstil || sisteAssessment.lifestyle || null,
                  bekreftende: sisteAssessment.bekreftende || sisteAssessment.confirmatory || null,
                  summary: sisteAssessment.oppsummering || sisteAssessment.summary || '',
                }
              })}
            >
              <Text style={s.aiKnappTekst}>Lag program med AI →</Text>
            </TouchableOpacity>
          </View>
        )}

        {aktiveProgrammer.length > 0 && (
          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>AKTIVE PROGRAMMER</Text>
            <View style={s.kortListe}>
              {aktiveProgrammer.map((p, i) => {
                const fremgang = p.okterTotalt > 0
                  ? Math.min(100, Math.round((p.okterFullfort / p.okterTotalt) * 100))
                  : 0;
                const pAktFarge = p.akt ? AKT_FARGE[p.akt] : null;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.programKort, i < aktiveProgrammer.length - 1 && s.programKortBorder]}
                    onPress={() => navigation.navigate('ProgramDetalj', { program: p, assessment: sisteAssessment })}
                  >
                    <View style={s.programKortTopp}>
                      <View style={s.programKortInfo}>
                        {p.akt && pAktFarge && (
                          <View style={[s.aktTag, { backgroundColor: pAktFarge.bg, borderColor: pAktFarge.border }]}>
                            <Text style={[s.aktTagTekst, { color: pAktFarge.tekst }]}>Akt {p.akt}</Text>
                          </View>
                        )}
                        <Text style={s.programTittel}>{p.tittel}</Text>
                        <Text style={s.programMeta}>
                          {p.dager?.join(' · ')}
                          {p.uker ? ` · ${p.uker} uker` : ''}
                          {p.ovelser?.length ? ` · ${p.ovelser.length} øvelser` : ''}
                        </Text>
                      </View>
                      <Text style={s.chevron}>›</Text>
                    </View>
                    {p.okterTotalt > 0 && (
                      <View style={s.progresjon}>
                        <View style={s.progBar}>
                          <View style={[s.progFill, { width: `${fremgang}%` as any }]} />
                        </View>
                        <Text style={s.progTekst}>{fremgang}% · {p.okterFullfort ?? 0}/{p.okterTotalt} økter</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={s.startKnapp}
                      onPress={() => navigation.navigate('AktivOkt', { program: p, assessment: sisteAssessment })}
                    >
                      <Text style={s.startKnappTekst}>Start økt →</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {aktiveProgrammer.length === 0 && (
          <View style={s.ingenKort}>
            <Text style={s.ingenTittel}>Ingen aktivt program</Text>
            <Text style={s.ingenSub}>Lag et program basert på kartleggingen din, eller bygg ditt eget.</Text>
            <TouchableOpacity style={s.btnPrimary} onPress={() => navigation.navigate('ProgramBuilder')}>
              <Text style={s.btnPrimaryTekst}>Bygg program</Text>
            </TouchableOpacity>
          </View>
        )}

        {arkiverte.length > 0 && (
          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>ARKIVERTE PROGRAMMER</Text>
            <View style={s.kortListe}>
              {arkiverte.map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  style={[s.programKort, s.programKortDimmet, i < arkiverte.length - 1 && s.programKortBorder]}
                  onPress={() => navigation.navigate('ProgramDetalj', { program: p, assessment: sisteAssessment })}
                >
                  <Text style={s.programTittelDimmet}>{p.tittel}</Text>
                  <Text style={s.programMeta}>
                    {p.uker ? `${p.uker} uker · ` : ''}
                    {p.ovelser?.length ? `${p.ovelser.length} øvelser` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  tittel: { fontSize: 22, fontWeight: '300', color: colors.text },
  nyttKnapp: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  nyttKnappTekst: { fontSize: 13, color: colors.text, fontWeight: '500' },
  inner: { padding: 16, paddingBottom: 40, gap: 20 },
  seksjon: { gap: 10 },
  seksjonTittel: { fontSize: 11, color: colors.muted, fontWeight: '500', letterSpacing: 1.0 },
  aiBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, gap: 12 },
  aiTopRad: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  aiLabel: { fontSize: 10, color: colors.muted, fontWeight: '500', letterSpacing: 1.0 },
  aktBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  aktBadgeTekst: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  aiFaseKort: { backgroundColor: colors.surface2, borderRadius: 10, padding: 12, gap: 4 },
  aiFaseTittel: { fontSize: 13, fontWeight: '500', color: colors.text },
  aiFaseTekst: { fontSize: 12, color: colors.muted, fontWeight: '300', lineHeight: 18 },
  aiBody: { fontSize: 13, color: colors.muted, fontWeight: '300', lineHeight: 20 },
  aiBodyBold: { color: colors.text, fontWeight: '400' },
  nextStep: { fontSize: 12, color: colors.muted2, fontWeight: '300', fontStyle: 'italic' },
  aiKnapp: { backgroundColor: colors.accent, borderRadius: 8, padding: 12, alignItems: 'center' },
  aiKnappTekst: { color: colors.bg, fontSize: 14, fontWeight: '600' },
  kortListe: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  programKort: { padding: 14, gap: 10 },
  programKortBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  programKortDimmet: { opacity: 0.5 },
  programKortTopp: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  programKortInfo: { flex: 1, gap: 4 },
  aktTag: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  aktTagTekst: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
  programTittel: { fontSize: 15, fontWeight: '500', color: colors.text },
  programTittelDimmet: { fontSize: 14, fontWeight: '400', color: colors.muted },
  programMeta: { fontSize: 12, color: colors.muted, fontWeight: '300' },
  chevron: { fontSize: 18, color: colors.muted2 },
  progresjon: { gap: 4 },
  progBar: { height: 3, backgroundColor: colors.border2, borderRadius: 2, overflow: 'hidden' },
  progFill: { height: '100%', backgroundColor: colors.green, borderRadius: 2 },
  progTekst: { fontSize: 11, color: colors.muted2, fontWeight: '300' },
  startKnapp: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 10, alignItems: 'center' },
  startKnappTekst: { fontSize: 13, color: colors.text, fontWeight: '500' },
  ingenKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 24, alignItems: 'center', gap: 12 },
  ingenTittel: { fontSize: 16, fontWeight: '400', color: colors.text },
  ingenSub: { fontSize: 13, color: colors.muted, fontWeight: '300', textAlign: 'center', lineHeight: 20 },
  btnPrimary: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 24 },
  btnPrimaryTekst: { color: colors.bg, fontSize: 14, fontWeight: '600' },
});
