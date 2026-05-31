"use client";

import { useEffect, useRef } from "react";
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from "vexflow";

export type StaffChord = {
  keys: string[];  // VexFlow format: ["c/4", "eb/4", "g/4"]
};

type Props = {
  chord: StaffChord;
  status: "waiting" | "correct" | "wrong";
  clef?: "treble" | "bass";
};

function accidentalForKey(notePart: string): string | null {
  // "b" seul = note Si → pas d'altération
  if (notePart.length === 1) return null;
  if (notePart[1] === "b") return "b";  // "bb", "eb", "ab", etc.
  if (notePart.includes("#")) return "#";
  return null;
}

export default function Staff({ chord, status, clef = "treble" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // La clé de Fa a besoin de plus d'espace en bas pour les lignes supplémentaires (Ré2–Fa2)
  const height = clef === "bass" ? 200 : 150;
  const staveY  = clef === "bass" ? 55  : 25;

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);
    renderer.resize(320, height);
    const context = renderer.getContext();

    const stave = new Stave(10, staveY, 290);
    stave.addClef(clef);
    stave.setContext(context).draw();

    const staveNote = new StaveNote({
      keys: chord.keys,
      duration: "w",
    });

    chord.keys.forEach((key, i) => {
      const notePart = key.split("/")[0];
      const acc = accidentalForKey(notePart);
      if (acc) staveNote.addModifier(new Accidental(acc), i);
    });

    const color =
      status === "correct" ? "#16a34a" :
      status === "wrong"   ? "#dc2626" :
      "#1e293b";

    staveNote.setStyle({ fillStyle: color, strokeStyle: color });

    const voice = new Voice({ numBeats: 4, beatValue: 4 });
    voice.addTickables([staveNote]);
    new Formatter().joinVoices([voice]).format([voice], 220);
    voice.draw(context, stave);
  }, [chord, status, clef, height, staveY]);

  return <div ref={containerRef} className="flex items-center justify-center" style={{ minHeight: height }} />;
}
