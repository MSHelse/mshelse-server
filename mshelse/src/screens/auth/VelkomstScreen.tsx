import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Image
} from 'react-native';
import { auth } from '../../services/firebase';
import { colors } from '../../theme/colors';

export default function VelkomstScreen({ navigation }: any) {
  const navn = auth.currentUser?.displayName?.split(' ')[0] || 'deg';

  function startKartlegging() {
    // Naviger til MainTabs først, deretter til Kartlegging
    navigation.replace('Main');
    // Liten delay slik at navigasjonsstrukturen er klar
    setTimeout(() => {
      navigation.navigate('Kartlegging');
    }, 100);
  }

  return (
    <ScrollView contentContainerStyle={s.inner} bounces={false}>

      <View style={s.logoRad}>
        <View style={s.logoWrapper}>
          <Image
            source={require('../../../assets/logo.webp')}
            style={s.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={s.klinikk}>Muskelspesialist Klinikken</Text>
      </View>

      <View style={s.hero}>
        <Text style={s.velkommen}>Hei, {navn}</Text>
        <Text style={s.tittel}>Du tok steget.{'\n'}La oss finne ut hva som skjer.</Text>
        <Text style={s.sub}>
          De fleste sliter lenge med smerter uten å forstå hvorfor. Kartleggingen tar 5–10 minutter og gir deg en klinisk vurdering basert på 8 års erfaring med muskel- og skjelettplager.
        </Text>
      </View>

      <View style={s.infoKort}>
        <Text style={s.infoTittel}>Du får</Text>
        <View style={s.infoRad}>
          <View style={s.dot} />
          <Text style={s.infoTekst}>En klinisk vurdering av årsaken til plagene dine</Text>
        </View>
        <View style={s.infoRad}>
          <View style={s.dot} />
          <Text style={s.infoTekst}>Riktig startpunkt – ikke for lett, ikke for hardt</Text>
        </View>
        <View style={s.infoRad}>
          <View style={s.dot} />
          <Text style={s.infoTekst}>Et program bygget rundt deg, ikke en mal</Text>
        </View>
      </View>

      <View style={s.knapper}>
        <TouchableOpacity style={s.btnPrimary} onPress={startKartlegging}>
          <Text style={s.btnPrimaryText}>Start kartlegging →</Text>
        </TouchableOpacity>
        <Text style={s.hint}>Tar 5–10 minutter · Kan gjøres når som helst</Text>
      </View>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  inner: { flexGrow: 1, backgroundColor: colors.bg, padding: 28, gap: 28, justifyContent: 'center' },

  logoRad: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 42, height: 42 },
  klinikk: { fontSize: 13, color: colors.muted, fontWeight: '300' },

  hero: { gap: 14 },
  velkommen: { fontSize: 11, color: colors.green, fontWeight: '500', letterSpacing: 0.8, textTransform: 'uppercase' },
  tittel: { fontSize: 27, fontWeight: '300', color: colors.text, lineHeight: 34 },
  sub: { fontSize: 14, color: colors.muted, fontWeight: '400', lineHeight: 23 },

  infoKort: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.greenBorder,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  infoTittel: { fontSize: 12, color: colors.green, fontWeight: '500', letterSpacing: 0.8, textTransform: 'uppercase' },
  infoRad: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dot: { width: 5, height: 5, borderRadius: 999, backgroundColor: colors.green, marginTop: 7 },
  infoTekst: { fontSize: 14, color: colors.text, fontWeight: '400', flex: 1, lineHeight: 21 },

  knapper: { gap: 10 },
  btnPrimary: { backgroundColor: colors.accent, borderRadius: 8, padding: 15, alignItems: 'center' },
  btnPrimaryText: { color: colors.bg, fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.muted2, textAlign: 'center', fontWeight: '300' },
});
