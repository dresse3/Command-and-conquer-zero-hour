import { Game } from "./game";
import { Renderer } from "./renderer";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const loading = document.getElementById("loading");
const insTop = document.getElementById("ins-top");
const insBottom = document.getElementById("ins-bottom");

// Fit the canvas to the *visible* area. On iOS Safari the visual viewport
// excludes the browser toolbars, and safe-area insets keep the HUD clear of
// the notch / home indicator (especially when added to the Home Screen).
function resizeCanvas(game?: Game) {
  const vv = window.visualViewport;
  const vw = Math.round(vv?.width ?? window.innerWidth);
  const vh = Math.round(vv?.height ?? window.innerHeight);
  const top = insTop?.offsetHeight ?? 0;
  const bottom = insBottom?.offsetHeight ?? 0;
  const w = vw;
  const h = Math.max(200, vh - top - bottom);
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.style.top = top + "px";
  if (game) game.resize(w, h);
}

resizeCanvas();

const game = new Game(canvas);
const renderer = new Renderer(canvas);

// Dev-only inspection handle (stripped from production builds).
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;

const onResize = () => resizeCanvas(game);
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", onResize);
window.visualViewport?.addEventListener("resize", onResize);
window.visualViewport?.addEventListener("scroll", onResize);
// Safari settles its toolbars a beat after load / rotation
setTimeout(onResize, 300);

if (loading) loading.remove();

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  renderer.draw(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
