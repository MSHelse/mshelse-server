import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../../services/firebase';
import { colors } from '../../theme/colors';

const BACKEND_URL = 'https://mshelse-server.onrender.com';

const AKT_FARGE: Record<number, { bg: string; border: string; tekst: string }> = {
  1: { bg: colors.dangerDim,  border: 'rgba(192,57,43,0.3)',   tekst: colors.danger },
  2: { bg: colors.orangeDim,  border: colors.orangeBorder,     tekst: colors.orange },
  3: { bg: colors.yellowDim,  border: colors.yellowBorder,     tekst: colors.yellow },
  4: { bg: colors.greenDim,   border: colors.greenBorder,      tekst: colors.green  },
};

type Tab = 'brukere' | 'statistikk';

async function adminFetch(path: string) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function tidSiden(iso: string | null): string {
  if (!iso) return 'Aldri';
  const diff = Date.now() - new Date(iso).getTime();
  const dager = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (dager === 0) return 'I dag';
  if (dager === 1) return 'I går';
  if (dager < 7) return `${dager}d siden`;
  if (dager < 30) return `${Math.floor(dager / 7)}u siden`;
  return `${Math.floor(dager / 30)}mnd siden`;
}

// ─── StatKort ───────────────────────────────────────────────────────────────
function StatKort({ label, verdi, enhet = '', farge }: {
  label: string; verdi: string | number | null; enhet?: string; farge?: string;
}) {
  return (
    <View style={s.statKort}>
      <Text style={[s.statVerdi, farge ? { color: farge } : null]}>
        {verdi != null ? `${verdi}${enhet}` : '–'}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── BrukereTab ─────────────────────────────────────────────────────────────
function BrukereTab({ navigation }: { navigation: any }) {
  const [brukere, setBrukere]   = useState<any[]>([]);
  const [laster, setLaster]     = useState(true);
  const [feil, setFeil]         = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [valgtBruker, setValgtBruker] = useState<any>(null);
  const [detalj, setDetalj]     = useState<any>(null);
  const [lasterDetalj, setLasterDetalj] = useState(false);

  const hent = useCallback(async () => {
    try {
      setFeil('');
      const data = await adminFetch('/api/admin/brukere');
      setBrukere(data);
    } catch (e: any) {
      setFeil(e.message);
    } finally {
      setLaster(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { hent(); }, [hent]));

  async function velgBruker(b: any) {
    setValgtBruker(b);
    setDetalj(null);
    setLasterDetalj(true);
    try {
      const data = await adminFetch(`/api/admin/bruker/${b.uid}`);
      setDetalj(data);
    } catch (e) {
      setDetalj(null);
    } finally {
      setLasterDetalj(false);
    }
  }

  if (laster) return <View style={s.center}><ActivityIndicator color={colors.accent} /></View>;
  if (feil) return (
    <View style={s.center}>
      <Text style={s.feilTekst}>{feil}</Text>
      <TouchableOpacity onPress={hent} style={{ marginTop: 12 }}>
        <Text style={{ color: colors.accent, fontSize: 14 }}>Prøv igjen</Text>
      </TouchableOpacity>
    </View>
  );

  // Detaljvisning
  if (valgtBruker) {
    const logger = detalj?.logger || [];
    const smerteData = logger
      .filter((l: any) => l.smerte != null)
      .map((l: any) => ({ smerte: l.smerte, dato: l.dato?.toDate ? l.dato.toDate() : new Date(l.dato) }));
    const fullfort = logger.filter((l: any) => l.fullfort).length;
    const compliance = logger.length > 0 ? Math.round(fullfort / logger.length * 100) : null;
    const aktivtProgram = detalj?.programmer?.find((p: any) => p.aktiv);

    return (
      <ScrollView contentContainerStyle={s.inner}>
        <TouchableOpacity onPress={() => { setValgtBruker(null); setDetalj(null); }} style={s.tilbakeRad}>
          <Text style={s.tilbake}>← Alle brukere</Text>
        </TouchableOpacity>

        <View style={s.seksjon}>
          <Text style={s.seksjonTittel}>BRUKER</Text>
          <View style={s.kort}>
            <Text style={s.kortTittel}>{valgtBruker.email || valgtBruker.uid}</Text>
            {valgtBruker.displayName && <Text style={s.kortSub}>{valgtBruker.displayName}</Text>}
            <Text style={s.kortSub}>Siste aktivitet: {tidSiden(valgtBruker.sisteAktiv)}</Text>
          </View>
        </View>

        {lasterDetalj ? (
          <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
        ) : detalj ? (
          <>
            <View style={s.seksjon}>
              <Text style={s.seksjonTittel}>OVERSIKT</Text>
              <View style={s.statGrid}>
                <StatKort label="Loggede økter" verdi={logger.length} />
                <StatKort label="Compliance" verdi={compliance} enhet="%" farge={compliance != null && compliance >= 70 ? colors.green : compliance != null && compliance >= 40 ? colors.yellow : colors.danger} />
                <StatKort label="Smerte nå" verdi={valgtBruker.sisteSmerte} enhet="/10" />
                <StatKort label="Aktivt program" verdi={aktivtProgram ? `Akt ${aktivtProgram.akt}` : 'Nei'} />
              </View>
            </View>

            {aktivtProgram && (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>AKTIVT PROGRAM</Text>
                <View style={s.kort}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={[s.kortTittel, { flex: 1 }]}>{aktivtProgram.tittel}</Text>
                    {AKT_FARGE[aktivtProgram.akt] && (
                      <View style={[s.aktTag, { backgroundColor: AKT_FARGE[aktivtProgram.akt].bg, borderColor: AKT_FARGE[aktivtProgram.akt].border }]}>
                        <Text style={[s.aktTagTekst, { color: AKT_FARGE[aktivtProgram.akt].tekst }]}>Akt {aktivtProgram.akt}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.kortSub}>{aktivtProgram.okterFullfort || 0} av {aktivtProgram.okterTotalt || 0} økter fullført</Text>
                </View>
              </View>
            )}

            {smerteData.length > 0 && (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>SMERTEUTVIKLING</Text>
                <View style={s.kort}>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {smerteData.map((d: any, i: number) => (
                      <View key={i} style={s.smertePrikk}>
                        <View style={[s.smerteBar, {
                          height: Math.max(4, (d.smerte / 10) * 40),
                          backgroundColor: d.smerte <= 3 ? colors.green : d.smerte <= 6 ? colors.yellow : colors.danger,
                        }]} />
                        <Text style={s.smerteTall}>{d.smerte}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={s.kortSub}>
                    Start: {smerteData[0].smerte}/10 · Nå: {smerteData[smerteData.length - 1].smerte}/10
                    {smerteData.length > 1 && ` · Endring: ${(smerteData[0].smerte - smerteData[smerteData.length - 1].smerte) >= 0 ? '-' : '+'}${Math.abs(smerteData[0].smerte - smerteData[smerteData.length - 1].smerte)}`}
                  </Text>
                </View>
              </View>
            )}

            {detalj.assessments?.length > 0 && (
              <View style={s.seksjon}>
                <Text style={s.seksjonTittel}>KARTLEGGINGER ({detalj.assessments.length})</Text>
                <View style={s.listeKort}>
                  {detalj.assessments.map((a: any, i: number) => {
                    const erReassessment = a.type === 'reassessment';
                    const dato = a.dato?.toDate ? a.dato.toDate() : new Date(a.dato);
                    return (
                      <View key={a.id} style={[s.listeRad, i < detalj.assessments.length - 1 && s.listeRadBorder]}>
                        <View style={[s.typeBadge, erReassessment ? s.typeBadgeGul : s.typeBadgeGrønn]}>
                          <Text style={[s.typeBadgeTekst, { color: erReassessment ? colors.yellow : colors.green }]}>
                            {erReassessment ? 'Statussjekk' : 'Kartlegging'}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.listeNavn}>{a.tittel || '–'}</Text>
                          {erReassessment && a.konklusjon && (
                            <Text style={s.listeSub}>{a.konklusjon}</Text>
                          )}
                          {!erReassessment && a.triage?.pain_level != null && (
                            <Text style={s.listeSub}>Smerte: {a.triage.pain_level}/10 · Akt {a.triage.start_act}</Text>
                          )}
                        </View>
                        <Text style={s.listeDato}>{dato.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    );
  }

  // Listemodus
  return (
    <ScrollView
      contentContainerStyle={s.inner}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); hent(); }} tintColor={colors.accent} />}
    >
      <Text style={s.antallTekst}>{brukere.length} registrerte brukere</Text>
      <View style={s.listeKort}>
        {brukere.length === 0 ? (
          <Text style={[s.listeSub, { padding: 16 }]}>Ingen brukere ennå</Text>
        ) : brukere.map((b, i) => (
          <TouchableOpacity
            key={b.uid}
            style={[s.listeRad, i < brukere.length - 1 && s.listeRadBorder]}
            onPress={() => velgBruker(b)}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.listeNavn} numberOfLines={1}>{b.email || b.uid}</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Text style={s.listeSub}>{tidSiden(b.sisteAktiv)}</Text>
                {b.compliance != null && (
                  <Text style={[s.listeSub, {
                    color: b.compliance >= 70 ? colors.green : b.compliance >= 40 ? colors.yellow : colors.danger
                  }]}>{b.compliance}% compliance</Text>
                )}
                {b.sisteSmerte != null && (
                  <Text style={s.listeSub}>Smerte {b.sisteSmerte}/10</Text>
                )}
              </View>
            </View>
            {b.aktivtProgram && AKT_FARGE[b.aktivtProgram.akt] && (
              <View style={[s.aktTag, { backgroundColor: AKT_FARGE[b.aktivtProgram.akt].bg, borderColor: AKT_FARGE[b.aktivtProgram.akt].border }]}>
                <Text style={[s.aktTagTekst, { color: AKT_FARGE[b.aktivtProgram.akt].tekst }]}>Akt {b.aktivtProgram.akt}</Text>
              </View>
            )}
            <Text style={s.pil}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── StatistikkTab ───────────────────────────────────────────────────────────
function StatistikkTab() {
  const [stats, setStats]       = useState<any>(null);
  const [laster, setLaster]     = useState(true);
  const [feil, setFeil]         = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const hent = useCallback(async () => {
    try {
      setFeil('');
      const data = await adminFetch('/api/admin/statistikk');
      setStats(data);
    } catch (e: any) {
      setFeil(e.message);
    } finally {
      setLaster(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { hent(); }, [hent]));

  if (laster) return <View style={s.center}><ActivityIndicator color={colors.accent} /></View>;
  if (feil) return (
    <View style={s.center}>
      <Text style={s.feilTekst}>{feil}</Text>
      <TouchableOpacity onPress={hent} style={{ marginTop: 12 }}>
        <Text style={{ color: colors.accent, fontSize: 14 }}>Prøv igjen</Text>
      </TouchableOpacity>
    </View>
  );
  if (!stats) return null;

  const smerteReduksjonFarge = stats.snittReduksjon == null ? undefined
    : stats.snittReduksjon > 0 ? colors.green
    : stats.snittReduksjon < 0 ? colors.danger
    : undefined;

  return (
    <ScrollView
      contentContainerStyle={s.inner}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); hent(); }} tintColor={colors.accent} />}
    >
      <View style={s.seksjon}>
        <Text style={s.seksjonTittel}>AKTIVITET</Text>
        <View style={s.statGrid}>
          <StatKort label="Totalt registrert" verdi={stats.totalBrukere} />
          <StatKort label="Aktive 7 dager" verdi={stats.aktiveUke} />
          <StatKort label="Aktive 30 dager" verdi={stats.aktive30} />
          <StatKort label="Inaktive 14+ dager" verdi={stats.inaktive14} farge={stats.inaktive14 > 0 ? colors.muted : undefined} />
        </View>
        <View style={s.statGrid}>
          <StatKort label="Loggede økter totalt" verdi={stats.totalLogger} />
        </View>
      </View>

      <View style={s.seksjon}>
        <Text style={s.seksjonTittel}>COMPLIANCE</Text>
        <View style={s.statGrid}>
          <StatKort
            label="Snitt alle tider"
            verdi={stats.snittCompliance}
            enhet="%"
            farge={stats.snittCompliance >= 70 ? colors.green : stats.snittCompliance >= 40 ? colors.yellow : colors.danger}
          />
          <StatKort
            label="Snitt siste 30 dager"
            verdi={stats.snittCompliance30}
            enhet="%"
            farge={stats.snittCompliance30 >= 70 ? colors.green : stats.snittCompliance30 >= 40 ? colors.yellow : colors.danger}
          />
        </View>
      </View>

      <View style={s.seksjon}>
        <Text style={s.seksjonTittel}>KLINISK EFFEKT</Text>
        <View style={s.statGrid}>
          <StatKort label="Snitt smerte ved start" verdi={stats.snittSmerteStart} enhet="/10" />
          <StatKort label="Snitt smerte nå" verdi={stats.snittSmerteNaa} enhet="/10" />
          <StatKort
            label="Snitt reduksjon"
            verdi={stats.snittReduksjon != null ? (stats.snittReduksjon >= 0 ? `-${stats.snittReduksjon}` : `+${Math.abs(stats.snittReduksjon)}`) : null}
            enhet=" poeng"
            farge={smerteReduksjonFarge}
          />
        </View>
      </View>

      <View style={s.seksjon}>
        <Text style={s.seksjonTittel}>PROGRESJON</Text>
        <View style={s.statGrid}>
          {([1, 2, 3] as number[]).map(a => (
            <StatKort
              key={a}
              label={`Brukere i Akt ${a}`}
              verdi={stats.aktFordeling[a]}
              farge={AKT_FARGE[a]?.tekst}
            />
          ))}
        </View>
        <View style={s.statGrid}>
          <StatKort label="Statussjekker gjennomført" verdi={stats.antallReassessments} />
          <StatKort label="Progresjonert akt" verdi={stats.antallAktProgresjon} farge={colors.green} />
        </View>
      </View>

      {stats.toppOvelser?.length > 0 && (
        <View style={s.seksjon}>
          <Text style={s.seksjonTittel}>TOPP ØVELSER</Text>
          <View style={s.listeKort}>
            {stats.toppOvelser.map((o: any, i: number) => (
              <View key={i} style={[s.listeRad, i < stats.toppOvelser.length - 1 && s.listeRadBorder]}>
                <Text style={[s.listeSub, { width: 22 }]}>{i + 1}.</Text>
                <Text style={[s.listeNavn, { flex: 1 }]}>{o.navn}</Text>
                <Text style={s.listeSub}>{o.count} sett</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ─── AdminPanelScreen ────────────────────────────────────────────────────────
export default function AdminPanelScreen({ navigation }: any) {
  const [tab, setTab] = useState<Tab>('brukere');

  function handleTabPress(t: Tab | 'ovelser') {
    if (t === 'ovelser') {
      navigation.navigate('AdminOvelse');
      return;
    }
    setTab(t);
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.tilbake}>← Tilbake</Text>
        </TouchableOpacity>
        <Text style={s.topbarTittel}>Admin</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={s.tabBar}>
        {(['brukere', 'statistikk', 'ovelser'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tabKnapp, tab === t && s.tabKnappAktiv]}
            onPress={() => handleTabPress(t)}
          >
            <Text style={[s.tabTekst, tab === t && s.tabTekstAktiv]}>
              {t === 'brukere' ? 'Brukere' : t === 'statistikk' ? 'Statistikk' : 'Øvelser'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'brukere'    && <BrukereTab navigation={navigation} />}
        {tab === 'statistikk' && <StatistikkTab />}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.bg },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  feilTekst:     { color: colors.muted, fontSize: 13, textAlign: 'center' },
  topbar:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  topbarTittel:  { fontSize: 15, fontWeight: '500', color: colors.text },
  tilbake:       { fontSize: 13, color: colors.muted, width: 60 },
  tilbakeRad:    { paddingBottom: 8 },

  tabBar:        { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tabKnapp:      { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabKnappAktiv: { borderBottomColor: colors.accent },
  tabTekst:      { fontSize: 13, color: colors.muted, fontWeight: '400' },
  tabTekstAktiv: { color: colors.text, fontWeight: '500' },

  inner:         { padding: 16, paddingBottom: 40, gap: 16 },
  antallTekst:   { fontSize: 12, color: colors.muted2, fontWeight: '300' },
  seksjon:       { gap: 8 },
  seksjonTittel: { fontSize: 10, color: colors.muted, fontWeight: '500', letterSpacing: 0.8 },

  statGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statKort:      { flex: 1, minWidth: '44%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 4 },
  statVerdi:     { fontSize: 26, fontWeight: '300', color: colors.text },
  statLabel:     { fontSize: 11, color: colors.muted, fontWeight: '400' },

  kort:          { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 4 },
  kortTittel:    { fontSize: 14, fontWeight: '500', color: colors.text },
  kortSub:       { fontSize: 12, color: colors.muted, fontWeight: '300' },

  listeKort:     { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  listeRad:      { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  listeRadBorder:{ borderBottomWidth: 1, borderBottomColor: colors.border },
  listeNavn:     { fontSize: 14, color: colors.text, fontWeight: '400' },
  listeSub:      { fontSize: 12, color: colors.muted, fontWeight: '300' },
  listeDato:     { fontSize: 11, color: colors.muted2, fontWeight: '300' },

  typeBadge:     { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeGrønn:{ backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  typeBadgeGul:  { backgroundColor: colors.yellowDim, borderColor: colors.yellowBorder },
  typeBadgeTekst:{ fontSize: 10, fontWeight: '500' },

  aktTag:        { borderWidth: 1, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  aktTagTekst:   { fontSize: 10, fontWeight: '500' },
  pil:           { fontSize: 18, color: colors.muted2 },

  smertePrikk:   { alignItems: 'center', gap: 2, justifyContent: 'flex-end' },
  smerteBar:     { width: 14, borderRadius: 3 },
  smerteTall:    { fontSize: 9, color: colors.muted2 },
});
