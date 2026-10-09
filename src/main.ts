// SPDX-License-Identifier: GPL-2.0-or-later
import { loadAssets } from './assets';
import { formatBootError } from './boot-error';
import { createCtx } from './ctx';
import { DATA_URL, fetchArchive } from './data/archive';
import { runGame } from './game';
import { BrowserClock } from './platform/clock';
import { attachDomInput } from './platform/dom-input';
import { CanvasPresenter } from './video/presenter';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;

function waitForStartGesture(): Promise<void> {
  overlay.textContent = 'OpenTyrian2000\n\nClick or press any key to start';
  return new Promise((resolve) => {
    const go = (e: Event) => {
      e.preventDefault();
      window.removeEventListener('keydown', go);
      window.removeEventListener('pointerdown', go);
      resolve();
    };
    window.addEventListener('keydown', go);
    window.addEventListener('pointerdown', go);
  });
}

async function boot(): Promise<void> {
  overlay.textContent = 'Loading game data…';
  const archive = await fetchArchive(DATA_URL, (loaded, total) => {
    overlay.textContent = total ? `Loading game data… ${Math.round((loaded / total) * 100)}%` : 'Loading game data…';
  });
  const assets = loadAssets(archive);
  await waitForStartGesture();
  overlay.hidden = true;
  canvas.focus();
  const ctx = createCtx({ assets, clock: new BrowserClock(), presenter: new CanvasPresenter(canvas) });
  attachDomInput({
    target: window,
    canvas,
    input: ctx.input,
    onToggleFullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    },
  });
  await runGame(ctx);
}

boot().catch((err: unknown) => {
  console.error(err);
  overlay.hidden = false;
  overlay.textContent = formatBootError(err);
});
