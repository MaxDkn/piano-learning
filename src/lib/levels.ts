import { buildExercise, midiToVexKey } from "./chords";

export type Level = 1 | 2 | 3 | 4;

export type Exercise = {
  level: Level;
  keys: string[];            // VexFlow keys
  clef: "treble" | "bass";
  nameFr: string;            // nom de la note/accord
  showName: boolean;         // false pour niveaux 1 et 2
  showStaffOnLoad: boolean;  // false pour niveaux 3 et 4 (révélé au clic)
  pitchClasses: number[];    // classes de hauteur attendues
};

// ── Niveau 1 : notes naturelles, clé de Sol ──────────────────────────────────
const TREBLE_NATURALS: [number, string][] = [
  [60, "Do4"], [62, "Ré4"], [64, "Mi4"], [65, "Fa4"], [67, "Sol4"],
  [69, "La4"], [71, "Si4"], [72, "Do5"], [74, "Ré5"], [76, "Mi5"],
  [77, "Fa5"], [79, "Sol5"],
];

export const LEVEL1_POOL: Exercise[] = TREBLE_NATURALS.map(([midi, name]) => ({
  level: 1,
  keys: [midiToVexKey(midi)],
  clef: "treble",
  nameFr: name,
  showName: false,
  showStaffOnLoad: true,
  pitchClasses: [midi % 12],
}));

// ── Niveau 2 : notes naturelles, clé de Fa — Ré2 à Do4 ──────────────────────
const BASS_NATURALS: [number, string][] = [
  [38, "Ré2"], [40, "Mi2"], [41, "Fa2"],
  [43, "Sol2"], [45, "La2"], [47, "Si2"],
  [48, "Do3"], [50, "Ré3"], [52, "Mi3"], [53, "Fa3"],
  [55, "Sol3"], [57, "La3"], [59, "Si3"], [60, "Do4"],
];

export const LEVEL2_POOL: Exercise[] = BASS_NATURALS.map(([midi, name]) => ({
  level: 2,
  keys: [midiToVexKey(midi)],
  clef: "bass",
  nameFr: name,
  showName: false,
  showStaffOnLoad: true,
  pitchClasses: [midi % 12],
}));

// ── Niveau 3 : triades de la gamme de Sol majeur (tous renversements) ─────────
// Gamme Sol maj : Sol(7), La(9), Si(11), Do(0), Ré(2), Mi(4), Fa#(6)
const G_MAJOR_TRIADS: [number, string][] = [
  [7,  "maj"],  // I   — Sol majeur
  [9,  "min"],  // II  — La mineur
  [11, "min"],  // III — Si mineur
  [0,  "maj"],  // IV  — Do majeur
  [2,  "maj"],  // V   — Ré majeur
  [4,  "min"],  // VI  — Mi mineur
  [6,  "dim"],  // VII — Fa# diminué
];

export const LEVEL3_POOL: Exercise[] = G_MAJOR_TRIADS.flatMap(([root, typeId]) =>
  [0, 1, 2].map((inv) => {
    const ex = buildExercise(root, typeId, inv);
    return {
      level: 3 as Level,
      keys: ex.keys,
      clef: "treble" as const,
      nameFr: ex.nameFr,
      showName: true,
      showStaffOnLoad: false,
      pitchClasses: ex.pitchClasses,
    };
  })
);

// ── Niveau 4 : accords de 7e de la gamme de Sol majeur ───────────────────────
const G_MAJOR_SEVENTHS: [number, string][] = [
  [7,  "maj7"],   // I   — Sol majeur 7
  [9,  "min7"],   // II  — La mineur 7
  [11, "min7"],   // III — Si mineur 7
  [0,  "maj7"],   // IV  — Do majeur 7
  [2,  "dom7"],   // V   — Ré dominant 7
  [4,  "min7"],   // VI  — Mi mineur 7
  [6,  "hdim7"],  // VII — Fa# demi-diminué
];

export const LEVEL4_POOL: Exercise[] = G_MAJOR_SEVENTHS.flatMap(([root, typeId]) =>
  [0, 1, 2, 3].map((inv) => {
    const ex = buildExercise(root, typeId, inv);
    return {
      level: 4 as Level,
      keys: ex.keys,
      clef: "treble" as const,
      nameFr: ex.nameFr,
      showName: true,
      showStaffOnLoad: false,
      pitchClasses: ex.pitchClasses,
    };
  })
);

const ALL_POOLS = [LEVEL1_POOL, LEVEL2_POOL, LEVEL3_POOL, LEVEL4_POOL];

export function buildPool(maxLevel: Level): Exercise[] {
  return ALL_POOLS.slice(0, maxLevel).flat();
}
