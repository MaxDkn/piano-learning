export type ChordType = {
  id: string;
  nameFr: string;
  intervals: number[]; // demi-tons depuis la fondamentale
};

export const CHORD_TYPES: ChordType[] = [
  { id: "maj",   nameFr: "majeur",          intervals: [0, 4, 7] },
  { id: "min",   nameFr: "mineur",          intervals: [0, 3, 7] },
  { id: "dim",   nameFr: "diminué",         intervals: [0, 3, 6] },
  { id: "aug",   nameFr: "augmenté",        intervals: [0, 4, 8] },
  { id: "dom7",  nameFr: "7ème",            intervals: [0, 4, 7, 10] },
  { id: "maj7",  nameFr: "majeur 7ème",     intervals: [0, 4, 7, 11] },
  { id: "min7",  nameFr: "mineur 7ème",     intervals: [0, 3, 7, 10] },
  { id: "dim7",  nameFr: "diminué 7ème",    intervals: [0, 3, 6, 9] },
  { id: "hdim7", nameFr: "demi-diminué",    intervals: [0, 3, 6, 10] },
];

// Noms français (avec bémols par convention classique)
export const ROOT_NAMES_FR = [
  "Do", "Do#", "Ré", "Mib", "Mi", "Fa", "Fa#", "Sol", "Lab", "La", "Sib", "Si",
];

export const INVERSION_NAMES_FR = [
  "",
  "1er renversement",
  "2e renversement",
  "3e renversement",
];

// Noms VexFlow pour chaque classe de hauteur
const PC_TO_VEX = ["c", "db", "d", "eb", "e", "f", "f#", "g", "ab", "a", "bb", "b"];

export function midiToVexKey(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${PC_TO_VEX[midi % 12]}/${octave}`;
}

export type Exercise = {
  keys: string[];          // VexFlow keys: ["c/4", "e/4", "g/4"]
  midiNotes: number[];
  pitchClasses: number[];  // classes de hauteur attendues
  root: number;
  typeId: string;
  inversion: number;
  nameFr: string;
};

export function buildExercise(root: number, typeId: string, inversion: number): Exercise {
  const chordType = CHORD_TYPES.find((t) => t.id === typeId)!;
  const rootMidi = 60 + root; // C4 = 60

  let notes = chordType.intervals.map((i) => rootMidi + i);

  // Applique le renversement : la note la plus basse monte d'une octave
  for (let i = 0; i < inversion; i++) {
    const minNote = Math.min(...notes);
    notes[notes.indexOf(minNote)] += 12;
  }
  notes.sort((a, b) => a - b);

  // Ramène dans la plage de la portée (max Si5 = MIDI 83)
  while (notes[notes.length - 1] > 83) notes = notes.map((n) => n - 12);
  while (notes[0] < 48) notes = notes.map((n) => n + 12); // min Do3

  const keys = notes.map(midiToVexKey);
  const pitchClasses = notes.map((n) => n % 12);
  const suffix = inversion > 0 ? ` — ${INVERSION_NAMES_FR[inversion]}` : "";

  return {
    keys,
    midiNotes: notes,
    pitchClasses,
    root,
    typeId,
    inversion,
    nameFr: `Accord de ${ROOT_NAMES_FR[root]} ${chordType.nameFr}${suffix}`,
  };
}

export type ChordMatch = {
  root: number;
  typeId: string;
  typeName: string;
  inversion: number;
  pitchClasses: number[];
  nameFr: string;
  score: number;
};
