import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView
} from 'react-native';
import { colors } from '../../theme/colors';

const AKT_FARGE: Record<number, { bg: string; border: string; tekst: string }> = {
  1: { bg: colors.dangerDim,  border: 'rgba(192,57,43,0.3)',   tekst: colors.danger },
  2: { bg: colors.orangeDim,  border: colors.orangeBorder,     tekst: colors.orange },
  3: { bg: colors.yellowDim,  border: colors.yellowBorder,     tekst: colors.yellow },
  4: { bg: colors.greenDim,   border: colors.greenBorder,      tekst: colors.green  },
};

const AKT_LABEL: Record<number, string> = {
  1: 'Få kontroll',
  2: 'Lett stabilitet',
  3: 'Tyngre stabilitet',
  4: 'Bygg styrke',
};

const KONKLUSJON_LABEL: Record<string, string> = {
  neste_akt:      'Klar for neste akt',
  intensiver:     'Øker vanskelighetsgraden',
  fortsett:       'Fortsett programmet',
  ny_kartlegging: 'Ny kartlegging anbefales',
};

export default function KartleggingDetaljScreen({ navigation, route }: any) {
  const assessment = route?.params?.assessment;

  if (!assessment) return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.tilbake}>← Tilbake</Text>
        </TouchableOpacity>
      </View>
      <View style={s.center}>
        <Text style={s.ingenTekst}>Fant ikke kartleggingen</Text>
      </View>
    </SafeAreaView>
  );

  const erReassessment = assessment.type === 'reassessment';
  const akt = assessment.triage?.start_act ?? 1;
  const aktFarge = AKT_FARGE[akt] || AKT_FARGE[1];

  function formatDato(dato: any) {
    if (!dato) return '–';
    const d = dato.toDate ? dato.toDate() : new Date(dato);
    return d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.tilbake}>← Tilbake</Text>
        </TouchableOpacity>
        <Text style={s.topbarTittel}>
          {erReassessment ? 'Statussjekk' : 'Kartlegging'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={s.inner}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.dato}>{formatDato(assessment.dato)}</Text>
          <View style={[s.aktBadge, { backgroundColor: aktFarge.bg, borderColor: aktFarge.border }]}>
            <Text style={[s.aktBadgeTekst, { color: aktFarge.tekst }]}>
              {erReassessment && assessment.konklusjon
                ? KONKLUSJON_LABEL[assessment.konklusjon] || assessment.konklusjon
                : `Akt ${akt} · ${AKT_LABEL[akt]}`}
            </Text>
          </View>
          <Text style={s.tittel}>{assessment.tittel}</Text>
          {!erReassessment && assessment.confidence != null && (
            <View style={s.confRow}>
              <View style={s.confBar}>
                <View style={[s.confFill, { width: `${assessment.confidence}%` as any }]} />
              </View>
              <Text style={s.confTekst}>{assessment.confidence}% sikkerhet</Text>
            </View>
          )}
        </View>

        {/* Reassessment-spesifikt */}
        {erReassessment && (
          <>
            {assessment.begrunnelse ? (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>VURDERING</Text>
                <View style={s.kort}>
                  <Text style={s.kortBody}>{assessment.begrunnelse}</Text>
                </View>
              </View>
            ) : null}
            {assessment.neste_steg ? (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>NESTE STEG</Text>
                <View style={[s.kort, s.kortGrønn]}>
                  <Text style={s.kortBody}>{assessment.neste_steg}</Text>
                </View>
              </View>
            ) : null}
            {assessment.program_hint?.fokus ? (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>NESTE PROGRAM</Text>
                <View style={s.kort}>
                  <Text style={s.kortBody}>{assessment.program_hint.fokus}</Text>
                  {(assessment.program_hint.prioriter || []).length > 0 && (
                    <Text style={s.kortMeta}>Prioriter: {assessment.program_hint.prioriter.join(' · ')}</Text>
                  )}
                  {(assessment.program_hint.unngå || []).length > 0 && (
                    <Text style={s.kortMeta}>Ikke ennå: {assessment.program_hint.unngå.join(' · ')}</Text>
                  )}
                </View>
              </View>
            ) : null}
          </>
        )}

        {/* Vanlig kartlegging */}
        {!erReassessment && (
          <>
            {/* Kandidater */}
            {(assessment.kandidater || assessment.candidates || []).length > 0 && (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>VURDERING</Text>
                {(assessment.kandidater || assessment.candidates).map((k: any) => (
                  <View key={k.rank} style={[s.kort, k.rank === 1 && s.kortPrimar]}>
                    <Text style={[s.kortLabel, k.rank === 1 && s.kortLabelPrimar]}>{k.label}</Text>
                    <Text style={s.kortTittel}>{k.title}</Text>
                    <Text style={s.kortBody}>{k.reasoning}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Funn */}
            {(assessment.funn || assessment.findings || []).length > 0 && (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>VIKTIGE FUNN</Text>
                {(assessment.funn || assessment.findings).map((f: any, i: number) => (
                  <View key={i} style={s.kort}>
                    {f.tag ? <Text style={s.kortTag}>{f.tag}</Text> : null}
                    <Text style={s.kortTittel}>{f.title}</Text>
                    <Text style={s.kortBody}>{f.body}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Livsstil */}
            {(assessment.livsstil || assessment.lifestyle)?.body ? (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>BAKGRUNN</Text>
                <View style={s.kort}>
                  <Text style={s.kortTittel}>{(assessment.livsstil || assessment.lifestyle).title}</Text>
                  <Text style={s.kortBody}>{(assessment.livsstil || assessment.lifestyle).body}</Text>
                </View>
              </View>
            ) : null}

            {/* Bekreftende */}
            {(assessment.bekreftende || assessment.confirmatory)?.body ? (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>DET DU SANNSYNLIGVIS KJENNER IGJEN</Text>
                <View style={s.kort}>
                  <Text style={s.kortBody}>{(assessment.bekreftende || assessment.confirmatory).body}</Text>
                </View>
              </View>
            ) : null}

            {/* Oppsummering */}
            {(assessment.oppsummering || assessment.summary) ? (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>OPPSUMMERING</Text>
                <View style={s.kort}>
                  <Text style={s.kortBody}>{assessment.oppsummering || assessment.summary}</Text>
                </View>
              </View>
            ) : null}

            {/* Triage */}
            {assessment.triage && (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>ANBEFALING</Text>
                <View style={s.triageKort}>
                  {assessment.triage.pain_level != null && (
                    <View style={s.triageRad}>
                      <Text style={s.triageEtikett}>Smertenivå ved start</Text>
                      <Text style={s.triageVerdi}>{assessment.triage.pain_level}/10</Text>
                    </View>
                  )}
                  {assessment.triage.goal ? (
                    <View style={s.triageRad}>
                      <Text style={s.triageEtikett}>Mål</Text>
                      <Text style={s.triageVerdi}>{assessment.triage.goal}</Text>
                    </View>
                  ) : null}
                  {assessment.triage.next_step ? (
                    <View style={[s.triageRad, { flexDirection: 'column', gap: 4 }]}>
                      <Text style={s.triageEtikett}>Neste steg</Text>
                      <Text style={s.kortBody}>{assessment.triage.next_step}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ingenTekst: { fontSize: 14, color: colors.muted },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  topbarTittel: { fontSize: 15, fontWeight: '500', color: colors.text },
  tilbake: { fontSize: 13, color: colors.muted, width: 60 },
  inner: { padding: 20, paddingBottom: 60, gap: 20 },
  header: { gap: 10 },
  dato: { fontSize: 12, color: colors.muted2, fontWeight: '300' },
  aktBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  aktBadgeTekst: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  tittel: { fontSize: 22, fontWeight: '300', color: colors.text, lineHeight: 30 },
  confRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confBar: { flex: 1, height: 3, backgroundColor: colors.border2, borderRadius: 2, overflow: 'hidden' },
  confFill: { height: '100%', backgroundColor: colors.green, borderRadius: 2 },
  confTekst: { fontSize: 11, color: colors.green, fontWeight: '500' },
  seksjon: { gap: 8 },
  seksjonTittel: { fontSize: 10, color: colors.muted, fontWeight: '500', letterSpacing: 0.8 },
  kort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 6 },
  kortPrimar: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  kortGrønn: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  kortLabel: { fontSize: 11, color: colors.muted, fontWeight: '500', letterSpacing: 0.6, textTransform: 'uppercase' },
  kortLabelPrimar: { color: colors.green },
  kortTag: { fontSize: 11, color: colors.muted, fontWeight: '500', letterSpacing: 0.6 },
  kortTittel: { fontSize: 15, color: colors.text, fontWeight: '400', lineHeight: 22 },
  kortBody: { fontSize: 13, color: colors.muted, fontWeight: '300', lineHeight: 20 },
  kortMeta: { fontSize: 12, color: colors.muted2, fontWeight: '300', marginTop: 4 },
  triageKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 12 },
  triageRad: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  triageEtikett: { fontSize: 13, color: colors.muted, fontWeight: '300' },
  triageVerdi: { fontSize: 14, color: colors.text, fontWeight: '500' },
});
