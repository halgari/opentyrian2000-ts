// SPDX-License-Identifier: GPL-2.0-or-later
import { loadAssets } from './assets';
import { formatBootError } from './boot-error';
import { createCtx } from './ctx';
import { DATA_URL, fetchArchive } from './data/archive';
import { runGame } from './game';
import { BrowserClock } from './platform/clock';
import { attachDomInput } from './platform/dom-input';
import { localStorageAdapter } from './platform/storage';
import { WebAudio, createAudioContext, createAudioOrNull } from './platform/web-audio';
import { CanvasPresenter } from './video/presenter';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;

function waitForStartGesture(): Promise<AudioContext | null> {
  overlay.textContent = 'OpenTyrian2000\n\nClick or press any key to start';
  return new Promise((resolve) => {
    const go = (e: Event) => {
      e.preventDefault();
      // Created synchronously inside the gesture so the browser lets it start.
      const ac = createAudioContext();
      window.removeEventListener('keydown', go);
      window.removeEventListener('pointerdown', go);
      resolve(ac);
    };
    window.addEventListener('keydown', go);
    window.addEventListener('pointerdown', go);
  });
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
  const archive = await fetchArchive(DATA_URL, (loaded, total) => {
    overlay.textContent = total ? `Loading game data… ${Math.round((loaded / total) * 100)}%` : 'Loading game data…';
  });
  const assets = loadAssets(archive);
  const ac = await waitForStartGesture();
  overlay.hidden = true;
  canvas.focus();
  const audio = await createAudioOrNull(ac, assets.music, assets.tyrianSnd, assets.voicesSnd);
  audio.setVolume(191, 191); // C config default when no config file exists (volume = 191 / sample volume = 191)
  if (location.search.includes('debug') && audio instanceof WebAudio) exposeDebug(audio);
  const ctx = createCtx({
    assets, clock: new BrowserClock(), presenter: new CanvasPresenter(canvas), audio,
    storage: localStorageAdapter(undefined, () => showNotice('Saving is unavailable in this browser (private mode or storage full). Progress will be lost when the page closes.')),
  });
  const detachInput = attachDomInput({
    target: window,
    canvas,
    input: ctx.input,
    onToggleFullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    },
  });
  try {
    await runGame(ctx);
  } catch (err) {
    // leave the page quiet behind the error overlay: no pointer lock, no sound, no queue growing with nobody to drain it
    detachInput();
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
