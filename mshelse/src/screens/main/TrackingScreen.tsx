import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, ActivityIndicator, Dimensions, Modal
} from 'react-native';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { colors } from '../../theme/colors';

const BREDDE = Dimensions.get('window').width - 40;
const DAGER = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

// Mapping fra tracking_type til radar-kategori
const TYPE_TIL_KATEGORI: Record<string, string> = {
  activation_quality: 'Aktivering',
  completed:          'Aktivering',
  contact_reps:       'Stabilitet',
  side_diff:          'Stabilitet',
  mobility:           'Mobilitet',
  sets_reps:          'Styrke',
  sets_reps_weight:   'Styrke',
  rpe:                'Utholdenhet',
};

const RADAR_KATEGORIER = ['Aktivering', 'Stabilitet', 'Mobilitet', 'Styrke', 'Utholdenhet'];

function getMandagIUken(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dag = d.getDay();
  d.setDate(d.getDate() + (dag === 0 ? -6 : 1 - dag));
  return d;
}

function grupperLoggerPerUke(logger: any[]): { label: string; logger: any[]; fullfort: number }[] {
  const dagensMandag = getMandagIUken(new Date());
  const ukeMap = new Map<number, any[]>();
  logger.forEach(l => {
    const dato = l.dato?.toDate ? l.dato.toDate() : new Date(l.dato);
    const logMandag = getMandagIUken(dato);
    const ukeNr = Math.round((dagensMandag.getTime() - logMandag.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (ukeNr < 0 || ukeNr > 7) return;
    if (!ukeMap.has(ukeNr)) ukeMap.set(ukeNr, []);
    ukeMap.get(ukeNr)!.push(l);
  });
  return Array.from(ukeMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ukeNr, logs]) => ({
      label: ukeNr === 0 ? 'DENNE UKEN' : ukeNr === 1 ? 'FORRIGE UKE' : `${ukeNr} UKER SIDEN`,
      logger: logs,
      fullfort: logs.filter(l => l.fullfort).length,
    }));
}

export default function TrackingScreen({ navigation }: any) {
  const [laster, setLaster] = useState(true);
  const [logger, setLogger] = useState<any[]>([]);
  const [programmer, setProgrammer] = useState<any[]>([]);

  // Fremgang-graf: to-nivå navigasjon
  const [valgtProgram, setValgtProgram] = useState<string | null>(null);
  const [valgtOvelse, setValgtOvelse] = useState<string | null>(null);
  const [visOvelseList, setVisOvelseList] = useState(false);
  const [visRadarInfo, setVisRadarInfo] = useState(false);

  // Logg: ekspanderbare rader
  const [ekspandert, setEkspandert] = useState<Set<string>>(new Set());

  useEffect(() => { hentData(); }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => hentData());
    return unsub;
  }, [navigation]);

  async function hentData() {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const [loggSnap, progSnap] = await Promise.all([
        getDocs(query(collection(db, 'users', user.uid, 'logger'), orderBy('dato', 'desc'), limit(50))),
        getDocs(query(collection(db, 'users', user.uid, 'programs'), orderBy('opprettet', 'desc'))),
      ]);
      setLogger(loggSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProgrammer(progSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLaster(false); }
  }

  // ── RADAR-LOGIKK ──────────────────────────────────────────────

  function normaliserVerdi(verdier: number[], type: string, allVerdier: number[]): number {
    if (verdier.length === 0) return 0;
    const snitt = verdier.reduce((a, b) => a + b, 0) / verdier.length;
    const er010 = ['activation_quality', 'mobility', 'rpe', 'side_diff'].includes(type);
    if (er010) return Math.min(10, snitt);
    // Reps-typer: normaliser mot historisk maks
    const maks = allVerdier.length > 0 ? Math.max(...allVerdier) : snitt;
    return maks > 0 ? Math.min(10, (snitt / maks) * 10) : 0;
  }

  function beregnRadar(loggUtvalg: any[]): Record<string, number> {
    const kategorier: Record<string, { verdier: number[]; type: string; alle: number[] }> = {};

    // Samle alle historiske verdier for normalisering
    const alleVerdierPerType: Record<string, number[]> = {};
    logger.forEach(l => {
      (l.ovelser || []).forEach((o: any) => {
        const types: string[] = o.tracking_types || (o.tracking_type ? [o.tracking_type] : []);
        types.forEach(type => {
          const kat = TYPE_TIL_KATEGORI[type];
          if (!kat) return;
          if (!alleVerdierPerType[type]) alleVerdierPerType[type] = [];
          (o.sett || []).forEach((s: any) => {
            if (s.hoppetOver) return;
            if (type === 'completed') { alleVerdierPerType[type].push(10); return; }
            const v = s.verdier?.[type];
            if (v != null && v > 0) alleVerdierPerType[type].push(v);
          });
        });
      });
    });

    loggUtvalg.forEach(l => {
      (l.ovelser || []).forEach((o: any) => {
        const types: string[] = o.tracking_types || (o.tracking_type ? [o.tracking_type] : []);
        types.forEach(type => {
          const kat = TYPE_TIL_KATEGORI[type];
          if (!kat) return;
          if (!kategorier[kat]) kategorier[kat] = { verdier: [], type, alle: alleVerdierPerType[type] || [] };
          (o.sett || []).forEach((s: any) => {
            if (s.hoppetOver) return;
            if (type === 'completed') { kategorier[kat].verdier.push(10); return; }
            const v = s.verdier?.[type];
            if (v != null && v > 0) kategorier[kat].verdier.push(v);
          });
        });
      });
    });

    const resultat: Record<string, number> = {};
    RADAR_KATEGORIER.forEach(kat => {
      const k = kategorier[kat];
      resultat[kat] = k ? normaliserVerdi(k.verdier, k.type, k.alle) : 0;
    });
    return resultat;
  }

  const halvt = Math.ceil(logger.length / 2);
  const nyligLogger = logger.slice(0, halvt);
  const tidligereLogger = logger.slice(halvt);
  const radarNå = beregnRadar(nyligLogger);
  const radarFør = beregnRadar(tidligereLogger);

  // ── FREMGANG-GRAF ─────────────────────────────────────────────

  // Unike programnavn fra logger
  const programNavn = [...new Set(logger.map((l: any) => l.programTittel).filter(Boolean))];

  // Øvelser for valgt program – inkluder formaalLabel for å skille like øvelser med ulik formål
  const ovelserForProgram: { key: string; navn: string; formaalLabel: string }[] = valgtProgram
    ? Object.values(
        logger
          .filter((l: any) => l.programTittel === valgtProgram)
          .flatMap((l: any) => (l.ovelser || []).map((o: any) => ({
            key: `${o.navn}||${o.formaalLabel || ''}`,
            navn: o.navn,
            formaalLabel: o.formaalLabel || '',
          })))
          .filter((o: any) => o.navn)
          .reduce((acc: any, o: any) => { acc[o.key] = o; return acc; }, {})
      ) as { key: string; navn: string; formaalLabel: string }[]
    : [];

  // Grafdata for valgt øvelse (matcher på navn + formaalLabel)
  function grafDataForOvelse(): { dato: Date; verdi: number }[] {
    if (!valgtProgram || !valgtOvelse) return [];
    const [ovNavn, ovFormaal] = valgtOvelse.split('||');
    return logger
      .filter((l: any) => l.programTittel === valgtProgram && l.fullfort)
      .map((l: any) => {
        const ovelse = (l.ovelser || []).find((o: any) =>
          o.navn === ovNavn && (o.formaalLabel || '') === ovFormaal
        );
        if (!ovelse) return null;
        const sett = (ovelse.sett || []).filter((s: any) => !s.hoppetOver);
        if (sett.length === 0) return null;
        const verdier = sett.flatMap((s: any) =>
          Object.values(s.verdier || {}).filter((v: any) => typeof v === 'number')
        ) as number[];
        if (verdier.length === 0) return null;
        const snitt = verdier.reduce((a, b) => a + b, 0) / verdier.length;
        const dato = l.dato?.toDate ? l.dato.toDate() : new Date(l.dato);
        return { dato, verdi: snitt };
      })
      .filter(Boolean)
      .reverse() as { dato: Date; verdi: number }[];
  }

  const grafData = grafDataForOvelse();

  // ── SPARKLINES ────────────────────────────────────────────────

  function sparklineForOvelse(ovelseNavn: string): number[] {
    return logger
      .filter((l: any) => l.fullfort)
      .slice(0, 8)
      .reverse()
      .map((l: any) => {
        const ovelse = (l.ovelser || []).find((o: any) => o.navn === ovelseNavn);
        if (!ovelse) return null;
        const sett = (ovelse.sett || []).filter((s: any) => !s.hoppetOver);
        const verdier = sett.flatMap((s: any) =>
          Object.values(s.verdier || {}).filter((v: any) => typeof v === 'number')
        ) as number[];
        if (verdier.length === 0) return null;
        return verdier.reduce((a, b) => a + b, 0) / verdier.length;
      })
      .filter((v): v is number => v !== null);
  }

  // ── COMPLIANCE ────────────────────────────────────────────────

  const aktivtProgram = programmer.find((p: any) => p.aktiv);
  const compliance = aktivtProgram?.okterTotalt > 0
    ? Math.round((aktivtProgram.okterFullfort / aktivtProgram.okterTotalt) * 100)
    : logger.length > 0 ? Math.round((logger.filter(l => l.fullfort).length / logger.length) * 100) : 0;

  // ── UKE-OVERSIKT ─────────────────────────────────────────────

  function ukeDager() {
    const idag = new Date();
    const dag = idag.getDay();
    const mandag = new Date(idag);
    mandag.setDate(idag.getDate() - (dag === 0 ? 6 : dag - 1));
    return DAGER.map((navn, i) => {
      const dato = new Date(mandag);
      dato.setDate(mandag.getDate() + i);
      const erIdag = dato.toDateString() === idag.toDateString();
      const logg = logger.find(l => {
        const ld = l.dato?.toDate ? l.dato.toDate() : new Date(l.dato);
        return ld.toDateString() === dato.toDateString();
      });
      return { navn, dato, erIdag, logg };
    });
  }

  if (laster) return (
    <SafeAreaView style={s.container}>
      <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
    </SafeAreaView>
  );

  const ukedager = ukeDager();
  const fullforte = logger.filter(l => l.fullfort).length;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <Text style={s.tittel}>Tracking</Text>
      </View>

      <ScrollView contentContainerStyle={s.inner}>

        {/* Ukeoversikt */}
        <View style={s.ukeKort}>
          <View style={s.ukeDager}>
            {ukedager.map((d, i) => (
              <View key={i} style={s.ukeDag}>
                <Text style={s.ukeDagNavn}>{d.navn}</Text>
                <View style={[
                  s.ukeDagSirkel,
                  d.logg?.fullfort && s.ukeDagFullfort,
                  d.logg && !d.logg.fullfort && s.ukeDagHoppet,
                  d.erIdag && !d.logg && s.ukeDagIdag,
                ]}>
                  <Text style={[
                    s.ukeDagTekst,
                    d.logg?.fullfort && s.ukeDagTekstFullfort,
                    d.logg && !d.logg.fullfort && s.ukeDagTekstHoppet,
                    d.erIdag && !d.logg && s.ukeDagTekstIdag,
                  ]}>
                    {d.logg?.fullfort ? '✓' : d.logg ? '✕' : d.erIdag ? '·' : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Stats */}
        <View style={s.stats}>
          <View style={s.statKort}>
            <Text style={s.statVerdi}>{fullforte}</Text>
            <Text style={s.statLabel}>Økter</Text>
          </View>
          <View style={s.statKort}>
            <Text style={[s.statVerdi, { color: colors.green }]}>{compliance}%</Text>
            <Text style={s.statLabel}>Compliance</Text>
          </View>
          <View style={s.statKort}>
            <Text style={s.statVerdi}>{logger.length}</Text>
            <Text style={s.statLabel}>Totalt logget</Text>
          </View>
        </View>

        {/* Formål-radar */}
        <View style={s.seksjon}>
          <View style={s.seksjonHeaderRad}>
            <Text style={s.seksjonTittel}>TRENINGSPROFIL</Text>
            <TouchableOpacity style={s.infoChip} onPress={() => setVisRadarInfo(true)}>
              <Text style={s.infoChipTekst}>?</Text>
            </TouchableOpacity>
          </View>
          <View style={s.radarKort}>
            <RadarDiagram nå={radarNå} før={radarFør} kategorier={RADAR_KATEGORIER} />
            <View style={s.radarLegend}>
              <View style={s.legendRad}>
                <View style={[s.legendDot, { backgroundColor: colors.green }]} />
                <Text style={s.legendTekst}>Nåværende periode</Text>
              </View>
              {tidligereLogger.length > 0 && (
                <View style={s.legendRad}>
                  <View style={[s.legendDot, { backgroundColor: colors.yellow }]} />
                  <Text style={s.legendTekst}>Forrige periode</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Fremgang-graf: to-nivå navigasjon */}
        <View style={s.seksjon}>
          <Text style={s.seksjonTittel}>FREMGANG</Text>
          <View style={s.grafKort}>

            {/* Nivå 1: Program-chips */}
            {programNavn.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.chipRad}>
                  {programNavn.map(navn => (
                    <TouchableOpacity
                      key={navn}
                      style={[s.grafChip, valgtProgram === navn && s.grafChipAktiv]}
                      onPress={() => {
                        if (valgtProgram === navn) {
                          // Trykk på samme program – toggle øvelse-liste
                          setVisOvelseList(v => !v);
                        } else {
                          // Bytt program – åpne liste, nullstill øvelse
                          setValgtProgram(navn);
                          setValgtOvelse(null);
                          setVisOvelseList(true);
                        }
                      }}
                    >
                      <Text style={[s.grafChipTekst, valgtProgram === navn && s.grafChipTekstAktiv]}>
                        {navn}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text style={s.tomTekst}>Logg noen økter for å se fremgang per program</Text>
            )}

            {/* Nivå 2: Øvelse-liste (variant C – lukkes ved valg) */}
            {valgtProgram && visOvelseList && ovelserForProgram.length > 0 && (
              <View style={s.ovelseListeWrapper}>
                {ovelserForProgram.map(o => {
                  const farger: Record<string, string> = {
                    'Aktivering':  colors.green,
                    'Stabilitet':  colors.yellow,
                    'Mobilitet':   colors.muted,
                    'Styrke':      colors.danger,
                    'Utholdenhet': colors.yellow,
                  };
                  const prikk = farger[o.formaalLabel] || colors.muted2;
                  return (
                    <TouchableOpacity
                      key={o.key}
                      style={[s.ovelseListeRad, valgtOvelse === o.key && s.ovelseListeRadAktiv]}
                      onPress={() => {
                        setValgtOvelse(o.key);
                        setVisOvelseList(false); // Lukk listen
                      }}
                    >
                      <View style={[s.ovelsePrikk, { backgroundColor: prikk }]} />
                      <Text
                        style={[s.ovelseListeNavn, valgtOvelse === o.key && s.ovelseListeNavnAktiv]}
                        numberOfLines={1}
                      >
                        {o.navn}
                      </Text>
                      {o.formaalLabel ? (
                        <View style={[s.formaalBadge, { backgroundColor: `${prikk}20`, borderColor: `${prikk}50` }]}>
                          <Text style={[s.formaalBadgeTekst, { color: prikk }]}>{o.formaalLabel}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Valgt øvelse + graf */}
            {valgtOvelse && !visOvelseList && (
              <TouchableOpacity
                style={s.valgtOvelseRad}
                onPress={() => setVisOvelseList(true)}
              >
                <Text style={s.valgtOvelseNavn} numberOfLines={1}>
                  {valgtOvelse.split('||')[0]}
                </Text>
                <Text style={s.valgtOvelseBytt}>Bytt ↕</Text>
              </TouchableOpacity>
            )}

            {/* Graf */}
            {grafData.length > 1 && !visOvelseList ? (
              <View style={{ marginTop: 8 }}>
                <MiniGraf
                  data={grafData.map(d => d.verdi)}
                  datoer={grafData.map(d => d.dato)}
                  farge={colors.green}
                />
              </View>
            ) : valgtOvelse && !visOvelseList ? (
              <Text style={[s.tomTekst, { marginTop: 8 }]}>
                Ikke nok data for {valgtOvelse.split('||')[0]} ennå
              </Text>
            ) : null}

          </View>
        </View>

        {/* Logg med sparklines */}
        <View style={s.seksjon}>
          <Text style={s.seksjonTittel}>LOGG</Text>
          {logger.length === 0 ? (
            <View style={s.tomKort}>
              <Text style={s.tomTekst}>Ingen logger ennå</Text>
              <Text style={s.tomSub}>Start en økt fra Program-fanen</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {grupperLoggerPerUke(logger).map(uke => (
                <View key={uke.label}>
                  <View style={s.loggUkeHeader}>
                    <Text style={s.loggUkeLabel}>{uke.label}</Text>
                    <Text style={s.loggUkeCompliance}>
                      {uke.fullfort} av {uke.logger.length} fullført
                    </Text>
                  </View>
                  <View style={s.loggListe}>
                    {uke.logger.map((l, i) => {
                      const erEkspandert = ekspandert.has(l.id);
                      const dato = l.dato?.toDate ? l.dato.toDate() : new Date(l.dato);
                      return (
                        <View key={l.id} style={[s.loggRad, i < uke.logger.length - 1 && s.loggRadBorder]}>
                          <TouchableOpacity
                            style={s.loggHeader}
                            onPress={() => setEkspandert(prev => {
                              const ny = new Set(prev);
                              ny.has(l.id) ? ny.delete(l.id) : ny.add(l.id);
                              return ny;
                            })}
                          >
                            <View style={[s.loggIkon, l.fullfort ? s.loggIkonFullfort : s.loggIkonHoppet]} />
                            <View style={s.loggInfo}>
                              <Text style={s.loggNavn}>{l.programTittel || 'Økt'}</Text>
                              <Text style={s.loggMeta}>
                                {dato.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}
                                {l.smerte != null ? ` · Smerte ${l.smerte}/10` : ''}
                              </Text>
                              {l.notat ? <Text style={s.loggNotat}>"{l.notat}"</Text> : null}
                            </View>
                            <View style={[s.loggStatus, l.fullfort ? s.loggStatusFullfort : s.loggStatusHoppet]}>
                              <Text style={[s.loggStatusTekst, l.fullfort ? s.loggStatusTekstF : s.loggStatusTekstH]}>
                                {l.fullfort ? 'Fullført' : 'Hoppet'}
                              </Text>
                            </View>
                          </TouchableOpacity>

                          {erEkspandert && (l.ovelser || []).length > 0 && (
                            <View style={s.loggDetaljer}>
                              {(l.ovelser || []).map((o: any, j: number) => {
                                const spark = sparklineForOvelse(o.navn);
                                const sett = (o.sett || []);
                                return (
                                  <View key={j} style={s.loggOvelseRad}>
                                    <View style={s.loggOvelseHeader}>
                                      {spark.length > 1 && (
                                        <Sparkline data={spark} farge={colors.green} />
                                      )}
                                      <Text style={s.loggOvelseNavn}>{o.navn}</Text>
                                    </View>
                                    <View style={s.settBrikker}>
                                      {sett.map((s2: any, k: number) => {
                                        const verdier = Object.values(s2.verdier || {}).filter((v: any) => typeof v === 'number') as number[];
                                        const visVerdi = verdier.length > 0
                                          ? Math.round(verdier.reduce((a, b) => a + b, 0) / verdier.length * 10) / 10
                                          : null;
                                        return (
                                          <View key={k} style={[s.settBrikke, s2.hoppetOver && s.settBrikkeHoppet]}>
                                            <Text style={[s.settBrikkeTekst, s2.hoppetOver && s.settBrikkeTekstHoppet]}>
                                              {s2.hoppetOver ? '–' : visVerdi != null ? visVerdi : '✓'}
                                            </Text>
                                          </View>
                                        );
                                      })}
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

      </ScrollView>

      {/* Radar-info modal */}
      <Modal visible={visRadarInfo} transparent animationType="fade" onRequestClose={() => setVisRadarInfo(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setVisRadarInfo(false)}>
          <View style={s.modalKort} onStartShouldSetResponder={() => true}>
            <Text style={s.modalTittel}>Treningsprofil</Text>
            <Text style={s.modalTekst}>
              Diagrammet viser treningsprofilen din basert på loggede økter. Hver akse representerer en treningskategori – jo lengre ut fra midten, jo bedre score.
            </Text>
            <View style={s.modalLegendRad}>
              <View style={[s.modalLegendDot, { backgroundColor: colors.green }]} />
              <Text style={s.modalLegendTekst}>Nåværende periode (siste halvdel av logger)</Text>
            </View>
            <View style={s.modalLegendRad}>
              <View style={[s.modalLegendDot, { backgroundColor: colors.yellow }]} />
              <Text style={s.modalLegendTekst}>Forrige periode – sammenlign for å se fremgang</Text>
            </View>
            <View style={s.modalSkillelinje} />
            <Text style={s.modalKategoriTittel}>Kategoriene</Text>
            {[
              { navn: 'Aktivering', tekst: 'Evne til å isolere og aktivere riktig muskel. Bygges i Akt 1.' },
              { navn: 'Stabilitet', tekst: 'Antall reps med god kontakt og sidebalanse. Øker over tid.' },
              { navn: 'Mobilitet', tekst: 'Bevegelsesfrihet og komfort gjennom øvelsene.' },
              { navn: 'Styrke', tekst: 'Antall reps og motstand. Relevant fra Akt 2.' },
              { navn: 'Utholdenhet', tekst: 'RPE-score – anstrengelse og kapasitet over tid.' },
            ].map(k => (
              <View key={k.navn} style={s.modalKategoriRad}>
                <Text style={s.modalKategoriNavn}>{k.navn}</Text>
                <Text style={s.modalKategoriTekst}>{k.tekst}</Text>
              </View>
            ))}
            <TouchableOpacity style={s.modalLukkKnapp} onPress={() => setVisRadarInfo(false)}>
              <Text style={s.modalLukkTekst}>Skjønt</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

// ── RADAR-KOMPONENT ───────────────────────────────────────────────

function RadarDiagram({ nå, før, kategorier }: { nå: Record<string, number>; før: Record<string, number>; kategorier: string[] }) {
  const Svg = require('react-native-svg').Svg;
  const Circle = require('react-native-svg').Circle;
  const Line = require('react-native-svg').Line;
  const Polygon = require('react-native-svg').Polygon;
  const Text: any = require('react-native-svg').Text;

  const size = BREDDE - 32;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;
  const labelR = r + 18;
  const n = kategorier.length;

  function punkt(verdi: number, index: number) {
    const vinkel = (index / n) * 2 * Math.PI - Math.PI / 2;
    const avstand = (verdi / 10) * r;
    return {
      x: cx + avstand * Math.cos(vinkel),
      y: cy + avstand * Math.sin(vinkel),
    };
  }

  function etikettPos(index: number) {
    const vinkel = (index / n) * 2 * Math.PI - Math.PI / 2;
    return {
      x: cx + labelR * Math.cos(vinkel),
      y: cy + labelR * Math.sin(vinkel),
    };
  }

  const aksePunkter = kategorier.map((_, i) => punkt(10, i));
  const punkterNå = kategorier.map((kat, i) => punkt(nå[kat] || 0, i));
  const punkterFør = kategorier.map((kat, i) => punkt(før[kat] || 0, i));

  const polyNå = punkterNå.map(p => `${p.x},${p.y}`).join(' ');
  const polyFør = punkterFør.map(p => `${p.x},${p.y}`).join(' ');

  const harFørData = Object.values(før).some(v => v > 0);

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {/* Nett-sirkler */}
        {[2, 4, 6, 8, 10].map(nivå => (
          <Circle
            key={nivå}
            cx={cx} cy={cy}
            r={(nivå / 10) * r}
            fill="none"
            stroke={colors.border}
            strokeWidth={1}
          />
        ))}

        {/* Akselinjer fra sentrum */}
        {aksePunkter.map((p, i) => (
          <Line
            key={i}
            x1={cx} y1={cy} x2={p.x} y2={p.y}
            stroke={colors.border}
            strokeWidth={1}
          />
        ))}

        {/* Forrige periode (gul, fylt) */}
        {harFørData && (
          <Polygon
            points={polyFør}
            fill={colors.yellow}
            fillOpacity={0.12}
            stroke={colors.yellow}
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
        )}

        {/* Nåværende periode (grønn, fylt) */}
        <Polygon
          points={polyNå}
          fill={colors.green}
          fillOpacity={0.18}
          stroke={colors.green}
          strokeWidth={2}
          strokeOpacity={0.9}
        />

        {/* Punkter på nåværende */}
        {punkterNå.map((p, i) => (
          <Circle
            key={i}
            cx={p.x} cy={p.y}
            r={4}
            fill={colors.green}
          />
        ))}

        {/* Etiketter */}
        {kategorier.map((kat, i) => {
          const ep = etikettPos(i);
          const score = nå[kat] || 0;
          return (
            <React.Fragment key={i}>
              <Text
                x={ep.x} y={ep.y - 5}
                textAnchor="middle"
                fontSize={9}
                fontWeight="500"
                fill={colors.muted}
                letterSpacing={0.5}
              >
                {kat.toUpperCase()}
              </Text>
              <Text
                x={ep.x} y={ep.y + 8}
                textAnchor="middle"
                fontSize={10}
                fill={colors.text}
              >
                {Math.round(score * 10) / 10}
              </Text>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

// ── MINI-GRAF MED DATOER ─────────────────────────────────────────

function MiniGraf({ data, datoer, farge }: { data: number[]; datoer: Date[]; farge: string }) {
  if (data.length < 2) return null;
  const h = 80;
  const w = BREDDE - 64;
  const steg = w / (data.length - 1);
  const minV = Math.min(...data);
  const maxV = Math.max(...data);
  const spenn = maxV - minV || 1;

  const punkter = data.map((v, i) => ({
    x: i * steg,
    y: h - ((v - minV) / spenn) * h,
  }));

  // Vis maks 4 datoetiketter
  const etiketterIndeks = data.length <= 4
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 3), Math.floor((2 * data.length) / 3), data.length - 1];

  function formatDato(d: Date): string {
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
  }

  return (
    <View>
      <View style={{ height: h + 4 }}>
        {/* Gridlinjer */}
        {[0, 50, 100].map(pct => (
          <View key={pct} style={[s.gridLinje, { top: `${pct}%` as any }]} />
        ))}
        {/* Linje */}
        {punkter.slice(1).map((p, i) => {
          const prev = punkter[i];
          const dx = p.x - prev.x;
          const dy = p.y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const vinkel = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: prev.x,
                top: prev.y,
                width: len,
                height: 2,
                backgroundColor: farge,
                opacity: 0.8,
                transformOrigin: 'left center',
                transform: [{ rotate: `${vinkel}deg` }],
              }}
            />
          );
        })}
        {/* Punkter */}
        {punkter.map((p, i) => (
          <View key={i} style={{ position: 'absolute', left: p.x - 3, top: p.y - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: farge }} />
        ))}
      </View>
      {/* Datoer */}
      <View style={{ height: 16, position: 'relative' }}>
        {etiketterIndeks.map(i => (
          <Text
            key={i}
            style={[s.grafAkse, {
              position: 'absolute',
              left: Math.max(0, Math.min(w - 40, punkter[i].x - 20)),
              top: 2,
            }]}
          >
            {formatDato(datoer[i])}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ── SPARKLINE ─────────────────────────────────────────────────────

function Sparkline({ data, farge }: { data: number[]; farge: string }) {
  if (data.length < 2) return <View style={{ width: 40 }} />;
  const w = 40;
  const h = 16;
  const steg = w / (data.length - 1);
  const minV = Math.min(...data);
  const maxV = Math.max(...data);
  const spenn = maxV - minV || 1;
  const punkter = data.map((v, i) => ({
    x: i * steg,
    y: h - ((v - minV) / spenn) * h,
  }));
  return (
    <View style={{ width: w, height: h, marginRight: 8 }}>
      {punkter.slice(1).map((p, i) => {
        const prev = punkter[i];
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const vinkel = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: prev.x,
              top: prev.y,
              width: len,
              height: 1.5,
              backgroundColor: farge,
              transformOrigin: 'left center',
              transform: [{ rotate: `${vinkel}deg` }],
            }}
          />
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topbar: { padding: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  tittel: { fontSize: 20, fontWeight: '300', color: colors.text },
  inner: { padding: 20, paddingBottom: 40, gap: 16 },
  seksjon: { gap: 8 },
  seksjonTittel: { fontSize: 10, color: colors.muted, fontWeight: '500', letterSpacing: 0.8 },

  ukeKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  ukeDager: { flexDirection: 'row', justifyContent: 'space-between' },
  ukeDag: { alignItems: 'center', gap: 5 },
  ukeDagNavn: { fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  ukeDagSirkel: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center' },
  ukeDagFullfort: { backgroundColor: colors.greenDim, borderColor: colors.green },
  ukeDagHoppet: { backgroundColor: colors.dangerDim, borderColor: colors.danger },
  ukeDagIdag: { borderColor: colors.accent },
  ukeDagTekst: { fontSize: 11, color: colors.muted2 },
  ukeDagTekstFullfort: { color: colors.green },
  ukeDagTekstHoppet: { color: colors.danger },
  ukeDagTekstIdag: { color: colors.text },

  stats: { flexDirection: 'row', gap: 8 },
  statKort: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, gap: 3 },
  statVerdi: { fontSize: 22, fontWeight: '300', color: colors.text },
  statLabel: { fontSize: 11, color: colors.muted, fontWeight: '300' },

  radarKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, gap: 12 },
  radarLabel: { fontSize: 10, color: colors.muted, fontWeight: '500', textAlign: 'center' },
  radarVerdi: { fontSize: 12, color: colors.text, fontWeight: '400', textAlign: 'center' },
  radarLegend: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  legendRad: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendTekst: { fontSize: 11, color: colors.muted, fontWeight: '300' },

  grafKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 8 },
  chipRad: { flexDirection: 'row', gap: 6 },
  grafChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface2 },
  grafChipAktiv: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  grafChipTekst: { fontSize: 12, color: colors.muted, fontWeight: '400' },
  grafChipTekstAktiv: { color: colors.green, fontWeight: '500' },
  ovelseChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  ovelseChipAktiv: { backgroundColor: colors.surface2, borderColor: colors.accent },
  ovelseChipTekst: { fontSize: 11, color: colors.muted2, fontWeight: '300' },
  ovelseChipTekstAktiv: { color: colors.text, fontWeight: '400' },
  ovelseListeWrapper: { marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4 },
  ovelseListeRad: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 8 },
  ovelseListeRadAktiv: { backgroundColor: colors.surface2 },
  ovelsePrikk: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  ovelseListeNavn: { fontSize: 13, color: colors.muted, fontWeight: '300', flex: 1 },
  ovelseListeNavnAktiv: { color: colors.text, fontWeight: '400' },
  formaalBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
  formaalBadgeTekst: { fontSize: 9, fontWeight: '500', letterSpacing: 0.3 },
  valgtOvelseRad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  valgtOvelseNavn: { fontSize: 13, color: colors.text, fontWeight: '400', flex: 1 },
  valgtOvelseBytt: { fontSize: 12, color: colors.muted, fontWeight: '300' },
  gridLinje: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  grafAkse: { fontSize: 9, color: colors.muted2, fontWeight: '300' },

  loggUkeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingHorizontal: 2 },
  loggUkeLabel: { fontSize: 10, color: colors.muted, fontWeight: '500', letterSpacing: 0.8 },
  loggUkeCompliance: { fontSize: 11, color: colors.muted2, fontWeight: '300' },
  loggListe: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  loggRad: { },
  loggRadBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  loggHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  loggIkon: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  loggIkonFullfort: { backgroundColor: colors.green },
  loggIkonHoppet: { backgroundColor: colors.danger },
  loggInfo: { flex: 1, gap: 2 },
  loggNavn: { fontSize: 14, fontWeight: '400', color: colors.text },
  loggMeta: { fontSize: 12, color: colors.muted, fontWeight: '300' },
  loggNotat: { fontSize: 12, color: colors.muted2, fontStyle: 'italic', marginTop: 2 },
  loggStatus: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  loggStatusFullfort: { backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder },
  loggStatusHoppet: { backgroundColor: colors.dangerDim, borderWidth: 1, borderColor: colors.dangerBorder },
  loggStatusTekst: { fontSize: 10, fontWeight: '500', letterSpacing: 0.3 },
  loggStatusTekstF: { color: colors.green },
  loggStatusTekstH: { color: colors.danger },
  loggDetaljer: { paddingHorizontal: 12, paddingBottom: 12, gap: 10, borderTopWidth: 1, borderTopColor: colors.border },
  loggOvelseRad: { gap: 6, paddingTop: 10 },
  loggOvelseHeader: { flexDirection: 'row', alignItems: 'center' },
  loggOvelseNavn: { fontSize: 13, color: colors.text, fontWeight: '400', flex: 1 },
  settBrikker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  settBrikke: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  settBrikkeHoppet: { opacity: 0.4 },
  settBrikkeTekst: { fontSize: 12, color: colors.text, fontWeight: '400' },
  settBrikkeTekstHoppet: { color: colors.muted2 },

  tomKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 20, alignItems: 'center', gap: 6 },
  tomTekst: { fontSize: 13, color: colors.muted2, fontWeight: '300' },
  tomSub: { fontSize: 12, color: colors.muted2, fontWeight: '300' },
  seksjonHeaderRad: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoChip: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center' },
  infoChipTekst: { fontSize: 10, color: colors.muted2, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, width: '100%', gap: 10 },
  modalTittel: { fontSize: 17, fontWeight: '500', color: colors.text },
  modalTekst: { fontSize: 13, color: colors.muted, fontWeight: '300', lineHeight: 21 },
  modalLegendRad: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalLegendDot: { width: 10, height: 10, borderRadius: 5 },
  modalLegendTekst: { fontSize: 13, color: colors.muted, fontWeight: '300', flex: 1 },
  modalSkillelinje: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  modalKategoriTittel: { fontSize: 11, color: colors.muted2, fontWeight: '500', letterSpacing: 0.8 },
  modalKategoriRad: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  modalKategoriNavn: { fontSize: 13, color: colors.text, fontWeight: '500', width: 88 },
  modalKategoriTekst: { fontSize: 13, color: colors.muted, fontWeight: '300', flex: 1, lineHeight: 20 },
  modalLukkKnapp: { backgroundColor: colors.accent, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 6 },
  modalLukkTekst: { color: colors.bg, fontSize: 14, fontWeight: '600' },
});
