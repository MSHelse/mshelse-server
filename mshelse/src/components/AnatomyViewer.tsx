import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors } from '../theme/colors';

// ─── Config ──────────────────────────────────────────────────────────────────
const BUCKET = 'mshelse.firebasestorage.app';

function storageUrl(filnavn: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/anatomy%2F${encodeURIComponent(filnavn)}?alt=media`;
}

// ─── Hjelpefunksjoner ────────────────────────────────────────────────────────
function normaliserFilnavn(bilde: string): string {
  if (bilde.includes('=- ') || bilde.includes('= - ')) return bilde;
  return bilde.replace(/^(Muscle Group=)(?![-\s]*)/, 'Muscle Group=- ');
}

function muskelNavnFraFil(fil: string): string {
  const m = fil.match(/Muscle Group=[-\s]*([^,]+)/);
  return (m?.[1] || '').trim().toLowerCase();
}

export function matchMuskelFil(bilde: string, kandidater: string[]): string {
  if (kandidater.length === 0) return normaliserFilnavn(bilde);
  if (kandidater.includes(bilde)) return bilde;
  const norm = (s: string) => s.replace(/=\s*-?\s*/g, '=').toLowerCase().trim();
  const treff = kandidater.find(k => norm(k) === norm(bilde));
  if (treff) return treff;
  const muskelNavn = muskelNavnFraFil(bilde);
  if (muskelNavn) {
    const deltreff = kandidater.find(k => norm(k).includes(muskelNavn));
    if (deltreff) return deltreff;
  }
  return normaliserFilnavn(bilde);
}

// ─── Typer ───────────────────────────────────────────────────────────────────
export interface AnatomiBilde {
  bilde: string;
  type: 'overfladisk' | 'dyp';
  rolle?: 'primer' | 'sekundar' | 'stabilisator';
}

export interface AnatomiData   { anterior?: AnatomiBilde[]; posterior?: AnatomiBilde[]; }
export interface MuskelGrupper { primer?: string[]; sekundar?: string[]; stabilisator?: string[]; }

interface Props {
  anatomi: AnatomiData;
  muskelgrupper?: MuskelGrupper;
  kompakt?: boolean;
  muskelFiler?: string[];
}

// ─── Farge per muskelrolle ───────────────────────────────────────────────────
const ROLLE_FARGE: Record<string, string> = {
  primer:       '#E05555',
  sekundar:     '#D4A82A',
  stabilisator: '#4A90D9',
};
const ROLLE_LABEL: Record<string, string> = {
  primer:       'PRIMÆR',
  sekundar:     'SEKUNDÆR',
  stabilisator: 'STABILISATOR',
};

// Eksakt målfarger per rolle (RGB)
const ROLLE_RGB: Record<string, [number, number, number]> = {
  primer:       [224, 85,  85],   // #E05555
  sekundar:     [212, 168, 42],   // #D4A82A
  stabilisator: [74,  144, 217],  // #4A90D9
};

function bestemRolle(entry: AnatomiBilde, muskelgrupper?: MuskelGrupper): string {
  if (entry.rolle) return entry.rolle;
  if (!muskelgrupper) return 'primer';
  const navn = muskelNavnFraFil(entry.bilde);
  if (!navn) return 'primer';
  const norm = (s: string) => s.toLowerCase().trim();
  if ((muskelgrupper.stabilisator || []).some(m => norm(m).includes(navn) || navn.includes(norm(m)))) return 'stabilisator';
  if ((muskelgrupper.sekundar || []).some(m => norm(m).includes(navn) || navn.includes(norm(m)))) return 'sekundar';
  return 'primer';
}

// ─── Canvas-cache: nøkkel er url+rolle ───────────────────────────────────────
const canvasCache = new Map<string, string>();

// ─── Direkte fargebytting på røde (muskel) piksler ───────────────────────────
// Røde piksler (r > 150, r dominerer) = muskler → byttes til målfargen
// Grå piksler (kropp/skjelett) = lav saturation → rørers ikke
function applyColorReplacement(d: Uint8ClampedArray, target: [number, number, number]) {
  const [tR, tG, tB] = target;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 150 && r > g * 1.5 && r > b * 1.5) {
      // Muskel-piksel: bytt til målfargen, skaler med lysstyrke (rød kanal = indikator)
      const brightness = r / 255;
      d[i]   = Math.round(tR * brightness);
      d[i+1] = Math.round(tG * brightness);
      d[i+2] = Math.round(tB * brightness);
    }
    // Ellers: rør ikke (grå kropp, skjelettkanter osv. forblir uendret)
  }
}

// ─── ProcessedImg: fjerner hvit bakgrunn + fargebytter muskler per rolle ──────
function ProcessedImg({
  url,
  posStyle,
  rolle,
}: {
  url: string;
  posStyle: React.CSSProperties;
  rolle: string;
}) {
  const cacheKey = `${url}|||${rolle}`;
  const [src, setSrc] = React.useState<string | null>(() => canvasCache.get(cacheKey) ?? null);

  React.useEffect(() => {
    const cached = canvasCache.get(cacheKey);
    if (cached) { setSrc(cached); return; }

    let cancelled = false;
    const img = new (window as any).Image() as HTMLImageElement;
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        // Fjern hvit bakgrunn
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const brightness = (r + g + b) / 3;
          const saturation = Math.max(r, g, b) - Math.min(r, g, b);
          if (brightness > 200 && saturation < 30) {
            const alpha = brightness >= 230 ? 0 : Math.round(((230 - brightness) / 30) * 255);
            d[i + 3] = Math.min(d[i + 3], alpha);
          }
        }

        // Bytt muskelfarge til eksakt målfargen for rollen
        applyColorReplacement(d, ROLLE_RGB[rolle] ?? ROLLE_RGB.primer);

        ctx.putImageData(imgData, 0, 0);
        if (cancelled) return;
        const dataUrl = canvas.toDataURL('image/png');
        canvasCache.set(cacheKey, dataUrl);
        setSrc(dataUrl);
      } catch {
        if (!cancelled) { canvasCache.set(cacheKey, url); setSrc(url); }
      }
    };

    img.onerror = () => { if (!cancelled) { canvasCache.set(cacheKey, '__error__'); setSrc('__error__'); } };
    img.src = url;
    return () => { cancelled = true; };
  }, [cacheKey]);

  if (!src || src === '__error__') return <div style={{ ...posStyle, opacity: 0 }} />;
  return (
    <img
      src={src}
      style={{ ...posStyle, mixBlendMode: 'darken' as any }}
      alt=""
    />
  );
}

// ─── Stablet bilder via HTML (web) ───────────────────────────────────────────
interface ImgEntry { url: string; rolle: string; }

function StackedImgs({ imgs, w, h, clip }: {
  imgs: ImgEntry[];
  w: number;
  h: number;
  clip?: 'left' | 'right';
}) {
  if (imgs.length === 0) return null;

  const containerStyle: React.CSSProperties = {
    position:   'relative',
    width:      clip ? w / 2 : w,
    height:     h,
    overflow:   'hidden',
    flexShrink: 0,
  };

  const posStyle: React.CSSProperties = {
    position:  'absolute',
    top:       0,
    left:      clip === 'right' ? -(w / 2) : 0,
    width:     w,
    height:    h,
    objectFit: 'fill' as const,
    display:   'block',
  };

  return (
    <div style={containerStyle}>
      {imgs.map(({ url, rolle }, i) => (
        <ProcessedImg
          key={`${url}-${i}`}
          url={url}
          posStyle={posStyle}
          rolle={rolle}
        />
      ))}
    </div>
  );
}

// ─── Én anatomi-figur (anterior eller posterior) ─────────────────────────────
function AnatomyFigure({ bilder, label, figW, figH, muskelFiler, muskelgrupper }: {
  bilder: AnatomiBilde[];
  label: string;
  figW: number;
  figH: number;
  muskelFiler: string[];
  muskelgrupper?: MuskelGrupper;
}) {
  const overfladiske   = bilder.filter(b => b.type === 'overfladisk');
  const dype           = bilder.filter(b => b.type === 'dyp');
  const harOverfladisk = overfladiske.length > 0;
  const harDyp         = dype.length > 0;

  // Native fallback
  if (Platform.OS !== 'web') {
    const første = overfladiske[0] || dype[0];
    if (!første) return null;
    const { Image } = require('react-native');
    return (
      <View style={fig.wrapper}>
        <Image
          source={{ uri: storageUrl(matchMuskelFil(første.bilde, muskelFiler)) }}
          style={{ width: figW, height: figH }}
          resizeMode="stretch"
        />
        <Text style={fig.label}>{label}</Text>
      </View>
    );
  }

  // ── Splittvisning: venstre = overfladisk (Outer), høyre = dyp (Inner) ───
  if (harOverfladisk && harDyp) {
    const overflImgs: ImgEntry[] = overfladiske.map(b => ({
      url:   storageUrl(matchMuskelFil(b.bilde, muskelFiler)),
      rolle: bestemRolle(b, muskelgrupper),
    }));
    const dypImgs: ImgEntry[] = dype.map(b => ({
      url:   storageUrl(matchMuskelFil(b.bilde, muskelFiler)),
      rolle: bestemRolle(b, muskelgrupper),
    }));

    return (
      <View style={fig.wrapper}>
        <div style={{
          display:      'flex',
          flexDirection: 'row',
          width:        figW,
          height:       figH,
          overflow:     'hidden',
        }}>
          <StackedImgs imgs={overflImgs} w={figW} h={figH} clip="left" />
          <StackedImgs imgs={dypImgs}    w={figW} h={figH} clip="right" />
        </div>
        <View style={fig.labelRad}>
          <Text style={fig.label}>{label}</Text>
          <Text style={fig.splitHint}> · overfl. | dyp</Text>
        </View>
      </View>
    );
  }

  // ── Kun én type ──────────────────────────────────────────────────────────
  const liste = harOverfladisk ? overfladiske : dype;
  const imgs: ImgEntry[] = liste.map(b => ({
    url:   storageUrl(matchMuskelFil(b.bilde, muskelFiler)),
    rolle: bestemRolle(b, muskelgrupper),
  }));

  return (
    <View style={fig.wrapper}>
      <div style={{ overflow: 'hidden', width: figW, height: figH }}>
        <StackedImgs imgs={imgs} w={figW} h={figH} />
      </div>
      <View style={fig.labelRad}>
        <Text style={fig.label}>{label}</Text>
      </View>
    </View>
  );
}

// ─── Muskelliste ──────────────────────────────────────────────────────────────
function MuskelListe({ muskelgrupper, kompakt }: { muskelgrupper: MuskelGrupper; kompakt: boolean }) {
  const rader: { rolle: string; muskler: string[] }[] = [];
  if ((muskelgrupper.primer || []).length > 0)
    rader.push({ rolle: 'primer', muskler: muskelgrupper.primer! });
  if ((muskelgrupper.sekundar || []).length > 0)
    rader.push({ rolle: 'sekundar', muskler: muskelgrupper.sekundar! });
  if ((muskelgrupper.stabilisator || []).length > 0)
    rader.push({ rolle: 'stabilisator', muskler: muskelgrupper.stabilisator! });
  if (rader.length === 0) return null;

  return (
    <View style={[ml.wrapper, kompakt && ml.wrapperKompakt]}>
      {rader.map(({ rolle, muskler }) => (
        <View key={rolle} style={ml.rad}>
          <View style={[ml.dot, { backgroundColor: ROLLE_FARGE[rolle] }]} />
          <Text style={[ml.label, { color: ROLLE_FARGE[rolle] }]}>{ROLLE_LABEL[rolle]}</Text>
          <Text style={ml.muskler} numberOfLines={kompakt ? 1 : undefined}>
            {muskler.join(', ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Hoved-eksport ────────────────────────────────────────────────────────────
export default function AnatomyViewer({ anatomi, muskelgrupper, kompakt = false, muskelFiler = [] }: Props) {
  const anterior   = anatomi?.anterior  || [];
  const posterior  = anatomi?.posterior || [];
  const harAnatomi = anterior.length > 0 || posterior.length > 0;
  const harMuskler = muskelgrupper && (
    (muskelgrupper.primer?.length ?? 0) > 0 ||
    (muskelgrupper.sekundar?.length ?? 0) > 0 ||
    (muskelgrupper.stabilisator?.length ?? 0) > 0
  );

  if (!harAnatomi && !harMuskler) return null;

  const figW = kompakt ? 100 : 130;
  const figH = figW * 2;

  return (
    <View style={[s.container, kompakt && s.containerKompakt]}>
      {harAnatomi && (
        <View style={[s.figurOmrade, kompakt && s.figurOmradeKompakt]}>
          <View style={s.figurRad}>
            {anterior.length > 0 && (
              <AnatomyFigure bilder={anterior} label="FORAN" figW={figW} figH={figH} muskelFiler={muskelFiler} muskelgrupper={muskelgrupper} />
            )}
            {posterior.length > 0 && (
              <AnatomyFigure bilder={posterior} label="BAK" figW={figW} figH={figH} muskelFiler={muskelFiler} muskelgrupper={muskelgrupper} />
            )}
          </View>
        </View>
      )}
      {harMuskler && (
        <MuskelListe muskelgrupper={muskelgrupper!} kompakt={kompakt} />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const fig = StyleSheet.create({
  wrapper:   { alignItems: 'center', gap: 6 },
  labelRad:  { flexDirection: 'row', alignItems: 'center' },
  label:     { fontSize: 10, color: colors.muted, fontWeight: '500', letterSpacing: 0.8 },
  splitHint: { fontSize: 9, color: colors.muted2, fontWeight: '300' },
});

const ml = StyleSheet.create({
  wrapper:        { gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  wrapperKompakt: { paddingTop: 8 },
  rad:            { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
  dot:            { width: 7, height: 7, borderRadius: 3.5, marginTop: 3 },
  label:          { fontSize: 9, fontWeight: '600', letterSpacing: 0.6, marginTop: 1, minWidth: 72 },
  muskler:        { fontSize: 12, color: colors.muted, fontWeight: '300', flex: 1 },
});

const s = StyleSheet.create({
  container:           { gap: 0 },
  containerKompakt:    {},
  figurOmrade: {
    backgroundColor:   '#F2F2F2',
    borderRadius:      14,
    overflow:          'hidden',
    paddingVertical:   16,
    paddingHorizontal: 8,
  },
  figurOmradeKompakt: {
    paddingVertical:   10,
    paddingHorizontal: 4,
  },
  figurRad: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            24,
  },
});
