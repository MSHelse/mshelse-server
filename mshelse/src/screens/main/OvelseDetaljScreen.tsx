import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, Image
} from 'react-native';
import VideoSpiller from '../../components/VideoSpiller';
import { colors } from '../../theme/colors';

export default function OvelseDetaljScreen({ navigation, route }: any) {
  const ovelse = route?.params?.ovelse;
  const personligKontekst: string | null = route?.params?.personligKontekst || null;
  const [valgtFormaal, setValgtFormaal] = useState(ovelse?.purposes?.[0] || null);

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

        {ovelse.purposes?.length > 1 && (
          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>FORMÅL</Text>
            <View style={s.formaalRad}>
              {ovelse.purposes.map((p: any) => (
                <TouchableOpacity
                  key={p.id}
                  style={[s.formaalKnapp, valgtFormaal?.id === p.id && s.formaalKnappAktiv]}
                  onPress={() => setValgtFormaal(p)}
                >
                  <Text style={[s.formaalTekst, valgtFormaal?.id === p.id && s.formaalTekstAktiv]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {valgtFormaal?.instruction && (
          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>INSTRUKSJON</Text>
            <View style={s.instruksjonKort}>
              <Text style={s.instruksjonTekst}>{valgtFormaal.instruction}</Text>
            </View>
          </View>
        )}

        {ovelse.anatomyImageUrl && (
          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>ANATOMI</Text>
            <View style={s.anatomiWrapper}>
              <Image
                source={{ uri: ovelse.anatomyImageUrl }}
                style={s.anatomiImage}
                resizeMode="contain"
              />
            </View>
          </View>
        )}

        {(ovelse.act || []).length > 0 && (
          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>PASSER FOR</Text>
            <View style={s.tagRad}>
              {ovelse.act.map((a: number) => (
                <View key={a} style={s.aktTag}>
                  <Text style={s.aktTagTekst}>Akt {a}</Text>
                </View>
              ))}
              {(ovelse.bodyParts || []).map((del: string) => (
                <View key={del} style={s.bodyTag}>
                  <Text style={s.bodyTagTekst}>{del}</Text>
                </View>
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
  formaalRad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formaalKnapp: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface },
  formaalKnappAktiv: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  formaalTekst: { fontSize: 13, color: colors.muted, fontWeight: '500' },
  formaalTekstAktiv: { color: colors.green },
  instruksjonKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14 },
  instruksjonTekst: { fontSize: 14, color: colors.text, fontWeight: '400', lineHeight: 22 },
  anatomiWrapper: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden', alignItems: 'center', padding: 16 },
  anatomiImage: { width: '100%', height: 200 },
  tagRad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  aktTag: { backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  aktTagTekst: { fontSize: 11, color: colors.green, fontWeight: '500' },
  bodyTag: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  bodyTagTekst: { fontSize: 11, color: colors.muted, fontWeight: '400' },
});
