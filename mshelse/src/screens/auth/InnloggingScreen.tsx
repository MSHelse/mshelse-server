import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image
} from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { colors } from '../../theme/colors';

export default function InnloggingScreen({ navigation }: any) {
  const [epost, setEpost] = useState('');
  const [passord, setPassord] = useState('');
  const [laster, setLaster] = useState(false);
  const [feil, setFeil] = useState('');

  async function loggInn() {
    if (!epost || !passord) { setFeil('Fyll inn e-post og passord'); return; }
    setLaster(true);
    setFeil('');
    try {
      await signInWithEmailAndPassword(auth, epost, passord);
    } catch (e: any) {
      setFeil('Feil e-post eller passord');
    } finally {
      setLaster(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.inner}>

        <View style={s.hero}>
          <View style={s.logoWrapper}>
            <Image
              source={require('../../../assets/logo.webp')}
              style={s.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={s.tagline}>Smertefri er{'\n'}<Text style={s.taglineItalic}>bare begynnelsen.</Text></Text>
          <Text style={s.sub}>MS Helse · Muskelspesialist Klinikken</Text>
        </View>

        <View style={s.form}>
          <View style={s.inputGroup}>
            <Text style={s.label}>E-POST</Text>
            <TextInput
              style={s.input}
              value={epost}
              onChangeText={setEpost}
              placeholder="navn@epost.no"
              placeholderTextColor={colors.muted2}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={s.inputGroup}>
            <Text style={s.label}>PASSORD</Text>
            <TextInput
              style={s.input}
              value={passord}
              onChangeText={setPassord}
              placeholder="••••••••"
              placeholderTextColor={colors.muted2}
              secureTextEntry
            />
          </View>

          {feil ? <Text style={s.feil}>{feil}</Text> : null}

          <TouchableOpacity style={s.btnPrimary} onPress={loggInn} disabled={laster}>
            {laster ? <ActivityIndicator color={colors.bg} /> : <Text style={s.btnPrimaryText}>Logg inn</Text>}
          </TouchableOpacity>
        </View>

        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>eller</Text>
          <View style={s.dividerLine} />
        </View>

        <TouchableOpacity style={s.btnOutline} onPress={() => navigation.navigate('Registrering')}>
          <Text style={s.btnOutlineText}>Opprett konto</Text>
        </TouchableOpacity>

        <Text style={s.vilkar}>Ved å bruke MS Helse godtar du våre vilkår og personvernerklæring</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, padding: 28, justifyContent: 'center', gap: 20 },
  hero: { gap: 10, alignItems: 'flex-start' },
  logoWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    overflow: 'hidden',
  },
  logo: { width: 64, height: 64 },
  tagline: { fontSize: 32, fontWeight: '200', color: colors.text, lineHeight: 38 },
  taglineItalic: { fontStyle: 'italic' },
  sub: { fontSize: 13, color: colors.muted, fontWeight: '400' },
  form: { gap: 12 },
  inputGroup: { gap: 6 },
  label: { fontSize: 11, color: colors.muted, letterSpacing: 0.8, fontWeight: '500' },
  input: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 13, fontSize: 15, color: colors.text },
  feil: { fontSize: 13, color: colors.danger, fontWeight: '300' },
  btnPrimary: { backgroundColor: colors.accent, borderRadius: 8, padding: 15, alignItems: 'center' },
  btnPrimaryText: { color: colors.bg, fontSize: 15, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 13, color: colors.muted2 },
  btnOutline: { borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 14, alignItems: 'center' },
  btnOutlineText: { color: colors.text, fontSize: 15, fontWeight: '500' },
  vilkar: { fontSize: 12, color: colors.muted2, textAlign: 'center', lineHeight: 18, fontWeight: '300' },
});
