import { logoTileLive } from './logo.js';

// BAARALI(12/10/2026): the approved monochrome B replaces the login mascot.
// Keep window.duo for the existing authentication guidance; the shared logo
// clock owns motion and pauses it offscreen, in the background or for reduction.
export function duoStage(): string {
  return `<div class="duo-stage">
  <div class="bubble l" id="say1" aria-live="polite"></div>
  <div class="bubble r" id="say2" hidden></div>
  <div class="duo">${logoTileLive(160)}</div>
</div>`;
}

export const DUO_CSS = `
.duo-stage { position:relative; height:220px; margin:0 -10px; }
.duo { position:absolute; left:50%; bottom:2px; transform:translateX(-50%); width:160px; height:160px; color:var(--ink); }
.bubble { position:absolute; left:0; right:0; top:0; margin:0 auto; width:max-content; max-width:100%; background:var(--card); border:1px solid var(--line); color:var(--ink); font-size:13px; line-height:1.35; padding:8px 12px; border-radius:12px; border-bottom-left-radius:4px; opacity:0; transform:translateY(6px); transition:opacity .2s,transform .2s; pointer-events:none; text-align:center; }
.bubble.on { opacity:1; transform:none; }
.bubble.r { display:none; }
.bubble.err { color:var(--error); }
@media (prefers-reduced-motion:reduce) { .bubble { transition:none; transform:none; } }
`;

export const DUO_JS = `
(() => {
  const stage=document.querySelector('.duo-stage');
  if(!stage) return;
  const one=stage.querySelector('#say1');
  function say(a,b,opts) {
    const text=b||a;
    one.classList.toggle('err',Boolean(opts&&opts.err));
    one.classList.toggle('on',Boolean(text));
    one.textContent=text||'';
  }
  window.duo={say,act(){},shut(){},watch(){},wait(on){stage.setAttribute('aria-busy',String(on));}};
})();
`;
