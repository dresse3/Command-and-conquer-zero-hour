import { Game } from "./game";
import { Renderer } from "./renderer";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const loading = document.getElementById("loading");

function resizeCanvas(game?: Game) {
  // Canvas backing store == CSS size (1:1). Mouse and world math all share
  // one coordinate space, which keeps input/selection dead simple.
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (game) game.resize(canvas.width, canvas.height);
}

resizeCanvas();

const game = new Game(canvas);
const renderer = new Renderer(canvas);

// Dev-only inspection handle (stripped from production builds).
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;

window.addEventListener("resize", () => resizeCanvas(game));

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
