import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, ActivityIndicator, TextInput
} from 'react-native';
import { collection, query, orderBy, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../services/firebase';
import { colors } from '../../theme/colors';

const ADMIN_UID = 'RpzuHdFg5heYMVHjC6F4IBPSrmq2';

const KJONN_VALG = ['Mann', 'Kvinne', 'Annet'];
const ALDER_VALG = ['Under 18', '18–29', '30–39', '40–49', '50–59', '60–69', '70+'];
const AKTIVITET_VALG = [
  'Lite aktivt (stillesittende)',
  'Lett aktiv (gange, lett arbeid)',
  'Moderat aktiv (trener 1–2 ganger/uke)',
  'Aktiv (trener 3–4 ganger/uke)',
  'Meget aktiv (trener 5+ ganger/uke)',
];
const TILSTAND_VALG = [
  'Benskjørhet/osteoporose', 'Hypermobilitet', 'Revmatisme/leddgikt',
  'Fibromyalgi', 'Gravid', 'Nylig operert', 'Artrose', 'Migrene',
  'Tidligere prolaps', 'Tidligere whiplash', 'Skoliose', 'Bekhterevs sykdom',
];

export default function ProfilScreen({ navigation }: any) {
  const [laster, setLaster] = useState(true);
  const [assessments, setAssessments] = useState<any[]>([]);

  // Helseprofil
  const [kjonn, setKjonn] = useState('');
  const [alder, setAlder] = useState('');
  const [aktivitet, setAktivitet] = useState('');
  const [tilstander, setTilstander] = useState<string[]>([]);
  const [andreTilstander, setAndreTilstander] = useState('');
  const [lagrerProfil, setLagrerProfil] = useState(false);
  const [profilEndret, setProfilEndret] = useState(false);
  const [visHelseProfil, setVisHelseProfil] = useState(false);

  const user = auth.currentUser;
  const navn = user?.displayName || 'Bruker';
  const epost = user?.email || '';
  const fornavn = navn.split(' ')[0];
  const erAdmin = user?.uid === ADMIN_UID;

  useEffect(() => {
    hentAssessments();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      hentAssessments();
    });
    return unsubscribe;
  }, [navigation]);

  async function hentAssessments() {
    if (!user) return;
    try {
      const [assessSnap, brukerSnap] = await Promise.all([
        getDocs(query(collection(db, 'users', user.uid, 'assessments'), orderBy('dato', 'desc'))),
        getDoc(doc(db, 'users', user.uid)),
      ]);
      setAssessments(assessSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const profil = brukerSnap.data()?.helseProfil;
      if (profil) {
        if (profil.biologiskKjonn) setKjonn(profil.biologiskKjonn);
        if (profil.aldersgruppe) setAlder(profil.aldersgruppe);
        if (profil.aktivitetsniva) setAktivitet(profil.aktivitetsniva);
        if (profil.tilstander?.length) setTilstander(profil.tilstander);
        if (profil.andreTilstander) setAndreTilstander(profil.andreTilstander);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLaster(false);
    }
  }

  async function lagreProfil() {
    if (!user) return;
    setLagrerProfil(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        helseProfil: {
          biologiskKjonn: kjonn,
          aldersgruppe: alder,
          aktivitetsniva: aktivitet,
          tilstander,
          andreTilstander: andreTilstander.trim(),
        },
      });
      setProfilEndret(false);
    } catch (e) { console.error(e); }
    finally { setLagrerProfil(false); }
  }

  function toggleTilstand(t: string) {
    setTilstander(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    setProfilEndret(true);
  }

  function formatDato(dato: any) {
    if (!dato) return '–';
    const d = dato.toDate ? dato.toDate() : new Date(dato);
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.tilbake}>← Tilbake</Text>
        </TouchableOpacity>
        <Text style={s.topbarTittel}>Profil</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={s.inner}>

        <View style={s.hero}>
          <View style={s.avatar}>
            <Text style={s.avatarTekst}>{fornavn[0]?.toUpperCase()}</Text>
          </View>
          <View>
            <Text style={s.navn}>{navn}</Text>
            <Text style={s.epost}>{epost}</Text>
          </View>
        </View>

        <View style={s.seksjon}>
          <TouchableOpacity style={s.seksjonHeaderRad} onPress={() => setVisHelseProfil(v => !v)}>
            <Text style={s.seksjonTittel}>HELSEPROFIL</Text>
            <Text style={s.seksjonPil}>{visHelseProfil ? '∧' : '∨'}</Text>
          </TouchableOpacity>

          {visHelseProfil && (
            <View style={s.profilKort}>
              <View style={s.profilFelt}>
                <Text style={s.profilLabel}>BIOLOGISK KJØNN</Text>
                <View style={s.chipRad}>
                  {KJONN_VALG.map(v => (
                    <TouchableOpacity key={v} style={[s.chip, kjonn === v && s.chipAktiv]}
                      onPress={() => { setKjonn(v); setProfilEndret(true); }}>
                      <Text style={[s.chipTekst, kjonn === v && s.chipTekstAktiv]}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={s.profilFelt}>
                <Text style={s.profilLabel}>ALDERSGRUPPE</Text>
                <View style={s.chipRad}>
                  {ALDER_VALG.map(v => (
                    <TouchableOpacity key={v} style={[s.chip, alder === v && s.chipAktiv]}
                      onPress={() => { setAlder(v); setProfilEndret(true); }}>
                      <Text style={[s.chipTekst, alder === v && s.chipTekstAktiv]}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={s.profilFelt}>
                <Text style={s.profilLabel}>AKTIVITETSNIVÅ</Text>
                <View style={s.aktivitetListe}>
                  {AKTIVITET_VALG.map(v => (
                    <TouchableOpacity key={v} style={[s.aktivitetRad, aktivitet === v && s.aktivitetRadAktiv]}
                      onPress={() => { setAktivitet(v); setProfilEndret(true); }}>
                      <View style={[s.aktivitetDot, aktivitet === v && s.aktivitetDotAktiv]} />
                      <Text style={[s.aktivitetTekst, aktivitet === v && s.aktivitetTekstAktiv]}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={s.profilFelt}>
                <Text style={s.profilLabel}>KJENTE TILSTANDER</Text>
                <View style={s.chipRad}>
                  {TILSTAND_VALG.map(t => (
                    <TouchableOpacity key={t} style={[s.chip, tilstander.includes(t) && s.chipAktiv]}
                      onPress={() => toggleTilstand(t)}>
                      <Text style={[s.chipTekst, tilstander.includes(t) && s.chipTekstAktiv]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={s.andreTilstanderInput}
                  value={andreTilstander}
                  onChangeText={v => { setAndreTilstander(v); setProfilEndret(true); }}
                  placeholder="Andre tilstander eller diagnoser…"
                  placeholderTextColor={colors.muted2}
                  multiline
                />
              </View>

              {profilEndret && (
                <TouchableOpacity style={s.lagreProfilKnapp} onPress={lagreProfil} disabled={lagrerProfil}>
                  <Text style={s.lagreProfilTekst}>{lagrerProfil ? 'Lagrer…' : 'Lagre profil'}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View style={s.seksjon}>
          <Text style={s.seksjonTittel}>KARTLEGGINGSHISTORIKK</Text>
          {laster ? (
            <ActivityIndicator color={colors.muted} style={{ padding: 20 }} />
          ) : assessments.length === 0 ? (
            <View style={s.kortTom}>
              <Text style={s.kortTomTekst}>Ingen kartlegginger ennå</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Kartlegging')}>
                <Text style={s.lenke}>Start kartlegging →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <HistorikkListe assessments={assessments} navigation={navigation} formatDato={formatDato} />
          )}
        </View>

        <View style={s.seksjon}>
          <Text style={s.seksjonTittel}>KARTLEGGING</Text>
          <TouchableOpacity style={s.radKnapp} onPress={() => navigation.navigate('Kartlegging')}>
            <Text style={s.radKnappTekst}>Ny kartlegging</Text>
            <Text style={s.radKnappPil}>›</Text>
          </TouchableOpacity>
        </View>

        {erAdmin && (
          <View style={s.seksjon}>
            <Text style={s.seksjonTittel}>ADMIN</Text>
            <TouchableOpacity style={s.adminKnapp} onPress={() => navigation.navigate('AdminOvelse')}>
              <Text style={s.adminKnappTekst}>Administrer øvelsesbibliotek</Text>
              <Text style={s.radKnappPil}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={s.seksjon}>
          <Text style={s.seksjonTittel}>KONTO</Text>
          <View style={s.kort}>
            <TouchableOpacity style={s.loggUtKnapp} onPress={() => signOut(auth)}>
              <Text style={s.loggUtTekst}>Logg ut</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const KONKLUSJON_IKON: Record<string, string> = {
  neste_akt: '↑',
  intensiver: '↗',
  fortsett: '→',
  ny_kartlegging: '↺',
};

const KONKLUSJON_LABEL: Record<string, string> = {
  neste_akt: 'Klar for neste akt',
  intensiver: 'Øker vanskelighetsgraden',
  fortsett: 'Fortsett programmet',
  ny_kartlegging: 'Ny kartlegging anbefales',
};

function HistorikkListe({ assessments, navigation, formatDato }: any) {
  const [ekspandert, setEkspandert] = React.useState<Set<string>>(new Set());
  const [ekspandertSjekk, setEkspandertSjekk] = React.useState<Set<string>>(new Set());

  const kartlegginger = assessments.filter((a: any) => a.type !== 'reassessment');
  const statussjekker = assessments.filter((a: any) => a.type === 'reassessment');

  function sjekkForKartlegging(kartlegging: any): any[] {
    const kartDato = kartlegging.dato?.toDate?.() || new Date(0);

    // Finn neste kartlegging sin dato for å avgrense perioden
    const nesteKartleggingDato = kartlegginger
      .map((k: any) => k.dato?.toDate?.() || new Date(0))
      .filter((d: Date) => d > kartDato)
      .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];

    return statussjekker.filter((sj: any) => {
      // Foretrekk programId-match hvis tilgjengelig på begge
      if (sj.programId && kartlegging.programId) {
        return sj.programId === kartlegging.programId;
      }
      // Fallback: statussjekken må være etter denne kartleggingen og før neste
      const sjekkDato = sj.dato?.toDate?.() || new Date(0);
      const etterDenne = sjekkDato >= kartDato;
      const forNeste = !nesteKartleggingDato || sjekkDato < nesteKartleggingDato;
      return etterDenne && forNeste;
    });
  }

  return (
    <View style={s.historikkListe}>
      {kartlegginger.map((k: any, i: number) => {
        const erEkspandert = ekspandert.has(k.id);
        const sjekker = sjekkForKartlegging(k);

        return (
          <View key={k.id} style={[s.historikkKort, i > 0 && { marginTop: 8 }]}>
            {/* Kartlegging – trykk for å åpne detalj-skjerm */}
            <TouchableOpacity
              style={s.historikkHeader}
              onPress={() => navigation.navigate('KartleggingDetalj', { assessment: k })}
              activeOpacity={0.7}
            >
              <View style={s.historikkHeaderInfo}>
                <Text style={s.assessmentDato}>{formatDato(k.dato)}</Text>
                <Text style={s.assessmentTittel}>{k.tittel}</Text>
                <View style={s.assessmentTags}>
                  <View style={s.aktTag}>
                    <Text style={s.aktTagTekst}>Akt {k.triage?.start_act ?? '–'}</Text>
                  </View>
                  {k.confidence != null && (
                    <Text style={s.conf}>{k.confidence}% sikkerhet</Text>
                  )}
                </View>
              </View>
              <Text style={s.historikkChevron}>›</Text>
            </TouchableOpacity>

            {/* Statussjekker – kollapsbar liste */}
            {sjekker.length > 0 && (
              <TouchableOpacity
                style={s.sjekkToggle}
                onPress={() => setEkspandert(prev => {
                  const ny = new Set(prev);
                  ny.has(k.id) ? ny.delete(k.id) : ny.add(k.id);
                  return ny;
                })}
              >
                <Text style={s.sjekkToggleTekst}>
                  {sjekker.length} statussjekk{sjekker.length !== 1 ? 'er' : ''} {erEkspandert ? '∧' : '∨'}
                </Text>
              </TouchableOpacity>
            )}

            {erEkspandert && sjekker.map((sj: any) => {
              const erSjekkEksp = ekspandertSjekk.has(sj.id);
              return (
                <TouchableOpacity
                  key={sj.id}
                  style={s.sjekkRad}
                  onPress={() => setEkspandertSjekk(prev => {
                    const ny = new Set(prev);
                    ny.has(sj.id) ? ny.delete(sj.id) : ny.add(sj.id);
                    return ny;
                  })}
                >
                  <View style={s.sjekkHeader}>
                    <Text style={s.sjekkIkon}>{KONKLUSJON_IKON[sj.konklusjon] || '→'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.sjekkDato}>{formatDato(sj.dato)}</Text>
                      <Text style={s.sjekkTittel}>
                        {KONKLUSJON_LABEL[sj.konklusjon] || sj.tittel || 'Statussjekk'}
                      </Text>
                    </View>
                    <Text style={s.sjekkPil}>{erSjekkEksp ? '∧' : '∨'}</Text>
                  </View>
                  {erSjekkEksp && (
                    <View style={s.sjekkDetalj}>
                      {sj.begrunnelse ? (
                        <Text style={s.sjekkBody}>{sj.begrunnelse}</Text>
                      ) : null}
                      {sj.neste_steg ? (
                        <View style={s.sjekkNesteSteg}>
                          <Text style={s.sjekkNesteStegLabel}>NESTE STEG</Text>
                          <Text style={s.sjekkBody}>{sj.neste_steg}</Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  topbarTittel: { fontSize: 15, fontWeight: '500', color: colors.text },
  tilbake: { fontSize: 13, color: colors.muted, width: 60 },
  inner: { padding: 20, paddingBottom: 40, gap: 24 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center' },
  avatarTekst: { fontSize: 18, fontWeight: '500', color: colors.muted },
  navn: { fontSize: 18, fontWeight: '300', color: colors.text },
  epost: { fontSize: 13, color: colors.muted, fontWeight: '300', marginTop: 2 },
  seksjon: { gap: 8 },
  seksjonTittel: { fontSize: 10, color: colors.muted, fontWeight: '500', letterSpacing: 0.8 },
  kort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' },
  kortTom: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, alignItems: 'center', gap: 8 },
  kortTomTekst: { fontSize: 14, color: colors.muted, fontWeight: '300' },
  lenke: { fontSize: 13, color: colors.accent, fontWeight: '400' },
  assessmentRad: { padding: 14, gap: 6 },
  assessmentRadBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  assessmentInfo: { gap: 4 },
  assessmentDato: { fontSize: 11, color: colors.muted2, fontWeight: '300' },
  assessmentTittel: { fontSize: 14, fontWeight: '400', color: colors.text },
  assessmentTags: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  aktTag: { backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  aktTagTekst: { fontSize: 10, color: colors.green, fontWeight: '500', letterSpacing: 0.4 },
  conf: { fontSize: 11, color: colors.muted, fontWeight: '300' },
  radKnapp: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  radKnappTekst: { fontSize: 15, color: colors.text, fontWeight: '300' },
  radKnappPil: { fontSize: 18, color: colors.muted2 },
  adminKnapp: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 12, padding: 14 },
  adminKnappTekst: { fontSize: 15, color: colors.green, fontWeight: '400' },
  seksjonHeaderRad: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seksjonPil: { fontSize: 14, color: colors.muted2 },
  profilKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, gap: 16 },
  profilFelt: { gap: 8 },
  profilLabel: { fontSize: 10, color: colors.muted2, fontWeight: '500', letterSpacing: 0.8 },
  chipRad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface2 },
  chipAktiv: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  chipTekst: { fontSize: 12, color: colors.muted, fontWeight: '300' },
  chipTekstAktiv: { color: colors.green, fontWeight: '500' },
  aktivitetListe: { gap: 6 },
  aktivitetRad: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  aktivitetRadAktiv: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  aktivitetDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border2 },
  aktivitetDotAktiv: { backgroundColor: colors.green, borderColor: colors.green },
  aktivitetTekst: { fontSize: 12, color: colors.muted, fontWeight: '300', flex: 1 },
  aktivitetTekstAktiv: { color: colors.text, fontWeight: '400' },
  andreTilstanderInput: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 10, fontSize: 13, color: colors.text, minHeight: 60, textAlignVertical: 'top' },
  lagreProfilKnapp: { backgroundColor: colors.accent, borderRadius: 8, padding: 12, alignItems: 'center' },
  lagreProfilTekst: { color: colors.bg, fontSize: 14, fontWeight: '600' },
  loggUtTekst: { fontSize: 14, color: colors.danger, fontWeight: '400' },
  historikkListe: { gap: 0 },
  historikkKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' },
  historikkHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10 },
  historikkHeaderInfo: { flex: 1, gap: 4 },
  historikkChevron: { fontSize: 20, color: colors.muted2, paddingTop: 2 },
  sjekkToggle: { paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  sjekkToggleTekst: { fontSize: 12, color: colors.muted, fontWeight: '400' },
  sjekkRad: { borderTopWidth: 1, borderTopColor: colors.border, padding: 12, gap: 8 },
  sjekkHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sjekkIkon: { fontSize: 15, color: colors.muted2, width: 20, textAlign: 'center' },
  sjekkDato: { fontSize: 10, color: colors.muted2, fontWeight: '300' },
  sjekkTittel: { fontSize: 13, color: colors.text, fontWeight: '400' },
  sjekkPil: { fontSize: 12, color: colors.muted2 },
  sjekkDetalj: { paddingLeft: 30, gap: 8 },
  sjekkBody: { fontSize: 13, color: colors.muted, fontWeight: '300', lineHeight: 20 },
  sjekkNesteSteg: { gap: 3 },
  sjekkNesteStegLabel: { fontSize: 9, color: colors.green, fontWeight: '500', letterSpacing: 0.7 },
});
