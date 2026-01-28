# Digital Ripples - Interactive Installation

An interactive p5.js installation featuring a "digital pond" that responds to user input through ripples, sound, and visual effects.

## Features

- **4 Input Actions**: Like, Dislike, Positive Comment, Negative Comment
- **4 Distinct Ripple Styles**: Each action creates unique visual ripple effects
- **Activity Meter**: Tracks interaction intensity with state machine (CALM → ACTIVE → OVERLOAD → RECOVER)
- **Synthesized Sound Effects**: Procedurally generated audio using p5.sound
- **Coordinate Plane Mapping**: Actions mapped to quadrants (Happy/Sad, Noise/Silence)
- **Touchscreen-Friendly UI**: Large buttons with visual feedback
- **Debug Mode**: Toggle with 'D' key to view activity meter and quadrant indicator

## Quick Start

1. Open `index.html` in a web browser
2. Click buttons or use keys 1-4 to trigger actions
3. Press 'D' to toggle debug mode
4. Press 'F' to toggle fullscreen

## Development

### Running Locally

Start a local server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

### Git Setup for Shared Computers

When working on a shared/public computer, use temporary credential caching to avoid storing credentials permanently:

```bash
git config credential.helper 'cache --timeout=3600'
git push origin main
```

This stores credentials in memory for 1 hour only, then automatically clears them.

## Controls

- **Mouse/Touch**: Click buttons to trigger actions
- **Keyboard**: 
  - `1` - Like (Happy)
  - `2` - Dislike (Sad)
  - `3` - Positive Comment (Noise)
  - `4` - Negative Comment (Silence)
  - `D` - Toggle debug mode
  - `F` - Toggle fullscreen

## Project Structure

- `index.html` - Main HTML file with p5.js libraries
- `sketch.js` - Main p5.js sketch with all functionality
- `planning.md` - Project planning document (do not edit without permission)

## License

See LICENSE file for details.
