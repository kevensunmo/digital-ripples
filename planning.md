# Digital Ripples - Interactive Installation Planning Document

> **⚠️ IMPORTANT: This document must not be edited without express permission from the project owner.**

## Project Overview
Build a p5.js project for an interactive installation.

## Requirements

### Visual Design
- **Background**: A dark, calm "digital pond" background with subtle noise/gradient.

### Input System
- **4 Buttons**: Like, Dislike, Positive Comment, Negative Comment
- For now implement them as on-screen buttons (p5 DOM) so it works without hardware
- Keep input handling abstract so later I can swap to keyboard/ESP32/websocket

### Ripple System
- Each input spawns a Ripple object with unique parameters and a short sound effect
- Multiple presses create overlapping/colliding ripple fields
- The scene becomes progressively chaotic with an "activity meter"
- When activity exceeds a threshold, transition to blackout (screen goes black) and audio mutes
- After a cooldown, slowly recover back to calm

### Coordinate Plane Mapping
- Map the 4 actions to 4 quadrants/directions:
  - **Happy** (Like)
  - **Sad** (Dislike)
  - **Noise** (Positive Comment)
  - **Silence** (Negative Comment)
- Use that mapping to change ripple style and sound

### Code Structure
- Separate files or clear sections:
  - Ripple class
  - ActivityManager
  - SoundManager
  - UI/Input

### Output
- Complete working code (index.html + sketch.js)
- Add comments

## Detailed Implementation Requirements

### Ripple Rendering Styles
Implement 4 distinct ripple rendering styles in p5.js, all circular-wave based but visually different:

1. **LIKE (happy)**: 
   - Clean concentric circles
   - Bright edge highlights
   - Smooth expansion

2. **DISLIKE (sad)**: 
   - Heavier ripples
   - Slower
   - Slightly "drooping" distortion / damping

3. **POSITIVE COMMENT (noise)**: 
   - Many small micro-ripples
   - Sparkly interference patterns

4. **NEGATIVE COMMENT (silence/mute)**: 
   - Minimal ripple that "absorbs" nearby waves (damps amplitude in a radius)

### Ripple Object Properties
Each ripple should have:
- position
- startTime
- maxRadius
- amplitude
- damping
- render() method
- update() method

### Global Ripple Management
- Keep a global list of ripples
- Remove expired ripples

### Background
- Dark pond with subtle animated grain

### Coordinate Plane Mapping Details
- The center of the screen is (0,0)
- Each action corresponds to a direction/quadrant and influences spawn position + parameters:
  - **LIKE** = +x (right) = happy
  - **DISLIKE** = -x (left) = sad
  - **POSITIVE COMMENT** = +y (up) = noise
  - **NEGATIVE COMMENT** = -y (down) = silence/mute
- When an action is triggered, choose a spawn point biased toward that direction (e.g., right half for LIKE), but still randomized
- Draw a subtle, optional debug overlay (toggle with key "D") showing axes and labels

### Activity / Overload Meter
- Increase meter on each button press (different weights per action)
- Slowly decay over time
- As meter rises:
  - Increase ripple count
  - Increase background turbulence
  - Add screen vignette and flicker
- If meter > 1.0, trigger OVERLOAD state:
  - Fade to black in 2 seconds
  - Stop spawning ripples
  - Mute or low-pass all sounds
  - Keep black for 5–10 seconds
  - Then recover: fade back, reset meter to ~0.3, return to calm state

### State Machine
Use a simple state machine:
- **CALM**
- **ACTIVE**
- **OVERLOAD**
- **RECOVER**

### Sound Effects
Add sound effects in p5.js using p5.sound WITHOUT loading external audio files:
- Use oscillators + envelopes (Env) to synthesize short "click + ripple" sounds per action:
  - **LIKE**: bright bell/pluck
  - **DISLIKE**: lower, dull thump
  - **POSITIVE COMMENT**: noisy burst (Noise oscillator) with short envelope
  - **NEGATIVE COMMENT**: very soft muted pulse
- Also add a subtle looping ambient water tone (very quiet) that becomes harsher as overload meter rises, then cuts in OVERLOAD

### Touchscreen UI
Build touchscreen-friendly on-screen buttons:
- 4 large buttons in a row (for a 18.5" touch screen)
- Each with a simple icon-like drawing (thumb up, thumb down, smile chat, blocked chat) drawn in p5 (vector shapes), not image files
- Each button has visual feedback (pressed animation)
- Provide a fullscreen mode toggle (F key) and a "kiosk mode" layout (hide debug, center canvas)
- Ensure the main canvas is separate from the UI area so it can run on a 53" TV while buttons stay on the touch screen (simulate dual-display by putting UI in a bottom panel for now)
