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

1. Open `index.html` in a web browser (defaults to **display** / projector layout: full pond, no on-screen buttons — use `controller.html` over `npm start`, or keys **1–4** to test).
2. For the **classic single-page** layout (buttons + pond), open `index.html?mode=combined`
3. Press `D` to toggle debug activity meter (quadrant chart remains)
4. Press `F` for fullscreen

## Development

### Running Locally

**Option A — simple static server (single screen, buttons on same page):**

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` (defaults to **display** — use `http://localhost:8000/index.html?mode=combined` if you want buttons on the same page).

**Option B — tablet + monitor on the same WiFi (buttons on tablet, video on PC):**

1. On the **computer** connected to the monitor, install once: `npm install`
2. Start: `npm start` (listens on `0.0.0.0`, default port **8080**; override with `PORT=9000 npm start`)
3. Find this machine’s **LAN IP** (e.g. System Settings → Network, or `ipconfig` / `ifconfig`).
4. **Monitor / projector browser:** open `http://<LAN-IP>:8080/` or `index.html` — it defaults to **display** (`?mode=display`). For a one-machine preview with buttons + pond, use `index.html?mode=combined`.
5. **Tablet browser:** open `http://<LAN-IP>:8080/controller.html` on the same Wi‑Fi.

The tablet sends button taps over **WebSocket** to the PC; audio and video play on the display machine. Allow the port through the OS firewall if connections fail.

### Git Setup for Shared Computers

When working on a shared/public computer, use temporary credential caching to avoid storing credentials permanently:

```bash
git config credential.helper 'cache --timeout=3600'
git push origin main
```

This stores credentials in memory for 1 hour only, then automatically clears them.

## Controls

- **Mouse/Touch (combined mode only)**: Click on-screen buttons (`?mode=combined`) to trigger actions
- **Keyboard** (display and combined):
  - `1` - Like (Happy)
  - `2` - Dislike (Sad)
  - `3` - Positive Comment (Noise)
  - `4` - Negative Comment (Silence)
  - `D` - Toggle debug mode
  - `F` - Toggle fullscreen

## Project Structure

- `index.html` - p5 entry; **defaults to display** (query `mode=display` added if absent). Use **`?mode=combined`** for buttons on the same screen.
- `controller.html` - Tablet-only control surface (use with `npm start`)
- `sketch.js` - Main p5.js sketch with all functionality
- `server.mjs` - Local HTTP + WebSocket relay for dual-display use
- `package.json` - Node dependency (`ws`) for the relay server
- `planning.md` - Project planning document (do not edit without permission)

## License

See LICENSE file for details.
