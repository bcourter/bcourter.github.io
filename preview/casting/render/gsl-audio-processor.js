// GSL Audio Processor - Runs in AudioWorklet thread
// Generates stereo audio at 44.1kHz from compiled GSL code

// swapMaps moves all of source's own keys into target (replacing
// target's contents in place), and clears source. Used by the
// crossfade path so we can briefly substitute the snapshot for the
// live sliderValues object and then put it back — no allocations on
// the audio thread.
function swapMaps(target, source) {
    for (const k of Object.keys(target)) delete target[k];
    for (const k of Object.keys(source)) {
        target[k] = source[k];
        delete source[k];
    }
}

class GSLAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        this.currentSampleTime = 0;
        this.sampleRate = 44100; // Will be updated from main thread
        this.computeAudio = null; // JavaScript function generated from GSL
        this.enabled = true;
        this.isPlaying = false;
        // Live slider state. The compiled audio function closes over
        // `sliderValues` (passed as the `sliders` argument to the
        // factory) — it reads sliderValues[name] every sample.
        //
        // Naively snapping a parameter value clicks because the audio
        // signal jumps at the transition; smoothing the parameter
        // produces an audible glide on frequency-like values
        // (sin(2*pi*freq*t) is not phase-continuous when freq
        // changes). Instead we snap the value AND start a short
        // crossfade between the previous audio stream and the new
        // one — both stay phase-continuous individually, and the
        // crossfade masks the discontinuity. Cost is 2× computeAudio
        // calls per sample during the crossfade window (~5ms).
        this.sliderValues = {};
        this.shaderCode = null;
        // Pre-allocated scratch maps for crossfade — mutated in place
        // so we don't allocate on the audio thread (allocations on the
        // realtime thread cause GC pauses → glitches).
        this.crossfadeSnapshot = {};  // values JUST BEFORE the current crossfade started
        this.crossfadeScratch = {};   // temp restore-point while we swap in the snapshot
        this.crossfadeRemaining = 0;
        // 5ms crossfade. Long enough for the audio to settle, short
        // enough to be perceived as instant. Recomputed on setSampleRate.
        this.crossfadeSeconds = 0.005;
        this.crossfadeDuration = Math.max(1, Math.round(this.crossfadeSeconds * this.sampleRate));

        // Listen for messages from main thread
        this.port.onmessage = (event) => {
            const { type, data } = event.data;

            switch (type) {
                case 'updateShader':
                    this.shaderCode = data.code;
                    if (data.sliderValues) {
                        this.snapSliderMap(data.sliderValues);
                    }
                    if (data.startTime !== undefined) {
                        this.currentSampleTime = data.startTime;
                    }
                    this.compileShader();
                    break;

                case 'setSlider':
                    // Drag event: snap the value (so the new audio
                    // stream is phase-correct from now on) but begin
                    // a brief crossfade from the pre-change stream
                    // so the listener doesn't hear the step. If a
                    // crossfade is already in progress (continuous
                    // drag), keep the original snapshot — that way
                    // we always crossfade from the audio that was
                    // playing before the drag began, not from
                    // halfway-through values.
                    if (this.crossfadeRemaining === 0) {
                        this.snapshotInto(this.crossfadeSnapshot, this.sliderValues);
                    }
                    this.sliderValues[data.name] = data.value;
                    this.crossfadeRemaining = this.crossfadeDuration;
                    break;

                case 'setSliderMap':
                    this.snapSliderMap(data.values || {});
                    break;

                case 'seek':
                    this.currentSampleTime = data.time;
                    break;

                case 'setEnabled':
                    this.enabled = data.enabled;
                    break;

                case 'setSampleRate':
                    this.sampleRate = data.sampleRate;
                    this.crossfadeDuration = Math.max(1, Math.round(this.crossfadeSeconds * this.sampleRate));
                    break;

                case 'setPlaying':
                    this.isPlaying = data.playing;
                    break;
            }
        };
    }

    // snapSliderMap replaces the current values with the given map,
    // in place — the closed-over `sliders` reference in the compiled
    // function continues to see the same sliderValues object. Used at
    // recompile / setSliderMap boundaries, which are natural reset
    // points (a fresh program has no "previous audio" to crossfade
    // from), so we also cancel any in-progress crossfade.
    snapSliderMap(values) {
        for (const k of Object.keys(this.sliderValues)) delete this.sliderValues[k];
        for (const k of Object.keys(values)) this.sliderValues[k] = values[k];
        this.crossfadeRemaining = 0;
    }

    // snapshotInto copies source's own keys into target, replacing
    // anything that was there. Used to seed the crossfade snapshot
    // without allocating on the audio thread.
    snapshotInto(target, source) {
        for (const k of Object.keys(target)) delete target[k];
        for (const k of Object.keys(source)) target[k] = source[k];
    }

    // patchShaderForSliders rewrites every `const NAME = RHS;` in the
    // generated JS to read live from the closed-over `sliders` object,
    // falling back to the original RHS when the host hasn't pushed a
    // value for that name. Patching every const (not just known slider
    // names) means the worklet doesn't need to know the slider list at
    // compile time — sliders[name] simply stays undefined for non-
    // sliders and the fallback fires every sample. The conditional
    // lookup is a single property access per const; even on shaders
    // with hundreds of const lines the overhead is in the noise
    // compared to the floating-point math that follows.
    patchShaderForSliders(code) {
        return code.replace(
            /(const\s+([A-Za-z_$][\w$]*)\s*=\s*)([^;]+)(;)/g,
            (_, head, name, rhs, tail) =>
                `${head}(sliders[${JSON.stringify(name)}] !== undefined ? sliders[${JSON.stringify(name)}] : ${rhs})${tail}`
        );
    }

    compileShader() {
        if (!this.shaderCode) {
            this.computeAudio = null;
            return;
        }
        try {
            const patched = this.patchShaderForSliders(this.shaderCode);
            // The factory takes one argument (the sliders object) so
            // the compiled `computeAudio` closes over our mutable map.
            const wrapped = `const sliders = arguments[0];\n${patched}\nreturn computeAudio;`;
            this.computeAudio = (new Function(wrapped))(this.sliderValues);

            this.port.postMessage({
                type: 'shaderLoaded',
                success: true
            });
        } catch (error) {
            this.port.postMessage({
                type: 'error',
                message: 'Failed to load audio shader: ' + error.message,
                stack: error.stack
            });
            this.computeAudio = null;
        }
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];

        // Check if we have valid output
        if (!output || output.length < 2) {
            return true;
        }

        const leftChannel = output[0];
        const rightChannel = output[1];

        // If no shader loaded, disabled, or paused, output silence
        if (!this.computeAudio || !this.enabled || !this.isPlaying) {
            leftChannel.fill(0);
            rightChannel.fill(0);
            return true;
        }

        // Generate audio samples
        const bufferSize = leftChannel.length;

        // Cache locals for the inner loop — every property access on
        // `this` inside a tight per-sample loop adds up. The compiled
        // audio function reads from sliderValues directly via its
        // closure, so swapping its contents between snapshot and
        // current is what lets one compiled function play two
        // parameter sets per sample during a crossfade.
        const sliderValues = this.sliderValues;
        const crossfadeSnapshot = this.crossfadeSnapshot;
        const crossfadeScratch = this.crossfadeScratch;
        const crossfadeDuration = this.crossfadeDuration;

        for (let i = 0; i < bufferSize; i++) {
            const gsl_time = this.currentSampleTime;

            try {
                let leftSample, rightSample;

                if (this.crossfadeRemaining > 0) {
                    // Crossfade between two computeAudio calls — one
                    // with the pre-change parameters and one with the
                    // current values. Each call sees a consistent
                    // parameter snapshot, so within itself it stays
                    // phase-continuous; the linear blend masks the
                    // discontinuity between the two streams.
                    //
                    // We swap sliderValues' contents in place rather
                    // than allocating, so the closed-over reference
                    // in computeAudio stays valid throughout. Keys
                    // are restored at end of sample.
                    swapMaps(crossfadeScratch, sliderValues);
                    swapMaps(sliderValues, crossfadeSnapshot);
                    const oldResult = this.computeAudio(gsl_time);
                    const oldL = oldResult[0], oldR = oldResult[1];

                    swapMaps(crossfadeSnapshot, sliderValues);
                    swapMaps(sliderValues, crossfadeScratch);
                    const newResult = this.computeAudio(gsl_time);
                    const newL = newResult[0], newR = newResult[1];

                    // t goes 0 → 1 across the crossfade window.
                    const t = 1 - this.crossfadeRemaining / crossfadeDuration;
                    leftSample  = oldL * (1 - t) + newL * t;
                    rightSample = oldR * (1 - t) + newR * t;
                    this.crossfadeRemaining -= 1;
                } else {
                    const result = this.computeAudio(gsl_time);
                    leftSample  = result[0];
                    rightSample = result[1];
                }

                // Clamp to [-1, 1] to prevent distortion
                leftChannel[i]  = Math.max(-1, Math.min(1, leftSample));
                rightChannel[i] = Math.max(-1, Math.min(1, rightSample));

            } catch (error) {
                // On error, output silence for this sample
                leftChannel[i] = 0;
                rightChannel[i] = 0;

                // Report error once (not for every sample to avoid spam)
                if (i === 0) {
                    this.port.postMessage({
                        type: 'error',
                        message: 'Audio generation error: ' + error.message
                    });
                }
            }

            // Increment time (sample-accurate) - only when playing
            this.currentSampleTime += 1.0 / this.sampleRate;
        }

        // Keep processor alive
        return true;
    }
}

// Register the processor
registerProcessor('gsl-audio-processor', GSLAudioProcessor);
