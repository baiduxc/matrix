import { siteMeta } from "./config/site.js";
import { audioConfig } from "./config/audio.js";

// One lazily unlocked context serves the bell, keyboard tick and cover-entry laser.
export function createSoundEngine() {
	if (!siteMeta.soundEnabled) {
		let disposed = false;
		return {
			setVisible() {},
			async play() {},
			isDisposed: () => disposed,
			getDiagnostics: () => ({
				state: disposed ? "closed" : "disabled",
				sources: 0,
			}),
			dispose() {
				disposed = true;
			},
		};
	}
	const Context = window.AudioContext || window.webkitAudioContext;
	if (!Context) throw new Error("Web Audio is unavailable");
	const context = new Context({ latencyHint: "interactive" });
	let visible = !document.hidden,
		destroyed = false;
	const last = { click: -1, type: -1, beam: -1 };
	const sources = new Set();
	const click = context.createBuffer(
		1,
		Math.ceil(context.sampleRate * audioConfig.clickDuration),
		context.sampleRate,
	);
	const samples = click.getChannelData(0),
		fundamental = audioConfig.clickFrequency;
	for (let i = 0; i < samples.length; i++) {
		const t = i / context.sampleRate;
		const attack = Math.min(1, t / 0.001);
		const tail = Math.min(1, (audioConfig.clickDuration - t) / 0.012);
		samples[i] =
			attack *
			tail *
			(Math.sin(t * Math.PI * 2 * fundamental) * 0.68 * Math.exp(-t * 28) +
				Math.sin(t * Math.PI * 2 * fundamental * 2.01) *
					0.23 *
					Math.exp(-t * 43) +
				Math.sin(t * Math.PI * 2 * fundamental * 3.04) *
					0.09 *
					Math.exp(-t * 65));
	}
	const type = context.createBuffer(
		1,
		Math.ceil(context.sampleRate * audioConfig.typeDuration),
		context.sampleRate,
	);
	const taps = type.getChannelData(0);
	for (let i = 0; i < taps.length; i++) {
		const t = i / context.sampleRate;
		const envelope =
			Math.min(1, t / 0.0007) *
			Math.exp(-t * 180) *
			Math.min(1, (audioConfig.typeDuration - t) / 0.003);
		taps[i] =
			(envelope *
				(Math.sin(t * Math.PI * 2 * 1700) * 0.6 +
					(Math.random() * 2 - 1) * 0.4) *
				audioConfig.typeVolume) /
			audioConfig.clickVolume;
	}
	const beam = context.createBuffer(
		1,
		Math.ceil(context.sampleRate * audioConfig.beamDuration),
		context.sampleRate,
	);
	const ray = beam.getChannelData(0);
	let phase = 0;
	for (let i = 0; i < ray.length; i++) {
		const t = i / context.sampleRate,
			progress = t / audioConfig.beamDuration;
		const frequency = 650 + 3100 * Math.exp(-progress * 5);
		phase += (2 * Math.PI * frequency) / context.sampleRate;
		const envelope = Math.min(1, t / 0.006) * Math.pow(1 - progress, 2);
		ray[i] =
			(envelope *
				(Math.sin(phase) * 0.76 +
					Math.sin(phase * 2.03) * 0.16 +
					(Math.random() * 2 - 1) * 0.08) *
				audioConfig.beamVolume) /
			audioConfig.clickVolume;
	}
	const gain = context.createGain();
	gain.gain.value = audioConfig.clickVolume;
	gain.connect(context.destination);
	const stop = () => {
		for (const source of sources) {
			try {
				source.stop();
			} catch {}
			source.onended = null;
			source.disconnect();
		}
		sources.clear();
	};
	return {
		setVisible(value) {
			visible = value;
			if (!value) stop();
		},
		async play(kind) {
			if (!["click", "type", "beam"].includes(kind) || destroyed || !visible)
				return;
			try {
				if (context.state !== "running") await context.resume();
			} catch {
				return;
			}
			if (destroyed || !visible || context.state !== "running") return;
			if (context.currentTime - last[kind] < audioConfig[`${kind}Cooldown`])
				return;
			last[kind] = context.currentTime;
			const source = context.createBufferSource();
			source.buffer = { click, type, beam }[kind];
			source.connect(gain);
			sources.add(source);
			source.onended = () => {
				sources.delete(source);
				source.disconnect();
			};
			source.start();
		},
		isDisposed() {
			return destroyed || context.state === "closed";
		},
		getDiagnostics() {
			return { state: context.state, sources: sources.size };
		},
		dispose() {
			if (destroyed) return;
			destroyed = true;
			stop();
			gain.disconnect();
			void context.close();
		},
	};
}
