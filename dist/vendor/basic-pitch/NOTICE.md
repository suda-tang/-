# Practice pitch recognition

This directory contains Spotify Basic Pitch 1.0.1 (Copyright 2022 Spotify AB),
its published model, TensorFlow.js 3.21.0 and its WASM backend (Google LLC).
These components are Apache-2.0 licensed. See the LICENSE files and
worker.js.LEGAL.txt for upstream copyright and third-party notices.

Sources: https://github.com/spotify/basic-pitch-ts and https://github.com/tensorflow/tfjs

The authored adapter is scripts/pitch-worker-entry.js. It supplies the missing
float32 default in the tfjs 3.21 WASM Fill kernel and scopes inference tensors to
avoid retaining temporary tensors between windows. The trained model is not
modified. dist/pitch-stream.js implements window commitment, chord grouping,
confidence gating and a conservative short/weak octave-harmonic filter.

Rebuild only this vendor bundle (never the whole dist client):

    pnpm --dir .sites-runtime/pitch-build add --ignore-scripts @spotify/basic-pitch@1.0.1 @tensorflow/tfjs-backend-wasm@3.21.0 esbuild@0.25.12
    node scripts/vendor-practice-pitch.mjs

All runtime files are served from this origin. No CDN or remote inference is
used. Model activations are not calibrated probabilities; thresholds and
harmonic filters may reject quiet real notes, so recognition is not a teacher's
assessment. Audition actual recordings before changing thresholds.
