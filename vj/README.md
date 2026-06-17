# Diptych

A browser-based VJ instrument — mix two layers (A / B) of generative visuals.
No build step to *run* it; it's plain HTML/Canvas/WebGL.

- `index.html` — landing page (`/vj/`)
- `vj-control.html` — the control UI
- `vj-output.html` — full-screen output (also embedded as the live preview)
- `works/*.html` — self-contained visual "works" (the clips you mix)
- `works/thumbs/*.png` — generated library thumbnails
- `works/works-list.js` — generated list of works (`window.VJ_WORKS`)

## Adding / editing a work

1. `cp works/_template.html works/your-work.html`
2. Edit the `vj-layer-protocol` JSON (controls, each with a `default`) and `draw()`.
   Control keys are arbitrary; only a control keyed `bpm` opts the layer into
   Shared BPM / Tap Tempo.
3. Commit. The pre-commit hook regenerates the list and thumbnail automatically.

## Build scripts

- `node vj/build-works.js` — regenerates `works/works-list.js` from `works/`.
- `node vj/build-thumbs.js` — renders each work to `works/thumbs/<name>.png`.
  - **Requires Google Chrome / Chromium** (headless screenshots).
  - Found via `$CHROME_PATH`, then common install paths, then `PATH`.
    If none is found it skips (never blocks a commit).
  - Incremental by default (only new/changed works, removes deleted ones).
    Force everything with `node vj/build-thumbs.js --all`.

Both run from a git **pre-commit hook**. Enable it once per clone:

```
git config core.hooksPath .githooks
```

(Without Chrome, thumbnails just aren't (re)generated — everything else works.)
