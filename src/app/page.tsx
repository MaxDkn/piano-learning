"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Staff from "@/components/Staff";
import { buildPool, type Exercise, type Level } from "@/lib/levels";
import { useChordDetection } from "@/components/hooks/useChordDetection";

const CALIBRATION_DURATION = 5000;
const CHORD_HOLD_MS = 600;  // ms à jouer juste pour valider un accord
const NOTE_HOLD_MS  = 300;  // ms pour une note simple

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomFrom<T>(pool: T[], exclude?: T): T {
  if (pool.length === 1) return pool[0];
  let item: T;
  do { item = pool[Math.floor(Math.random() * pool.length)]; }
  while (item === exclude);
  return item;
}

// Tolérance 80 % des notes du template présentes
function chordsMatch(detected: number[], expected: number[]): boolean {
  const detSet = new Set(detected);
  let common = 0;
  for (const pc of expected) if (detSet.has(pc)) common++;
  return common >= Math.ceil(expected.length * 0.8);
}

type NoteStatus = "waiting" | "correct" | "wrong";

// ── Composant ─────────────────────────────────────────────────────────────────

export default function Home() {
  const currentLevel: Level = 2; // niveau courant de l'utilisateur
  const pool = useMemo(() => buildPool(currentLevel), [currentLevel]);

  const [exercise, setExercise] = useState<Exercise>(() => randomFrom(pool));
  const [status, setStatus]     = useState<NoteStatus>("waiting");
  const [staffVisible, setStaffVisible] = useState(exercise.showStaffOnLoad);

  const { appState, chord, dominantPc, calibrationProgress, error, calibrate, stop } =
    useChordDetection();

  const correctSinceRef = useRef<number | null>(null);
  const holdMs = exercise.pitchClasses.length === 1 ? NOTE_HOLD_MS : CHORD_HOLD_MS;

  // ── Avancer à l'exercice suivant ────────────────────────────────────────────
  function nextExercise() {
    const next = randomFrom(pool, exercise);
    setExercise(next);
    setStatus("waiting");
    setStaffVisible(next.showStaffOnLoad);
    correctSinceRef.current = null;
  }

  // ── Détection ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (appState !== "listening" || status === "correct") return;

    const isSingleNote = exercise.pitchClasses.length === 1;
    const isMatch = isSingleNote
      ? dominantPc !== null && dominantPc === exercise.pitchClasses[0]
      : chord !== null && chordsMatch(chord.pitchClasses, exercise.pitchClasses);

    if (isMatch) {
      if (correctSinceRef.current === null) {
        correctSinceRef.current = Date.now();
      } else if (Date.now() - correctSinceRef.current >= holdMs) {
        setStatus("correct");
        correctSinceRef.current = null;
        setTimeout(nextExercise, 900);
      }
    } else {
      correctSinceRef.current = null;
      if (chord || dominantPc !== null) {
        setStatus("wrong");
        setTimeout(() => setStatus("waiting"), 350);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chord, dominantPc, exercise, appState, status]);

  const secondsLeft = Math.ceil((1 - calibrationProgress) * (CALIBRATION_DURATION / 1000));

  // ── Nom d'accord splitté pour l'affichage ───────────────────────────────────
  const [chordMain, chordSub] = exercise.nameFr.includes(" — ")
    ? exercise.nameFr.split(" — ")
    : [exercise.nameFr, null];

  return (
    <main className="min-h-screen bg-stone-50 flex flex-col items-center justify-center gap-8 p-6">

      {/* ── IDLE ── */}
      {appState === "idle" && (
        <div className="flex flex-col items-center gap-6 text-center">
          <div>
            <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">Piano</h1>
            <p className="text-sm text-stone-500 mt-1">Reconnaissance par microphone</p>
          </div>
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-2 max-w-xs">{error}</p>
          )}
          <button
            onClick={() => calibrate(CALIBRATION_DURATION)}
            className="flex items-center gap-2 bg-stone-800 text-white px-8 py-3 rounded-xl font-medium hover:bg-stone-700 active:bg-stone-900 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
            Commencer
          </button>
        </div>
      )}

      {/* ── CALIBRATION ── */}
      {appState === "calibrating" && (
        <div className="flex flex-col items-center gap-5 text-center max-w-xs">
          <div className="text-6xl font-bold text-stone-800 tabular-nums">{secondsLeft}</div>
          <div>
            <p className="text-base font-medium text-stone-700">Calibration en cours…</p>
            <p className="text-sm text-stone-500 mt-1">Ne jouez pas — on mesure le bruit ambiant</p>
          </div>
          <div className="w-full bg-stone-200 rounded-full h-1.5">
            <div
              className="bg-stone-800 h-1.5 rounded-full transition-all duration-100"
              style={{ width: `${calibrationProgress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── LISTENING ── */}
      {appState === "listening" && (
        <div
          className={`bg-white rounded-2xl shadow-sm border-2 transition-colors duration-200 w-full max-w-sm overflow-hidden cursor-pointer ${
            status === "correct" ? "border-green-400" :
            status === "wrong"   ? "border-red-400"   :
            "border-stone-200"
          }`}
          onClick={() => !staffVisible && setStaffVisible(true)}
        >
          {/* Nom de l'accord (niveaux 3+) */}
          {exercise.showName && (
            <div className="px-6 pt-6 pb-2 text-center">
              <p className="text-xl font-semibold text-stone-800 leading-tight">{chordMain}</p>
              {chordSub && (
                <p className="text-sm text-stone-500 mt-1">{chordSub}</p>
              )}
            </div>
          )}

          {/* Partition */}
          {staffVisible ? (
            <div className="px-4 py-4">
              <Staff
                chord={{ keys: exercise.keys }}
                status={status}
                clef={exercise.clef}
              />
            </div>
          ) : (
            <div className="h-20 flex items-center justify-center">
              <span className="text-xs text-stone-300">appuyer pour voir</span>
            </div>
          )}

          {/* Feedback inline */}
          {status === "correct" && (
            <div className="flex items-center justify-center gap-2 text-green-600 font-medium pb-4">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Correct !
            </div>
          )}
          {status === "wrong" && chord && (
            <div className="flex items-center justify-center gap-2 text-red-400 text-sm pb-4">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-stone-500 truncate">{chord.nameFr}</span>
            </div>
          )}
        </div>
      )}

    </main>
  );
}
