// ============================================================================
// Digital Ripples - Interactive Installation
// ============================================================================
//
// Modes (URL): default = buttons on this screen. ?mode=display = video wall only;
// use tablet at http://<PC-ip>:8080/controller.html with npm start (see server.mjs).

// Layout (responsive: updated in setup and windowResized)
let uiPanelHeight = 200; // Height of bottom UI panel
let pondHeight = 880;    // Canvas height minus UI panel (initial placeholder)

// Action types mapped to quadrants
const ACTIONS = {
    LIKE: { quadrant: 1, x: 1, y: 0, label: 'Happy' },      // +x (right)
    DISLIKE: { quadrant: 2, x: -1, y: 0, label: 'Sad' },    // -x (left)
    POSITIVE_COMMENT: { quadrant: 3, x: 0, y: -1, label: 'Noise' },  // +y (up)
    NEGATIVE_COMMENT: { quadrant: 4, x: 0, y: 1, label: 'Silence' }  // -y (down)
};

// State machine states
const STATE = {
    CALM: 'CALM',
    ACTIVE: 'ACTIVE',
    OVERLOAD: 'OVERLOAD',
    RECOVER: 'RECOVER'
};

// Global variables
let ripples = [];
let activityManager;
let soundManager;
let uiManager;
let showDebug = false;
let isFullscreen = false;
let backgroundNoise = [];

/** true when monitor shows only pond/video; controls come from controller.html over WebSocket */
let IS_DISPLAY_MODE = false;
function detectAppMode() {
    if (typeof window === 'undefined') return;
    IS_DISPLAY_MODE = new URLSearchParams(window.location.search).get('mode') === 'display';
}
detectAppMode();

let displayInputSocket = null;

// Quadrant tracking (persistent values)
let quadrantPosition = {
    happySad: 0.0,    // -1.0 (sad) to +1.0 (happy)
    noiseSilence: 0.0  // -1.0 (silence) to +1.0 (noise)
};
const QUADRANT_SMOOTHING = 0.15; // How much each press moves the average (0-1)

// Videos = Cartesian quadrant pairs: Happy/Sad × Noise/Silence (files: Happy_Noise.mp4, …)
const QUADRANT_VIDEO_IDS = ['Happy_Noise', 'Happy_Silence', 'Sad_Noise', 'Sad_Silence'];
const DEFAULT_QUADRANT_VIDEO_ID = 'Happy_Noise';

// Low-res grain buffer (updated every few frames) — keeps sketch fast so video stays smooth
let pondGrainBuffer = null;
let pondGrainW = 0;
let pondGrainH = 0;
let pondGrainLastFrame = -1;
const POND_GRAIN_FRAME_SKIP = 2; // refresh grain every N draw frames

// ============================================================================
// VIDEO BACKGROUND (quadrant pair + crossfade)
// ============================================================================

class VideoBackgroundManager {
    constructor() {
        this.clips = {};
        this.foregroundId = DEFAULT_QUADRANT_VIDEO_ID;
        this.backgroundId = null; // outgoing clip during crossfade
        this.fadeStartMs = 0;
        this.fadeDurationMs = 1400;
        this.lastStableId = DEFAULT_QUADRANT_VIDEO_ID;
        this.deadZone = 0.1;
        this.playbackStarted = false;
    }

    preloadAssets() {
        for (const id of QUADRANT_VIDEO_IDS) {
            const v = createVideo(`assets/videos/${id}.mp4`);
            v.hide();
            v.volume(0);
            v.attribute('playsinline', '');
            v.attribute('muted', '');
            // Hint playback at device rate (helps some browsers stay in sync with compositor)
            try {
                v.elt.playbackRate = 1;
            } catch (e) { /* ignore */ }
            this.clips[id] = v;
        }
    }

    /** Call after first user gesture so browsers allow playback */
    ensurePlaybackStarted() {
        if (this.playbackStarted) return;
        this.playbackStarted = true;
        for (const id of Object.keys(this.clips)) {
            const v = this.clips[id];
            v.loop();
            if (id === this.foregroundId) {
                v.play();
            } else {
                v.pause();
            }
        }
    }

    /** Map (happySad, noiseSilence) to one of four clips: Happy_Noise, Happy_Silence, … */
    pickTargetVideoId(hs, ns) {
        if (abs(hs) < this.deadZone && abs(ns) < this.deadZone) {
            return this.lastStableId;
        }
        const row = hs >= 0 ? 'Happy' : 'Sad';
        const col = ns >= 0 ? 'Noise' : 'Silence';
        const id = `${row}_${col}`;
        this.lastStableId = id;
        return id;
    }

    snapCrossfadeComplete() {
        if (this.backgroundId !== null) {
            const out = this.clips[this.backgroundId];
            if (out) out.pause();
            this.backgroundId = null;
        }
    }

    beginCrossfade(newId) {
        if (newId === this.foregroundId) return;
        const incoming = this.clips[newId];
        if (!incoming) return;
        this.backgroundId = this.foregroundId;
        this.foregroundId = newId;
        this.fadeStartMs = millis();
        try {
            incoming.time(0);
        } catch (e) { /* some browsers */ }
        incoming.loop();
        incoming.play();
        const out = this.clips[this.backgroundId];
        if (out) out.play();
    }

    updateFromQuadrant(hs, ns) {
        const target = this.pickTargetVideoId(hs, ns);
        if (target !== this.foregroundId) {
            if (this.backgroundId !== null) {
                this.snapCrossfadeComplete();
            }
            this.beginCrossfade(target);
        }
    }

    getFadeT() {
        if (this.backgroundId === null) return 1;
        return constrain((millis() - this.fadeStartMs) / this.fadeDurationMs, 0, 1);
    }

    endCrossfadeIfDone() {
        if (this.backgroundId === null) return;
        if (this.getFadeT() < 1) return;
        const out = this.clips[this.backgroundId];
        if (out) out.pause();
        this.backgroundId = null;
    }

    /** object-fit: cover in pond area */
    drawVideoCover(vid, alpha) {
        if (!vid || vid.width <= 0) return;
        const w = width;
        const h = pondHeight;
        const vw = vid.width;
        const vh = vid.height;
        const scale = max(w / vw, h / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const ox = (w - dw) / 2;
        const oy = (h - dh) / 2;
        push();
        tint(255, alpha);
        image(vid, ox, oy, dw, dh);
        pop();
    }

    render() {
        const t = this.getFadeT();
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        if (this.backgroundId !== null) {
            const outAlpha = 255 * (1 - e);
            const inAlpha = 255 * e;
            this.drawVideoCover(this.clips[this.backgroundId], outAlpha);
            this.drawVideoCover(this.clips[this.foregroundId], inAlpha);
        } else {
            this.drawVideoCover(this.clips[this.foregroundId], 255);
        }

        this.endCrossfadeIfDone();
    }
}

let videoBackgroundManager;

// ============================================================================
// RIPPLE CLASS
// ============================================================================

class Ripple {
    constructor(x, y, actionType, startTime) {
        this.x = x;
        this.y = y;
        this.actionType = actionType;
        this.startTime = startTime;
        this.age = 0;
        
        // Set parameters based on action type
        const params = this.getActionParams(actionType);
        this.maxRadius = params.maxRadius;
        this.amplitude = params.amplitude;
        this.damping = params.damping;
        this.speed = params.speed;
        this.lifespan = params.lifespan;
        this.color = params.color;
        
        // For interference patterns (positive comment)
        this.microRipples = [];
        if (actionType === ACTIONS.POSITIVE_COMMENT) {
            this.generateMicroRipples();
        }
    }
    
    getActionParams(actionType) {
        // Scale ripple size on small screens (reference width 800px)
        const scale = typeof width !== 'undefined' ? min(1, max(0.3, width / 800)) : 1;
        switch(actionType) {
            case ACTIONS.LIKE:
                return {
                    maxRadius: 400 * scale,
                    amplitude: 1.0,
                    damping: 0.95,
                    speed: 3.5,
                    lifespan: 3000,
                    color: [100, 200, 255, 180] // Bright blue
                };
            case ACTIONS.DISLIKE:
                return {
                    maxRadius: 350 * scale,
                    amplitude: 0.8,
                    damping: 0.92,
                    speed: 2.0,
                    lifespan: 4000,
                    color: [150, 100, 150, 160] // Muted purple
                };
            case ACTIONS.POSITIVE_COMMENT:
                return {
                    maxRadius: 300 * scale,
                    amplitude: 0.6,
                    damping: 0.98,
                    speed: 4.0,
                    lifespan: 2500,
                    color: [255, 220, 100, 140] // Golden yellow
                };
            case ACTIONS.NEGATIVE_COMMENT:
                return {
                    maxRadius: 250 * scale,
                    amplitude: 0.4,
                    damping: 0.99,
                    speed: 2.5,
                    lifespan: 3500,
                    color: [50, 50, 80, 120] // Dark muted blue
                };
        }
    }
    
    generateMicroRipples() {
        // Create many small ripples for noise effect
        for (let i = 0; i < 15; i++) {
            const angle = random(TWO_PI);
            const dist = random(20, 80);
            this.microRipples.push({
                x: this.x + cos(angle) * dist,
                y: this.y + sin(angle) * dist,
                startTime: this.startTime + random(-100, 100),
                radius: random(30, 60)
            });
        }
    }
    
    update(currentTime) {
        this.age = currentTime - this.startTime;
        return this.age < this.lifespan;
    }
    
    getCurrentRadius() {
        const progress = this.age / this.lifespan;
        return min(progress * this.speed * 50, this.maxRadius);
    }
    
    getCurrentAmplitude() {
        const progress = this.age / this.lifespan;
        const radius = this.getCurrentRadius();
        // Apply damping based on radius
        let amp = this.amplitude * pow(this.damping, radius / 10);
        
        // Special effects per action type
        if (this.actionType === ACTIONS.DISLIKE) {
            // Drooping distortion
            const droop = sin(progress * PI * 2) * 0.1;
            amp *= (1 - droop);
        }
        
        // Negative comment absorbs nearby waves
        if (this.actionType === ACTIONS.NEGATIVE_COMMENT) {
            // This will be handled in render to affect other ripples
        }
        
        return amp * (1 - progress * 0.7); // Fade out over time
    }
    
    render() {
        const radius = this.getCurrentRadius();
        const amplitude = this.getCurrentAmplitude();
        
        if (radius <= 0 || amplitude <= 0) return;
        
        push();
        noFill();
        
        switch(this.actionType) {
            case ACTIONS.LIKE:
                this.renderLike(radius, amplitude);
                break;
            case ACTIONS.DISLIKE:
                this.renderDislike(radius, amplitude);
                break;
            case ACTIONS.POSITIVE_COMMENT:
                this.renderPositiveComment(radius, amplitude);
                break;
            case ACTIONS.NEGATIVE_COMMENT:
                this.renderNegativeComment(radius, amplitude);
                break;
        }
        
        pop();
    }
    
    // LIKE: Clean concentric circles with bright edge highlights
    renderLike(radius, amplitude) {
        const [r, g, b, a] = this.color;
        const numRings = 5;
        
        for (let i = 0; i < numRings; i++) {
            const ringRadius = radius - (i * 15);
            if (ringRadius <= 0) continue;
            
            const ringAlpha = a * amplitude * (1 - i / numRings) * 0.6;
            stroke(r, g, b, ringAlpha);
            strokeWeight(2);
            
            // Bright edge highlight on outer ring
            if (i === 0) {
                strokeWeight(3);
                stroke(r + 50, g + 50, b + 50, ringAlpha * 1.2);
            }
            
            ellipse(this.x, this.y, ringRadius * 2);
        }
    }
    
    // DISLIKE: Heavier ripples, slower, with drooping distortion
    renderDislike(radius, amplitude) {
        const [r, g, b, a] = this.color;
        const numRings = 4;
        
        for (let i = 0; i < numRings; i++) {
            const ringRadius = radius - (i * 20);
            if (ringRadius <= 0) continue;
            
            const ringAlpha = a * amplitude * (1 - i / numRings) * 0.5;
            stroke(r, g, b, ringAlpha);
            strokeWeight(3);
            
            // Drooping effect - distort the circle
            beginShape();
            for (let angle = 0; angle < TWO_PI; angle += 0.1) {
                const droop = sin(angle * 3 + this.age * 0.01) * 5;
                const x = this.x + cos(angle) * (ringRadius + droop);
                const y = this.y + sin(angle) * (ringRadius + droop * 0.5);
                vertex(x, y);
            }
            endShape(CLOSE);
        }
    }
    
    // POSITIVE COMMENT: Many small micro-ripples + sparkly interference
    renderPositiveComment(radius, amplitude) {
        const [r, g, b, a] = this.color;
        
        // Main ripple
        for (let i = 0; i < 3; i++) {
            const ringRadius = radius - (i * 12);
            if (ringRadius <= 0) continue;
            
            const ringAlpha = a * amplitude * (1 - i / 3) * 0.4;
            stroke(r, g, b, ringAlpha);
            strokeWeight(1.5);
            ellipse(this.x, this.y, ringRadius * 2);
        }
        
        // Micro-ripples
        for (let micro of this.microRipples) {
            const microAge = this.age - (micro.startTime - this.startTime);
            if (microAge < 0 || microAge > 1000) continue;
            
            const microRadius = (microAge / 1000) * micro.radius;
            const microAlpha = a * amplitude * (1 - microAge / 1000) * 0.3;
            
            stroke(r + 50, g + 30, b - 20, microAlpha);
            strokeWeight(1);
            ellipse(micro.x, micro.y, microRadius * 2);
        }
        
        // Sparkly interference pattern
        push();
        stroke(r + 100, g + 80, b, amplitude * 30);
        strokeWeight(1);
        for (let i = 0; i < 8; i++) {
            const angle = (this.age * 0.02 + i * PI / 4) % TWO_PI;
            const dist = radius * 0.7;
            const x1 = this.x + cos(angle) * dist;
            const y1 = this.y + sin(angle) * dist;
            const x2 = this.x + cos(angle) * dist * 1.2;
            const y2 = this.y + sin(angle) * dist * 1.2;
            line(x1, y1, x2, y2);
        }
        pop();
    }
    
    // NEGATIVE COMMENT: Minimal ripple that absorbs nearby waves
    renderNegativeComment(radius, amplitude) {
        const [r, g, b, a] = this.color;
        
        // Very subtle main ripple
        for (let i = 0; i < 2; i++) {
            const ringRadius = radius - (i * 15);
            if (ringRadius <= 0) continue;
            
            const ringAlpha = a * amplitude * (1 - i / 2) * 0.2;
            stroke(r, g, b, ringAlpha);
            strokeWeight(1);
            ellipse(this.x, this.y, ringRadius * 2);
        }
        
        // Absorption effect - damp other ripples in radius
        // This is handled in the main render loop
    }
    
    // Check if this ripple should damp another ripple (negative comment effect)
    shouldDamp(otherRipple, currentTime) {
        if (this.actionType !== ACTIONS.NEGATIVE_COMMENT) return false;
        if (otherRipple === this) return false;
        
        const dx = this.x - otherRipple.x;
        const dy = this.y - otherRipple.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const absorptionRadius = this.getCurrentRadius() * 1.5;
        
        return distance < absorptionRadius;
    }
}

// ============================================================================
// ACTIVITY MANAGER
// ============================================================================

class ActivityManager {
    constructor() {
        this.meter = 0.0;
        this.state = STATE.CALM;
        this.overloadThreshold = 1.0;
        this.decayRate = 0.001; // Per frame
        this.overloadStartTime = 0;
        this.recoverStartTime = 0;
        this.blackoutAlpha = 0;
        
        // Activity weights per action
        this.weights = {
            [ACTIONS.LIKE]: 0.15,
            [ACTIONS.DISLIKE]: 0.18,
            [ACTIONS.POSITIVE_COMMENT]: 0.20,
            [ACTIONS.NEGATIVE_COMMENT]: 0.12
        };
    }
    
    addActivity(actionType) {
        if (this.state === STATE.OVERLOAD) return; // Don't add during overload
        
        const weight = this.weights[actionType] || 0.15;
        this.meter = min(this.meter + weight, 1.5); // Allow slight overflow
        
        // Transition to ACTIVE if meter is rising
        if (this.meter > 0.3 && this.state === STATE.CALM) {
            this.state = STATE.ACTIVE;
        }
        
        // Check for overload
        if (this.meter >= this.overloadThreshold && this.state !== STATE.OVERLOAD) {
            this.triggerOverload();
        }
    }
    
    triggerOverload() {
        this.state = STATE.OVERLOAD;
        this.overloadStartTime = millis();
        this.blackoutAlpha = 0;
    }
    
    update() {
        // Decay meter over time (except during overload/recover)
        if (this.state === STATE.CALM || this.state === STATE.ACTIVE) {
            this.meter = max(0, this.meter - this.decayRate);
            
            // Return to calm if meter is low
            if (this.meter < 0.2 && this.state === STATE.ACTIVE) {
                this.state = STATE.CALM;
            }
        }
        
        // Handle overload state
        if (this.state === STATE.OVERLOAD) {
            const elapsed = millis() - this.overloadStartTime;
            
            // Fade to black in 2 seconds
            if (elapsed < 2000) {
                this.blackoutAlpha = map(elapsed, 0, 2000, 0, 255);
            } else {
                this.blackoutAlpha = 255;
            }
            
            // Keep black for 5-10 seconds, then recover
            if (elapsed > 7000) {
                this.state = STATE.RECOVER;
                this.recoverStartTime = millis();
            }
        }
        
        // Handle recover state
        if (this.state === STATE.RECOVER) {
            const elapsed = millis() - this.recoverStartTime;
            
            // Fade back over 3 seconds
            if (elapsed < 3000) {
                this.blackoutAlpha = map(elapsed, 0, 3000, 255, 0);
            } else {
                this.blackoutAlpha = 0;
                this.meter = 0.3; // Reset to moderate level
                this.state = STATE.CALM;
            }
        }
    }
    
    getBackgroundTurbulence() {
        // Increase background noise/grain as meter rises
        return map(this.meter, 0, 1.0, 0.3, 1.5, true);
    }
    
    getVignetteIntensity() {
        // Add vignette effect as meter rises
        return map(this.meter, 0.5, 1.0, 0, 0.8, true);
    }
    
    getFlickerIntensity() {
        // Add screen flicker as meter rises
        if (this.meter > 0.7) {
            return random(0, map(this.meter, 0.7, 1.0, 0, 0.3, true));
        }
        return 0;
    }
    
    shouldSpawnRipples() {
        return this.state !== STATE.OVERLOAD;
    }
    
    getMeter() {
        return this.meter;
    }
    
    getState() {
        return this.state;
    }
    
    getBlackoutAlpha() {
        return this.blackoutAlpha;
    }
}

// ============================================================================
// SOUND MANAGER
// ============================================================================

class SoundManager {
    constructor() {
        this.ambientOsc = null;
        this.ambientEnv = null;
        this.ambientGain = null;
        this.masterVolume = 0.5;
        this.isMuted = false;
        this.initAmbient();
    }
    
    initAmbient() {
        // Create subtle looping ambient water tone
        this.ambientOsc = new p5.Oscillator('sine');
        this.ambientOsc.freq(60); // Low frequency for water-like sound
        this.ambientOsc.amp(0);
        
        // Add some modulation for water effect
        const lfo = new p5.Oscillator('sine');
        lfo.freq(0.1); // Very slow modulation
        lfo.amp(5); // Small frequency modulation
        lfo.start();
        lfo.disconnect(); // We'll manually connect if needed
        
        this.ambientOsc.start();
        this.ambientOsc.amp(0.05 * this.masterVolume); // Very quiet
    }
    
    playActionSound(actionType) {
        if (this.isMuted) return;
        
        switch(actionType) {
            case ACTIONS.LIKE:
                this.playLikeSound();
                break;
            case ACTIONS.DISLIKE:
                this.playDislikeSound();
                break;
            case ACTIONS.POSITIVE_COMMENT:
                this.playPositiveCommentSound();
                break;
            case ACTIONS.NEGATIVE_COMMENT:
                this.playNegativeCommentSound();
                break;
        }
    }
    
    // LIKE: Bright bell/pluck
    playLikeSound() {
        const osc = new p5.Oscillator('sine');
        const env = new p5.Envelope();
        
        osc.freq(440); // A4
        env.setADSR(0.01, 0.1, 0.3, 0.5);
        env.setRange(0.3 * this.masterVolume, 0);
        
        osc.start();
        osc.connect();
        env.play(osc);
        
        // Add harmonic for bell-like quality
        setTimeout(() => {
            const osc2 = new p5.Oscillator('sine');
            osc2.freq(880); // Octave
            osc2.start();
            const env2 = new p5.Envelope();
            env2.setADSR(0.01, 0.05, 0.2, 0.3);
            env2.setRange(0.15 * this.masterVolume, 0);
            env2.play(osc2);
        }, 10);
    }
    
    // DISLIKE: Lower, dull thump
    playDislikeSound() {
        const osc = new p5.Oscillator('sawtooth');
        const env = new p5.Envelope();
        
        osc.freq(110); // Low A2
        env.setADSR(0.05, 0.2, 0.4, 0.8);
        env.setRange(0.25 * this.masterVolume, 0);
        
        osc.start();
        osc.connect();
        env.play(osc);
    }
    
    // POSITIVE COMMENT: Noisy burst
    playPositiveCommentSound() {
        const noise = new p5.Noise('white');
        const env = new p5.Envelope();
        const filter = new p5.BandPass();
        
        filter.freq(800);
        filter.res(10);
        
        noise.connect(filter);
        filter.connect();
        
        env.setADSR(0.01, 0.05, 0.1, 0.2);
        env.setRange(0.2 * this.masterVolume, 0);
        
        noise.start();
        env.play(noise);
    }
    
    // NEGATIVE COMMENT: Very soft muted pulse
    playNegativeCommentSound() {
        const osc = new p5.Oscillator('sine');
        const env = new p5.Envelope();
        const filter = new p5.LowPass();
        
        filter.freq(200); // Low pass for muted effect
        
        osc.freq(150);
        osc.connect(filter);
        filter.connect();
        
        env.setADSR(0.1, 0.2, 0.3, 0.5);
        env.setRange(0.1 * this.masterVolume, 0);
        
        osc.start();
        env.play(osc);
    }
    
    updateAmbient(activityMeter) {
        if (!this.ambientOsc) return;
        
        // Increase ambient harshness as meter rises
        const baseAmp = 0.05;
        const harshness = map(activityMeter, 0, 1.0, 0, 0.3, true);
        const targetAmp = (baseAmp + harshness) * this.masterVolume;
        
        // Smoothly transition
        const currentAmp = this.ambientOsc.getAmp();
        const newAmp = lerp(currentAmp, targetAmp, 0.05);
        this.ambientOsc.amp(newAmp);
        
        // Adjust frequency for harshness
        const baseFreq = 60;
        const harshFreq = baseFreq + (harshness * 40);
        this.ambientOsc.freq(harshFreq);
    }
    
    mute() {
        this.isMuted = true;
        if (this.ambientOsc) {
            this.ambientOsc.amp(0);
        }
    }
    
    unmute() {
        this.isMuted = false;
        if (this.ambientOsc) {
            this.ambientOsc.amp(0.05 * this.masterVolume);
        }
    }
    
    setLowPass(activityMeter) {
        // Apply low-pass filter during overload
        // This would require a global filter, simplified here
    }
}

// ============================================================================
// UI MANAGER
// ============================================================================

class UIManager {
    constructor() {
        this.buttons = [];
        this.buttonWidth = 200;
        this.buttonHeight = 150;
        this.buttonSpacing = 30;
        this.initButtons();
    }
    
    initButtons() {
        if (IS_DISPLAY_MODE) {
            this.buttons = [];
            return;
        }
        // Responsive button dimensions
        this.buttonSpacing = min(30, max(8, width * 0.02));
        const totalButtonWidth = 4 * this.buttonWidth + 3 * this.buttonSpacing;
        if (totalButtonWidth > width - 40) {
            this.buttonWidth = max(60, (width - 40 - 3 * this.buttonSpacing) / 4);
        }
        this.buttonHeight = min(150, max(50, uiPanelHeight * 0.85));
        
        const startX = (width - (4 * this.buttonWidth + 3 * this.buttonSpacing)) / 2;
        const y = pondHeight + (uiPanelHeight - this.buttonHeight) / 2;
        
        this.buttons = [
            {
                action: ACTIONS.LIKE,
                x: startX,
                y: y,
                pressed: false,
                pressTime: 0
            },
            {
                action: ACTIONS.DISLIKE,
                x: startX + this.buttonWidth + this.buttonSpacing,
                y: y,
                pressed: false,
                pressTime: 0
            },
            {
                action: ACTIONS.POSITIVE_COMMENT,
                x: startX + 2 * (this.buttonWidth + this.buttonSpacing),
                y: y,
                pressed: false,
                pressTime: 0
            },
            {
                action: ACTIONS.NEGATIVE_COMMENT,
                x: startX + 3 * (this.buttonWidth + this.buttonSpacing),
                y: y,
                pressed: false,
                pressTime: 0
            }
        ];
    }
    
    handleClick(mx, my) {
        for (let button of this.buttons) {
            if (mx >= button.x && mx <= button.x + this.buttonWidth &&
                my >= button.y && my <= button.y + this.buttonHeight) {
                this.triggerButton(button);
                return button.action;
            }
        }
        return null;
    }
    
    triggerButton(button) {
        button.pressed = true;
        button.pressTime = millis();
        
        // Reset after animation
        setTimeout(() => {
            button.pressed = false;
        }, 200);
    }
    
    render() {
        if (IS_DISPLAY_MODE) {
            if (showDebug) {
                this.renderQuadrantIndicator();
            }
            return;
        }
        // Render buttons
        for (let button of this.buttons) {
            this.renderButton(button);
        }
        
        // Render quadrant indicator (only in debug mode)
        if (showDebug) {
            this.renderQuadrantIndicator();
        }
    }
    
    updateQuadrantPosition(actionType) {
        // Update quadrant position based on action
        switch(actionType) {
            case ACTIONS.LIKE: // Happy (+x)
                quadrantPosition.happySad = lerp(quadrantPosition.happySad, 1.0, QUADRANT_SMOOTHING);
                break;
            case ACTIONS.DISLIKE: // Sad (-x)
                quadrantPosition.happySad = lerp(quadrantPosition.happySad, -1.0, QUADRANT_SMOOTHING);
                break;
            case ACTIONS.POSITIVE_COMMENT: // Noise (+y)
                quadrantPosition.noiseSilence = lerp(quadrantPosition.noiseSilence, 1.0, QUADRANT_SMOOTHING);
                break;
            case ACTIONS.NEGATIVE_COMMENT: // Silence (-y)
                quadrantPosition.noiseSilence = lerp(quadrantPosition.noiseSilence, -1.0, QUADRANT_SMOOTHING);
                break;
        }
    }
    
    renderQuadrantIndicator() {
        // In display mode uiPanelHeight is 0, so use a fixed overlay size/position.
        const indicatorSize = IS_DISPLAY_MODE
            ? min(160, width * 0.18, height * 0.2)
            : min(120, width * 0.12, uiPanelHeight * 0.7);
        const indicatorX = width - indicatorSize - 20;
        const indicatorY = IS_DISPLAY_MODE
            ? 68
            : pondHeight + (uiPanelHeight - indicatorSize) / 2;
        
        push();
        translate(indicatorX + indicatorSize / 2, indicatorY + indicatorSize / 2);
        
        // Background
        fill(20, 20, 30, 200);
        stroke(100, 100, 120);
        strokeWeight(2);
        rectMode(CENTER);
        rect(0, 0, indicatorSize, indicatorSize, 8);
        
        // Draw axes
        stroke(80, 80, 100);
        strokeWeight(1);
        line(-indicatorSize / 2, 0, indicatorSize / 2, 0); // Horizontal: Happy vs Sad
        line(0, -indicatorSize / 2, 0, indicatorSize / 2); // Vertical: Noise vs Silence
        
        // Draw current position indicator
        const xPos = map(quadrantPosition.happySad, -1, 1, -indicatorSize / 2 + 10, indicatorSize / 2 - 10);
        const yPos = map(quadrantPosition.noiseSilence, -1, 1, indicatorSize / 2 - 10, -indicatorSize / 2 + 10);
        
        // Draw position dot
        fill(100, 200, 255);
        noStroke();
        ellipse(xPos, yPos, 8, 8);
        
        // Draw position line from center
        stroke(100, 200, 255, 100);
        strokeWeight(1);
        line(0, 0, xPos, yPos);
        
        // Labels
        fill(200, 200, 220);
        textAlign(CENTER);
        textSize(11);
        
        // Horizontal axis labels
        text('Happy', indicatorSize / 2 - 15, -5);
        text('Sad', -indicatorSize / 2 + 15, -5);
        
        // Vertical axis labels
        text('Noise', -indicatorSize / 2 + 5, -indicatorSize / 2 + 15);
        text('Silence', -indicatorSize / 2 + 5, indicatorSize / 2 - 5);
        
        pop();
    }
    
    renderButton(button) {
        const { x, y, action, pressed } = button;
        const pressOffset = pressed ? 5 : 0;
        
        push();
        translate(x + this.buttonWidth / 2, y + this.buttonHeight / 2 + pressOffset);
        
        // Button background
        fill(pressed ? 40 : 30, 30, 40);
        stroke(100, 100, 120);
        strokeWeight(2);
        rectMode(CENTER);
        rect(0, 0, this.buttonWidth, this.buttonHeight, 10);
        
        // Button icon
        noStroke();
        switch(action) {
            case ACTIONS.LIKE:
                this.drawThumbUp();
                break;
            case ACTIONS.DISLIKE:
                this.drawThumbDown();
                break;
            case ACTIONS.POSITIVE_COMMENT:
                this.drawSmileChat();
                break;
            case ACTIONS.NEGATIVE_COMMENT:
                this.drawBlockedChat();
                break;
        }
        
        // Label
        fill(200, 200, 220);
        textAlign(CENTER);
        textSize(16);
        text(action.label, 0, this.buttonHeight / 2 - 15);
        
        pop();
    }
    
    drawThumbUp() {
        fill(100, 200, 255);
        // Thumb
        ellipse(-15, -10, 20, 25);
        // Hand base
        ellipse(10, 5, 30, 35);
    }
    
    drawThumbDown() {
        fill(150, 100, 150);
        // Thumb
        ellipse(-15, 10, 20, 25);
        // Hand base
        ellipse(10, -5, 30, 35);
    }
    
    drawSmileChat() {
        fill(255, 220, 100);
        // Chat bubble
        ellipse(0, 0, 40, 35);
        // Smile
        noFill();
        stroke(50, 50, 50);
        strokeWeight(2);
        arc(0, 5, 20, 15, 0, PI);
    }
    
    drawBlockedChat() {
        fill(50, 50, 80);
        // Chat bubble
        ellipse(0, 0, 40, 35);
        // Blocked line
        stroke(150, 50, 50);
        strokeWeight(3);
        line(-15, -15, 15, 15);
    }
}

// ============================================================================
// COORDINATE PLANE MAPPING
// ============================================================================

function getSpawnPoint(actionType) {
    const centerX = width / 2;
    const centerY = pondHeight / 2;
    const margin = min(100, width * 0.08, pondHeight * 0.08);
    
    // Bias spawn point toward action's quadrant
    let x, y;
    
    switch(actionType) {
        case ACTIONS.LIKE: // +x (right)
            x = random(centerX, width - margin);
            y = random(margin, pondHeight - margin);
            break;
        case ACTIONS.DISLIKE: // -x (left)
            x = random(margin, centerX);
            y = random(margin, pondHeight - margin);
            break;
        case ACTIONS.POSITIVE_COMMENT: // +y (up)
            x = random(margin, width - margin);
            y = random(margin, centerY);
            break;
        case ACTIONS.NEGATIVE_COMMENT: // -y (down)
            x = random(margin, width - margin);
            y = random(centerY, pondHeight - margin);
            break;
    }
    
    return { x, y };
}

function actionFromRemoteKey(key) {
    switch (key) {
        case 'LIKE': return ACTIONS.LIKE;
        case 'DISLIKE': return ACTIONS.DISLIKE;
        case 'POSITIVE_COMMENT': return ACTIONS.POSITIVE_COMMENT;
        case 'NEGATIVE_COMMENT': return ACTIONS.NEGATIVE_COMMENT;
        default: return null;
    }
}

/** Shared path for local buttons, keyboard, and tablet WebSocket */
function fireInputAction(action) {
    if (!action || !activityManager.shouldSpawnRipples()) return;
    if (videoBackgroundManager) {
        videoBackgroundManager.ensurePlaybackStarted();
    }
    uiManager.updateQuadrantPosition(action);
    const spawn = getSpawnPoint(action);
    ripples.push(new Ripple(spawn.x, spawn.y, action, millis()));
    activityManager.addActivity(action);
    soundManager.playActionSound(action);
}

function connectDisplayInputSocket() {
    if (!IS_DISPLAY_MODE || typeof WebSocket === 'undefined') return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws`;
    const connect = () => {
        let socket;
        try {
            socket = new WebSocket(url);
        } catch (e) {
            setTimeout(connect, 2000);
            return;
        }
        socket.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type !== 'input' || !msg.action) return;
                const action = actionFromRemoteKey(msg.action);
                if (action) fireInputAction(action);
            } catch (e) { /* ignore */ }
        };
        socket.onclose = () => {
            displayInputSocket = null;
            setTimeout(connect, 2000);
        };
        socket.onopen = () => {
            displayInputSocket = socket;
        };
    };
    connect();
}

function renderDebugOverlay() {
    if (!showDebug) return;
    
    // Activity meter (debug only)
    renderActivityMeterDebug();
}

function renderActivityMeterDebug() {
    const meterWidth = min(300, width - 60);
    const meterHeight = 20;
    const meterX = width - meterWidth - 30;
    const meterY = 30;
    
    // Background
    fill(20, 20, 30);
    noStroke();
    rect(meterX, meterY, meterWidth, meterHeight, 5);
    
    // Meter fill
    const fillWidth = meterWidth * activityManager.getMeter();
    const state = activityManager.getState();
    
    if (state === STATE.OVERLOAD || state === STATE.RECOVER) {
        fill(150, 50, 50);
    } else if (state === STATE.ACTIVE) {
        fill(255, 200, 100);
    } else {
        fill(100, 200, 255);
    }
    
    rect(meterX, meterY, fillWidth, meterHeight, 5);
    
    // Label and state
    fill(200, 200, 220);
    textAlign(LEFT);
    textSize(14);
    text(`Activity: ${activityManager.getMeter().toFixed(2)} [${state}]`, meterX, meterY - 5);
}

// ============================================================================
// BACKGROUND RENDERING
// ============================================================================

/** Resize / refresh low-resolution grain texture (cheap vs tens of thousands of rects per frame) */
function updatePondGrainBuffer(turbulence) {
    const gw = max(32, ceil(width / 5));
    const gh = max(24, ceil(pondHeight / 5));
    if (!pondGrainBuffer || pondGrainW !== gw || pondGrainH !== gh) {
        pondGrainBuffer = createGraphics(gw, gh);
        pondGrainBuffer.pixelDensity(1);
        pondGrainW = gw;
        pondGrainH = gh;
        pondGrainLastFrame = -1;
    }
    if (pondGrainLastFrame >= 0 && frameCount - pondGrainLastFrame < POND_GRAIN_FRAME_SKIP) {
        return;
    }
    pondGrainLastFrame = frameCount;
    pondGrainBuffer.loadPixels();
    const px = pondGrainBuffer.pixels;
    let p = 0;
    for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
            const noiseVal = noise(i * 0.09, j * 0.09, frameCount * 0.012) * turbulence * 14;
            const n = constrain(noiseVal, 0, 255);
            px[p++] = n;
            px[p++] = constrain(n * 1.05, 0, 255);
            px[p++] = constrain(n * 1.1, 0, 255);
            px[p++] = 38;
        }
    }
    pondGrainBuffer.updatePixels();
}

function renderBackground() {
    // Single semi-transparent veil (avoids thousands of strip draws)
    push();
    noStroke();
    fill(5, 10, 18, 118);
    rect(0, 0, width, pondHeight);
    fill(5, 8, 14, 72);
    rect(0, 0, width, pondHeight * 0.45);
    pop();

    // Scaled grain image from small offscreen buffer
    const turbulence = activityManager.getBackgroundTurbulence();
    updatePondGrainBuffer(turbulence);
    if (pondGrainBuffer) {
        push();
        imageMode(CORNER);
        tint(255, 200);
        image(pondGrainBuffer, 0, 0, width, pondHeight);
        noTint();
        pop();
    }

    // Vignette effect
    const vignette = activityManager.getVignetteIntensity();
    if (vignette > 0) {
        push();
        noFill();
        for (let r = 0; r < 8; r++) {
            const alpha = vignette * (1 - r / 8) * 25;
            stroke(0, 0, 0, alpha);
            strokeWeight(3);
            ellipse(width / 2, pondHeight / 2, 
                   width * 1.5 - r * 60, pondHeight * 1.5 - r * 60);
        }
        pop();
    }
    
    // Flicker effect
    const flicker = activityManager.getFlickerIntensity();
    if (flicker > 0) {
        fill(255, 255, 255, flicker * 255);
        noStroke();
        rect(0, 0, width, pondHeight);
    }
}

// ============================================================================
// P5.JS SETUP AND DRAW
// ============================================================================

function preload() {
    videoBackgroundManager = new VideoBackgroundManager();
    videoBackgroundManager.preloadAssets();
}

function setup() {
    createCanvas(windowWidth, windowHeight);
    pixelDensity(1); // lighter GPU load on Retina — smoother video → canvas compositing
    frameRate(60);
    updateLayout();
    
    // Initialize managers
    activityManager = new ActivityManager();
    soundManager = new SoundManager();
    uiManager = new UIManager();
    
    // Initialize background noise array for grain effect
    backgroundNoise = [];
    
    if (IS_DISPLAY_MODE) {
        connectDisplayInputSocket();
    }
}

// Update layout variables from current canvas size; call after resize
function updateLayout() {
    if (IS_DISPLAY_MODE) {
        uiPanelHeight = 0;
        pondHeight = height;
    } else {
        uiPanelHeight = min(200, Math.floor(height * 0.2));
        pondHeight = height - uiPanelHeight;
    }
    // Force pond grain buffer rebuild on next draw
    pondGrainW = 0;
    pondGrainH = 0;
    if (typeof uiManager !== 'undefined' && uiManager.initButtons) {
        uiManager.initButtons();
    }
}

// Respond to window resize
function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    updateLayout();
    // video draw uses current width / pondHeight each frame — no extra resize needed
}

function draw() {
    const currentTime = millis();
    
    // Update activity manager
    activityManager.update();
    
    // Update sound manager
    soundManager.updateAmbient(activityManager.getMeter());
    
    // Handle overload mute
    if (activityManager.getState() === STATE.OVERLOAD) {
        soundManager.mute();
    } else if (activityManager.getState() === STATE.CALM) {
        soundManager.unmute();
    }
    
    // Base fill (visible before video frames load)
    background(12, 14, 20);
    
    // Quadrant-driven video layer + smooth crossfade
    if (videoBackgroundManager) {
        videoBackgroundManager.updateFromQuadrant(
            quadrantPosition.happySad,
            quadrantPosition.noiseSilence
        );
        videoBackgroundManager.render();
    }
    
    // Digital pond overlay (grain, vignette) on top of video
    renderBackground();
    
    // Update and render ripples
    ripples = ripples.filter(ripple => {
        const alive = ripple.update(currentTime);
        if (alive) {
            // Check for damping from negative comment ripples
            let shouldDamp = false;
            for (let other of ripples) {
                if (other.shouldDamp(ripple, currentTime)) {
                    shouldDamp = true;
                    break;
                }
            }
            
            if (!shouldDamp) {
                ripple.render();
            } else {
                // Render with reduced amplitude
                push();
                const oldAmp = ripple.amplitude;
                ripple.amplitude *= 0.3; // Damp amplitude
                ripple.render();
                ripple.amplitude = oldAmp;
                pop();
            }
        }
        return alive;
    });
    
    // Render debug overlay
    renderDebugOverlay();
    
    // Render UI
    uiManager.render();
    
    // Render blackout overlay
    const blackoutAlpha = activityManager.getBlackoutAlpha();
    if (blackoutAlpha > 0) {
        fill(0, 0, 0, blackoutAlpha);
        noStroke();
        rect(0, 0, width, pondHeight);
    }
}

// ============================================================================
// INPUT HANDLING
// ============================================================================

function mousePressed() {
    if (videoBackgroundManager) {
        videoBackgroundManager.ensurePlaybackStarted();
    }
    
    if (IS_DISPLAY_MODE) {
        return;
    }
    
    // Check UI button clicks
    const action = uiManager.handleClick(mouseX, mouseY);
    
    if (action && activityManager.shouldSpawnRipples()) {
        for (const b of uiManager.buttons) {
            if (b.action === action) {
                uiManager.triggerButton(b);
                break;
            }
        }
        fireInputAction(action);
    }
}

// Keyboard input (for testing and future hardware integration)
function keyPressed() {
    if (videoBackgroundManager) {
        videoBackgroundManager.ensurePlaybackStarted();
    }
    
    // Toggle debug overlay
    if (key === 'd' || key === 'D') {
        showDebug = !showDebug;
    }
    
    // Toggle fullscreen
    if (key === 'f' || key === 'F') {
        toggleFullscreen();
    }
    
    // Simulate button presses with keys 1-4
    if (key === '1') fireInputAction(ACTIONS.LIKE);
    if (key === '2') fireInputAction(ACTIONS.DISLIKE);
    if (key === '3') fireInputAction(ACTIONS.POSITIVE_COMMENT);
    if (key === '4') fireInputAction(ACTIONS.NEGATIVE_COMMENT);
}

function toggleFullscreen() {
    if (!isFullscreen) {
        let fs = fullscreen();
        fullscreen(!fs);
        isFullscreen = true;
    } else {
        fullscreen(false);
        isFullscreen = false;
    }
}
