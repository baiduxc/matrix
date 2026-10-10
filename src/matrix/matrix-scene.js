import { createFrameLoop } from "./lib/frame-loop.js";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

// Homepage atmosphere remains procedural; character and destination art use generated layers.
export function createMatrixScene(canvas, onReady, onFailure) {
	let renderer;
	try {
		renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: false,
			alpha: false,
			powerPreference: "high-performance",
		});
	} catch (error) {
		onFailure(error);
		return { dispose() {}, setState() {} };
	}
	const scene = new THREE.Scene();
	scene.background = new THREE.Color("#000704");
	scene.fog = new THREE.FogExp2("#000704", 0.028);
	const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 110);
	camera.position.set(0, 0.5, 17);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.1;
	const composer = new EffectComposer(renderer);
	composer.addPass(new RenderPass(scene, camera));
	const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.48, 0.4, 0.4);
	composer.addPass(bloom);
	// Screen-space atmospheric falloff keeps live geometry behind copy quiet.
	const focusPass = new ShaderPass({
		uniforms: {
			tDiffuse: { value: null },
			uFocus: { value: new THREE.Vector2(0.5, 0.26) },
			uWarp: { value: 0 },
		},
		vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
		fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 uFocus; uniform float uWarp; varying vec2 vUv;
      void main(){
        vec2 radial=vUv-.5; vec2 uv=.5+radial*(1.0-uWarp*.12); vec2 shift=radial*uWarp*.012;
        vec3 color=vec3(texture2D(tDiffuse,uv+shift).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-shift).b);
        vec2 d=(vUv-uFocus)*vec2(3.5,9.0);
        float caption=exp(-dot(d,d));
        float header=smoothstep(.85,.99,vUv.y)*.55;
        vec2 intro=(vUv-vec2(.15,.82))*vec2(4.0,13.0);
        float text=exp(-dot(intro,intro))*.6;
        color*=1.0-max(caption*.87,max(header,text));
        gl_FragColor=vec4(color,1.0);
      }
    `,
	});
	composer.addPass(focusPass);
	composer.addPass(new OutputPass());

	// Procedural glyph atlas, never a downloaded background/texture.
	const atlasCanvas = document.createElement("canvas");
	atlasCanvas.width = 512;
	atlasCanvas.height = 256;
	const ctx = atlasCanvas.getContext("2d");
	ctx.clearRect(0, 0, 512, 256);
	ctx.fillStyle = "#ffffff";
	ctx.font = "23px monospace";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	const glyphs =
		"アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン012345789ZXY<>:=+{}";
	for (let i = 0; i < 128; i++)
		ctx.fillText(
			glyphs[i % glyphs.length],
			(i % 16) * 32 + 16,
			Math.floor(i / 16) * 32 + 16,
		);
	const atlas = new THREE.CanvasTexture(atlasCanvas);
	atlas.minFilter = THREE.LinearFilter;
	atlas.magFilter = THREE.LinearFilter;
	const uniforms = {
		uTime: { value: 0 },
		uAtlas: { value: atlas },
		uWarp: { value: 0 },
	};
	const rainVertex = `
    varying vec2 vUv;
    varying float vDepth;
    uniform float uWarp;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
	const rainFragment = `
    uniform sampler2D uAtlas;
    uniform float uTime;
    uniform float uSeed;
    uniform float uOpacity;
    uniform float uWarp;
    varying vec2 vUv;
    varying float vDepth;
    float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
    void main() {
      float col = floor(vUv.x * 3.0);
      float speed = 0.08 + hash(col + uSeed) * 0.11;
      float y = vUv.y * 58.0 + uTime * (2.5 + hash(uSeed) * 3.0) * (1.0 + uWarp * 4.0);
      float row = floor(y);
      vec2 cell = vec2(fract(vUv.x * 3.0), fract(y));
      float glyph = floor(hash(row * 0.73 + col * 31.0 + uSeed + floor(uTime * 1.4)) * 128.0);
      vec2 tile = vec2(mod(glyph, 16.0), 7.0 - floor(glyph / 16.0));
      float ink = texture2D(uAtlas, (tile + cell) / vec2(16.0, 8.0)).a;
      float trail = fract(vUv.y * 1.8 + uTime * speed + hash(col * 13.0 + uSeed));
      float alpha = pow(1.0 - trail, 3.0) * 0.85 + 0.035;
      float head = smoothstep(0.91, 1.0, 1.0 - trail);
      vec3 color = mix(vec3(0.0, 0.72, 0.36), vec3(0.55, 1.0, 0.82), head);
      float depth = exp(-vDepth * 0.028);
      gl_FragColor = vec4(color * (1.0 + head), ink * alpha * uOpacity * depth);
    }
  `;
	const rainGroup = new THREE.Group();
	scene.add(rainGroup);
	const random = (a, b) => a + Math.random() * (b - a);
	const rainGeometry = new THREE.PlaneGeometry(0.9, 24);
	for (let i = 0; i < 175; i++) {
		const material = new THREE.ShaderMaterial({
			uniforms: {
				...uniforms,
				uSeed: { value: i * 3.17 },
				uOpacity: { value: random(0.28, 0.85) },
			},
			vertexShader: rainVertex,
			fragmentShader: rainFragment,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			blending: THREE.AdditiveBlending,
		});
		const plane = new THREE.Mesh(rainGeometry, material);
		let x = random(-30, 30);
		const z = random(-38, 7);
		if (Math.abs(x) < 6 && z > -8) x += x > 0 ? 9 : -9;
		plane.position.set(x, random(-3, 5), z);
		plane.rotation.y = random(-0.35, 0.35);
		rainGroup.add(plane);
	}

	// Glyphs circulate along a stationary torus. Only the pointer's nearby arc deforms.
	const torusCount = 10800;
	const torusGeo = new THREE.BufferGeometry();
	const torusPositions = new Float32Array(torusCount * 3);
	const phases = new Float32Array(torusCount);
	const coordinates = new Float32Array(torusCount * 2);
	for (let i = 0; i < torusCount; i++) {
		const theta = ((i % 300) / 300) * Math.PI * 2;
		const phi = (Math.floor(i / 300) / 36) * Math.PI * 2;
		const r = 6.1 + 0.8 * Math.cos(phi);
		torusPositions[i * 3] = r * Math.cos(theta);
		torusPositions[i * 3 + 1] = r * Math.sin(theta);
		torusPositions[i * 3 + 2] = 0.8 * Math.sin(phi);
		phases[i] = Math.random();
		coordinates[i * 2] = theta;
		coordinates[i * 2 + 1] = phi;
	}
	torusGeo.setAttribute(
		"position",
		new THREE.BufferAttribute(torusPositions, 3),
	);
	torusGeo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
	torusGeo.setAttribute(
		"aTorusCoord",
		new THREE.BufferAttribute(coordinates, 2),
	);
	torusGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 9);
	const torusMat = new THREE.ShaderMaterial({
		uniforms: {
			...uniforms,
			uOpacity: { value: 0.36 },
			uHover: { value: 0 },
			uHoverPoint: { value: new THREE.Vector2(0, 6.1) },
		},
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		vertexShader: `
      attribute float aPhase;
      attribute vec2 aTorusCoord;
      varying float vPhase;
      varying float vInteraction;
      uniform float uTime;
      uniform float uWarp;
      uniform float uHover;
      uniform vec2 uHoverPoint;
      void main() {
        vPhase = aPhase;
        float theta = aTorusCoord.x + uTime * 0.075;
        float phi = aTorusCoord.y + uTime * 0.8;
        vec2 radial = vec2(cos(theta), sin(theta));
        vec2 separation = radial * 6.1 - uHoverPoint;
        float distanceSquared = dot(separation, separation);
        float nearPointer = exp(-distanceSquared / 1.75);
        float shoulder = max(0.0, exp(-distanceSquared / 4.5) - nearPointer);
        // A local elastic bulge, with a shallow compressed shoulder. The rest
        // of the circumference keeps its original 0.8 tube radius.
        float tube = 0.8 + uHover * (nearPointer * 1.4 - shoulder * 0.22);
        vInteraction = nearPointer * uHover;
        float radius = 6.1 + tube * cos(phi);
        vec3 p = vec3(radius * cos(theta), radius * sin(theta), tube * sin(phi));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp((180.0 + aPhase * 50.0) * (1.0 + vInteraction * 0.18) / -mv.z, 1.0, 14.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
		fragmentShader: `
      uniform sampler2D uAtlas;
      uniform float uTime;
      uniform float uOpacity;
      varying float vPhase;
      varying float vInteraction;
      void main() {
        float glyph = floor(fract(vPhase + floor(uTime * 1.2) * 0.014) * 128.0);
        vec2 tile = vec2(mod(glyph, 16.0), 7.0 - floor(glyph / 16.0));
        float a = texture2D(uAtlas, (tile + vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)) / vec2(16.0, 8.0)).a;
        float pulse = 0.4 + 0.6 * pow(sin(vPhase * 60.0 + uTime * 0.6) * 0.5 + 0.5, 2.0);
        vec3 color = mix(vec3(0.02, 0.52, 0.3), vec3(0.22, 0.9, 0.58), vPhase);
        gl_FragColor = vec4(color * (1.0 + vInteraction * 0.55), a * uOpacity * pulse * (1.0 + vInteraction * 0.45));
      }
    `,
	});
	const torus = new THREE.Points(torusGeo, torusMat);
	torus.position.set(0, 2.0, -4);
	torus.rotation.set(0.12, -0.12, 0);
	scene.add(torus);
	const dustCount = 1600;
	const dustGeo = new THREE.BufferGeometry();
	const dustPositions = new Float32Array(dustCount * 3);
	for (let i = 0; i < dustCount; i++) {
		dustPositions[i * 3] = random(-26, 26);
		dustPositions[i * 3 + 1] = random(-7, 15);
		dustPositions[i * 3 + 2] = random(-40, 12);
	}
	dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
	const dust = new THREE.Points(
		dustGeo,
		new THREE.PointsMaterial({
			color: "#43ffb5",
			size: 0.028,
			transparent: true,
			opacity: 0.65,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		}),
	);
	scene.add(dust);

	// No static wire torus, floor grid, or wireframe pillars behind the portal.
	// Its only environment layers are live rain and sparse particles.

	let loop = null,
		disposed = false;
	let state = {
		paused: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		reading: false,
		warp: 0,
		active: 0,
		mode: "matrix",
	};
	const pointer = { x: 0, y: 0, inside: false };
	const raycaster = new THREE.Raycaster(),
		pointerNdc = new THREE.Vector2();
	const ringPlane = new THREE.Plane(),
		planeNormal = new THREE.Vector3(),
		hit = new THREE.Vector3();
	const inverseRotation = new THREE.Quaternion();
	let ringBaseScale = 0.82,
		smoothHover = 0,
		hoverVelocity = 0,
		ringHovered = false;
	let hoverAngle = Math.PI / 2,
		targetHoverAngle = Math.PI / 2;
	let sceneTime = 0,
		last = performance.now(),
		smoothWarp = 0,
		smoothReading = 0,
		shock = 0;
	const move = (event) => {
		if (event.pointerType === "touch") return;
		const rect = canvas.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = (-(event.clientY - rect.top) / rect.height) * 2 + 1;
		pointer.inside =
			Math.abs(pointer.x) <= 1 &&
			Math.abs(pointer.y) <= 1 &&
			!event.target.closest?.('button,a,input,textarea,[role="dialog"]');
	};
	const leave = (event) => {
		if (!event.relatedTarget) pointer.inside = false;
	};
	const blur = () => {
		pointer.inside = false;
	};
	const resize = () => {
		const width = canvas.clientWidth,
			height = canvas.clientHeight;
		if (!width || !height) return;
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize(width, height, false);
		composer.setSize(width, height);
		const portrait = width < 700;
		ringBaseScale = portrait ? 0.52 : 0.82;
		torus.scale.setScalar(ringBaseScale);
		torus.position.y = portrait ? 2.6 : 2.1;
		focusPass.uniforms.uFocus.value.set(0.16, 0.78);
		loop?.invalidate();
	};
	const observer = new ResizeObserver(resize);
	observer.observe(canvas);
	window.addEventListener("pointermove", move, { passive: true });
	window.addEventListener("pointerout", leave, { passive: true });
	window.addEventListener("blur", blur);
	let lost = false;
	const contextLost = (event) => {
		event.preventDefault();
		lost = true;
		loop?.setActive(false);
		onFailure(new Error("WebGL context lost"));
	};
	canvas.addEventListener("webglcontextlost", contextLost);
	resize();
	const animate = (now) => {
		if (disposed) return;
		const dt = Math.min((now - last) / 1000, 0.06);
		last = now;
		// These destinations use their own illustrated environments, with no digital rain.
		if (lost || document.hidden || (state.mode !== "matrix" && !state.warp))
			return;
		if (!state.paused) sceneTime += dt * (1 + smoothWarp * 1.7);
		shock *= Math.exp(-dt * 3.2);
		const damp = 1 - Math.exp(-dt * 5);
		smoothWarp += (state.warp - smoothWarp) * damp;
		smoothReading += ((state.reading ? 1 : 0) - smoothReading) * damp;
		uniforms.uTime.value = sceneTime;
		uniforms.uWarp.value = smoothWarp;
		focusPass.uniforms.uWarp.value = smoothWarp;
		const mx = state.paused ? 0 : pointer.x;
		const my = state.paused ? 0 : pointer.y;
		camera.position.x +=
			(mx * 0.9 + Math.sin(state.active * 2.1) * 0.25 - camera.position.x) *
			damp;
		camera.position.y += (0.5 + my * 0.45 - camera.position.y) * damp;
		camera.position.z +=
			(17 -
				smoothWarp * 14 -
				smoothReading * 1.2 -
				shock * 0.8 -
				camera.position.z) *
			damp;
		camera.fov = 52 + smoothWarp * 34 + shock * 4;
		camera.updateProjectionMatrix();
		camera.lookAt(0, 0.5, -4);
		let distanceToRing = Infinity;
		if (
			pointer.inside &&
			state.mode === "matrix" &&
			!state.reading &&
			!state.paused &&
			smoothWarp < 0.05
		) {
			camera.updateMatrixWorld();
			torus.updateMatrixWorld();
			pointerNdc.set(pointer.x, pointer.y);
			raycaster.setFromCamera(pointerNdc, camera);
			planeNormal.set(0, 0, 1).applyQuaternion(torus.quaternion);
			ringPlane.setFromNormalAndCoplanarPoint(planeNormal, torus.position);
			if (raycaster.ray.intersectPlane(ringPlane, hit)) {
				inverseRotation.copy(torus.quaternion).invert();
				hit
					.sub(torus.position)
					.applyQuaternion(inverseRotation)
					.divideScalar(ringBaseScale);
				distanceToRing = Math.abs(Math.hypot(hit.x, hit.y) - 6.1);
				if (distanceToRing < 3.1) targetHoverAngle = Math.atan2(hit.y, hit.x);
			}
		}
		// Hysteresis includes the expanded surface, so following its edge cannot
		// repeatedly shrink/reinflate the ring under the pointer.
		ringHovered = distanceToRing < (ringHovered ? 3.1 : 1.3);
		const hover = ringHovered ? 1 : 0;
		if (state.paused) {
			smoothHover = 0;
			hoverVelocity = 0;
		} else {
			if (hover && smoothHover < 0.01) hoverAngle = targetHoverAngle;
			const angleDelta = Math.atan2(
				Math.sin(targetHoverAngle - hoverAngle),
				Math.cos(targetHoverAngle - hoverAngle),
			);
			hoverAngle += angleDelta * (1 - Math.exp(-dt * 18));
			hoverVelocity += ((hover - smoothHover) * 100 - hoverVelocity * 12) * dt;
			smoothHover = THREE.MathUtils.clamp(
				smoothHover + hoverVelocity * dt,
				0,
				1.12,
			);
			if (smoothHover === 0 && hoverVelocity < 0) hoverVelocity = 0;
		}
		torus.scale.setScalar(ringBaseScale);
		torusMat.uniforms.uHover.value = smoothHover;
		torusMat.uniforms.uHoverPoint.value.set(
			Math.cos(hoverAngle) * 6.1,
			Math.sin(hoverAngle) * 6.1,
		);
		dust.rotation.y = sceneTime * 0.008;
		bloom.strength = 0.46 + smoothWarp * 1.1 + shock * 0.22;
		torus.visible = state.mode === "matrix" || state.mode === "reader";
		composer.render();
	};
	loop = createFrameLoop(animate);
	const syncLoop = () => {
		const visible = !lost && !document.hidden;
		loop.setActive(
			visible &&
				(state.warp > 0.001 ||
					(state.mode === "matrix" && !state.paused && !state.reading)),
		);
		if (visible && state.mode === "matrix") loop.invalidate();
	};
	document.addEventListener("visibilitychange", syncLoop);
	syncLoop();
	onReady();
	return {
		setState(next) {
			if (next.active !== undefined && next.active !== state.active) shock = 1;
			state = { ...state, ...next };
			syncLoop();
		},
		getDiagnostics() {
			return {
				...loop.getDiagnostics(),
				geometries: renderer.info.memory.geometries,
				textures: renderer.info.memory.textures,
				programs: renderer.info.programs.length,
			};
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			loop.dispose();
			document.removeEventListener("visibilitychange", syncLoop);
			observer.disconnect();
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerout", leave);
			window.removeEventListener("blur", blur);
			canvas.removeEventListener("webglcontextlost", contextLost);
			const geometries = new Set(),
				materials = new Set();
			scene.traverse((o) => {
				if (o.geometry) geometries.add(o.geometry);
				if (o.material)
					(Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
						materials.add(m),
					);
			});
			geometries.forEach((g) => g.dispose());
			materials.forEach((m) => m.dispose());
			atlas.dispose();
			composer.passes.forEach((pass) => pass.dispose?.());
			composer.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
		},
	};
}
