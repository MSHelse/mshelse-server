// Felles progresjonsvurdering – brukes av HjemScreen og AktivOktScreen
// Returnerer true hvis ALLE tracking-typer i programmet er over terskel over 2-3 økter

export interface ProgresjonResultat {
  klar: boolean;
  akt: number;
  årsak: string; // for debugging / logging
}

// Terskelverdi per tracking-type – "klar for progresjon"
const TERSKEL: Record<string, { type: 'min' | 'maks'; verdi: number }> = {
  activation_quality: { type: 'min', verdi: 8 },
  contact_reps:       { type: 'min', verdi: 8 },   // antall reps, ikke 0-10 – se repMal-logikk
  mobility:           { type: 'min', verdi: 8 },
  rpe:                { type: 'maks', verdi: 7 },   // lav RPE = lett = klar for mer
  side_diff:          { type: 'maks', verdi: 3 },   // lav diff = balansert
  sets_reps:          { type: 'min', verdi: 0 },    // ikke klinisk terskel – ignorer
  sets_reps_weight:   { type: 'min', verdi: 0 },    // ikke klinisk terskel – ignorer
  completed:          { type: 'min', verdi: 0 },    // alltid godkjent
};

const IGNORER = new Set(['sets_reps', 'sets_reps_weight', 'completed']);

function snittVerdi(logger: any[], type: string): number | null {
  const alle = logger.flatMap((l: any) =>
    (l.ovelser || []).flatMap((o: any) =>
      (o.sett || []).map((s: any) => s.verdier?.[type] ?? null)
    )
  ).filter((v: any) => v !== null) as number[];
  if (alle.length === 0) return null;
  return alle.reduce((a, b) => a + b, 0) / alle.length;
}

function maksVerdi(logger: any[], type: string): number | null {
  const alle = logger.flatMap((l: any) =>
    (l.ovelser || []).flatMap((o: any) =>
      (o.sett || []).map((s: any) => s.verdier?.[type] ?? null)
    )
  ).filter((v: any) => v !== null) as number[];
  if (alle.length === 0) return null;
  return Math.max(...alle);
}

export function vurderProgresjon(
  program: any,
  logger: any[], // alle logger for dette programmet, nyeste først
): ProgresjonResultat {
  const akt = program?.akt || 1;
  const totalt = program?.okterTotalt || 0;
  const fullfort = program?.okterFullfort || 0;

  // Ikke ferdig med programmet, og minst 40% fullført
  if (totalt < 2 || fullfort < Math.floor(totalt * 0.4) || fullfort >= totalt) {
    return { klar: false, akt, årsak: 'for tidlig' };
  }

  // Programlogger, fullførte, nyeste først
  const programLogger = logger
    .filter((l: any) => l.programId === program.id && l.fullfort)
    .slice(0, 3);

  if (programLogger.length < 2) {
    return { klar: false, akt, årsak: 'for få logger' };
  }

  // Bygg sett med alle tracking-typer i programmet (støtter gammelt + nytt skjema)
  const trackingTyper = new Set<string>();
  (program.ovelser || []).forEach((o: any) => {
    (o.tracking_types || []).forEach((t: string) => trackingTyper.add(t));
    if (o.tracking_type) trackingTyper.add(o.tracking_type);
  });
  // Fallback: les fra logger hvis programmet mangler tracking-info
  programLogger.forEach((l: any) => {
    (l.ovelser || []).forEach((o: any) => {
      (o.tracking_types || []).forEach((t: string) => trackingTyper.add(t));
      if (o.tracking_type) trackingTyper.add(o.tracking_type);
    });
  });

  const kliniskeTyper = [...trackingTyper].filter(t => !IGNORER.has(t));

  if (kliniskeTyper.length === 0) {
    // Kun completed – sjekk smerte for Akt 1
    if (akt === 1) {
      const harSmerte = programLogger.some((l: any) => l.smerte !== null && l.smerte !== undefined);
      if (harSmerte) {
        const smertefri = programLogger.every((l: any) => (l.smerte ?? 10) === 0);
        return smertefri
          ? { klar: true, akt, årsak: 'smertefri, kun completed tracking' }
          : { klar: false, akt, årsak: 'ikke smertefri' };
      }
    }
    return { klar: false, akt, årsak: 'ingen kliniske tracking-typer' };
  }

  // AND-logikk: alle kliniske typer må nå terskel over siste 2-3 logger
  const resultater: Record<string, boolean> = {};

  for (const type of kliniskeTyper) {
    const t = TERSKEL[type];
    if (!t) continue;

    if (type === 'contact_reps') {
      // contact_reps: bruker repMal fra program, ikke fast terskel
      const repMal = (program.ovelser || []).find((o: any) =>
        (o.tracking_types || [o.tracking_type]).includes?.('contact_reps')
      )?.reps || 10;
      const maks = maksVerdi(programLogger, 'contact_reps');
      resultater[type] = maks !== null && maks >= repMal * 0.85;
    } else if (t.type === 'min') {
      const s = snittVerdi(programLogger, type);
      resultater[type] = s !== null && s >= t.verdi;
    } else if (type === 'rpe') {
      // RPE: siste logger ≤ 7 OG har falt minst 1.5 poeng siden første logg
      const snittNylig = snittVerdi(programLogger, 'rpe');
      if (snittNylig === null) { resultater[type] = false; continue; }
      const lavNok = snittNylig <= t.verdi;
      const eldste = programLogger[programLogger.length - 1];
      const snittStart = snittVerdi([eldste], 'rpe');
      const harFalt = snittStart !== null && (snittStart - snittNylig) >= 1.5;
      resultater[type] = lavNok && harFalt;
    } else {
      // Andre maks-typer (side_diff) – lavt er bra
      const s = snittVerdi(programLogger, type);
      resultater[type] = s !== null && s <= t.verdi;
    }
  }

  // Alle må være true
  const alle = Object.values(resultater);
  const klar = alle.length > 0 && alle.every(Boolean);

  // Akt 1 ekstra: hvis smerte trackes, må den være 0
  if (klar && akt === 1) {
    const harSmerte = programLogger.some((l: any) => l.smerte !== null && l.smerte !== undefined);
    if (harSmerte) {
      const smertefri = programLogger.every((l: any) => (l.smerte ?? 10) === 0);
      if (!smertefri) return { klar: false, akt, årsak: 'ikke smertefri' };
    }
  }

  const årsak = klar
    ? `alle kriterier nådd: ${JSON.stringify(resultater)}`
    : `ikke alle nådd: ${JSON.stringify(resultater)}`;

  return { klar, akt, årsak };
}
