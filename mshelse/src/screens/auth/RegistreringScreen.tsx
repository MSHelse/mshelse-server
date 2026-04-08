import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { opprettBrukerDokument } from '../../services/bruker';
import { colors } from '../../theme/colors';

export default function RegistreringScreen({ navigation }: any) {
  const [navn, setNavn] = useState('');
  const [epost, setEpost] = useState('');
  const [passord, setPassord] = useState('');
  const [bekreft, setBekreft] = useState('');
  const [laster, setLaster] = useState(false);
  const [feil, setFeil] = useState('');
  const [samtykke, setSamtykke] = useState(false);

  async function registrer() {
    if (!navn || !epost || !passord || !bekreft) { setFeil('Fyll inn alle feltene'); return; }
    if (!samtykke) { setFeil('Du må samtykke til datalagring for å fortsette'); return; }
    if (passord !== bekreft) { setFeil('Passordene er ikke like'); return; }
    if (passord.length < 8) { setFeil('Passordet må være minst 8 tegn'); return; }
    setLaster(true);
    setFeil('');
    try {
      const { user } = await createUserWithEmailAndPassword(auth, epost, passord);
      await updateProfile(user, { displayName: navn });
      await opprettBrukerDokument(user.uid, navn, epost);
      navigation.navigate('Velkomst');
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') setFeil('E-posten er allerede i bruk');
      else setFeil('Noe gikk galt. Prøv igjen.');
    } finally {
      setLaster(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.tilbake}>← Tilbake</Text>
          </TouchableOpacity>
          <Text style={s.tittel}>Opprett konto</Text>
        </View>
        <View style={s.form}>
          <View style={s.inputGroup}>
            <Text style={s.label}>NAVN</Text>
            <TextInput style={s.input} value={navn} onChangeText={setNavn} placeholder="Anders Haugen" placeholderTextColor={colors.muted2} autoCapitalize="words" />
          </View>
          <View style={s.inputGroup}>
            <Text style={s.label}>E-POST</Text>
            <TextInput style={s.input} value={epost} onChangeText={setEpost} placeholder="navn@epost.no" placeholderTextColor={colors.muted2} keyboardType="email-address" autoCapitalize="none" />
          </View>
          <View style={s.inputGroup}>
            <Text style={s.label}>PASSORD</Text>
            <TextInput style={s.input} value={passord} onChangeText={setPassord} placeholder="Minst 8 tegn" placeholderTextColor={colors.muted2} secureTextEntry />
          </View>
          <View style={s.inputGroup}>
            <Text style={s.label}>BEKREFT PASSORD</Text>
            <TextInput style={s.input} value={bekreft} onChangeText={setBekreft} placeholder="••••••••" placeholderTextColor={colors.muted2} secureTextEntry />
          </View>
          <TouchableOpacity style={s.samtykkeRad} onPress={() => setSamtykke(v => !v)} activeOpacity={0.7}>
            <View style={[s.samtykkeBoks, samtykke && s.samtykkeBoksAktiv]}>
              {samtykke && <Text style={s.samtykkehake}>✓</Text>}
            </View>
            <Text style={s.samtykkeTekst}>
              Jeg samtykker til at Muskelspesialist Klinikken lagrer mine treningsøkter og øvelsesdata for å gi meg personlig oppfølging.
            </Text>
          </TouchableOpacity>
          {feil ? <Text style={s.feil}>{feil}</Text> : null}
          <TouchableOpacity style={s.btnPrimary} onPress={registrer} disabled={laster}>
            {laster ? <ActivityIndicator color={colors.bg} /> : <Text style={s.btnPrimaryText}>Opprett konto</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Innlogging')}>
            <Text style={s.loggInn}>Har du allerede konto? <Text style={s.loggInnLink}>Logg inn</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { padding: 28, gap: 24, flexGrow: 1 },
  header: { gap: 12 },
  tilbake: { fontSize: 13, color: colors.muted, fontWeight: '300' },
  tittel: { fontSize: 24, fontWeight: '400', color: colors.text },
  form: { gap: 14 },
  inputGroup: { gap: 6 },
  label: { fontSize: 11, color: colors.muted, letterSpacing: 0.8, fontWeight: '500' },
  input: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 12, fontSize: 15, color: colors.text },
  feil: { fontSize: 13, color: colors.danger, fontWeight: '300' },
  btnPrimary: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  btnPrimaryText: { color: colors.bg, fontSize: 15, fontWeight: '600' },
  loggInn: { fontSize: 13, color: colors.muted, textAlign: 'center', fontWeight: '400' },
  loggInnLink: { color: colors.accent },
  samtykkeRad: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  samtykkeBoks: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  samtykkeBoksAktiv: { backgroundColor: colors.green, borderColor: colors.green },
  samtykkehake: { fontSize: 12, color: colors.bg, fontWeight: '600' },
  samtykkeTekst: { flex: 1, fontSize: 13, color: colors.muted, fontWeight: '300', lineHeight: 20 },
});
