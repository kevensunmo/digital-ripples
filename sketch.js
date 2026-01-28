// ============================================================================
// Digital Ripples - Interactive Installation
// ============================================================================

// Global constants
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const UI_PANEL_HEIGHT = 200; // Height of bottom UI panel
const POND_HEIGHT = CANVAS_HEIGHT - UI_PANEL_HEIGHT;

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

// Quadrant tracking (persistent values)
let quadrantPosition = {
    happySad: 0.0,    // -1.0 (sad) to +1.0 (happy)
    noiseSilence: 0.0  // -1.0 (silence) to +1.0 (noise)
};
const QUADRANT_SMOOTHING = 0.15; // How much each press moves the average (0-1)

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
        switch(actionType) {
            case ACTIONS.LIKE:
                return {
                    maxRadius: 400,
                    amplitude: 1.0,
                    damping: 0.95,
                    speed: 3.5,
                    lifespan: 3000,
                    color: [100, 200, 255, 180] // Bright blue
                };
            case ACTIONS.DISLIKE:
                return {
                    maxRadius: 350,
                    amplitude: 0.8,
                    damping: 0.92,
                    speed: 2.0,
                    lifespan: 4000,
                    color: [150, 100, 150, 160] // Muted purple
                };
            case ACTIONS.POSITIVE_COMMENT:
                return {
                    maxRadius: 300,
                    amplitude: 0.6,
                    damping: 0.98,
                    speed: 4.0,
                    lifespan: 2500,
                    color: [255, 220, 100, 140] // Golden yellow
                };
            case ACTIONS.NEGATIVE_COMMENT:
                return {
                    maxRadius: 250,
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
        const startX = (CANVAS_WIDTH - (4 * this.buttonWidth + 3 * this.buttonSpacing)) / 2;
        const y = POND_HEIGHT + (UI_PANEL_HEIGHT - this.buttonHeight) / 2;
        
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
        const indicatorSize = 120;
        const indicatorX = CANVAS_WIDTH - indicatorSize - 20;
        const indicatorY = POND_HEIGHT + (UI_PANEL_HEIGHT - indicatorSize) / 2;
        
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
    const centerX = CANVAS_WIDTH / 2;
    const centerY = POND_HEIGHT / 2;
    
    // Bias spawn point toward action's quadrant
    let x, y;
    
    switch(actionType) {
        case ACTIONS.LIKE: // +x (right)
            x = random(centerX, CANVAS_WIDTH - 100);
            y = random(100, POND_HEIGHT - 100);
            break;
        case ACTIONS.DISLIKE: // -x (left)
            x = random(100, centerX);
            y = random(100, POND_HEIGHT - 100);
            break;
        case ACTIONS.POSITIVE_COMMENT: // +y (up)
            x = random(100, CANVAS_WIDTH - 100);
            y = random(100, centerY);
            break;
        case ACTIONS.NEGATIVE_COMMENT: // -y (down)
            x = random(100, CANVAS_WIDTH - 100);
            y = random(centerY, POND_HEIGHT - 100);
            break;
    }
    
    return { x, y };
}

function renderDebugOverlay() {
    if (!showDebug) return;
    
    // Activity meter (debug only)
    renderActivityMeterDebug();
}

function renderActivityMeterDebug() {
    const meterWidth = 300;
    const meterHeight = 20;
    const meterX = CANVAS_WIDTH - meterWidth - 30;
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

function renderBackground() {
    // Dark pond base with gradient
    for (let y = 0; y < POND_HEIGHT; y += 3) {
        const gradient = map(y, 0, POND_HEIGHT, 10, 25);
        stroke(gradient, gradient + 5, gradient + 10);
        strokeWeight(3);
        line(0, y, CANVAS_WIDTH, y);
    }
    
    // Animated grain/noise (optimized - sample fewer points)
    const turbulence = activityManager.getBackgroundTurbulence();
    push();
    noStroke();
    for (let x = 0; x < CANVAS_WIDTH; x += 4) {
        for (let y = 0; y < POND_HEIGHT; y += 4) {
            const noiseVal = noise(x * 0.01, y * 0.01, frameCount * 0.01) * turbulence * 8;
            fill(noiseVal, noiseVal * 1.1, noiseVal * 1.2, 30);
            rect(x, y, 4, 4);
        }
    }
    pop();
    
    // Vignette effect
    const vignette = activityManager.getVignetteIntensity();
    if (vignette > 0) {
        push();
        noFill();
        for (let r = 0; r < 8; r++) {
            const alpha = vignette * (1 - r / 8) * 25;
            stroke(0, 0, 0, alpha);
            strokeWeight(3);
            ellipse(CANVAS_WIDTH / 2, POND_HEIGHT / 2, 
                   CANVAS_WIDTH * 1.5 - r * 60, POND_HEIGHT * 1.5 - r * 60);
        }
        pop();
    }
    
    // Flicker effect
    const flicker = activityManager.getFlickerIntensity();
    if (flicker > 0) {
        fill(255, 255, 255, flicker * 255);
        noStroke();
        rect(0, 0, CANVAS_WIDTH, POND_HEIGHT);
    }
}

// ============================================================================
// P5.JS SETUP AND DRAW
// ============================================================================

function setup() {
    createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Initialize managers
    activityManager = new ActivityManager();
    soundManager = new SoundManager();
    uiManager = new UIManager();
    
    // Initialize background noise array for grain effect
    backgroundNoise = [];
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
    
    // Clear and render background
    background(15, 20, 25);
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
        rect(0, 0, CANVAS_WIDTH, POND_HEIGHT);
    }
}

// ============================================================================
// INPUT HANDLING
// ============================================================================

function mousePressed() {
    // Check UI button clicks
    const action = uiManager.handleClick(mouseX, mouseY);
    
    if (action && activityManager.shouldSpawnRipples()) {
        // Update quadrant position
        uiManager.updateQuadrantPosition(action);
        
        // Get spawn point based on action quadrant
        const spawn = getSpawnPoint(action);
        
        // Create ripple
        const ripple = new Ripple(spawn.x, spawn.y, action, millis());
        ripples.push(ripple);
        
        // Add activity
        activityManager.addActivity(action);
        
        // Play sound
        soundManager.playActionSound(action);
    }
}

// Keyboard input (for testing and future hardware integration)
function keyPressed() {
    // Toggle debug overlay
    if (key === 'd' || key === 'D') {
        showDebug = !showDebug;
    }
    
    // Toggle fullscreen
    if (key === 'f' || key === 'F') {
        toggleFullscreen();
    }
    
    // Simulate button presses with keys 1-4
    if (key === '1' && activityManager.shouldSpawnRipples()) {
        const action = ACTIONS.LIKE;
        uiManager.updateQuadrantPosition(action);
        const spawn = getSpawnPoint(action);
        const ripple = new Ripple(spawn.x, spawn.y, action, millis());
        ripples.push(ripple);
        activityManager.addActivity(action);
        soundManager.playActionSound(action);
    }
    if (key === '2' && activityManager.shouldSpawnRipples()) {
        const action = ACTIONS.DISLIKE;
        uiManager.updateQuadrantPosition(action);
        const spawn = getSpawnPoint(action);
        const ripple = new Ripple(spawn.x, spawn.y, action, millis());
        ripples.push(ripple);
        activityManager.addActivity(action);
        soundManager.playActionSound(action);
    }
    if (key === '3' && activityManager.shouldSpawnRipples()) {
        const action = ACTIONS.POSITIVE_COMMENT;
        uiManager.updateQuadrantPosition(action);
        const spawn = getSpawnPoint(action);
        const ripple = new Ripple(spawn.x, spawn.y, action, millis());
        ripples.push(ripple);
        activityManager.addActivity(action);
        soundManager.playActionSound(action);
    }
    if (key === '4' && activityManager.shouldSpawnRipples()) {
        const action = ACTIONS.NEGATIVE_COMMENT;
        uiManager.updateQuadrantPosition(action);
        const spawn = getSpawnPoint(action);
        const ripple = new Ripple(spawn.x, spawn.y, action, millis());
        ripples.push(ripple);
        activityManager.addActivity(action);
        soundManager.playActionSound(action);
    }
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
