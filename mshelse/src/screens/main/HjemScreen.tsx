import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, ActivityIndicator, Modal
} from 'react-native';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { colors } from '../../theme/colors';
import { vurderProgresjon } from '../../services/progresjon';

export default function HjemScreen({ navigation }: any) {
  const [laster, setLaster] = useState(true);
  const [sisteAssessment, setSisteAssessment] = useState<any>(null);
  const [aktiveProgrammer, setAktiveProgrammer] = useState<any[]>([]);
  const [dagensLogger, setDagensLogger] = useState<any[]>([]);
  const [progresjonsBanner, setProgresjonsBanner] = useState<{ program: any; akt: number } | null>(null);

  const fornavn = auth.currentUser?.displayName?.split(' ')[0] || 'deg';

  useEffect(() => { hentData(); }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => hentData());
    return unsub;
  }, [navigation]);

  async function hentData() {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const assessSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'assessments'), orderBy('dato', 'desc'), limit(1))
      );
      if (!assessSnap.empty) {
        setSisteAssessment({ id: assessSnap.docs[0].id, ...assessSnap.docs[0].data() });
      } else {
        setSisteAssessment(null);
      }

      const progSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'programs'), orderBy('opprettet', 'desc'))
      );
      const alle = progSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const aktive = alle.filter((p: any) => p.aktiv);
      setAktiveProgrammer(aktive);

      // Sjekk progresjonsbanner for hvert aktive program
      const logSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'logger'), orderBy('dato', 'desc'), limit(20))
      );
      const logger = logSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const iDagStr = new Date().toDateString();
      setDagensLogger(logger.filter(l => {
        const dato = l.dato?.toDate ? l.dato.toDate() : new Date(l.dato);
        return dato.toDateString() === iDagStr;
      }));
      setProgresjonsBanner(sjekkProgresjon(aktive, logger));
    } catch (e) {
      console.error(e);
    } finally {
      setLaster(false);
    }
  }

  // Sjekk om i dag er en treningsdag i et gitt program
  function erTreningsdagIDag(program: any): boolean {
    const DAGKART: Record<number, string> = { 1: 'Man', 2: 'Tir', 3: 'Ons', 4: 'Tor', 5: 'Fre', 6: 'Lør', 0: 'Søn' };
    const dagensNavn = DAGKART[new Date().getDay()];
    return (program.dager || []).includes(dagensNavn);
  }

  // Finn dagens program – første aktive program der i dag er treningsdag
  const dagensProgram = aktiveProgrammer.find(p => erTreningsdagIDag(p)) || null;
  const frekvensIDag = dagensProgram?.frekvensPerDag || 1;
  const gjortIDag = dagensLogger.filter(l => l.programId === dagensProgram?.id && l.fullfort).length;
  const alleGjortIDag = frekvensIDag > 1 && gjortIDag >= frekvensIDag;

  function hilsen() {
    const t = new Date().getHours();
    if (t < 12) return 'God morgen';
    if (t < 17) return 'God ettermiddag';
    return 'God kveld';
  }

  if (laster) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <View>
          <Text style={s.hilsen}>{hilsen()}, {fornavn}</Text>
          <Text style={s.dato}>{new Date().toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        </View>
        <TouchableOpacity style={s.avatar} onPress={() => navigation.navigate('Profil')}>
          <Text style={s.avatarTekst}>{fornavn[0]?.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.inner}>
        {!sisteAssessment ? (
          // TOM TILSTAND
          <View style={s.gap}>
            <View style={s.tomHeader}>
              <Text style={s.tomTittel}>Kom i gang</Text>
              <Text style={s.tomSub}>Du har ikke noe aktivt program ennå. Her er to måter å starte på.</Text>
            </View>

            <TouchableOpacity style={s.veiviserKort} onPress={() => navigation.navigate('Kartlegging')}>
              <View style={[s.veiviserIkon, { backgroundColor: colors.greenDim, borderColor: colors.greenBorder }]}>
                <Text style={[s.veiviserIkonTekst, { color: colors.green }]}>+</Text>
              </View>
              <View style={s.veiviserBody}>
                <Text style={s.veiviserTittel}>Start kartlegging</Text>
                <Text style={s.veiviserSub}>Finn årsaken og få et program tilpasset deg</Text>
              </View>
              <Text style={s.pil}>›</Text>
            </TouchableOpacity>

            {/* Fix 10: "Bruk en mal" pekte til tom Program-fane – endret til ProgramBuilder */}
            <TouchableOpacity style={s.veiviserKort} onPress={() => navigation.navigate('ProgramBuilder')}>
              <View style={s.veiviserIkon}>
                <Text style={s.veiviserIkonTekst}>☰</Text>
              </View>
              <View style={s.veiviserBody}>
                <Text style={s.veiviserTittel}>Opprett program selv</Text>
                <Text style={s.veiviserSub}>Sett opp øvelser og treningsdager manuelt</Text>
              </View>
              <Text style={s.pil}>›</Text>
            </TouchableOpacity>

            <View style={s.tipsKort}>
              <Text style={s.tipsTekst}>Tips: Kartleggingen gir AI nok informasjon til å lage et skreddersydd program for deg</Text>
            </View>
          </View>
        ) : (
          // AKTIV TILSTAND
          <View style={s.gap}>

            {/* Din situasjon – basert på triage */}
            <SituasjonKort
              assessment={sisteAssessment}
              navigation={navigation}
              aktivtProgram={aktiveProgrammer[0] || null}
            />

            {/* Progresjonsbanner */}
            {progresjonsBanner && (
              <TouchableOpacity
                style={s.progresjonsBanner}
                onPress={() => navigation.navigate('Reassessment', {
                  program: progresjonsBanner.program,
                  forrigeAssessment: sisteAssessment,
                })}
                activeOpacity={0.85}
              >
                <View style={s.progresjonsBannerTopp}>
                  <View style={s.progresjonsBannerIkon}>
                    <Text style={s.progresjonsBannerIkonTekst}>↑</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.progresjonsBannerLabel}>KLAR FOR NESTE STEG</Text>
                    <Text style={s.progresjonsBannerTekst}>
                      {progresjonsBanner.akt === 1
                        ? 'Du har vært smertefri en stund og øvelsene sitter godt. På tide å legge på litt mer.'
                        : 'Du holder kontakten gjennom flere reps nå enn da du startet. Musklene begynner å ta over der de skal.'
                      }
                    </Text>
                  </View>
                </View>
                <View style={s.progresjonsBannerKnapp}>
                  <Text style={s.progresjonsBannerKnappTekst}>Ta en kort statussjekk →</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Dagens økt */}
            {dagensProgram ? (
              <View style={s.dagensOktKort}>
                <View style={s.dagensOktHeader}>
                  <View>
                    <Text style={s.dagensOktLabel}>I DAG</Text>
                    <Text style={s.dagensOktTittel}>{dagensProgram.tittel}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                      <View style={[s.dagensOktBadge, { alignSelf: 'flex-start' }]}>
                        <Text style={s.dagensOktBadgeTekst}>
                          {(dagensProgram.ovelser || []).length} øvelser
                        </Text>
                      </View>
                      {frekvensIDag > 1 && (
                        <View style={[s.dagensOktBadge, alleGjortIDag && { backgroundColor: colors.greenDim, borderColor: colors.greenBorder }]}>
                          <Text style={s.dagensOktBadgeTekst}>
                            {gjortIDag}/{frekvensIDag} ganger i dag
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {/* Øvelseliste – maks 4, resten skjult */}
                <View style={s.dagensOvelseList}>
                  {(dagensProgram.ovelser || []).slice(0, 4).map((o: any, i: number) => (
                    <View key={i} style={s.dagensOvelseRad}>
                      <View style={s.dagensOvelseDot} />
                      <Text style={s.dagensOvelseNavn}>{o.navn}</Text>
                      <Text style={s.dagensOvelseMeta}>
                        {o.sets} sett{o.reps ? ` · ${o.reps} reps` : ''}
                      </Text>
                    </View>
                  ))}
                  {(dagensProgram.ovelser || []).length > 4 && (
                    <Text style={s.dagensOvelseFlere}>
                      + {dagensProgram.ovelser.length - 4} til
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={s.dagensStartKnapp}
                  onPress={() => navigation.navigate('AktivOkt', { program: dagensProgram, assessment: sisteAssessment })}
                >
                  <Text style={s.dagensStartTekst}>
                    {alleGjortIDag ? `Gjort ${frekvensIDag}× – start en gang til →` : frekvensIDag > 1 && gjortIDag > 0 ? `Start gang ${gjortIDag + 1} av ${frekvensIDag} →` : 'Start dagens økt →'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : aktiveProgrammer.length > 0 ? (
              <View style={s.ikkeOktDag}>
                <Text style={s.ikkeOktDagTekst}>Ikke treningsdag i dag</Text>
                <Text style={s.ikkeOktDagSub}>
                  Neste: {nesteOktDag(aktiveProgrammer[0])}
                </Text>
              </View>
            ) : null}

            {aktiveProgrammer.length > 0 ? (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>AKTIVE PROGRAMMER</Text>
                {aktiveProgrammer.map(p => {
                  const fremgang = p.okterTotalt > 0
                    ? Math.round((p.okterFullfort / p.okterTotalt) * 100)
                    : 0;
                  return (
                    <View key={p.id} style={s.programKort}>
                      <TouchableOpacity
                        style={s.programKortTopp}
                        onPress={() => navigation.navigate('ProgramDetalj', { program: p, assessment: sisteAssessment })}
                        activeOpacity={0.7}
                      >
                        <View style={s.programKortInfo}>
                          {p.akt && (
                            <View style={s.aktTag}>
                              <Text style={s.aktTagTekst}>Akt {p.akt}</Text>
                            </View>
                          )}
                          <Text style={s.programTittel}>{p.tittel}</Text>
                          <Text style={s.programMeta}>
                            {p.dager?.join(' · ')}
                            {p.uker ? ` · ${p.uker} uker` : ''}
                            {p.ovelser?.length ? ` · ${p.ovelser.length} øvelser` : ''}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          {p.uke && p.uker ? (
                            <Text style={s.ukeLabel}>Uke {p.uke}/{p.uker}</Text>
                          ) : null}
                          <Text style={{ fontSize: 20, color: colors.muted2 }}>›</Text>
                        </View>
                      </TouchableOpacity>

                      {p.okterTotalt > 0 && (
                        <View style={s.progresjon}>
                          <View style={s.progBar}>
                            <View style={[s.progFill, { width: `${fremgang}%` as any }]} />
                          </View>
                          <View style={s.progRow}>
                            <Text style={s.progTekst}>{fremgang}% fullført</Text>
                            <Text style={s.progTekst}>{p.okterFullfort ?? 0} / {p.okterTotalt} økter</Text>
                          </View>
                        </View>
                      )}

                      <View style={s.programKnapper}>
                        <TouchableOpacity
                          style={s.btnSekundar}
                          onPress={() => navigation.navigate('ProgramBuilder', { program: p })}
                        >
                          <Text style={s.btnSekundarTekst}>Rediger</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.btnPrimary, { flex: 1 }]}
                          onPress={() => navigation.navigate('AktivOkt', { program: p, assessment: sisteAssessment })}
                        >
                          <Text style={s.btnPrimaryTekst}>Start økt</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={s.ingenProgram}>
                <Text style={s.ingenProgramTekst}>Ingen aktivt program ennå</Text>
                <TouchableOpacity
                  style={s.btnPrimary}
                  onPress={() => navigation.getParent()?.navigate('Program')}
                >
                  <Text style={s.btnPrimaryTekst}>Sett opp program</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function sjekkProgresjon(programmer: any[], logger: any[]): { program: any; akt: number } | null {
  for (const p of programmer) {
    const programLogger = logger.filter((l: any) => l.programId === p.id);
    const resultat = vurderProgresjon(p, programLogger);
    if (resultat.klar) return { program: p, akt: resultat.akt };
  }
  return null;
}


const DAGKART: Record<number, string> = { 1: 'Man', 2: 'Tir', 3: 'Ons', 4: 'Tor', 5: 'Fre', 6: 'Lør', 0: 'Søn' };

function nesteOktDag(program: any): string {
  if (!program?.dager?.length) return '–';
  const idag = new Date().getDay();
  // Finn neste dag i programmet etter i dag
  for (let i = 1; i <= 7; i++) {
    const nesteDag = DAGKART[(idag + i) % 7];
    if (program.dager.includes(nesteDag)) {
      return i === 1 ? 'i morgen' : nesteDag;
    }
  }
  return program.dager[0];
}

const AKT_FARGE: Record<number, { bg: string; border: string; tekst: string }> = {
  1: { bg: colors.dangerDim, border: 'rgba(192,57,43,0.3)', tekst: colors.danger },
  2: { bg: colors.yellowDim, border: colors.yellowBorder, tekst: colors.yellow },
  3: { bg: colors.greenDim, border: colors.greenBorder, tekst: colors.green },
};

const AKT_LABEL: Record<number, string> = {
  1: 'Få kontroll',
  2: 'Rette opp',
  3: 'Vokse',
};

function SituasjonKort({ assessment, navigation, aktivtProgram }: { assessment: any; navigation: any; aktivtProgram: any }) {
  const [visAktInfo, setVisAktInfo] = React.useState(false);
  const erReassessment = assessment.type === 'reassessment';
  const akt = assessment.triage?.start_act ?? 1;
  const smerteNivaa = assessment.triage?.pain_level ?? null;
  const maal = assessment.triage?.goal || '';
  const nestesteg = assessment.triage?.next_step || assessment.neste_steg || '';
  const begrunnelse = assessment.begrunnelse || '';
  const farge = AKT_FARGE[akt] || AKT_FARGE[1];

  const KONKLUSJON_LABEL: Record<string, { tekst: string; farge: typeof farge }> = {
    neste_akt:       { tekst: 'Klar for neste akt', farge: AKT_FARGE[3] },
    intensiver:      { tekst: 'Øker vanskelighetsgraden', farge: AKT_FARGE[2] },
    fortsett:        { tekst: 'Fortsett programmet', farge: AKT_FARGE[akt] },
    ny_kartlegging:  { tekst: 'Ny kartlegging anbefales', farge: AKT_FARGE[1] },
  };
  const konklusjonInfo = erReassessment ? KONKLUSJON_LABEL[assessment.konklusjon] : null;

  const AKT_INFO = [
    { akt: 1, tittel: 'Akt 1 – Få kontroll', tekst: 'Her starter du. Fokus er å deaktivere overaktive muskler og lære kroppen å bruke de riktige igjen. Øvelsene er lette – det handler om kontakt, ikke styrke. Smerte er ofte relevant i denne fasen.' },
    { akt: 2, tittel: 'Akt 2 – Rette opp', tekst: 'Du har fått kontakt. Nå bygger vi kapasitet og korrigerer kompensasjonsmønstre. Øvelsene krever mer – stabilitet under belastning og bevegelseskvalitet er i fokus.' },
    { akt: 3, tittel: 'Akt 3 – Vokse', tekst: 'Grunnmuren er på plass. Nå handler det om å bygge videre – progressiv styrke, utholdenhet og å gjøre kroppen robust nok til å tåle det livet krever.' },
  ];

  return (
    <View style={s.situasjonKort}>

      {/* Header – badge + ? chip + knapp */}
      <View style={s.situasjonHeader}>
        <View style={s.aktBadgeRad}>
          <View style={[s.aktBadge, {
            backgroundColor: (konklusjonInfo?.farge || farge).bg,
            borderColor: (konklusjonInfo?.farge || farge).border,
          }]}>
            <Text style={[s.aktBadgeTekst, { color: (konklusjonInfo?.farge || farge).tekst }]}>
              {erReassessment && konklusjonInfo
                ? konklusjonInfo.tekst
                : `Akt ${akt} · ${AKT_LABEL[akt]}`}
            </Text>
          </View>
          {!erReassessment && (
            <TouchableOpacity style={s.aktInfoChip} onPress={() => setVisAktInfo(true)}>
              <Text style={s.aktInfoChipTekst}>?</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => aktivtProgram
          ? navigation.navigate('Reassessment', { program: aktivtProgram, forrigeAssessment: assessment })
          : navigation.navigate('Kartlegging')
        }>
          <Text style={s.nyKartlegging}>{aktivtProgram ? 'Ny sjekk →' : 'Ny kartlegging →'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.assessmentTittel}>{assessment.tittel}</Text>

      {/* Begrunnelse fra reassessment */}
      {erReassessment && begrunnelse ? (
        <Text style={s.reassessmentBegrunnelse}>{begrunnelse}</Text>
      ) : null}

      {/* Smerteindikator – kun Akt 1 og ikke reassessment */}
      {!erReassessment && akt === 1 && smerteNivaa !== null && (
        <View style={s.smerteRad}>
          <Text style={s.smerteLabel}>Smertenivå</Text>
          <View style={s.smerteBar}>
            <View style={[s.smerteFill, {
              width: `${(smerteNivaa / 10) * 100}%` as any,
              backgroundColor: smerteNivaa >= 7 ? colors.danger : smerteNivaa >= 4 ? colors.yellow : colors.green,
            }]} />
          </View>
          <Text style={s.smerteTall}>{smerteNivaa}/10</Text>
        </View>
      )}

      {/* Mål */}
      {maal ? (
        <View style={s.maalRad}>
          <Text style={s.maalLabel}>MÅL</Text>
          <Text style={s.maalTekst}>{maal}</Text>
        </View>
      ) : null}

      {/* Neste steg */}
      {nestesteg ? (
        <View style={s.nesteStegKort}>
          <Text style={s.nesteStegLabel}>NESTE STEG</Text>
          <Text style={s.nesteStegTekst}>{nestesteg}</Text>
        </View>
      ) : null}

      {/* Confidence – kun for vanlig kartlegging */}
      {!erReassessment && assessment.confidence != null && (
        <View style={s.confRow}>
          <View style={s.confBar}>
            <View style={[s.confFill, { width: `${assessment.confidence ?? 0}%` as any }]} />
          </View>
          <Text style={s.confTekst}>{assessment.confidence}% sikkerhet</Text>
        </View>
      )}

      {/* Akt-info modal */}
      <Modal visible={visAktInfo} transparent animationType="fade" onRequestClose={() => setVisAktInfo(false)}>
        <TouchableOpacity style={s.aktInfoOverlay} activeOpacity={1} onPress={() => setVisAktInfo(false)}>
          <View style={s.aktInfoModalKort} onStartShouldSetResponder={() => true}>
            <Text style={s.aktInfoModalHovedTittel}>Rehabiliteringsreisen</Text>
            {AKT_INFO.map(info => (
              <View key={info.akt} style={[s.aktInfoRad, info.akt === akt && s.aktInfoRadAktiv]}>
                <View style={[s.aktInfoNummer, {
                  backgroundColor: info.akt === 1 ? AKT_FARGE[1].bg : info.akt === 2 ? AKT_FARGE[2].bg : AKT_FARGE[3].bg,
                  borderColor: info.akt === 1 ? AKT_FARGE[1].border : info.akt === 2 ? AKT_FARGE[2].border : AKT_FARGE[3].border,
                }]}>
                  <Text style={[s.aktInfoNummerTekst, {
                    color: info.akt === 1 ? AKT_FARGE[1].tekst : info.akt === 2 ? AKT_FARGE[2].tekst : AKT_FARGE[3].tekst,
                  }]}>{info.akt}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.aktInfoTittel}>{info.tittel}</Text>
                  <Text style={s.aktInfoTekst}>{info.tekst}</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity style={s.aktInfoLukkKnapp} onPress={() => setVisAktInfo(false)}>
              <Text style={s.aktInfoLukkTekst}>Skjønt</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  hilsen: { fontSize: 18, fontWeight: '300', color: colors.text },
  dato: { fontSize: 12, color: colors.muted, fontWeight: '300', marginTop: 2 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center' },
  avatarTekst: { fontSize: 13, fontWeight: '500', color: colors.muted },
  inner: { padding: 20, paddingBottom: 40 },
  gap: { gap: 12 },
  seksjon: { gap: 8 },
  seksjonTittel: { fontSize: 11, color: colors.muted, fontWeight: '500', letterSpacing: 1.0 },

  // Tom tilstand
  tomHeader: { gap: 6, marginBottom: 4 },
  tomTittel: { fontSize: 20, fontWeight: '300', color: colors.text },
  tomSub: { fontSize: 14, color: colors.muted, fontWeight: '400', lineHeight: 21 },
  veiviserKort: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14 },
  veiviserIkon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  veiviserIkonTekst: { fontSize: 18, color: colors.muted },
  veiviserBody: { flex: 1 },
  veiviserTittel: { fontSize: 16, fontWeight: '500', color: colors.text, marginBottom: 2 },
  veiviserSub: { fontSize: 12, color: colors.muted, fontWeight: '300' },
  pil: { fontSize: 18, color: colors.muted2 },
  tipsKort: { backgroundColor: colors.surface2, borderRadius: 10, padding: 12 },
  tipsTekst: { fontSize: 12, color: colors.muted2, fontWeight: '300', lineHeight: 18, textAlign: 'center' },

  // Assessment-kort
  assessmentTittel: { fontSize: 17, fontWeight: '300', color: colors.text, lineHeight: 24 },
  nyKartlegging: { fontSize: 12, color: colors.muted, fontWeight: '300' },
  confRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confBar: { flex: 1, height: 3, backgroundColor: colors.border2, borderRadius: 2, overflow: 'hidden' },
  confFill: { height: '100%', backgroundColor: colors.green, borderRadius: 2 },
  confTekst: { fontSize: 11, color: colors.muted, fontWeight: '300' },

  // Situasjon-kort
  situasjonKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, gap: 12 },
  situasjonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  aktBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  aktBadgeTekst: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  smerteRad: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  smerteLabel: { fontSize: 11, color: colors.muted, fontWeight: '300', width: 72 },
  smerteBar: { flex: 1, height: 4, backgroundColor: colors.border2, borderRadius: 2, overflow: 'hidden' },
  smerteFill: { height: '100%', borderRadius: 2 },
  smerteTall: { fontSize: 12, color: colors.text, fontWeight: '500', width: 30, textAlign: 'right' },
  reassessmentBegrunnelse: { fontSize: 13, color: colors.muted, fontWeight: '300', lineHeight: 20 },
  aktBadgeRad: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aktInfoChip: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, alignItems: 'center', justifyContent: 'center' },
  aktInfoChipTekst: { fontSize: 10, color: colors.muted2, fontWeight: '600' },
  aktInfoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  aktInfoModalKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, width: '100%', gap: 12 },
  aktInfoModalHovedTittel: { fontSize: 17, fontWeight: '500', color: colors.text },
  aktInfoRad: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 10, borderRadius: 10 },
  aktInfoRadAktiv: { backgroundColor: colors.surface2 },
  aktInfoNummer: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  aktInfoNummerTekst: { fontSize: 13, fontWeight: '600' },
  aktInfoTittel: { fontSize: 14, fontWeight: '500', color: colors.text },
  aktInfoTekst: { fontSize: 13, color: colors.muted, fontWeight: '300', lineHeight: 20 },
  aktInfoLukkKnapp: { backgroundColor: colors.accent, borderRadius: 10, padding: 12, alignItems: 'center' },
  aktInfoLukkTekst: { color: colors.bg, fontSize: 14, fontWeight: '600' },
  maalRad: { gap: 3 },
  maalLabel: { fontSize: 9, color: colors.muted2, fontWeight: '500', letterSpacing: 0.7 },
  maalTekst: { fontSize: 13, color: colors.muted, fontWeight: '300', lineHeight: 19 },
  nesteStegKort: { backgroundColor: colors.surface2, borderRadius: 8, padding: 10, gap: 3 },
  nesteStegLabel: { fontSize: 9, color: colors.green, fontWeight: '500', letterSpacing: 0.7 },
  nesteStegTekst: { fontSize: 13, color: colors.text, fontWeight: '300', lineHeight: 20 },

  // Program-kort
  programKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  programKortTopp: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14, paddingBottom: 10 },
  programKortInfo: { flex: 1, gap: 5 },
  aktTag: { backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  aktTagTekst: { fontSize: 11, color: colors.green, fontWeight: '500', letterSpacing: 0.5 },
  programTittel: { fontSize: 16, fontWeight: '300', color: colors.text },
  programMeta: { fontSize: 12, color: colors.muted, fontWeight: '300' },
  ukeLabel: { fontSize: 11, color: colors.muted2 },
  progresjon: { paddingHorizontal: 14, paddingBottom: 10, gap: 5 },
  progBar: { height: 3, backgroundColor: colors.border2, borderRadius: 2, overflow: 'hidden' },
  progFill: { height: '100%', backgroundColor: colors.green, borderRadius: 2 },
  progRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progTekst: { fontSize: 11, color: colors.muted2 },
  programKnapper: { flexDirection: 'row', gap: 8, padding: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },

  // Ingen program
  ingenProgram: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, alignItems: 'center', gap: 12 },
  ingenProgramTekst: { fontSize: 14, color: colors.muted, fontWeight: '300' },

  // Dagens økt
  dagensOktKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 14, padding: 16, gap: 14 },
  dagensOktHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  dagensOktLabel: { fontSize: 11, color: colors.green, fontWeight: '500', letterSpacing: 0.8, marginBottom: 2 },
  dagensOktTittel: { fontSize: 16, color: colors.text, fontWeight: '400' },
  dagensOktBadge: { backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  dagensOktBadgeTekst: { fontSize: 11, color: colors.green, fontWeight: '500' },
  dagensOvelseList: { gap: 8 },
  dagensOvelseRad: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dagensOvelseDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green, flexShrink: 0 },
  dagensOvelseNavn: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '300' },
  dagensOvelseMeta: { fontSize: 12, color: colors.muted2, fontWeight: '300' },
  dagensOvelseFlere: { fontSize: 12, color: colors.muted, fontWeight: '300', paddingLeft: 15 },
  dagensStartKnapp: { backgroundColor: colors.green, borderRadius: 8, padding: 13, alignItems: 'center' },
  dagensStartTekst: { color: '#fff', fontSize: 15, fontWeight: '600' },
  ikkeOktDag: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 4 },
  ikkeOktDagTekst: { fontSize: 14, color: colors.muted, fontWeight: '300' },
  ikkeOktDagSub: { fontSize: 12, color: colors.muted2, fontWeight: '300' },

  // Progresjonsbanner
  progresjonsBanner: { backgroundColor: colors.greenDim, borderWidth: 1.5, borderColor: colors.green, borderRadius: 14, padding: 16, gap: 14 },
  progresjonsBannerTopp: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  progresjonsBannerIkon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  progresjonsBannerIkonTekst: { fontSize: 16, color: '#fff', fontWeight: '600' },
  progresjonsBannerLabel: { fontSize: 10, color: colors.green, fontWeight: '600', letterSpacing: 0.8, marginBottom: 4 },
  progresjonsBannerTekst: { fontSize: 13, color: colors.text, fontWeight: '300', lineHeight: 20 },
  progresjonsBannerKnapp: { backgroundColor: colors.green, borderRadius: 8, padding: 12, alignItems: 'center' },
  progresjonsBannerKnappTekst: { fontSize: 14, color: '#fff', fontWeight: '600' },

  // Knapper
  btnPrimary: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 24, alignItems: 'center' },
  btnPrimaryTekst: { color: colors.bg, fontSize: 14, fontWeight: '600' },
  btnSekundar: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 11, paddingHorizontal: 16, alignItems: 'center' },
  btnSekundarTekst: { color: colors.muted, fontSize: 14, fontWeight: '400' },
});
