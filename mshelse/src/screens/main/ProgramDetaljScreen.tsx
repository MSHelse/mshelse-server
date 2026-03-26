import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert
} from 'react-native';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { colors } from '../../theme/colors';

function formaterDato(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
}

const TRACKING_LABEL: Record<string, string> = {
  activation_quality: 'Aktivering', contact_reps: 'Stabilitet',
  mobility: 'Mobilitet', sets_reps: 'Styrke',
  sets_reps_weight: 'Styrke + motstand', rpe: 'Utholdenhet',
  side_diff: 'Sideforskjell', completed: 'Fullført',
};

const DAGER_FULL: Record<string, string> = {
  Man: 'Mandag', Tir: 'Tirsdag', Ons: 'Onsdag',
  Tor: 'Torsdag', Fre: 'Fredag', Lør: 'Lørdag', Søn: 'Søndag',
};

const AKT_FARGE: Record<number, { bg: string; border: string; tekst: string }> = {
  1: { bg: colors.dangerDim, border: 'rgba(192,57,43,0.3)', tekst: colors.danger },
  2: { bg: colors.yellowDim, border: colors.yellowBorder, tekst: colors.yellow },
  3: { bg: colors.greenDim, border: colors.greenBorder, tekst: colors.green },
};

export default function ProgramDetaljScreen({ navigation, route }: any) {
  const program = route?.params?.program;
  const assessment = route?.params?.assessment || null;
  const [ovelseData, setOvelseData] = useState<Record<string, any>>({});
  const [laster, setLaster] = useState(true);

  useEffect(() => { hentOvelseData(); }, []);

  async function hentOvelseData() {
    const ids = [...new Set((program?.ovelser || []).map((o: any) => o.exerciseId).filter(Boolean))];
    if (ids.length === 0) { setLaster(false); return; }
    try {
      const snap = await getDocs(collection(db, 'exercises'));
      const map: Record<string, any> = {};
      snap.docs.forEach(d => { if (ids.includes(d.id)) map[d.id] = { id: d.id, ...d.data() }; });
      setOvelseData(map);
    } catch (e) { console.error(e); }
    finally { setLaster(false); }
  }

  async function slettProgram() {
    const user = auth.currentUser;
    if (!user || !program?.id) return;
    Alert.alert('Slett program', `Vil du slette "${program.tittel}"? Dette kan ikke angres.`, [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Slett', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'programs', program.id));
          navigation.goBack();
        } catch (e) { console.error(e); }
      }},
    ]);
  }

  if (!program) return (
    <SafeAreaView style={s.container}>
      <View style={s.center}><Text style={s.ingenTekst}>Fant ikke program</Text></View>
    </SafeAreaView>
  );

  const akt = program.akt ?? 1;
  const aktFarge = AKT_FARGE[akt] || AKT_FARGE[1];
  const fremgang = program.okterTotalt > 0
    ? Math.min(100, Math.round((program.okterFullfort / program.okterTotalt) * 100)) : 0;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.tilbake}>← Tilbake</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.inner}>

        <View style={s.header}>
          <View style={[s.aktBadge, { backgroundColor: aktFarge.bg, borderColor: aktFarge.border }]}>
            <Text style={[s.aktBadgeTekst, { color: aktFarge.tekst }]}>Akt {akt}</Text>
          </View>
          <Text style={s.tittel}>{program.tittel}</Text>
          <Text style={s.meta}>{program.uker} uker · {program.dager?.length || 0} dager/uke</Text>
          {program.opprettet && (
            <Text style={s.datoTekst}>Startet {formaterDato(program.opprettet)}</Text>
          )}
        </View>

        {program.okterTotalt > 0 && (
          <View style={s.fremdriftSeksjon}>
            <View style={s.fremdriftHeader}>
              <Text style={s.seksjonTittel}>FREMDRIFT</Text>
              <Text style={s.fremdriftProsent}>{fremgang}%</Text>
            </View>
            <View style={s.progBar}>
              <View style={[s.progFill, { width: `${fremgang}%` as any }]} />
            </View>
            <Text style={s.fremdriftTekst}>{program.okterFullfort} av {program.okterTotalt} økter fullført</Text>
          </View>
        )}

        {(program.dager || []).length > 0 && (
          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>TRENINGSDAGER</Text>
            <View style={s.dagChips}>
              {program.dager.map((d: string) => (
                <View key={d} style={s.dagChip}>
                  <Text style={s.dagChipTekst}>{DAGER_FULL[d] || d}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={s.seksjon}>
          <Text style={s.seksjonTittel}>ØVELSER ({(program.ovelser || []).length})</Text>
          {laster ? (
            <ActivityIndicator color={colors.muted} style={{ padding: 20 }} />
          ) : (
            <View style={s.ovelseListeKort}>
              {(program.ovelser || []).map((o: any, i: number) => {
                const bibliotekOvelse = ovelseData[o.exerciseId];
                const typer: string[] = o.tracking_types || (o.tracking_type ? [o.tracking_type] : []);
                const erKlikkbar = !!bibliotekOvelse;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[s.ovelseRad, i < (program.ovelser.length - 1) && s.ovelseRadBorder]}
                    onPress={() => erKlikkbar ? navigation.navigate('OvelseDetalj', {
                      ovelse: bibliotekOvelse,
                      personligKontekst: o.personligKontekst || null,
                    }) : null}
                    activeOpacity={erKlikkbar ? 0.7 : 1}
                  >
                    <View style={s.ovelseInfo}>
                      <View style={s.ovelseNavnRad}>
                        <Text style={s.ovelseNavn}>{o.navn}</Text>
                        {erKlikkbar && <Text style={s.ovelseChevron}>›</Text>}
                      </View>
                      {o.formaalLabel ? <Text style={s.ovelseFormaal}>{o.formaalLabel}</Text> : null}
                      <View style={s.ovelseMeta}>
                        <Text style={s.ovelseMetaTekst}>
                          {o.sets} sett · {o.reps} reps
                          {o.hold ? ` · Hold ${o.hold}s` : ''}
                          {o.tempo ? ` · Tempo ${o.tempo}` : ''}
                        </Text>
                        {typer.length > 0 && !typer.includes('completed') && (
                          <Text style={s.ovelseType}>
                            {typer.map((t: string) => TRACKING_LABEL[t] || t).join(' + ')}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

      </ScrollView>

      <View style={s.bunntBar}>
        <TouchableOpacity style={s.btnSlett} onPress={slettProgram}>
          <Text style={s.btnSlettTekst}>🗑</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSekundar} onPress={() => navigation.navigate('ProgramBuilder', { program })}>
          <Text style={s.btnSekundarTekst}>Rediger</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btnPrimary, { flex: 1 }]} onPress={() => navigation.navigate('AktivOkt', { program, assessment })}>
          <Text style={s.btnPrimaryTekst}>Start økt</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ingenTekst: { color: colors.muted, fontSize: 14 },
  topbar: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  tilbake: { fontSize: 15, color: colors.muted, fontWeight: '400' },
  inner: { padding: 20, paddingBottom: 100, gap: 20 },
  header: { gap: 8 },
  aktBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  aktBadgeTekst: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  tittel: { fontSize: 24, fontWeight: '300', color: colors.text, lineHeight: 32 },
  meta: { fontSize: 13, color: colors.muted, fontWeight: '300' },
  fremdriftSeksjon: { gap: 8 },
  fremdriftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fremdriftProsent: { fontSize: 13, color: colors.green, fontWeight: '500' },
  fremdriftTekst: { fontSize: 12, color: colors.muted2, fontWeight: '300' },
  progBar: { height: 4, backgroundColor: colors.border2, borderRadius: 2, overflow: 'hidden' },
  progFill: { height: '100%', backgroundColor: colors.green, borderRadius: 2 },
  seksjon: { gap: 10 },
  seksjonTittel: { fontSize: 11, color: colors.muted, fontWeight: '500', letterSpacing: 1.0 },
  dagChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dagChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  dagChipTekst: { fontSize: 13, color: colors.text, fontWeight: '400' },
  ovelseListeKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  ovelseRad: { padding: 14 },
  ovelseRadBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  ovelseInfo: { gap: 4 },
  ovelseNavnRad: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ovelseNavn: { fontSize: 15, fontWeight: '500', color: colors.text, flex: 1 },
  ovelseChevron: { fontSize: 18, color: colors.muted2 },
  ovelseFormaal: { fontSize: 12, color: colors.muted, fontWeight: '300' },
  ovelseMeta: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  ovelseMetaTekst: { fontSize: 12, color: colors.muted2, fontWeight: '300' },
  ovelseType: { fontSize: 11, color: colors.green, fontWeight: '400' },
  bunntBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 28, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  btnPrimary: { backgroundColor: colors.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
  btnPrimaryTekst: { color: colors.bg, fontSize: 15, fontWeight: '600' },
  btnSekundar: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 10, padding: 14, paddingHorizontal: 20, alignItems: 'center' },
  btnSekundarTekst: { color: colors.muted, fontSize: 14, fontWeight: '400' },
  btnSlett: { backgroundColor: colors.dangerDim, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: 10, padding: 14, paddingHorizontal: 14, alignItems: 'center' },
  btnSlettTekst: { color: colors.danger, fontSize: 15 },
  datoTekst: { fontSize: 11, color: colors.muted2, fontWeight: '300' },
});
