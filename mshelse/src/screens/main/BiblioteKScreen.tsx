import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, ActivityIndicator, TextInput
} from 'react-native';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { colors } from '../../theme/colors';

const KROPPSDELER = ['Alle', 'Korsrygg', 'Hofte', 'Nakke', 'Skulder', 'Kne', 'Legg', 'Core'];

const AKT_FARGE: Record<number, { bg: string; border: string; tekst: string }> = {
  1: { bg: colors.dangerDim,  border: 'rgba(192,57,43,0.3)',   tekst: colors.danger },
  2: { bg: colors.orangeDim,  border: colors.orangeBorder,     tekst: colors.orange },
  3: { bg: colors.yellowDim,  border: colors.yellowBorder,     tekst: colors.yellow },
  4: { bg: colors.greenDim,   border: colors.greenBorder,      tekst: colors.green  },
};

export default function BiblioteKScreen({ navigation }: any) {
  const [laster, setLaster] = useState(true);
  const [ovelser, setOvelser] = useState<any[]>([]);
  const [filter, setFilter] = useState('Alle');
  const [filterAkt, setFilterAkt] = useState(0);
  const [sok, setSok] = useState('');

  useEffect(() => {
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

  function filtrerte() {
    return ovelser.filter(o => {
      const matchFilter = filter === 'Alle' || (o.bodyParts || []).includes(filter);
      const matchSok = !sok || o.name?.toLowerCase().includes(sok.toLowerCase());
      const matchAkt = filterAkt === 0 || (o.act || []).includes(filterAkt);
      return matchFilter && matchSok && matchAkt;
    });
  }

  function gruppertPerKroppsdel() {
    const liste = filtrerte();
    if (filter !== 'Alle') return { [filter]: liste };
    const grupper: Record<string, any[]> = {};
    liste.forEach(o => {
      const deler = o.bodyParts || ['Annet'];
      deler.forEach((del: string) => {
        if (!grupper[del]) grupper[del] = [];
        if (!grupper[del].find((x: any) => x.id === o.id)) {
          grupper[del].push(o);
        }
      });
    });
    return grupper;
  }

  const grupper = gruppertPerKroppsdel();

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
        <Text style={s.tittel}>Øvelsesbibliotek</Text>
        <Text style={s.antall}>{ovelser.length} øvelser</Text>
      </View>

      <View style={s.sokWrapper}>
        <TextInput
          style={s.sokInput}
          value={sok}
          onChangeText={setSok}
          placeholder="Søk øvelser..."
          placeholderTextColor={colors.muted2}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterInner}>
        {KROPPSDELER.map(k => (
          <TouchableOpacity
            key={k}
            style={[s.filterChip, filter === k && s.filterChipAktiv]}
            onPress={() => setFilter(k)}
          >
            <Text style={[s.filterTekst, filter === k && s.filterTekstAktiv]}>{k}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.aktFilterRad}>
        <TouchableOpacity
          style={[s.aktFilterChip, filterAkt === 0 && s.aktFilterChipAktiv]}
          onPress={() => setFilterAkt(0)}
        >
          <Text style={[s.filterTekst, filterAkt === 0 && s.filterTekstAktiv]}>Alle akter</Text>
        </TouchableOpacity>
        {[1, 2, 3, 4].map(a => (
          <TouchableOpacity
            key={a}
            style={[s.aktFilterChip, filterAkt === a && { backgroundColor: AKT_FARGE[a].bg, borderColor: AKT_FARGE[a].border }]}
            onPress={() => setFilterAkt(filterAkt === a ? 0 : a)}
          >
            <Text style={[s.filterTekst, filterAkt === a && { color: AKT_FARGE[a].tekst }]}>Akt {a}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.inner}>
        {Object.keys(grupper).length === 0 ? (
          <View style={s.tomKort}>
            <Text style={s.tomTekst}>Ingen øvelser lagt til ennå</Text>
          </View>
        ) : (
          Object.entries(grupper).map(([del, liste]) => (
            <View key={del} style={s.gruppe}>
              <Text style={s.gruppeTittel}>{del.toUpperCase()}</Text>
              <View style={s.kort}>
                {(liste as any[]).map((o, i) => (
                  <TouchableOpacity
                    key={o.id}
                    style={[s.ovelseRad, i < liste.length - 1 && s.ovelseRadBorder]}
                    onPress={() => navigation.navigate('OvelseDetalj', { ovelse: o })}
                  >
                    <View style={s.ovelseInfo}>
                      <Text style={s.ovelseNavn}>{o.name}</Text>
                      <View style={s.ovelseTagRow}>
                        {(o.act || []).map((a: number) => (
                          <View key={a} style={[s.aktTag, AKT_FARGE[a] && { backgroundColor: AKT_FARGE[a].bg, borderColor: AKT_FARGE[a].border }]}>
                            <Text style={[s.aktTagTekst, AKT_FARGE[a] && { color: AKT_FARGE[a].tekst }]}>Akt {a}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <Text style={s.pil}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  tittel: { fontSize: 21, fontWeight: '300', color: colors.text },
  antall: { fontSize: 13, color: colors.muted, fontWeight: '300' },
  sokWrapper: { padding: 16, paddingBottom: 8 },
  sokInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, borderRadius: 8, padding: 10, fontSize: 14, color: colors.text },
  filterScroll: { flexGrow: 0, paddingBottom: 8 },
  filterInner: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface },
  filterChipAktiv: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterTekst: { fontSize: 13, color: colors.muted, fontWeight: '400' },
  filterTekstAktiv: { color: colors.bg },
  inner: { padding: 16, paddingBottom: 40, gap: 16 },
  gruppe: { gap: 8 },
  gruppeTittel: { fontSize: 10, color: colors.muted, fontWeight: '500', letterSpacing: 0.8 },
  kort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  ovelseRad: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  ovelseRadBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  ovelseInfo: { flex: 1, gap: 5 },
  ovelseNavn: { fontSize: 15, fontWeight: '500', color: colors.text },
  ovelseTagRow: { flexDirection: 'row', gap: 5 },
  aktTag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  aktTagTekst: { fontSize: 10, fontWeight: '500' },
  aktFilterRad: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  aktFilterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border2, backgroundColor: colors.surface },
  aktFilterChipAktiv: { backgroundColor: colors.accent, borderColor: colors.accent },
  pil: { fontSize: 18, color: colors.muted2 },
  tomKort: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 24, alignItems: 'center' },
  tomTekst: { fontSize: 14, color: colors.muted, fontWeight: '400' },
});
