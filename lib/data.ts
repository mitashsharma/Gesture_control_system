import type { ModelMode } from './store';

export const PROJECT = {
  title: 'Gesture Controlled System',
  subtitle:
    'Next-Gen OS & I/O Control via Real-Time Computer Vision and Voice Assistant Integration',
  version: 'v2.4.0-stable',
  reviewId: 'CSE-CV-2026/0417',
  status: 'Approved with Modifications',
};

export const META_CHIPS = [
  'AI / Machine Learning (Computer Vision)',
  'Application Development',
  'Windows OS',
] as const;

/* --------------------------- engines --------------------------- */

export interface EngineSpec {
  mode: ModelMode;
  name: string;
  label: string;
  framework: string;
  device: string;
  params: string;
  input: string;
  accuracy: number;
  latency: [number, number];
  /** Warm-up time when the engine is hot-swapped in (ms). */
  coldStart: number;
  blurb: string;
}

export const ENGINES: Record<ModelMode, EngineSpec> = {
  cnn: {
    mode: 'cnn',
    name: 'Custom_Gesture_CNN_v2',
    label: 'Custom CNN Model (PyBind11)',
    framework: 'PyTorch 2.1 → TorchScript · pybind11 C++ binding',
    device: 'CUDA 12.2 · CPU (AVX2) fallback',
    params: '1.42 M trainable',
    input: '128 × 128 × 3 normalised hand ROI',
    accuracy: 98.4,
    latency: [108, 246],
    coldStart: 1400,
    blurb:
      'Five-class residual CNN compiled to TorchScript and exposed to the Python runtime through a pybind11 module. Highest accuracy, but frame cost spikes under GPU contention.',
  },
  prebuilt: {
    mode: 'prebuilt',
    name: 'MediaPipe_Prebuilt_Fallback',
    label: 'Prebuilt Lightweight Fallback Model',
    framework: 'MediaPipe Hands (BlazePalm + Hand Landmark)',
    device: 'CPU · XNNPACK delegate',
    params: '4.87 M graph ops',
    input: '224 × 224 × 3 RGB · zero-copy buffer',
    accuracy: 96.1,
    latency: [6, 19],
    coldStart: 420,
    blurb:
      'Prebuilt geometric classifier over the 21-point landmark graph. Deterministic sub-20 ms inference — used as the always-available safety engine.',
  },
};

/* ---------------------- confusion matrices ---------------------- */

export const GESTURE_CLASSES = [
  'Swipe Left',
  'Pinch Click',
  'Scroll Up',
  'Palm Stop',
  'Fist Drag',
] as const;

export type GestureClass = (typeof GESTURE_CLASSES)[number];

/** rows = target (actual), cols = predicted. 400 validation samples per class. */
export const CONFUSION: Record<ModelMode, number[][]> = {
  cnn: [
    [396, 2, 1, 0, 1],
    [1, 392, 3, 2, 2],
    [1, 1, 398, 0, 0],
    [0, 3, 0, 390, 7],
    [2, 1, 0, 5, 392],
  ],
  prebuilt: [
    [390, 5, 3, 1, 1],
    [4, 384, 6, 3, 3],
    [3, 4, 386, 4, 3],
    [2, 6, 2, 383, 7],
    [6, 5, 3, 7, 379],
  ],
};

export const EVAL_SPLIT = {
  train: 14400,
  val: 2000,
  test: 3600,
  folds: 5,
  augmented: true,
};

/* --------------------------- pipeline --------------------------- */

export interface PipelineStep {
  index: number;
  title: string;
  tech: string;
  detail: string;
  throughput: string;
}

export const PIPELINE: PipelineStep[] = [
  {
    index: 1,
    title: 'Video Feed Capture',
    tech: 'OpenCV',
    detail: 'DirectShow grab → 1280×720@60 → ROI crop + CLAHE normalisation.',
    throughput: '60 fps source',
  },
  {
    index: 2,
    title: 'Hand Landmark Extraction',
    tech: 'MediaPipe / pybind11',
    detail: 'BlazePalm detection then 21-point 3D landmark regression, zero-copy NumPy view.',
    throughput: '21 pts / frame',
  },
  {
    index: 3,
    title: 'Gesture Recognition / Fallback Engine',
    tech: 'CNN v2 ⇄ Prebuilt',
    detail: 'Latency watchdog arbitrates: TorchScript CNN while inside budget, geometric fallback beyond 150 ms.',
    throughput: 'watchdog @ 150 ms',
  },
  {
    index: 4,
    title: 'OS Action Execution',
    tech: 'win32api / PyAutoGUI',
    detail: 'Debounced intent queue → SendInput injection for cursor, click, drag, scroll and window events.',
    throughput: '< 4 ms inject',
  },
  {
    index: 5,
    title: 'Voice Assistant Channel',
    tech: 'SpeechRecognition',
    detail: 'Parallel Google STT intent stream, fused with gesture intents by a priority resolver.',
    throughput: 'streaming STT',
  },
];

export const TECH_STACK = [
  'Python 3.8.5',
  'OpenCV',
  'MediaPipe',
  'pybind11',
  'PyAutoGUI',
  'Win32API',
  'SpeechRecognition',
  'TorchScript',
  'NumPy',
  'Threading',
] as const;

/* ----------------------------- team ----------------------------- */

export interface Member {
  name: string;
  role: string;
  focus: string;
  initials: string;
  hue: string;
}

export const TEAM: Member[] = [
  {
    name: 'Aarav Sharma',
    role: 'Team Lead · Model Architecture',
    focus: 'CNN v2 design, TorchScript export, pybind11 bridge',
    initials: 'AS',
    hue: 'from-cyan-400 to-indigo-500',
  },
  {
    name: 'Ishita Verma',
    role: 'Computer Vision Engineer',
    focus: 'OpenCV capture pipeline, ROI normalisation, landmark maths',
    initials: 'IV',
    hue: 'from-violet-400 to-fuchsia-500',
  },
  {
    name: 'Rohan Mehta',
    role: 'OS Integration Engineer',
    focus: 'win32api / PyAutoGUI action layer, input-event injection',
    initials: 'RM',
    hue: 'from-sky-400 to-cyan-500',
  },
  {
    name: 'Nikhil Rao',
    role: 'Voice & Fusion Engineer',
    focus: 'SpeechRecognition intents, gesture/voice priority resolver',
    initials: 'NR',
    hue: 'from-amber-400 to-orange-500',
  },
  {
    name: 'Sneha Kulkarni',
    role: 'QA · Benchmarking',
    focus: 'Latency harness, confusion-matrix evaluation, documentation',
    initials: 'SK',
    hue: 'from-emerald-400 to-teal-500',
  },
];

export const MENTORS = [
  { name: 'Dr. Anjali Bhatnagar', role: 'Internal Project Guide' },
  { name: 'Prof. R. K. Tripathi', role: 'External Evaluator' },
] as const;

/* ---------------------------- status ---------------------------- */

export interface Modification {
  id: string;
  title: string;
  note: string;
  severity: 'critical' | 'major' | 'minor';
  status: 'closed' | 'open';
}

export const MODIFICATIONS: Modification[] = [
  {
    id: 'M-01',
    title: 'Add inference latency watchdog with automatic engine fallback',
    note: 'Evaluator observed 240 ms stalls under GPU contention. Resolved by the hot-swap layer now shipped in this build.',
    severity: 'critical',
    status: 'closed',
  },
  {
    id: 'M-02',
    title: 'Report per-class precision and recall alongside overall accuracy',
    note: 'Added the interactive confusion-matrix visualiser with hover metrics.',
    severity: 'major',
    status: 'closed',
  },
  {
    id: 'M-03',
    title: 'Debounce gesture intents before OS injection',
    note: 'A 180 ms cooldown now prevents duplicate SendInput bursts on pinch hold.',
    severity: 'major',
    status: 'closed',
  },
  {
    id: 'M-04',
    title: 'Document failure modes of the prebuilt fallback engine',
    note: 'Fine-motor gestures (Fist Drag) degrade ~1.9% — to be quantified in the final report chapter.',
    severity: 'minor',
    status: 'open',
  },
];

export const TIMELINE = [
  { label: 'Proposal submitted', date: '12 Jan 2026', state: 'done' },
  { label: 'Prototype review (I)', date: '09 Mar 2026', state: 'done' },
  { label: 'Final evaluation', date: '28 Apr 2026', state: 'done' },
  { label: 'Modifications closed', date: '22 May 2026', state: 'done' },
  { label: 'Report + source handover', date: '06 Jun 2026', state: 'active' },
] as const;
