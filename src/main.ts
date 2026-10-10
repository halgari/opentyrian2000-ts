// SPDX-License-Identifier: GPL-2.0-or-later
import { loadAssets } from './assets';
import { formatBootError } from './boot-error';
import { createCtx } from './ctx';
import { DATA_URL, fetchArchive } from './data/archive';
import { archiveFromInline, workletDataUrlFromInline, workletUrlFromInline } from './data/inline';
import { runGame } from './game';
import { BrowserClock } from './platform/clock';
import { canvasBox } from './platform/scaling';
import { licenceNotice } from './licence';
import { fullscreenSupported, isFullscreen, toggleFullscreen as toggleFs } from './platform/fullscreen';
import { Joysticks } from './platform/gamepad';
import { attachDomInput } from './platform/dom-input';
import { attachPageLifecycle, attachSaveSync } from './game/save-sync';
import { localStorageAdapter } from './platform/storage';
import { WebAudio, createAudioContext, createAudioOrNull, type AudioDeps } from './platform/web-audio';
import { CanvasPresenter } from './video/presenter';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;

/** Browsers keep a new AudioContext suspended until the page gets a gesture: resume it on the first key or click. */
function resumeOnGesture(ac: AudioContext): void {
  const go = (): void => {
    void ac.resume().catch(() => {});
    window.removeEventListener('keydown', go, true);
    window.removeEventListener('pointerdown', go, true);
  };
  window.addEventListener('keydown', go, true);
  window.addEventListener('pointerdown', go, true);
}

/** The licence notice goes in a hidden element and the console, never over the game. */
function publishLicence(): void {
  const text = licenceNotice(__SOURCE_URL__);
  let el = document.getElementById('licence');
  if (!el) {
    el = document.createElement('div');
    el.id = 'licence';
    el.hidden = true;
    document.body.appendChild(el);
  }
  el.textContent = text;
  console.info(text);
}

/** A small, dismissable one-off notice (storage failures); the overlay is reserved for fatal errors. */
function showNotice(text: string): void {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.textContent = text;
  el.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;padding:8px 12px;background:rgba(0,0,0,.85);color:#fc6;font-size:14px;text-align:center;cursor:pointer;z-index:10';
  el.title = 'Click to dismiss';
  el.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
}

function exposeDebug(audio: WebAudio): void {
  (window as unknown as { __audio: unknown }).__audio = {
    get peak() { return audio.peak; },
    get playing() { return audio.playing; },
  };
}

async function boot(): Promise<void> {
  overlay.textContent = 'Loading game data…';
  const archive = __SINGLE__
    ? await archiveFromInline(document)
    : await fetchArchive(DATA_URL, (loaded, total) => {
      overlay.textContent = total ? `Loading game data… ${Math.round((loaded / total) * 100)}%` : 'Loading game data…';
    });
  const assets = loadAssets(archive);
  publishLicence();
  let ac = createAudioContext();
  if (ac) resumeOnGesture(ac);
  overlay.hidden = true;
  canvas.focus();
  let deps: AudioDeps = {};
  if (__SINGLE__) {
    // No ?worker&url asset exists in the single file: without a Blob URL, run silent instead of loading a missing file.
    try { deps = { workletUrl: workletUrlFromInline(document), workletFallbackUrl: workletDataUrlFromInline(document) }; } catch (err) {
      console.warn('Audio worklet unavailable, running without sound:', err);
      ac = null;
    }
  }
  const audio = await createAudioOrNull(ac, assets.music, assets.tyrianSnd, assets.voicesSnd, deps);
  audio.setVolume(191, 191); // C config default when no config file exists (volume = 191 / sample volume = 191)
  if (location.search.includes('debug') && audio instanceof WebAudio) exposeDebug(audio);
  const ctx = createCtx({
    assets, clock: new BrowserClock(), presenter: new CanvasPresenter(canvas), audio,
    storage: localStorageAdapter(undefined, () => showNotice('Saving is unavailable in this browser (private mode or storage full). Progress will be lost when the page closes.')),
  });
  if (location.search.includes('debug')) (window as unknown as { __ot?: unknown }).__ot = ctx; // the e2e smoke test reads the ship position
  ctx.input.joysticks = new Joysticks(navigator, () => ctx.clock.now());
  // The poll reads navigator.getGamepads() on every pass; the events are only logged (joystick.c prints on init).
  window.addEventListener('gamepadconnected', (e) => console.info(`gamepad connected: ${e.gamepad.id}`));
  window.addEventListener('gamepaddisconnected', (e) => console.info(`gamepad disconnected: ${e.gamepad.id}`));
  const detachLifecycle = attachPageLifecycle(window, document, ctx);
  const detachSaveSync = attachSaveSync(window, ctx);
  document.addEventListener('visibilitychange', () => {
    try {
      if (document.visibilityState === 'hidden') void ac?.suspend().catch(() => {});
      else void ac?.resume().catch(() => {});
    } catch { /* audio context already closed */ }
  });
  const toggleFullscreen = (): void => toggleFs(document);
  // Setup > Graphics: the canvas box follows the window (index.html's stylesheet is the fit-4-3 default until a mode is set)
  const applyScaling = (): void => {
    if (ctx.display.scalingMode === 'fit-4-3') { canvas.style.width = ''; canvas.style.height = ''; return; } // the stylesheet rule
    const { w, h } = canvasBox(ctx.display.scalingMode, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  };
  ctx.display.onScalingChange = applyScaling;
  // null where the API is missing or disabled (iPhone Safari): Setup shows "Off" and the row does nothing
  ctx.display.toggleFullscreen = fullscreenSupported(document) ? toggleFullscreen : null;
  ctx.display.isFullscreen = () => isFullscreen(document);
  window.addEventListener('resize', () => { if (ctx.display.scalingMode !== 'fit-4-3') applyScaling(); });
  // a devicePixelRatio change (moving between monitors, page zoom) re-runs the computation; the query is re-armed each time
  const watchDpr = (): void => {
    const mq = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq?.addEventListener('change', () => { applyScaling(); watchDpr(); }, { once: true });
  };
  watchDpr();
  const detachInput = attachDomInput({
    target: window,
    canvas,
    input: ctx.input,
    isBoundKey: (sc) => {
      const c = ctx.game.config;
      return c.sharedKeyboard && (c.keySettings.includes(sc) || c.keySettings2.includes(sc));
    },
    onToggleFullscreen: toggleFullscreen,
  });
  try {
    await runGame(ctx);
  } catch (err) {
    // leave the page quiet behind the error overlay: no pointer lock, no sound, no queue growing with nobody to drain it
    detachInput();
    detachLifecycle();
    detachSaveSync();
    try { document.exitPointerLock(); } catch { /* not locked */ }
    try { audio.stopSong(); } catch { /* ignore */ }
    void ac?.suspend().catch(() => {});
    throw err;
  }
}

boot().catch((err: unknown) => {
  console.error(err);
  overlay.hidden = false;
  overlay.textContent = formatBootError(err);
});
