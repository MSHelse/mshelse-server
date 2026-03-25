import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, TextInput, ActivityIndicator, Alert, Platform
} from 'react-native';
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../../services/firebase';
import { colors } from '../../theme/colors';

const ADMIN_UID = 'RpzuHdFg5heYMVHjC6F4IBPSrmq2';
const BACKEND_URL = 'https://mshelse-server.onrender.com';

const KROPPSDELER = ['Korsrygg', 'Hofte', 'Nakke', 'Skulder', 'Kne', 'Legg', 'Core', 'Ankel', 'Bryst', 'Biceps', 'Triceps', 'Hamstring', 'Quad'];
const AKT_VALG = [1, 2, 3];

const TRACKING_TYPER: { id: string; label: string }[] = [
  { id: 'completed',        label: 'Fullført' },
  { id: 'activation_quality', label: 'Aktivering (0–10)' },
  { id: 'contact_reps',     label: 'Reps m/kontakt' },
  { id: 'sets_reps',        label: 'Sett/reps' },
  { id: 'sets_reps_weight', label: 'Sett/reps/motstand' },
  { id: 'mobility',         label: 'Bevegelighet (0–10)' },
  { id: 'rpe',              label: 'Anstrengelse (RPE)' },
  { id: 'side_diff',        label: 'Sideforskjell' },
];

const MOTSTAND_TYPER = ['Kroppsvekt', 'Strikk', 'Manualer', 'Stang', 'Kettlebell', 'Kabelmaskin'];

export default function AdminOvelseScreen({ navigation }: any) {
  const [visForm, setVisForm] = useState(false);
  const [redigerer, setRedigerer] = useState<any>(null);
  const [ovelser, setOvelser] = useState<any[]>([]);
  const [laster, setLaster] = useState(true);
  const [lagrer, setLagrer] = useState(false);
  const [sok, setSok] = useState('');
  const [filterKroppsdel, setFilterKroppsdel] = useState('Alle');

  // Øvelse-felt
  const [navn, setNavn] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [feilVideoUrl, setFeilVideoUrl] = useState('');
  const [anatomyImageUrl, setAnatomyImageUrl] = useState('');
  const [hold, setHold] = useState('');
  const [tempo, setTempo] = useState('');
  const [lasterBilde, setLasterBilde] = useState(false);
  const [valgteKroppsdeler, setValgteKroppsdeler] = useState<string[]>([]);
  const [valgteAkt, setValgteAkt] = useState<number[]>([]);
  const [primerMuskler, setPrimerMuskler] = useState('');
  const [sekundarMuskler, setSekundarMuskler] = useState('');

  // Flat variant-felt (erstatter purposes[])
  const [formaalLabel, setFormaalLabel] = useState('');
  const [instruksjon, setInstruksjon] = useState('');
  const [trackingTypes, setTrackingTypes] = useState<string[]>(['completed']);
  const [motstandsType, setMotstandsType] = useState<string[]>([]);
  const [kliniskNotat, setKliniskNotat] = useState('');
  const [generererNotat, setGenerererNotat] = useState(false);

  const user = auth.currentUser;

  useEffect(() => {
    if (user?.uid !== ADMIN_UID) return;
    hentOvelser();
  }, []);

  async function hentOvelser() {
    try {
      const snap = await getDocs(query(collection(db, 'exercises'), orderBy('name')));
      setOvelser(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLaster(false);
    }
  }

  function nullstillForm() {
    setNavn(''); setVideoUrl(''); setFeilVideoUrl(''); setAnatomyImageUrl('');
    setHold(''); setTempo('');
    setValgteKroppsdeler([]); setValgteAkt([]);
    setPrimerMuskler(''); setSekundarMuskler('');
    setFormaalLabel(''); setInstruksjon('');
    setTrackingTypes(['completed']); setMotstandsType([]);
    setKliniskNotat('');
    setRedigerer(null);
  }

  function lastInnRedigering(o: any) {
    setRedigerer(o);
    setNavn(o.name || '');
    setVideoUrl(o.videoUrl || '');
    setFeilVideoUrl(o.feilVideoUrl || '');
    setAnatomyImageUrl(o.anatomyImageUrl || '');
    setHold(o.hold !== undefined && o.hold !== null ? String(o.hold) : '');
    setTempo(o.tempo || '');
    setValgteKroppsdeler(o.bodyParts || []);
    setValgteAkt(o.act || []);
    setPrimerMuskler((o.muskelgrupper?.primer || []).join(', '));
    setSekundarMuskler((o.muskelgrupper?.sekundar || []).join(', '));
    setFormaalLabel(o.formaalLabel || '');
    setInstruksjon(o.instruksjon || '');
    setTrackingTypes(o.tracking_types || (o.tracking_type ? [o.tracking_type] : ['completed']));
    setMotstandsType(o.motstandsType || []);
    setKliniskNotat(o.kliniskNotat || '');
    setVisForm(true);
  }

  function toggleKroppsdel(del: string) {
    setValgteKroppsdeler(prev => prev.includes(del) ? prev.filter(k => k !== del) : [...prev, del]);
  }

  function toggleAkt(a: number) {
    setValgteAkt(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  }

  function toggleTrackingType(type: string) {
    setTrackingTypes(prev => {
      const har = prev.includes(type);
      const ny = har ? prev.filter(t => t !== type) : [...prev, type];
      return ny.length > 0 ? ny : ['completed'];
    });
  }

  function toggleMotstand(type: string) {
    setMotstandsType(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }

  async function genererAINotat() {
    if (!instruksjon.trim()) {
      Alert.alert('Fyll inn instruksjon først');
      return;
    }
    setGenerererNotat(true);
    try {
      const primer = primerMuskler.trim() || '(ikke spesifisert)';
      const sekundar = sekundarMuskler.trim() || '(ikke spesifisert)';
      const kropp = valgteKroppsdeler.join(', ') || '(ikke spesifisert)';
      const akt = valgteAkt.join(', ') || '(ikke spesifisert)';
      const motstand = motstandsType.length ? motstandsType.join(', ') : '';

      const prompt = `Du er en klinisk muskel- og skjeletterapeut med 30 års erfaring.

Skriv et kort klinisk notat (2–4 setninger) for denne øvelsen som skal brukes av en AI for å velge riktige øvelser til rehabiliteringsprogrammer.

Øvelse: ${navn || '(ikke navngitt)'}
Formål/variant: ${formaalLabel || '(ikke spesifisert)'}
Instruksjon: ${instruksjon}
Kroppsdeler: ${kropp}
Primære muskler: ${primer}
Sekundære muskler: ${sekundar}
Akt: ${akt}
Tracking-typer: ${trackingTypes.join(', ')}${motstand ? `\nMotstandstype: ${motstand}` : ''}

Notatet skal beskrive:
- Hvilke muskler og strukturer som primært aktiveres
- Hvilke kliniske tilstander eller kompensasjonsmønstre øvelsen adresserer
- Eventuelle kontraindikasjoner eller forsiktighetsregler

Svar kun med selve notatet, ingen overskrifter eller forklaringer.`;

      const res = await fetch(`${BACKEND_URL}/api/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: 'Du er en klinisk ekspert. Svar kun med det kliniske notatet, ingen forklaringer.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      const tekst = data.content?.[0]?.text?.trim() || '';
      if (tekst) {
        setKliniskNotat(tekst);
      } else {
        Alert.alert('Ingen tekst generert. Prøv igjen.');
      }
    } catch (e) {
      Alert.alert('Feil ved AI-generering. Sjekk internett og prøv igjen.');
      console.error(e);
    } finally {
      setGenerererNotat(false);
    }
  }

  async function uploadBilde() {
    if (Platform.OS === 'web') {
      return new Promise<string>((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (!file) return resolve('');
          setLasterBilde(true);
          try {
            const storageRef = ref(storage, `anatomy/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setAnatomyImageUrl(url);
            resolve(url);
          } catch (err) {
            Alert.alert('Feil ved opplasting');
            reject(err);
          } finally {
            setLasterBilde(false);
          }
        };
        input.click();
      });
    }
  }

  async function lagre() {
    if (!navn.trim()) { Alert.alert('Mangler navn'); return; }
    setLagrer(true);

    const primerListe = primerMuskler.split(',').map(s => s.trim()).filter(Boolean);
    const sekundarListe = sekundarMuskler.split(',').map(s => s.trim()).filter(Boolean);

    const data = {
      name: navn.trim(),
      videoUrl: videoUrl.trim(),
      feilVideoUrl: feilVideoUrl.trim(),
      anatomyImageUrl: anatomyImageUrl.trim(),
      hold: hold ? parseInt(hold) : null,
      tempo: tempo.trim() || null,
      bodyParts: valgteKroppsdeler,
      act: valgteAkt,
      muskelgrupper: { primer: primerListe, sekundar: sekundarListe },
      formaalLabel: formaalLabel.trim(),
      instruksjon: instruksjon.trim(),
      tracking_types: trackingTypes,
      tracking_type: trackingTypes[0] || 'completed',
      motstandsType: trackingTypes.includes('sets_reps_weight') ? motstandsType : [],
      kliniskNotat: kliniskNotat.trim(),
    };

    try {
      if (redigerer) {
        await updateDoc(doc(db, 'exercises', redigerer.id), data);
      } else {
        await addDoc(collection(db, 'exercises'), { ...data, opprettet: serverTimestamp() });
      }
      await hentOvelser();
      nullstillForm();
      setVisForm(false);
    } catch (e) {
      Alert.alert('Feil ved lagring');
      console.error(e);
    } finally {
      setLagrer(false);
    }
  }

  if (user?.uid !== ADMIN_UID) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><Text style={s.feilTekst}>Ingen tilgang</Text></View>
      </SafeAreaView>
    );
  }

  if (visForm) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => { setVisForm(false); nullstillForm(); }}>
            <Text style={s.tilbake}>Avbryt</Text>
          </TouchableOpacity>
          <Text style={s.topbarTittel}>{redigerer ? 'Rediger øvelse' : 'Ny øvelse'}</Text>
          <TouchableOpacity onPress={lagre} disabled={lagrer}>
            {lagrer ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={s.lagreKnapp}>Lagre</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.formInner}>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabel}>NAVN</Text>
            <TextInput style={s.input} value={navn} onChangeText={setNavn} placeholder="f.eks. Benhev – Aktivering" placeholderTextColor={colors.muted2} />
            <Text style={s.inputHint}>Inkluder varianten i navnet, f.eks. "Frog pumps – Stabilitet"</Text>
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabel}>VIDEO URL (YouTube)</Text>
            <TextInput style={s.input} value={videoUrl} onChangeText={setVideoUrl} placeholder="https://youtube.com/watch?v=..." placeholderTextColor={colors.muted2} autoCapitalize="none" />
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabel}>FEIL-VIDEO URL (YouTube)</Text>
            <TextInput style={s.input} value={feilVideoUrl} onChangeText={setFeilVideoUrl} placeholder="https://youtube.com/watch?v=..." placeholderTextColor={colors.muted2} autoCapitalize="none" />
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabel}>ANATOMI-BILDE</Text>
            <TouchableOpacity
              style={[s.uploadKnapp, lasterBilde && s.uploadKnappDisabled]}
              onPress={uploadBilde}
              disabled={lasterBilde}
            >
              {lasterBilde
                ? <ActivityIndicator color={colors.accent} size="small" />
                : <Text style={s.uploadKnappTekst}>
                    {anatomyImageUrl ? '✓ Bilde lastet opp – trykk for å bytte' : '↑ Last opp bilde'}
                  </Text>
              }
            </TouchableOpacity>
            {anatomyImageUrl ? <Text style={s.uploadUrl} numberOfLines={1}>{anatomyImageUrl}</Text> : null}
          </View>

          <View style={s.radFelter}>
            <View style={[s.feltGruppe, { flex: 1 }]}>
              <Text style={s.feltLabel}>HOLD (sekunder)</Text>
              <TextInput
                style={s.input}
                value={hold}
                onChangeText={v => setHold(v.replace(/[^0-9]/g, ''))}
                placeholder="f.eks. 5"
                placeholderTextColor={colors.muted2}
                keyboardType="numeric"
              />
            </View>
            <View style={[s.feltGruppe, { flex: 1 }]}>
              <Text style={s.feltLabel}>TEMPO</Text>
              <TextInput
                style={s.input}
                value={tempo}
                onChangeText={setTempo}
                placeholder="f.eks. 3-0-1"
                placeholderTextColor={colors.muted2}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabel}>KROPPSDELER</Text>
            <View style={s.chipRad}>
              {KROPPSDELER.map(del => (
                <TouchableOpacity
                  key={del}
                  style={[s.chip, valgteKroppsdeler.includes(del) && s.chipAktiv]}
                  onPress={() => toggleKroppsdel(del)}
                >
                  <Text style={[s.chipTekst, valgteKroppsdeler.includes(del) && s.chipTekstAktiv]}>{del}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabel}>PRIMÆRE MUSKLER</Text>
            <TextInput style={s.input} value={primerMuskler} onChangeText={setPrimerMuskler} placeholder="f.eks. Gluteus maximus, Gluteus medius" placeholderTextColor={colors.muted2} />
            <Text style={s.inputHint}>Kommaseparer flere muskler</Text>
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabel}>SEKUNDÆRE MUSKLER</Text>
            <TextInput style={s.input} value={sekundarMuskler} onChangeText={setSekundarMuskler} placeholder="f.eks. Transversus abdominis, Erector spinae" placeholderTextColor={colors.muted2} />
            <Text style={s.inputHint}>Kommaseparer flere muskler</Text>
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabel}>AKT</Text>
            <View style={s.chipRad}>
              {AKT_VALG.map(a => (
                <TouchableOpacity
                  key={a}
                  style={[s.chip, valgteAkt.includes(a) && s.chipAktivGreen]}
                  onPress={() => toggleAkt(a)}
                >
                  <Text style={[s.chipTekst, valgteAkt.includes(a) && s.chipTekstAktiv]}>Akt {a}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Variant-info */}
          <View style={s.seksjonDivider}>
            <Text style={s.feltLabel}>VARIANT OG INSTRUKSJON</Text>
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabelLiten}>FORMÅL-LABEL</Text>
            <TextInput
              style={s.input}
              value={formaalLabel}
              onChangeText={setFormaalLabel}
              placeholder="f.eks. Aktivering, Stabilitet, Mobilitet"
              placeholderTextColor={colors.muted2}
            />
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabelLiten}>INSTRUKSJON FOR BRUKER</Text>
            <TextInput
              style={[s.input, s.inputMultilinje]}
              value={instruksjon}
              onChangeText={setInstruksjon}
              placeholder="Steg-for-steg instruksjon brukeren ser under økten..."
              placeholderTextColor={colors.muted2}
              multiline
            />
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabelLiten}>TRACKING-TYPER (velg én eller flere)</Text>
            <View style={s.trackingGrid}>
              {TRACKING_TYPER.map(t => {
                const aktiv = trackingTypes.includes(t.id);
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[s.trackingChip, aktiv && s.trackingChipAktiv]}
                    onPress={() => toggleTrackingType(t.id)}
                  >
                    <Text style={[s.trackingChipTekst, aktiv && s.trackingChipTekstAktiv]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {trackingTypes.includes('sets_reps_weight') && (
            <View style={s.feltGruppe}>
              <Text style={s.feltLabelLiten}>MOTSTANDSTYPE</Text>
              <View style={s.chipRad}>
                {MOTSTAND_TYPER.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[s.chip, motstandsType.includes(t) && s.chipAktivGreen]}
                    onPress={() => toggleMotstand(t)}
                  >
                    <Text style={[s.chipTekst, motstandsType.includes(t) && s.chipTekstAktiv]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={s.feltGruppe}>
            <View style={s.aiNotatHeader}>
              <Text style={s.feltLabelLiten}>KLINISK NOTAT (kun for AI)</Text>
              <TouchableOpacity
                style={[s.aiKnapp, generererNotat && s.aiKnappDisabled]}
                onPress={genererAINotat}
                disabled={generererNotat}
              >
                {generererNotat
                  ? <ActivityIndicator size="small" color={colors.green} />
                  : <Text style={s.aiKnappTekst}>✦ Generer</Text>
                }
              </TouchableOpacity>
            </View>
            <TextInput
              style={[s.input, s.inputMultilinje, s.aiInput]}
              value={kliniskNotat}
              onChangeText={setKliniskNotat}
              placeholder="Trykk 'Generer' for å la AI skrive dette – eller skriv selv."
              placeholderTextColor={colors.muted2}
              multiline
            />
          </View>

        </ScrollView>
      </SafeAreaView>
    );
  }

  const alleKroppsdeler = ['Alle', ...Array.from(new Set(ovelser.flatMap(o => o.bodyParts || []))).sort()];

  function filtrerte() {
    return ovelser.filter(o => {
      const matchSok = !sok.trim() || o.name?.toLowerCase().includes(sok.toLowerCase());
      const matchFilter = filterKroppsdel === 'Alle' || (o.bodyParts || []).includes(filterKroppsdel);
      return matchSok && matchFilter;
    });
  }

  function gruppert(): Record<string, any[]> {
    const liste = filtrerte();
    if (filterKroppsdel !== 'Alle') return { [filterKroppsdel]: liste };
    const grupper: Record<string, any[]> = {};
    liste.forEach(o => {
      const deler = (o.bodyParts || ['Annet']);
      deler.forEach((del: string) => {
        if (!grupper[del]) grupper[del] = [];
        if (!grupper[del].find((x: any) => x.id === o.id)) grupper[del].push(o);
      });
    });
    return grupper;
  }

  const grupper = gruppert();
  const antallFiltrert = filtrerte().length;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.tilbake}>← Tilbake</Text>
        </TouchableOpacity>
        <Text style={s.topbarTittel}>Admin – Øvelser</Text>
        <TouchableOpacity onPress={() => setVisForm(true)}>
          <Text style={s.lagreKnapp}>+ Ny</Text>
        </TouchableOpacity>
      </View>

      {laster ? (
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <>
          <View style={s.sokWrapper}>
            <TextInput
              style={s.sokInput}
              value={sok}
              onChangeText={setSok}
              placeholder="Søk øvelser..."
              placeholderTextColor={colors.muted2}
            />
            <Text style={s.antallTekst}>{antallFiltrert} av {ovelser.length}</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterInner}>
            {alleKroppsdeler.map(k => (
              <TouchableOpacity
                key={k}
                style={[s.filterChip, filterKroppsdel === k && s.filterChipAktiv]}
                onPress={() => setFilterKroppsdel(k)}
              >
                <Text style={[s.filterTekst, filterKroppsdel === k && s.filterTekstAktiv]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView contentContainerStyle={s.inner}>
            {ovelser.length === 0 ? (
              <View style={s.tomKort}>
                <Text style={s.tomTekst}>Ingen øvelser ennå</Text>
                <TouchableOpacity style={s.btnPrimary} onPress={() => setVisForm(true)}>
                  <Text style={s.btnPrimaryTekst}>Legg til første øvelse</Text>
                </TouchableOpacity>
              </View>
            ) : antallFiltrert === 0 ? (
              <View style={s.tomKort}>
                <Text style={s.tomTekst}>Ingen treff på "{sok}"</Text>
              </View>
            ) : (
              Object.entries(grupper).map(([del, liste]) => (
                <View key={del} style={s.gruppe}>
                  <Text style={s.gruppeTittel}>{del.toUpperCase()} · {liste.length}</Text>
                  <View style={s.kort}>
                    {(liste as any[]).map((o, i) => (
                      <TouchableOpacity
                        key={o.id}
                        style={[s.ovelseRad, i < liste.length - 1 && s.ovelseRadBorder]}
                        onPress={() => lastInnRedigering(o)}
                      >
                        <View style={s.ovelseInfo}>
                          <Text style={s.ovelseNavn}>{o.name}</Text>
                          <Text style={s.ovelseMeta}>
                            {o.formaalLabel ? `${o.formaalLabel} · ` : ''}
                            {o.muskelgrupper?.primer?.length
                              ? o.muskelgrupper.primer.slice(0, 2).join(', ')
                              : (o.bodyParts || []).join(', ')}
                            {o.act?.length ? ` · Akt ${o.act.join('/')}` : ''}
                          </Text>
                        </View>
                        <Text style={s.pil}>›</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  feilTekst: { color: colors.muted, fontSize: 14 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  topbarTittel: { fontSize: 15, fontWeight: '500', color: colors.text },
  tilbake: { fontSize: 13, color: colors.muted, width: 60 },
  lagreKnapp: { fontSize: 13, color: colors.accent, fontWeight: '600', width: 60, textAlign: 'right' },
  inner: { padding: 16, paddingBottom: 40, gap: 16 },
  formInner: { padding: 16, paddingBottom: 80, gap: 18 },
  feltGruppe: { gap: 8 },
  radFelter: { flexDirection: 'row', gap: 12 },
  uploadKnapp: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 12, alignItems: 'center' },
  uploadKnappDisabled: { opacity: 0.5 },
  uploadKnappTekst: { fontSize: 14, color: colors.text, fontWeight: '400' },
  uploadUrl: { fontSize: 11, color: colors.muted2, fontWeight: '300' },
  feltLabel: { fontSize: 11, color: colors.muted, fontWeight: '500', letterSpacing: 1.0 },
  feltLabelLiten: { fontSize: 10, color: colors.muted2, fontWeight: '500', letterSpacing: 0.6 },
  inputHint: { fontSize: 11, color: colors.muted2, fontWeight: '300' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 11, fontSize: 14, color: colors.text },
  inputMultilinje: { minHeight: 80, textAlignVertical: 'top' },
  aiInput: { minHeight: 70, borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  chipRad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface },
  chipAktiv: { backgroundColor: colors.surface2, borderColor: colors.accent },
  chipAktivGreen: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  chipTekst: { fontSize: 13, color: colors.muted },
  chipTekstAktiv: { color: colors.text },
  seksjonDivider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  trackingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trackingChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface2 },
  trackingChipAktiv: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  trackingChipTekst: { fontSize: 12, color: colors.muted },
  trackingChipTekstAktiv: { color: colors.green, fontWeight: '500' },
  aiNotatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  aiKnapp: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  aiKnappDisabled: { opacity: 0.5 },
  aiKnappTekst: { fontSize: 12, color: colors.green, fontWeight: '500' },
  tomKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 24, alignItems: 'center', gap: 14 },
  tomTekst: { fontSize: 14, color: colors.muted, fontWeight: '400' },
  btnPrimary: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 24 },
  btnPrimaryTekst: { color: colors.bg, fontSize: 14, fontWeight: '600' },
  sokWrapper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  sokInput: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 9, fontSize: 14, color: colors.text },
  antallTekst: { fontSize: 12, color: colors.muted2, fontWeight: '300', minWidth: 40, textAlign: 'right' },
  filterScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterInner: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface },
  filterChipAktiv: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterTekst: { fontSize: 13, color: colors.muted, fontWeight: '400' },
  filterTekstAktiv: { color: colors.bg },
  gruppe: { gap: 8 },
  gruppeTittel: { fontSize: 10, color: colors.muted, fontWeight: '500', letterSpacing: 0.8 },
  kort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  ovelseRad: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  ovelseRadBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  ovelseInfo: { flex: 1 },
  ovelseNavn: { fontSize: 15, fontWeight: '500', color: colors.text, marginBottom: 3 },
  ovelseMeta: { fontSize: 12, color: colors.muted, fontWeight: '300' },
  pil: { fontSize: 18, color: colors.muted2 },
});
