"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  CHORD_TYPES,
  ROOT_NAMES_FR,
  INVERSION_NAMES_FR,
  type ChordMatch,
} from "@/lib/chords";

// FFT grand pour une bonne résolution en fréquence (~5 Hz/bin à 44100 Hz)
const FFT_SIZE = 8192;
const NOISE_FLOOR_DB = -55;   // bins en dessous ignorés
const CHROMA_THRESHOLD = 0.3;  // seuil de présence d'une classe de hauteur
const MATCH_MIN_RATIO = 0.7;   // % minimum de notes du template à détecter
const CALIBRATION_MARGIN = 2.5;

type State = "idle" | "calibrating" | "listening";

// ─── Chroma ───────────────────────────────────────────────────────────────────
// Répartit l'énergie spectrale sur 12 classes de hauteur (octaves fusionnées)
function computeChroma(freqData: Float32Array, sampleRate: number): number[] {
  const chroma = new Array(12).fill(0);
  const binFreq = sampleRate / FFT_SIZE;

  for (let i = 2; i < freqData.length; i++) {
    const freq = i * binFreq;
    if (freq < 40 || freq > 5000) continue;
    if (freqData[i] < NOISE_FLOOR_DB) continue;

    // dB → magnitude linéaire
    const mag = Math.pow(10, freqData[i] / 20);
    const midiFloat = 12 * Math.log2(freq / 440) + 69;
    const pc = ((Math.round(midiFloat) % 12) + 12) % 12;
    chroma[pc] += mag;
  }

  const max = Math.max(...chroma);
  return max > 0 ? chroma.map((v) => v / max) : chroma;
}

// ─── Basse ────────────────────────────────────────────────────────────────────
// Cherche la note la plus grave avec de l'énergie significative
function detectBassNote(freqData: Float32Array, sampleRate: number): number {
  const binFreq = sampleRate / FFT_SIZE;
  for (let i = 2; i < freqData.length; i++) {
    const freq = i * binFreq;
    if (freq < 40) continue;
    if (freq > 1200) break;
    if (freqData[i] > NOISE_FLOOR_DB) {
      const midiFloat = 12 * Math.log2(freq / 440) + 69;
      return ((Math.round(midiFloat) % 12) + 12) % 12;
    }
  }
  return -1;
}

// ─── Matching ─────────────────────────────────────────────────────────────────
function matchChord(chroma: number[], bassNote: number): ChordMatch | null {
  const active = chroma.map((v) => v >= CHROMA_THRESHOLD);
  const activeCount = active.filter(Boolean).length;
  if (activeCount < 2) return null;

  let best: ChordMatch | null = null;
  let bestScore = -Infinity;

  for (const chordType of CHORD_TYPES) {
    for (let root = 0; root < 12; root++) {
      const template = chordType.intervals.map((i) => (root + i) % 12);
      const n = template.length;

      let matches = 0;
      let extra = 0;
      for (let pc = 0; pc < 12; pc++) {
        if (active[pc]) template.includes(pc) ? matches++ : extra++;
      }

      if (matches < Math.ceil(n * MATCH_MIN_RATIO)) continue;

      const score = matches / n - 0.4 * (extra / Math.max(activeCount, 1));
      if (score <= bestScore) continue;
      bestScore = score;

      // Renversement d'après la basse
      const bassInTemplate = bassNote >= 0 ? template.indexOf(bassNote) : 0;
      const inversion = bassInTemplate > 0 ? bassInTemplate : 0;
      const suffix = inversion > 0 ? ` — ${INVERSION_NAMES_FR[inversion]}` : "";

      best = {
        root,
        typeId: chordType.id,
        typeName: chordType.nameFr,
        inversion,
        pitchClasses: template,
        nameFr: `Accord de ${ROOT_NAMES_FR[root]} ${chordType.nameFr}${suffix}`,
        score,
      };
    }
  }

  return best;
}

// ─── RMS pour la gate ─────────────────────────────────────────────────────────
function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useChordDetection() {
  const [appState, setAppState] = useState<State>("idle");
  const [chord, setChord] = useState<ChordMatch | null>(null);
  const [dominantPc, setDominantPc] = useState<number | null>(null); // pour niveaux 1/2
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeDomainBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const freqBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const noiseGateRef = useRef<number>(0.01);

  const stopLoops = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stopLoops();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    streamRef.current = null;
    setAppState("idle");
    setChord(null);
  }, [stopLoops]);

  const initAudio = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    streamRef.current = stream;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyserRef.current = analyser;
    ctx.createMediaStreamSource(stream).connect(analyser);

    timeDomainBufRef.current = new Float32Array(new ArrayBuffer(FFT_SIZE * 4));
    freqBufRef.current = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
    return ctx;
  }, []);

  const calibrate = useCallback(async (durationMs = 5000) => {
    setError(null);
    setAppState("calibrating");
    setCalibrationProgress(0);

    let ctx: AudioContext;
    try {
      ctx = await initAudio();
    } catch {
      setError("Impossible d'accéder au microphone.");
      setAppState("idle");
      return;
    }

    const samples: number[] = [];
    const start = performance.now();

    await new Promise<void>((resolve) => {
      const collect = () => {
        if (!analyserRef.current || !timeDomainBufRef.current) { resolve(); return; }
        const elapsed = performance.now() - start;
        const progress = Math.min(elapsed / durationMs, 1);
        setCalibrationProgress(progress);
        analyserRef.current.getFloatTimeDomainData(timeDomainBufRef.current);
        samples.push(rms(timeDomainBufRef.current));
        if (progress < 1) rafRef.current = requestAnimationFrame(collect);
        else resolve();
      };
      rafRef.current = requestAnimationFrame(collect);
    });

    // 95e percentile × marge
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0.01;
    noiseGateRef.current = Math.max(p95 * CALIBRATION_MARGIN, 0.005);

    // Démarre la détection d'accords
    setAppState("listening");

    const detect = () => {
      if (!analyserRef.current || !timeDomainBufRef.current || !freqBufRef.current) return;

      analyserRef.current.getFloatTimeDomainData(timeDomainBufRef.current);
      if (rms(timeDomainBufRef.current) < noiseGateRef.current) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      analyserRef.current.getFloatFrequencyData(freqBufRef.current);
      const chromaVec = computeChroma(freqBufRef.current, ctx.sampleRate);

      // Note dominante : classe de hauteur avec le plus d'énergie
      const maxChroma = Math.max(...chromaVec);
      setDominantPc(maxChroma > 0.4 ? chromaVec.indexOf(maxChroma) : null);

      const bassNote = detectBassNote(freqBufRef.current, ctx.sampleRate);
      const match = matchChord(chromaVec, bassNote);
      if (match) setChord(match);

      rafRef.current = requestAnimationFrame(detect);
    };
    detect();
  }, [initAudio]);

  useEffect(() => () => stop(), [stop]);

  return { appState, chord, dominantPc, calibrationProgress, error, calibrate, stop };
}
