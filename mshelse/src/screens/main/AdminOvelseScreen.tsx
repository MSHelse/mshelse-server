import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, TextInput, ActivityIndicator, Modal
} from 'react-native';
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDocs, getDoc, query, orderBy } from 'firebase/firestore';
import { ref, listAll } from 'firebase/storage';
import { auth, db, storage } from '../../services/firebase';
import AnatomyViewer, { matchMuskelFil } from '../../components/AnatomyViewer';
import { colors } from '../../theme/colors';

const ADMIN_UID = 'RpzuHdFg5heYMVHjC6F4IBPSrmq2';
const BACKEND_URL = 'https://mshelse-server.onrender.com';

const KROPPSDELER = ['Korsrygg', 'Hofte', 'Nakke', 'Skulder', 'Kne', 'Legg', 'Core', 'Ankel', 'Bryst', 'Biceps', 'Triceps', 'Hamstring', 'Quad'];
const AKT_VALG = [1, 2, 3];

const TRACKING_TYPER: { id: string; label: string }[] = [
  { id: 'completed',          label: 'Fullført' },
  { id: 'activation_quality', label: 'Aktivering (0–10)' },
  { id: 'contact_reps',       label: 'Reps m/kontakt' },
  { id: 'sets_reps',          label: 'Sett/reps' },
  { id: 'sets_reps_weight',   label: 'Sett/reps/motstand' },
  { id: 'mobility',           label: 'Bevegelighet (0–10)' },
  { id: 'rpe',                label: 'Anstrengelse (RPE)' },
  { id: 'side_diff',          label: 'Sideforskjell' },
];

const MOTSTAND_TYPER = ['Kroppsvekt', 'Strikk', 'Manualer', 'Stang', 'Kettlebell', 'Kabelmaskin'];

interface AnatomiBilde { bilde: string; type: 'overfladisk' | 'dyp'; rolle?: 'primer' | 'sekundar' | 'stabilisator'; }
interface AnatomiData  { anterior: AnatomiBilde[]; posterior: AnatomiBilde[]; }

function parseMuskelFil(fil: string) {
  const muskelMatch = fil.match(/Muscle Group=[-\s]*([^,]+)/);
  const viewMatch   = fil.match(/View=\s*([^,]+)/);
  const dissMatch   = fil.match(/Dissection=\s*([^.]+)/);
  return {
    muskel:     (muskelMatch?.[1] || fil).trim(),
    view:       (viewMatch?.[1]  || '').trim(),
    dissection: (dissMatch?.[1]  || '').trim(),
  };
}

// Hent unike muskelnavn for en gitt view fra filliste
function unikeMuskler(filer: string[], view: 'anterior' | 'posterior'): string[] {
  const viewStr = view === 'anterior' ? 'Anterior' : 'Posterior';
  const navn = new Set<string>();
  filer.forEach(f => {
    const parsed = parseMuskelFil(f);
    if (parsed.view.trim() !== viewStr) return;
    if (parsed.muskel) navn.add(parsed.muskel);
  });
  return Array.from(navn).sort();
}

// Finn beste fil for en muskel+view – returnerer Outer som standard
function finnBesteFiler(muskelNavn: string, view: 'anterior' | 'posterior', filer: string[], preferertType?: 'overfladisk' | 'dyp'): AnatomiBilde[] {
  const viewStr = view === 'anterior' ? 'Anterior' : 'Posterior';
  const norm = (s: string) => s.toLowerCase().trim();
  const kandidater = filer.filter(f => {
    const parsed = parseMuskelFil(f);
    return parsed.view.trim() === viewStr && norm(parsed.muskel) === norm(muskelNavn);
  });
  const outer = kandidater.find(f => f.includes('Dissection=Outer Muscles'));
  const inner = kandidater.find(f => f.includes('Dissection=Inner Muscles'));

  // Respekter preferert type hvis filen finnes
  if (preferertType === 'dyp' && inner) return [{ bilde: inner, type: 'dyp' }];
  if (preferertType === 'overfladisk' && outer) return [{ bilde: outer, type: 'overfladisk' }];

  // Standard: Outer først
  if (outer) return [{ bilde: outer, type: 'overfladisk' }];
  if (inner) return [{ bilde: inner, type: 'dyp' }];
  return [];
}

// Hva slags filer finnes for en muskel?
type MuskelVisning = 'begge' | 'outer' | 'inner' | 'ingen';
function muskelVisning(muskelNavn: string, view: 'anterior' | 'posterior', filer: string[]): MuskelVisning {
  const viewStr = view === 'anterior' ? 'Anterior' : 'Posterior';
  const norm = (s: string) => s.toLowerCase().trim();
  const kandidater = filer.filter(f => {
    const parsed = parseMuskelFil(f);
    return parsed.view.trim() === viewStr && norm(parsed.muskel) === norm(muskelNavn);
  });
  const harOuter = kandidater.some(f => f.includes('Dissection=Outer Muscles'));
  const harInner = kandidater.some(f => f.includes('Dissection=Inner Muscles'));
  if (harOuter && harInner) return 'begge';
  if (harOuter) return 'outer';
  if (harInner) return 'inner';
  return 'ingen';
}

export default function AdminOvelseScreen({ navigation }: any) {
  const [visForm,          setVisForm]          = useState(false);
  const [redigerer,        setRedigerer]        = useState<any>(null);
  const [ovelser,          setOvelser]          = useState<any[]>([]);
  const [laster,           setLaster]           = useState(true);
  const [lagrer,           setLagrer]           = useState(false);
  const [sok,              setSok]              = useState('');
  const [filterKroppsdel,  setFilterKroppsdel]  = useState('Alle');
  const [melding,          setMelding]          = useState('');

  const [navn,             setNavn]             = useState('');
  const [videoUrl,         setVideoUrl]         = useState('');
  const [hold,             setHold]             = useState('');
  const [tempo,            setTempo]            = useState('');
  const [valgteKroppsdeler,setValgteKroppsdeler]= useState<string[]>([]);
  const [valgteAkt,        setValgteAkt]        = useState<number[]>([]);
  const [instruksjon,      setInstruksjon]      = useState('');
  const [trackingTypes,    setTrackingTypes]    = useState<string[]>(['completed']);
  const [motstandsType,    setMotstandsType]    = useState<string[]>([]);
  const [kliniskNotat,     setKliniskNotat]     = useState('');
  const [generererNotat,   setGenerererNotat]   = useState(false);

  // Anatomi
  const [muskelFiler,      setMuskelFiler]      = useState<string[]>([]);
  const [anatomi,          setAnatomi]          = useState<AnatomiData>({ anterior: [], posterior: [] });
  const [genererAnatomi,   setGenererAnatomi]   = useState(false);
  const [visMuskelPicker,  setVisMuskelPicker]  = useState(false);
  const [pickerView,       setPickerView]       = useState<'anterior' | 'posterior'>('anterior');
  const [pickerSok,        setPickerSok]        = useState('');

  const user = auth.currentUser;

  // Vis inline-melding som forsvinner etter 3s
  function visMelding(tekst: string) {
    setMelding(tekst);
    setTimeout(() => setMelding(''), 3000);
  }

  useEffect(() => {
    if (user?.uid !== ADMIN_UID) return;
    hentOvelser();
    hentMuskelFiler();
  }, []);

  async function hentMuskelFiler() {
    try {
      const res = await listAll(ref(storage, 'anatomy/'));
      setMuskelFiler(res.items.map(item => item.name));
    } catch (e) { console.error('Klarte ikke hente muskelfiler:', e); }
  }

  async function hentOvelser() {
    try {
      const snap = await getDocs(query(collection(db, 'exercises'), orderBy('name')));
      setOvelser(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLaster(false); }
  }

  function nullstillForm() {
    setNavn(''); setVideoUrl('');
    setHold(''); setTempo('');
    setValgteKroppsdeler([]); setValgteAkt([]);
    setInstruksjon('');
    setTrackingTypes(['completed']); setMotstandsType([]);
    setKliniskNotat('');
    setAnatomi({ anterior: [], posterior: [] });
    setRedigerer(null);
    setMelding('');
  }

  async function kopierOvelse(id: string) {
    try {
      const snap = await getDoc(doc(db, 'exercises', id));
      if (!snap.exists()) return;
      const o = snap.data();
      setRedigerer(null);
      setNavn((o.name || '') + ' (kopi)');
      setVideoUrl(o.videoUrl || '');
      setHold(o.hold !== undefined && o.hold !== null ? String(o.hold) : '');
      setTempo(o.tempo || '');
      setValgteKroppsdeler(o.bodyParts || []);
      setValgteAkt(o.act || []);
      setInstruksjon(o.instruksjon || '');
      setTrackingTypes(o.tracking_types || (o.tracking_type ? [o.tracking_type] : ['completed']));
      setMotstandsType(o.motstandsType || []);
      setKliniskNotat(o.kliniskNotat || '');
      setAnatomi(o.anatomi || { anterior: [], posterior: [] });
      setVisForm(true);
    } catch (e) {
      visMelding('Klarte ikke kopiere øvelsen');
    }
  }

  function lastInnRedigering(o: any) {
    setRedigerer(o);
    setNavn(o.name || '');
    setVideoUrl(o.videoUrl || '');
    setHold(o.hold !== undefined && o.hold !== null ? String(o.hold) : '');
    setTempo(o.tempo || '');
    setValgteKroppsdeler(o.bodyParts || []);
    setValgteAkt(o.act || []);
    setInstruksjon(o.instruksjon || '');
    setTrackingTypes(o.tracking_types || (o.tracking_type ? [o.tracking_type] : ['completed']));
    setMotstandsType(o.motstandsType || []);
    setKliniskNotat(o.kliniskNotat || '');
    setAnatomi(o.anatomi || { anterior: [], posterior: [] });
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
      const ny = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      return ny.length > 0 ? ny : ['completed'];
    });
  }
  function toggleMotstand(type: string) {
    setMotstandsType(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  }

  // ── Deriver muskelgrupper fra anatomi-state ────────────────────────────
  function muskelgrupperFraAnatomi(a: AnatomiData) {
    const alle = [...a.anterior, ...a.posterior];
    const primer: string[] = [], sekundar: string[] = [], stabilisator: string[] = [];
    const sett = new Set<string>();
    alle.forEach(entry => {
      const navn = parseMuskelFil(entry.bilde).muskel;
      if (!navn || sett.has(navn.toLowerCase())) return;
      sett.add(navn.toLowerCase());
      const rolle = entry.rolle || 'primer';
      if (rolle === 'sekundar') sekundar.push(navn);
      else if (rolle === 'stabilisator') stabilisator.push(navn);
      else primer.push(navn);
    });
    return { primer, sekundar, stabilisator };
  }

  function leggTilFraPicker(muskelNavn: string) {
    const nyeBilder = finnBesteFiler(muskelNavn, pickerView, muskelFiler);
    if (nyeBilder.length === 0) return;
    const bilderMedRolle = nyeBilder.map(b => ({ ...b, rolle: 'primer' as const }));
    setAnatomi(prev => {
      const norm = (s: string) => s.toLowerCase().trim();
      const harAllerede = prev[pickerView].some((e: AnatomiBilde) =>
        norm(parseMuskelFil(e.bilde).muskel) === norm(muskelNavn)
      );
      if (harAllerede) {
        // Toggle av: fjern muskelen
        return { ...prev, [pickerView]: prev[pickerView].filter((e: AnatomiBilde) =>
          norm(parseMuskelFil(e.bilde).muskel) !== norm(muskelNavn)
        )};
      }
      return { ...prev, [pickerView]: [...prev[pickerView], ...bilderMedRolle] };
    });
  }

  // Toggle type (overfladisk ↔ dyp) for en anatomi-entry
  function toggleAnatomType(view: 'anterior' | 'posterior', muskelKey: string) {
    setAnatomi(prev => {
      const liste = prev[view].map((entry: AnatomiBilde) => {
        const norm = (s: string) => s.toLowerCase().trim();
        if (norm(parseMuskelFil(entry.bilde).muskel) !== muskelKey) return entry;
        if (entry.type === 'overfladisk') {
          const innerFil = entry.bilde.replace('Dissection=Outer Muscles', 'Dissection=Inner Muscles');
          // Sjekk at Inner-fil finnes
          const finnes = muskelFiler.some(f => f === innerFil);
          if (!finnes) { visMelding('Ingen dyp-fil finnes for denne muskelen'); return entry; }
          return { ...entry, type: 'dyp' as const, bilde: innerFil };
        } else {
          const outerFil = entry.bilde.replace('Dissection=Inner Muscles', 'Dissection=Outer Muscles');
          const finnes = muskelFiler.some(f => f === outerFil);
          if (!finnes) { visMelding('Ingen overfladisk-fil finnes for denne muskelen'); return entry; }
          return { ...entry, type: 'overfladisk' as const, bilde: outerFil };
        }
      });
      return { ...prev, [view]: liste };
    });
  }

  // Toggle rolle (primer → sekundar → stabilisator → primer) for en anatomi-entry
  function toggleRolle(view: 'anterior' | 'posterior', muskelKey: string) {
    const syklus: Array<'primer' | 'sekundar' | 'stabilisator'> = ['primer', 'sekundar', 'stabilisator'];
    setAnatomi(prev => {
      const norm = (s: string) => s.toLowerCase().trim();
      const liste = prev[view].map((entry: AnatomiBilde) => {
        if (norm(parseMuskelFil(entry.bilde).muskel) !== muskelKey) return entry;
        const nåIdx = syklus.indexOf(entry.rolle || 'primer');
        const nesteRolle = syklus[(nåIdx + 1) % 3];
        return { ...entry, rolle: nesteRolle };
      });
      return { ...prev, [view]: liste };
    });
  }

  async function genererAINotat() {
    if (!instruksjon.trim()) { visMelding('Fyll inn instruksjon først'); return; }
    setGenerererNotat(true);
    try {
      const mg = muskelgrupperFraAnatomi(anatomi);
      const prompt = `Du er en klinisk muskel- og skjeletterapeut med 30 års erfaring.

Skriv et kort klinisk notat (2–4 setninger) for denne øvelsen som skal brukes av en AI for å velge riktige øvelser til rehabiliteringsprogrammer.

Øvelse: ${navn || '(ikke navngitt)'}
Instruksjon: ${instruksjon}
Kroppsdeler: ${valgteKroppsdeler.join(', ') || '(ikke spesifisert)'}
Primære muskler: ${mg.primer.join(', ') || '(ikke spesifisert)'}
Sekundære muskler: ${mg.sekundar.join(', ') || '(ikke spesifisert)'}
Stabilisatorer: ${mg.stabilisator.join(', ') || '(ikke spesifisert)'}
Akt: ${valgteAkt.join(', ') || '(ikke spesifisert)'}
Tracking-typer: ${trackingTypes.join(', ')}${motstandsType.length ? `\nMotstandstype: ${motstandsType.join(', ')}` : ''}

Notatet skal beskrive:
- Hvilke muskler og strukturer som primært aktiveres
- Hvilke kliniske tilstander eller kompensasjonsmønstre øvelsen adresserer
- Eventuelle kontraindikasjoner eller forsiktighetsregler

Svar kun med selve notatet, ingen overskrifter eller forklaringer.`;

      const res  = await fetch(`${BACKEND_URL}/api/proxy`, {
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
      if (tekst) setKliniskNotat(tekst);
      else visMelding('Ingen tekst generert. Prøv igjen.');
    } catch (e) {
      visMelding('Feil ved AI-generering. Sjekk internett og prøv igjen.');
    } finally { setGenerererNotat(false); }
  }

  async function genererAnatomiMapping() {
    setGenererAnatomi(true);
    try {
      let filer = muskelFiler;
      if (filer.length === 0) {
        const res = await listAll(ref(storage, 'anatomy/'));
        filer = res.items.map(item => item.name);
        setMuskelFiler(filer);
      }
      if (filer.length === 0) {
        visMelding('Ingen filer funnet i Storage.');
        setGenererAnatomi(false);
        return;
      }

      // Filtrer til kun Outer-filer for AI-en (holder prompten kortere)
      const outerFiler = filer.filter(f => f.includes('Dissection=Outer Muscles'));

      const mg2 = muskelgrupperFraAnatomi(anatomi);
      const prompt = `Du er anatomiekspert. Velg hvilke muskelbilder som skal vises for denne øvelsen.

Øvelse: ${navn || '(ikke navngitt)'}
Primære muskler: ${mg2.primer.join(', ') || '(ikke spesifisert)'}
Sekundære muskler: ${mg2.sekundar.join(', ') || '(ikke spesifisert)'}
Stabilisatorer: ${mg2.stabilisator.join(', ') || '(ikke spesifisert)'}
Kroppsdeler: ${valgteKroppsdeler.join(', ') || '(ikke spesifisert)'}
Instruksjon: ${instruksjon || '(ikke spesifisert)'}

Tilgjengelige filer (Outer/overfladisk – det finnes tilsvarende Inner/dyp for alle):
${outerFiler.join('\n')}

Returner KUN et JSON-objekt (ingen annen tekst):
{
  "anterior": [{ "bilde": "eksakt filnavn fra listen", "type": "overfladisk", "rolle": "primer" }],
  "posterior": [{ "bilde": "eksakt filnavn fra listen", "type": "overfladisk", "rolle": "sekundar" }]
}

Regler:
- Bruk BARE filnavn fra listen, ord for ord
- type er alltid "overfladisk" (admin kan bytte til dyp manuelt etterpå)
- rolle er "primer", "sekundar" eller "stabilisator" basert på muskelgrupper oppgitt over
- Primære muskler alltid med. Sekundære kun om klinisk relevante
- Ta med begge sider (anterior + posterior) der relevant
- Maks 3 filer per side`;

      const res  = await fetch(`${BACKEND_URL}/api/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: 'Du er anatomiekspert. Svar KUN med et JSON-objekt, ingen forklaringer eller markdown.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data  = await res.json();
      const tekst = data.content?.[0]?.text?.trim() || '';
      const start = tekst.indexOf('{');
      const end   = tekst.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('Ingen JSON i svar');
      const parsed: AnatomiData = JSON.parse(tekst.slice(start, end + 1));
      // Fuzzy-match filnavnene mot faktiske Storage-filer
      const fixBilder = (liste: AnatomiBilde[]) =>
        (liste || []).map(b => ({ ...b, bilde: matchMuskelFil(b.bilde, filer) }));
      setAnatomi({
        anterior: fixBilder(parsed.anterior),
        posterior: fixBilder(parsed.posterior),
      });
    } catch (e) {
      visMelding('Feil ved anatomi-generering. Prøv igjen.');
      console.error(e);
    } finally { setGenererAnatomi(false); }
  }

  async function lagre() {
    if (!navn.trim()) { visMelding('Mangler navn'); return; }
    setLagrer(true);
    const data = {
      name:            navn.trim(),
      videoUrl:        videoUrl.trim(),
      hold:            hold ? parseInt(hold) : null,
      tempo:           tempo.trim() || null,
      bodyParts:       valgteKroppsdeler,
      act:             valgteAkt,
      muskelgrupper:   muskelgrupperFraAnatomi(anatomi),
      instruksjon:    instruksjon.trim(),
      tracking_types: trackingTypes,
      tracking_type:  trackingTypes[0] || 'completed',
      motstandsType:  trackingTypes.includes('sets_reps_weight') ? motstandsType : [],
      kliniskNotat:   kliniskNotat.trim(),
      anatomi:        (anatomi.anterior.length > 0 || anatomi.posterior.length > 0) ? anatomi : null,
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
      visMelding('Feil ved lagring');
      console.error(e);
    } finally { setLagrer(false); }
  }

  if (user?.uid !== ADMIN_UID) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><Text style={s.feilTekst}>Ingen tilgang</Text></View>
      </SafeAreaView>
    );
  }

  // ── FORM ──────────────────────────────────────────────────────────────────
  if (visForm) {
    const antallAnatomi = anatomi.anterior.length + anatomi.posterior.length;

    // Hjelpefunksjon for anatomi-chips per view
    const renderAnatomiChips = (view: 'anterior' | 'posterior', label: string) => {
      const norm = (s: string) => s.toLowerCase().trim();
      const sett = new Map<string, AnatomiBilde>();
      anatomi[view].forEach((item: AnatomiBilde) => {
        const { muskel } = parseMuskelFil(item.bilde);
        if (!sett.has(norm(muskel))) sett.set(norm(muskel), item);
      });

      return (
        <View style={s.feltGruppe}>
          <Text style={s.feltLabelLiten}>{label}</Text>
          <View style={s.chipRad}>
            {Array.from(sett.entries()).map(([key, item]) => {
              const { muskel } = parseMuskelFil(item.bilde);
              const vis = muskelVisning(muskel, view, muskelFiler);
              const erDyp = item.type === 'dyp';
              const kanToggle = vis === 'begge';
              const chipStil = erDyp ? s.anatomiChipDyp : s.anatomiChip;
              const tekstStil = erDyp ? s.anatomiChipTekstDyp : s.anatomiChipTekst;
              const merke = erDyp ? '◉' : '○';
              const rolleFarge = ROLLE_CHIP_FARGE[item.rolle || 'primer'];
              const rolleLabel = item.rolle === 'stabilisator' ? 'S' : item.rolle === 'sekundar' ? 'K' : 'P';

              return (
                <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  {/* Toggle type ved trykk på ikon (kun for muskler med begge varianter) */}
                  {kanToggle && (
                    <TouchableOpacity
                      style={s.toggleTypeKnapp}
                      onPress={() => toggleAnatomType(view, key)}
                    >
                      <Text style={[s.toggleTypeTekst, erDyp ? { color: colors.yellow } : { color: colors.muted2 }]}>
                        {erDyp ? '◉' : '○'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {/* Rolle-toggle: trykk ● for å sykle primer→sekundar→stabilisator */}
                  <TouchableOpacity
                    style={[s.rolleKnapp, { borderColor: rolleFarge || ROLLE_CHIP_FARGE.primer }]}
                    onPress={() => toggleRolle(view, key)}
                  >
                    <Text style={{ fontSize: 10, color: rolleFarge || ROLLE_CHIP_FARGE.primer, fontWeight: '600' }}>
                      {rolleLabel}
                    </Text>
                  </TouchableOpacity>
                  {/* Fjern ved trykk på chippen */}
                  <TouchableOpacity style={chipStil} onPress={() => {
                    setAnatomi(prev => ({
                      ...prev,
                      [view]: prev[view].filter((e: AnatomiBilde) => norm(parseMuskelFil(e.bilde).muskel) !== key)
                    }));
                  }}>
                    <Text style={tekstStil}>
                      {!kanToggle && `${merke} `}{muskel} ×
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <TouchableOpacity style={s.leggTilChip} onPress={() => { setPickerView(view); setPickerSok(''); setVisMuskelPicker(true); }}>
              <Text style={s.leggTilChipTekst}>+ Legg til</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    };

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

        {/* Inline melding */}
        {melding ? (
          <View style={s.meldingBoks}>
            <Text style={s.meldingTekst}>{melding}</Text>
          </View>
        ) : null}

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

          <View style={s.radFelter}>
            <View style={[s.feltGruppe, { flex: 1 }]}>
              <Text style={s.feltLabel}>HOLD (sek)</Text>
              <TextInput style={s.input} value={hold} onChangeText={v => setHold(v.replace(/[^0-9]/g, ''))} placeholder="5" placeholderTextColor={colors.muted2} keyboardType="numeric" />
            </View>
            <View style={[s.feltGruppe, { flex: 1 }]}>
              <Text style={s.feltLabel}>TEMPO</Text>
              <TextInput style={s.input} value={tempo} onChangeText={setTempo} placeholder="3-0-1" placeholderTextColor={colors.muted2} autoCapitalize="none" />
            </View>
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabel}>KROPPSDELER</Text>
            <View style={s.chipRad}>
              {KROPPSDELER.map(del => (
                <TouchableOpacity key={del} style={[s.chip, valgteKroppsdeler.includes(del) && s.chipAktiv]} onPress={() => toggleKroppsdel(del)}>
                  <Text style={[s.chipTekst, valgteKroppsdeler.includes(del) && s.chipTekstAktiv]}>{del}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabel}>AKT</Text>
            <View style={s.chipRad}>
              {AKT_VALG.map(a => (
                <TouchableOpacity key={a} style={[s.chip, valgteAkt.includes(a) && s.chipAktivGreen]} onPress={() => toggleAkt(a)}>
                  <Text style={[s.chipTekst, valgteAkt.includes(a) && s.chipTekstAktiv]}>Akt {a}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabel}>INSTRUKSJON</Text>
            <TextInput style={[s.input, s.inputMultilinje]} value={instruksjon} onChangeText={setInstruksjon} placeholder="Steg-for-steg instruksjon brukeren ser under økten..." placeholderTextColor={colors.muted2} multiline />
          </View>

          <View style={s.feltGruppe}>
            <Text style={s.feltLabelLiten}>TRACKING-TYPER</Text>
            <View style={s.trackingGrid}>
              {TRACKING_TYPER.map(t => {
                const aktiv = trackingTypes.includes(t.id);
                return (
                  <TouchableOpacity key={t.id} style={[s.trackingChip, aktiv && s.trackingChipAktiv]} onPress={() => toggleTrackingType(t.id)}>
                    <Text style={[s.trackingChipTekst, aktiv && s.trackingChipTekstAktiv]}>{t.label}</Text>
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
                  <TouchableOpacity key={t} style={[s.chip, motstandsType.includes(t) && s.chipAktivGreen]} onPress={() => toggleMotstand(t)}>
                    <Text style={[s.chipTekst, motstandsType.includes(t) && s.chipTekstAktiv]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={s.feltGruppe}>
            <View style={s.aiNotatHeader}>
              <Text style={s.feltLabelLiten}>KLINISK NOTAT (kun for AI)</Text>
              <TouchableOpacity style={[s.aiKnapp, generererNotat && s.aiKnappDisabled]} onPress={genererAINotat} disabled={generererNotat}>
                {generererNotat ? <ActivityIndicator size="small" color={colors.green} /> : <Text style={s.aiKnappTekst}>✦ Generer</Text>}
              </TouchableOpacity>
            </View>
            <TextInput style={[s.input, s.inputMultilinje, s.aiInput]} value={kliniskNotat} onChangeText={setKliniskNotat} placeholder="Trykk 'Generer' for å la AI skrive dette – eller skriv selv." placeholderTextColor={colors.muted2} multiline />
          </View>

          {/* ── ANATOMI-MAPPING ──────────────────────────────────────── */}
          <View style={s.seksjonDivider}>
            <View style={s.aiNotatHeader}>
              <Text style={s.feltLabel}>ANATOMI-MAPPING</Text>
              <TouchableOpacity style={[s.aiKnapp, genererAnatomi && s.aiKnappDisabled]} onPress={genererAnatomiMapping} disabled={genererAnatomi}>
                {genererAnatomi ? <ActivityIndicator size="small" color={colors.green} /> : <Text style={s.aiKnappTekst}>✦ Generer</Text>}
              </TouchableOpacity>
            </View>
            {muskelFiler.length === 0 && <Text style={s.inputHint}>Laster filer fra Storage...</Text>}
          </View>

          {/* Foran */}
          {renderAnatomiChips('anterior', 'FORAN (ANTERIOR)')}

          {/* Bak */}
          {renderAnatomiChips('posterior', 'BAK (POSTERIOR)')}

          {/* Preview */}
          <View style={s.feltGruppe}>
            <Text style={s.feltLabelLiten}>FORHÅNDSVISNING</Text>
            <View style={s.anatomiPreview}>
              <AnatomyViewer
                anatomi={anatomi}
                muskelgrupper={muskelgrupperFraAnatomi(anatomi)}
                muskelFiler={muskelFiler}
              />
              {anatomi.anterior.length === 0 && anatomi.posterior.length === 0 && (
                <Text style={s.previewTomTekst}>Ingen muskler valgt</Text>
              )}
            </View>
          </View>

        </ScrollView>

        {/* ── MUSKEL-PICKER MODAL ──────────────────────────────────── */}
        <Modal visible={visMuskelPicker} animationType="slide" transparent onRequestClose={() => setVisMuskelPicker(false)}>
          <View style={s.pickerOverlay}>
            <View style={s.pickerKort}>
              <View style={s.pickerHeader}>
                <Text style={s.pickerTittel}>Legg til – {pickerView === 'anterior' ? 'Foran' : 'Bak'}</Text>
                <TouchableOpacity onPress={() => setVisMuskelPicker(false)}>
                  <Text style={s.pickerLukk}>Ferdig</Text>
                </TouchableOpacity>
              </View>

              <View style={s.pickerToggleRad}>
                <TouchableOpacity style={[s.pickerToggle, pickerView === 'anterior' && s.pickerToggleAktiv]} onPress={() => setPickerView('anterior')}>
                  <Text style={[s.pickerToggleTekst, pickerView === 'anterior' && s.pickerToggleTekstAktiv]}>Foran</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.pickerToggle, pickerView === 'posterior' && s.pickerToggleAktiv]} onPress={() => setPickerView('posterior')}>
                  <Text style={[s.pickerToggleTekst, pickerView === 'posterior' && s.pickerToggleTekstAktiv]}>Bak</Text>
                </TouchableOpacity>
              </View>

              <TextInput style={s.pickerSok} value={pickerSok} onChangeText={setPickerSok} placeholder="Søk muskel..." placeholderTextColor={colors.muted2} />

              <ScrollView style={s.pickerListe} contentContainerStyle={{ gap: 2, paddingBottom: 20 }}>
                {(() => {
                  const norm = (s: string) => s.toLowerCase().trim();
                  const muskler = unikeMuskler(muskelFiler, pickerView)
                    .filter(m => !pickerSok.trim() || m.toLowerCase().includes(pickerSok.toLowerCase()));
                  return muskler.map(muskelNavn => {
                    const vis = muskelVisning(muskelNavn, pickerView, muskelFiler);
                    const erValgt = anatomi[pickerView].some((e: AnatomiBilde) =>
                      norm(parseMuskelFil(e.bilde).muskel) === norm(muskelNavn)
                    );
                    const visLabel = vis === 'begge' ? 'overfl. + dyp' : vis === 'inner' ? 'dyp' : 'overfl.';
                    const visKode  = vis === 'begge' ? '⬡' : vis === 'inner' ? '◉' : '○';
                    const visStil  = vis === 'begge' ? { color: colors.green } : vis === 'inner' ? { color: colors.yellow } : { color: colors.muted2 };
                    return (
                      <TouchableOpacity key={muskelNavn} style={[s.pickerRad, erValgt && s.pickerRadValgt]} onPress={() => leggTilFraPicker(muskelNavn)}>
                        <Text style={[s.pickerMuskel, erValgt && s.pickerMuskelValgt]}>{muskelNavn}</Text>
                        <Text style={[s.pickerDissection, visStil]}>{visKode} {visLabel}</Text>
                        {erValgt && <Text style={s.pickerCheckmark}>✓</Text>}
                      </TouchableOpacity>
                    );
                  });
                })()}
                {unikeMuskler(muskelFiler, pickerView).filter(m => !pickerSok.trim() || m.toLowerCase().includes(pickerSok.toLowerCase())).length === 0 && (
                  <Text style={s.pickerTomTekst}>Ingen treff</Text>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    );
  }

  // ── LISTE ─────────────────────────────────────────────────────────────────
  const alleKroppsdeler = ['Alle', ...Array.from(new Set(ovelser.flatMap(o => o.bodyParts || []))).sort()];

  function filtrerte() {
    return ovelser.filter(o => {
      const matchSok    = !sok.trim() || o.name?.toLowerCase().includes(sok.toLowerCase());
      const matchFilter = filterKroppsdel === 'Alle' || (o.bodyParts || []).includes(filterKroppsdel);
      return matchSok && matchFilter;
    });
  }

  function gruppert(): Record<string, any[]> {
    const liste = filtrerte();
    if (filterKroppsdel !== 'Alle') return { [filterKroppsdel]: liste };
    const grupper: Record<string, any[]> = {};
    liste.forEach(o => {
      (o.bodyParts || ['Annet']).forEach((del: string) => {
        if (!grupper[del]) grupper[del] = [];
        if (!grupper[del].find((x: any) => x.id === o.id)) grupper[del].push(o);
      });
    });
    return grupper;
  }

  const grupper        = gruppert();
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

      {/* Inline melding i liste-modus */}
      {melding ? (
        <View style={s.meldingBoks}>
          <Text style={s.meldingTekst}>{melding}</Text>
        </View>
      ) : null}

      {laster ? (
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <>
          <View style={s.sokWrapper}>
            <TextInput style={s.sokInput} value={sok} onChangeText={setSok} placeholder="Søk øvelser..." placeholderTextColor={colors.muted2} />
            <Text style={s.antallTekst}>{antallFiltrert} av {ovelser.length}</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterInner}>
            {alleKroppsdeler.map(k => (
              <TouchableOpacity key={k} style={[s.filterChip, filterKroppsdel === k && s.filterChipAktiv]} onPress={() => setFilterKroppsdel(k)}>
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
              <View style={s.tomKort}><Text style={s.tomTekst}>Ingen treff på "{sok}"</Text></View>
            ) : (
              Object.entries(grupper).map(([del, liste]) => (
                <View key={del} style={s.gruppe}>
                  <Text style={s.gruppeTittel}>{del.toUpperCase()} · {liste.length}</Text>
                  <View style={s.kort}>
                    {(liste as any[]).map((o, i) => (
                      <View key={o.id} style={[s.ovelseRad, i < liste.length - 1 && s.ovelseRadBorder]}>
                        <TouchableOpacity style={{ flex: 1 }} onPress={() => lastInnRedigering(o)}>
                          <View style={s.ovelseInfo}>
                            <Text style={s.ovelseNavn}>{o.name}</Text>
                            <Text style={s.ovelseMeta}>
                              {o.muskelgrupper?.primer?.length ? o.muskelgrupper.primer.slice(0, 2).join(', ') : (o.bodyParts || []).join(', ')}
                              {o.act?.length ? ` · Akt ${o.act.join('/')}` : ''}
                              {o.anatomi ? ' · 🫀' : ''}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.kopierKnapp} onPress={() => kopierOvelse(o.id)}>
                          <Text style={s.kopierKnappTekst}>Kopier</Text>
                        </TouchableOpacity>
                        <Text style={s.pil}>›</Text>
                      </View>
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

const ROLLE_CHIP_FARGE: Record<string, string> = {
  primer: '#E05555', sekundar: '#D4A82A', stabilisator: '#4A90D9',
};

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
  meldingBoks: { backgroundColor: colors.yellowDim, borderBottomWidth: 1, borderBottomColor: colors.yellowBorder, paddingVertical: 8, paddingHorizontal: 16 },
  meldingTekst: { fontSize: 13, color: colors.yellow, fontWeight: '400' },
  anatomiChip:            { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface },
  anatomiChipDyp:         { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.yellowBorder, backgroundColor: colors.yellowDim },
  anatomiChipTekst:       { fontSize: 12, color: colors.muted },
  anatomiChipTekstDyp:    { fontSize: 12, color: colors.yellow },
  toggleTypeKnapp:        { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  toggleTypeTekst:        { fontSize: 11 },
  rolleKnapp:             { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  previewTomTekst:        { fontSize: 12, color: colors.muted2, fontWeight: '300', padding: 8 },
  leggTilChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface },
  leggTilChipTekst: { fontSize: 12, color: colors.muted },
  anatomiPreview: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, alignItems: 'center' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerKort: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', paddingBottom: 20 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerTittel: { fontSize: 15, fontWeight: '500', color: colors.text },
  pickerLukk: { fontSize: 14, color: colors.accent, fontWeight: '600' },
  pickerToggleRad: { flexDirection: 'row', gap: 6, padding: 12, alignItems: 'center' },
  pickerToggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface2 },
  pickerToggleAktiv: { backgroundColor: colors.accent, borderColor: colors.accent },
  pickerToggleTekst: { fontSize: 13, color: colors.muted },
  pickerToggleTekstAktiv: { color: colors.bg, fontWeight: '500' },
  pickerSok: { marginHorizontal: 12, marginBottom: 6, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 9, fontSize: 14, color: colors.text },
  pickerListe: { paddingHorizontal: 12 },
  pickerRad: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, gap: 8 },
  pickerRadValgt: { backgroundColor: colors.greenDim },
  pickerMuskel: { fontSize: 14, color: colors.text, flex: 1 },
  pickerMuskelValgt: { color: colors.green, fontWeight: '500' },
  pickerDissection: { fontSize: 11, color: colors.muted2 },
  pickerCheckmark: { fontSize: 14, color: colors.green },
  pickerTomTekst: { fontSize: 13, color: colors.muted2, textAlign: 'center', padding: 20 },
  tomKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 24, alignItems: 'center', gap: 14 },
  tomTekst: { fontSize: 14, color: colors.muted },
  btnPrimary: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 24 },
  btnPrimaryTekst: { color: colors.bg, fontSize: 14, fontWeight: '600' },
  sokWrapper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  sokInput: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 9, fontSize: 14, color: colors.text },
  antallTekst: { fontSize: 12, color: colors.muted2, fontWeight: '300', minWidth: 40, textAlign: 'right' },
  filterScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterInner: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface },
  filterChipAktiv: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterTekst: { fontSize: 13, color: colors.muted },
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
  kopierKnapp: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface2, marginRight: 8 },
  kopierKnappTekst: { fontSize: 11, color: colors.muted, fontWeight: '400' },
});
