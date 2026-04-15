// Felles progresjonsvurdering – brukes av HjemScreen og AktivOktScreen

export interface ProgresjonResultat {
  klar: boolean;              // Kriterier nådd + minst 40% av programmet fullført
  snartKlar: boolean;         // Akt 1 only: smerte ≤ 3, aktivering/mobilitet 5–6
  tidligProgresjon: boolean;  // Kriterier nådd på siste 3 treningsdager (uten 40%-krav)
  rpeSignal: 'for_lett' | 'optimal' | 'for_hardt' | null;
  failsafe: boolean;          // Akt 2+: smerte ≥ 4 registrert nylig
  akt: number;
  årsak: string;
  // Regresjon og stagnasjon
  regresjon: boolean;
  regresjonArsak: 'smertespike' | 'kontroll' | null;
  stagnasjon: boolean;
  stagnasjonJustering: 'øk' | 'reduser' | null;
  stagnasjonStrength: 'low' | 'medium' | 'high' | null;
  stagnasjonData: {
    contact_reps: 'flat' | 'improving' | 'not_tracked';
    side_diff:    'flat' | 'improving' | 'not_tracked';
    rpe:          number | null;
  } | null;
}

// Terskelverdier per akt
const TERSKEL_AKT1: Record<string, { type: 'min' | 'maks'; verdi: number }> = {
  activation_quality: { type: 'min', verdi: 7 },
  mobility:           { type: 'min', verdi: 7 },
  contact_reps:       { type: 'min', verdi: 8 },
  side_diff:          { type: 'maks', verdi: 3 },
  sets_reps:          { type: 'min', verdi: 0 },
  sets_reps_weight:   { type: 'min', verdi: 0 },
  completed:          { type: 'min', verdi: 0 },
};

const TERSKEL_AKT2PLUSS: Record<string, { type: 'min' | 'maks'; verdi: number }> = {
  activation_quality: { type: 'min', verdi: 8 },
  contact_reps:       { type: 'min', verdi: 8 },
  mobility:           { type: 'min', verdi: 8 },
  side_diff:          { type: 'maks', verdi: 3 },
  sets_reps:          { type: 'min', verdi: 0 },
  sets_reps_weight:   { type: 'min', verdi: 0 },
  completed:          { type: 'min', verdi: 0 },
};

// RPE er et justeringssignal – ikke et progresjonskrav
const IGNORER = new Set(['sets_reps', 'sets_reps_weight', 'completed', 'rpe']);

function regresjonSjekk(
  sisteUnike: any[][],
  gkIds: Set<string>,
  program: any,
): { regresjon: boolean; arsak: 'smertespike' | 'kontroll' | null } {
  // A) Smertespike: noen av siste 3 økter har smerte ≥ 5
  const siste3 = sisteUnike.slice(0, 3).flat();
  if (siste3.some((l: any) => (l.smerte ?? 0) >= 5)) {
    return { regresjon: true, arsak: 'smertespike' };
  }

  // B) Kontrollkollaps: ≥ 2 gatekeeper-logger siste 2 dager med contact_reps < 50% repMal
  const gkOvelse = (program.ovelser || []).find((o: any) =>
    gkIds.has(o.exerciseId ?? o.id) &&
    (o.tracking_types || [o.tracking_type]).includes?.('contact_reps')
  );
  const repMal = gkOvelse?.reps ?? null;

  if (repMal !== null) {
    const gkSiste2 = filterGatekeeperLogger(sisteUnike.slice(0, 2).flat(), gkIds);
    const lavKontrollCount = gkSiste2.filter(
      (l: any) => l.contact_reps !== null && l.contact_reps < repMal * 0.5
    ).length;
    if (lavKontrollCount >= 2) {
      return { regresjon: true, arsak: 'kontroll' };
    }
  }

  return { regresjon: false, arsak: null };
}

function stagnasjonSjekk(
  sisteUnike5: any[][],
  gkIds: Set<string>,
): {
  stagnasjon: boolean;
  justering: 'øk' | 'reduser' | null;
  strength: 'low' | 'medium' | 'high' | null;
  data: ProgresjonResultat['stagnasjonData'];
} {
  const ingenData = { stagnasjon: false, justering: null, strength: null, data: null };

  if (sisteUnike5.length < 5) return ingenData;

  // Hard guard: smerte > 3 i noen av siste 3 sesjoner → failsafe/regresjon håndterer dette
  const siste3 = sisteUnike5.slice(0, 3).flat();
  const maxSmerte = Math.max(0, ...siste3.map((l: any) => l.smerte ?? 0));
  if (maxSmerte > 3) return ingenData;

  const nyligeLogger  = filterGatekeeperLogger(sisteUnike5.slice(0, 2).flat(), gkIds);
  const tidligeLogger = filterGatekeeperLogger(sisteUnike5.slice(2, 5).flat(), gkIds);

  if (nyligeLogger.length < 2 || tidligeLogger.length < 2) return ingenData;

  // contact_reps
  const nyligeReps  = snittVerdi(nyligeLogger, 'contact_reps');
  const tidligeReps = snittVerdi(tidligeLogger, 'contact_reps');
  const repsTracked = nyligeReps !== null && tidligeReps !== null;
  const repsBedret  = repsTracked && nyligeReps > tidligeReps * 1.05;

  // side_diff (lavt er bedre)
  const nyligeSide  = snittVerdi(nyligeLogger, 'side_diff');
  const tidligeSide = snittVerdi(tidligeLogger, 'side_diff');
  const sideTracked = nyligeSide !== null && tidligeSide !== null;
  const sideBedret  = sideTracked && nyligeSide < tidligeSide * 0.95;

  if (!repsTracked && !sideTracked) return ingenData;

  // Evaluer kun trackede metrics
  const trackedMetrics: boolean[] = [];
  if (repsTracked) trackedMetrics.push(repsBedret);
  if (sideTracked) trackedMetrics.push(sideBedret);
  const stagnert = trackedMetrics.length > 0 && trackedMetrics.every(v => v === false);
  if (!stagnert) return ingenData;

  // RPE-justering
  const avgRpe = snittVerdi(nyligeLogger, 'rpe');
  const justering: 'øk' | 'reduser' | null =
    avgRpe !== null && avgRpe < 3.5 ? 'øk' :
    avgRpe !== null && avgRpe > 6.5 ? 'reduser' : null;

  // Strength: basert på antall flate metrics
  const contact_repsStatus = !repsTracked ? 'not_tracked' : repsBedret ? 'improving' : 'flat';
  const side_diffStatus    = !sideTracked ? 'not_tracked' : sideBedret ? 'improving' : 'flat';
  const flatCount = [contact_repsStatus, side_diffStatus].filter(s => s === 'flat').length;
  const strength: 'low' | 'medium' | 'high' =
    flatCount >= 2 ? 'high' : flatCount === 1 ? 'medium' : 'low';

  return {
    stagnasjon: true,
    justering,
    strength,
    data: { contact_reps: contact_repsStatus, side_diff: side_diffStatus, rpe: avgRpe },
  };
}

function erGatekeeper(o: any): boolean {
  if (o.gatekeeperOverride === true) return true;
  if (o.gatekeeperOverride === false) return false;
  return o.gatekeeper === true;
}

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

// Filtrer logger til kun gatekeeper-øvelser (eller alle ved fallback)
function filterGatekeeperLogger(logger: any[], gkIds: Set<string>): any[] {
  if (gkIds.size === 0) return logger;
  return logger.map(l => ({
    ...l,
    ovelser: (l.ovelser || []).filter((o: any) => gkIds.has(o.exerciseId)),
  }));
}

function sjekkKriterier(
  programLogger: any[],
  trackingTyper: Set<string>,
  program: any,
  akt: number,
): boolean {
  const terskel = akt === 1 ? TERSKEL_AKT1 : TERSKEL_AKT2PLUSS;
  const kliniske = [...trackingTyper].filter(t => !IGNORER.has(t));

  if (kliniske.length === 0) {
    // Kun completed – akt 1 sjekker smerte
    if (akt === 1) {
      const harSmerte = programLogger.some((l: any) => l.smerte !== null && l.smerte !== undefined);
      if (harSmerte) return programLogger.every((l: any) => (l.smerte ?? 10) <= 3);
    }
    return false;
  }

  for (const type of kliniske) {
    const t = terskel[type];
    if (!t) continue;

    if (type === 'contact_reps') {
      const repMal = (program.ovelser || []).find((o: any) =>
        (o.tracking_types || [o.tracking_type]).includes?.('contact_reps')
      )?.reps || 10;
      const maks = maksVerdi(programLogger, 'contact_reps');
      if (maks === null || maks < repMal * 0.85) return false;
    } else if (t.type === 'min') {
      const s = snittVerdi(programLogger, type);
      if (s === null || s < t.verdi) return false;
    } else {
      // maks-typer (side_diff) – lavt er bra
      const s = snittVerdi(programLogger, type);
      if (s === null || s > t.verdi) return false;
    }
  }

  // Akt 1: smerte ≤ 3 som tilleggskrav
  if (akt === 1) {
    const harSmerte = programLogger.some((l: any) => l.smerte !== null && l.smerte !== undefined);
    if (harSmerte && !programLogger.every((l: any) => (l.smerte ?? 10) <= 3)) return false;
  }

  return true;
}

export function vurderProgresjon(
  program: any,
  logger: any[],
): ProgresjonResultat {
  const akt = program?.akt || 1;
  const totalt = program?.okterTotalt || 0;
  const fullfort = program?.okterFullfort || 0;

  const tom: ProgresjonResultat = {
    klar: false, snartKlar: false, tidligProgresjon: false,
    rpeSignal: null, failsafe: false, akt, årsak: 'for tidlig',
    regresjon: false, regresjonArsak: null,
    stagnasjon: false, stagnasjonJustering: null, stagnasjonStrength: null, stagnasjonData: null,
  };

  // Fullførte logger for dette programmet, nyeste først
  const alleFullforte = logger.filter((l: any) => l.programId === program.id && l.fullfort);

  // Failsafe: akt >= 2, smerte >= 4 i noen av siste 3 logger
  const failsafe = akt >= 2 &&
    alleFullforte.slice(0, 3).some((l: any) => l.smerte !== null && l.smerte !== undefined && l.smerte >= 4);

  // Grupper per unik treningsdag (nyeste først)
  const dagMap = new Map<string, any[]>();
  for (const l of alleFullforte) {
    const dato = l.dato?.toDate ? l.dato.toDate() : new Date(l.dato);
    const nøkkel = dato.toDateString();
    if (!dagMap.has(nøkkel)) dagMap.set(nøkkel, []);
    dagMap.get(nøkkel)!.push(l);
  }
  const alleUnike = Array.from(dagMap.values());
  const sisteUnike = alleUnike.slice(0, 5); // 5 dager for stagnasjon

  if (sisteUnike.length < 2) {
    return { ...tom, failsafe, årsak: 'for få treningsdager' };
  }

  // Finn gatekeeper-øvelser
  const gkOvelser = (program.ovelser || []).filter(erGatekeeper);
  const gkIds = new Set<string>(gkOvelser.map((o: any) => o.exerciseId).filter(Boolean));
  const aktuelleOvelser = gkIds.size > 0 ? gkOvelser : (program.ovelser || []);

  // Tracking-typer fra aktuelle øvelser (fallback: fra logger)
  const trackingTyper = new Set<string>();
  aktuelleOvelser.forEach((o: any) => {
    (o.tracking_types || []).forEach((t: string) => trackingTyper.add(t));
    if (o.tracking_type) trackingTyper.add(o.tracking_type);
  });

  const programLogger = filterGatekeeperLogger(sisteUnike.slice(0, 3).flat(), gkIds);

  // RPE-signal (justeringssignal – ikke progresjonskrav)
  const avgRpe = snittVerdi(programLogger, 'rpe');
  let rpeSignal: ProgresjonResultat['rpeSignal'] = null;
  if (avgRpe !== null) {
    if (avgRpe < 3.5) rpeSignal = 'for_lett';
    else if (avgRpe > 6.5) rpeSignal = 'for_hardt';
    else rpeSignal = 'optimal';
  }

  // tidligProgresjon: kriterier nådd på siste 3 dager (uten 40%-krav)
  const tidligProgresjon = sisteUnike.length >= 3
    ? sjekkKriterier(programLogger, trackingTyper, program, akt)
    : false;

  // klar: kriterier nådd + minst 40% fullført
  const harNok = totalt >= 2 && fullfort >= Math.floor(totalt * 0.4) && fullfort < totalt;
  const klar = harNok && sjekkKriterier(programLogger, trackingTyper, program, akt);

  // snartKlar (kun akt 1): smerte ≤ 3 + aktivering/mobilitet 5–6
  let snartKlar = false;
  if (!klar && !tidligProgresjon && akt === 1) {
    const smerteOk = sisteUnike.flat().every((l: any) => (l.smerte ?? 10) <= 3);
    const aktivering = snittVerdi(programLogger, 'activation_quality');
    const mobilitet = snittVerdi(programLogger, 'mobility');
    snartKlar = smerteOk &&
      aktivering !== null && aktivering >= 5 && aktivering < 7 &&
      mobilitet !== null && mobilitet >= 5 && mobilitet < 7;
  }

  // Regresjon
  const regResult = regresjonSjekk(sisteUnike, gkIds, program);
  if (regResult.regresjon) {
    return {
      klar: false, snartKlar: false, tidligProgresjon: false,
      rpeSignal, failsafe: false, akt,
      årsak: `regresjon (${regResult.arsak})`,
      regresjon: true, regresjonArsak: regResult.arsak,
      stagnasjon: false, stagnasjonJustering: null, stagnasjonStrength: null, stagnasjonData: null,
    };
  }

  // Failsafe (etter regresjon-sjekk)
  if (failsafe) {
    return {
      klar: false, snartKlar: false, tidligProgresjon: false,
      rpeSignal, failsafe: true, akt, årsak: 'failsafe – smerte ≥ 4',
      regresjon: false, regresjonArsak: null,
      stagnasjon: false, stagnasjonJustering: null, stagnasjonStrength: null, stagnasjonData: null,
    };
  }

  // Stagnasjon
  const stagResult = stagnasjonSjekk(sisteUnike, gkIds);

  const årsak = klar
    ? 'alle kriterier nådd (≥40% fullført)'
    : tidligProgresjon
      ? 'kriterier nådd tidlig (siste 3 treningsdager)'
      : snartKlar
        ? 'nesten klar – akt 1'
        : stagResult.stagnasjon
          ? 'stagnasjon detektert'
          : 'ikke alle kriterier nådd';

  return {
    klar, snartKlar, tidligProgresjon, rpeSignal, failsafe: false, akt, årsak,
    regresjon: false, regresjonArsak: null,
    stagnasjon: stagResult.stagnasjon,
    stagnasjonJustering: stagResult.justering,
    stagnasjonStrength: stagResult.strength,
    stagnasjonData: stagResult.data,
  };
}
