import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, Modal,
} from 'react-native';
import VideoSpiller from '../../components/VideoSpiller';
import AnatomyViewer from '../../components/AnatomyViewer';
import { colors } from '../../theme/colors';

const AKT_FARGE: Record<number, { bg: string; border: string; tekst: string }> = {
  1: { bg: colors.dangerDim, border: 'rgba(192,57,43,0.3)', tekst: colors.danger },
  2: { bg: colors.yellowDim, border: colors.yellowBorder, tekst: colors.yellow },
  3: { bg: colors.greenDim, border: colors.greenBorder, tekst: colors.green },
};

const AKT_FORKLARING: Record<number, string> = {
  1: 'Kontroll og demping – beregnet for akutt og subakutt fase med smerter. Fokus på deaktivering, mobilisering og lavterskel aktivering.',
  2: 'Rette opp – aktivering med progresjon. Adresserer kompensasjonsmønstre og bygger opp stabilitet og kontroll.',
  3: 'Vokse – progressiv styrke og utholdenhet. For brukere uten aktive smerter som ønsker livslang trening.',
};

const TRACKING_LABEL: Record<string, string> = {
  activation_quality: 'Kontaktkvalitet (0–10)',
  contact_reps:       'Reps med god kontakt',
  sets_reps:          'Sett/reps',
  sets_reps_weight:   'Sett/reps/motstand',
  mobility:           'Bevegelsesfølelse (0–10)',
  rpe:                'Anstrengelse (RPE)',
  side_diff:          'Sideforskjell (0–10)',
  completed:          'Fullført',
};

const TRACKING_INFO: Record<string, { tittel: string; tekst: string; eksempel?: string }> = {
  activation_quality: { tittel: 'Kontaktkvalitet', tekst: 'Hvor godt klarer du å aktivere riktig muskel uten at andre tar over?', eksempel: '3 = kjenner litt. 8 = tydelig isolert kontakt gjennom hele settet.' },
  contact_reps: { tittel: 'Reps med god kontakt', tekst: 'Tell kun repsene der du kjenner at riktig muskel jobber. Stopp når en annen muskel tar over.', eksempel: '12 reps totalt, mister kontakt på rep 9 → logg 8.' },
  rpe: { tittel: 'Anstrengelse (RPE)', tekst: 'Hvor hardt kjennes belastningen totalt etter settet?', eksempel: '1–3 = lett. 4–6 = moderat. 7–8 = hardt. 9–10 = nær maks.' },
  mobility: { tittel: 'Bevegelsesfølelse', tekst: 'Hvordan oppleves bevegelsen? Fokuser på kvalitet – fri og smertefri, eller stiv og begrenset?', eksempel: '1–3 = stiv. 5–6 = noe friksjon. 8–10 = fri og smertefri.' },
  side_diff: { tittel: 'Sideforskjell', tekst: 'Hvor stor er forskjellen mellom høyre og venstre side? 0 = ingen forskjell, 10 = stor forskjell.', eksempel: 'Venstre side føles halvparten så sterk → logg 5.' },
  sets_reps: { tittel: 'Sett/reps', tekst: 'Standard sett- og repregistrering. Tell alle reps du fullfører.' },
  sets_reps_weight: { tittel: 'Sett/reps/motstand', tekst: 'Registrer reps og vekt/motstand per sett.' },
  completed: { tittel: 'Fullført', tekst: 'Marker settet som fullført uten detaljert tracking.' },
};

export default function OvelseDetaljScreen({ navigation, route }: any) {
  const ovelse = route?.params?.ovelse;
  const personligKontekst: string | null = route?.params?.personligKontekst || null;
  const [visAktModal, setVisAktModal] = useState<number | null>(null);
  const [visTrackingModal, setVisTrackingModal] = useState<string | null>(null);
  // Støtt både ny flat struktur og gammel purposes[]-struktur
  const instruksjonTekst: string = ovelse?.instruksjon || ovelse?.purposes?.[0]?.instruction || '';
  const formaalLabelTekst: string = ovelse?.formaalLabel || ovelse?.purposes?.[0]?.label || '';

  if (!ovelse) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <Text style={s.feilTekst}>Øvelse ikke funnet</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.tilbake}>← Tilbake</Text>
        </TouchableOpacity>
        <Text style={s.topbarTittel} numberOfLines={1}>{ovelse.name}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={s.inner}>

        {ovelse.videoUrl && <VideoSpiller url={ovelse.videoUrl} />}

        {ovelse.feilVideoUrl && (
          <View>
            <View style={s.feilLabel}>
              <View style={s.feilDot} />
              <Text style={s.feilLabelTekst}>Unngå dette</Text>
            </View>
            <VideoSpiller url={ovelse.feilVideoUrl} />
          </View>
        )}

        {personligKontekst && (
          <View style={s.seksjon}>
            <View style={s.kontekstKort}>
              <Text style={s.kontekstLabel}>FOR DEG SPESIELT</Text>
              <Text style={s.kontekstTekst}>{personligKontekst}</Text>
            </View>
          </View>
        )}

        {instruksjonTekst ? (
          <View style={s.seksjon}>
            {formaalLabelTekst ? (
              <Text style={s.seksjonTittel}>{formaalLabelTekst.toUpperCase()}</Text>
            ) : null}
            <View style={s.instruksjonKort}>
              <Text style={s.instruksjonTekst}>{instruksjonTekst}</Text>
            </View>
          </View>
        ) : null}

        {/* Ny AnatomyViewer – bruker anatomi-feltet fra Firestore */}
        {(ovelse.anatomi || ovelse.muskelgrupper) && (
          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>ANATOMI</Text>
            <View style={s.anatomiKort}>
              <AnatomyViewer
                anatomi={ovelse.anatomi || { anterior: [], posterior: [] }}
                muskelgrupper={ovelse.muskelgrupper}
              />
            </View>
          </View>
        )}

        {((ovelse.act || []).length > 0 || (ovelse.tracking_types || ovelse.tracking_type)) && (
          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>OM ØVELSEN</Text>

            {(ovelse.act || []).length > 0 && (
              <View style={s.tagRad}>
                {ovelse.act.map((a: number) => (
                  <View key={a} style={s.tagPar}>
                    <View style={[s.aktTag, AKT_FARGE[a] && { backgroundColor: AKT_FARGE[a].bg, borderColor: AKT_FARGE[a].border }]}>
                      <Text style={[s.aktTagTekst, AKT_FARGE[a] && { color: AKT_FARGE[a].tekst }]}>Akt {a}</Text>
                    </View>
                    <TouchableOpacity style={s.infoChip} onPress={() => setVisAktModal(a)}>
                      <Text style={s.infoChipTekst}>?</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {(ovelse.tracking_types || (ovelse.tracking_type ? [ovelse.tracking_type] : [])).length > 0 && (
              <View style={s.tagRad}>
                {(ovelse.tracking_types || [ovelse.tracking_type]).map((t: string) => (
                  <View key={t} style={s.tagPar}>
                    <View style={s.trackingChip}>
                      <Text style={s.trackingChipTekst}>{TRACKING_LABEL[t] || t}</Text>
                    </View>
                    {TRACKING_INFO[t] && (
                      <TouchableOpacity style={s.infoChip} onPress={() => setVisTrackingModal(t)}>
                        <Text style={s.infoChipTekst}>?</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* Akt-forklaring modal */}
      <Modal visible={visAktModal !== null} transparent animationType="fade" onRequestClose={() => setVisAktModal(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setVisAktModal(null)}>
          <View style={s.modalKort} onStartShouldSetResponder={() => true}>
            <Text style={s.modalTittel}>Akt {visAktModal}</Text>
            <Text style={s.modalTekst}>{visAktModal ? AKT_FORKLARING[visAktModal] : ''}</Text>
            <TouchableOpacity onPress={() => setVisAktModal(null)}>
              <Text style={s.modalLukk}>Lukk</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Tracking-type modal */}
      <Modal visible={visTrackingModal !== null} transparent animationType="fade" onRequestClose={() => setVisTrackingModal(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setVisTrackingModal(null)}>
          <View style={s.modalKort} onStartShouldSetResponder={() => true}>
            {visTrackingModal && TRACKING_INFO[visTrackingModal] && (
              <>
                <Text style={s.modalTittel}>{TRACKING_INFO[visTrackingModal].tittel}</Text>
                <Text style={s.modalTekst}>{TRACKING_INFO[visTrackingModal].tekst}</Text>
                {TRACKING_INFO[visTrackingModal].eksempel && (
                  <Text style={s.modalEksempel}>{TRACKING_INFO[visTrackingModal].eksempel}</Text>
                )}
              </>
            )}
            <TouchableOpacity onPress={() => setVisTrackingModal(null)}>
              <Text style={s.modalLukk}>Lukk</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  feilTekst: { color: colors.muted, fontSize: 14 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  topbarTittel: { fontSize: 15, fontWeight: '500', color: colors.text, flex: 1, textAlign: 'center' },
  tilbake: { fontSize: 13, color: colors.muted, width: 60 },
  inner: { paddingBottom: 40 },
  feilLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, paddingBottom: 4, backgroundColor: colors.surface2 },
  feilDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  feilLabelTekst: { fontSize: 12, color: colors.danger, fontWeight: '500', letterSpacing: 0.4 },
  seksjon: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.border },
  seksjonTittel: { fontSize: 11, color: colors.muted, fontWeight: '500', letterSpacing: 1.0 },
  kontekstKort: { backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 14, padding: 14, gap: 6 },
  kontekstLabel: { fontSize: 10, color: colors.green, fontWeight: '600', letterSpacing: 1.0 },
  kontekstTekst: { fontSize: 14, color: colors.text, fontWeight: '400', lineHeight: 22 },
  instruksjonKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14 },
  instruksjonTekst: { fontSize: 14, color: colors.text, fontWeight: '400', lineHeight: 22 },
  anatomiKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, alignItems: 'center' },
  tagRad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagPar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aktTag: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  aktTagTekst: { fontSize: 11, fontWeight: '500' },
  trackingChip: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  trackingChipTekst: { fontSize: 11, color: colors.muted, fontWeight: '400' },
  infoChip: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center' },
  infoChipTekst: { fontSize: 10, color: colors.muted2, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, width: '100%', gap: 10 },
  modalTittel: { fontSize: 17, fontWeight: '500', color: colors.text },
  modalTekst: { fontSize: 14, color: colors.muted, fontWeight: '300', lineHeight: 20 },
  modalEksempel: { fontSize: 13, color: colors.muted2, fontWeight: '300', fontStyle: 'italic' },
  modalLukk: { fontSize: 14, color: colors.accent, fontWeight: '500', textAlign: 'right', marginTop: 4 },
});
