"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { PitchDetector } from "pitchy";

export type DetectedNote = {
  frequency: number;
  note: string;
  midiNumber: number;
  clarity: number;
};

const MIN_CLARITY = 0.9;
const CALIBRATION_MARGIN = 2.5; // seuil = max_ambiant × 2.5

const NOTE_NAMES_FR = ["Do", "Do#", "Ré", "Ré#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];

function rms(buffer: Float32Array<ArrayBuffer>): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

function frequencyToNote(frequency: number): { note: string; midiNumber: number } {
  const midiNumber = Math.round(12 * Math.log2(frequency / 440) + 69);
  const octave = Math.floor(midiNumber / 12) - 1;
  return { note: `${NOTE_NAMES_FR[midiNumber % 12]}${octave}`, midiNumber };
}

type State = "idle" | "calibrating" | "listening";

export function usePitchDetection() {
  const [state, setState] = useState<State>("idle");
  const [detectedNote, setDetectedNote] = useState<DetectedNote | null>(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0); // 0-1
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const detectorRef = useRef<PitchDetector<Float32Array<ArrayBuffer>> | null>(null);
  const inputRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const noiseGateRef = useRef<number>(0.02);

  const stopLoops = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stopLoops();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    audioContextRef.current = null;
    streamRef.current = null;
    setState("idle");
  }, [stopLoops]);

  // Lance le micro + l'analyser, retourne l'audioContext prêt
  const initAudio = useCallback(async (): Promise<AudioContext> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    streamRef.current = stream;
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const bufferLength = analyser.fftSize;
    detectorRef.current = PitchDetector.forFloat32Array(bufferLength) as PitchDetector<Float32Array<ArrayBuffer>>;
    inputRef.current = new Float32Array(new ArrayBuffer(bufferLength * 4));
    return audioContext;
  }, []);

  // Calibration : écoute N ms, calcule le seuil sur le bruit ambiant
  const calibrate = useCallback(async (durationMs = 5000) => {
    setError(null);
    setState("calibrating");
    setCalibrationProgress(0);

    let audioContext: AudioContext;
    try {
      audioContext = await initAudio();
    } catch {
      setError("Impossible d'accéder au microphone. Vérifiez les permissions.");
      setState("idle");
      return;
    }

    const samples: number[] = [];
    const startTime = performance.now();

    await new Promise<void>((resolve) => {
      const collect = () => {
        if (!analyserRef.current || !inputRef.current) { resolve(); return; }
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        setCalibrationProgress(progress);
        analyserRef.current.getFloatTimeDomainData(inputRef.current);
        samples.push(rms(inputRef.current));
        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(collect);
        } else {
          resolve();
        }
      };
      animFrameRef.current = requestAnimationFrame(collect);
    });

    // 95e percentile × marge
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0.01;
    noiseGateRef.current = Math.max(p95 * CALIBRATION_MARGIN, 0.005);

    // Démarre la détection
    setState("listening");
    setCalibrationProgress(1);

    const detect = () => {
      if (!analyserRef.current || !detectorRef.current || !inputRef.current) return;
      analyserRef.current.getFloatTimeDomainData(inputRef.current);
      if (rms(inputRef.current) >= noiseGateRef.current) {
        const [frequency, clarity] = detectorRef.current.findPitch(inputRef.current, audioContext.sampleRate);
        if (clarity > MIN_CLARITY && frequency >= 27.5 && frequency <= 4186) {
          const { note, midiNumber } = frequencyToNote(frequency);
          setDetectedNote({ frequency, note, midiNumber, clarity });
        }
      }
      animFrameRef.current = requestAnimationFrame(detect);
    };
    detect();
  }, [initAudio]);

  useEffect(() => { return () => stop(); }, [stop]);

  return { state, detectedNote, calibrationProgress, error, calibrate, stop };
}
