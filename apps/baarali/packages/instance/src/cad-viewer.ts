import { KIT_JS } from './motion-kit.js';
import type { BrandKit } from './motion-templates.js';
export interface CadMesh { vertices: number[][]; triangles: number[][] }

// BAARALI(13/10/2026): synchronous projection makes a CAD turntable seekable
// at the exact HyperFrames time, including backwards seeks and video capture.
// The official player owns playback; the composition needs no private timer.
export const CAD_VIEWER_JS = String.raw`
(function () {
  var canvas = document.getElementById('cad-stage');
  var gl = canvas.getContext('webgl', {alpha:true, antialias:true, preserveDrawingBuffer:true});
  if(!gl) throw new Error('The 3D preview requires WebGL.');
  var mesh = JSON.parse(document.getElementById('cad-mesh').textContent);
  var root = document.querySelector('[data-composition-id]');
  var duration = Number(root.getAttribute('data-duration'));
  var rgb = root.getAttribute('data-cad-color').match(/\w\w/g).map(function (s) { return parseInt(s, 16); });
  var lower = [Infinity, Infinity, Infinity], upper = [-Infinity, -Infinity, -Infinity];
  mesh.vertices.forEach(function (v) { v.forEach(function (n, i) { lower[i] = Math.min(lower[i], n); upper[i] = Math.max(upper[i], n); }); });
  var center = lower.map(function (n, i) { return (n + upper[i]) / 2; });
  var radius = mesh.vertices.reduce(function (best,v) { return Math.max(best,Math.hypot(v[0]-center[0], v[1]-center[1], v[2]-center[2])); }, 1);
  function shader(type, source) {
    var s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec3 position; attribute vec3 normal; uniform float angle; uniform vec2 scale; varying float light; void main(){float ca=cos(angle),sa=sin(angle),cp=cos(1.02),sp=sin(1.02); vec3 p=vec3(position.x*ca-position.y*sa,position.x*sa+position.y*ca,position.z); vec3 n=vec3(normal.x*ca-normal.y*sa,normal.x*sa+normal.y*ca,normal.z); n=vec3(n.x,n.y*cp-n.z*sp,n.y*sp+n.z*cp); light=.42+.58*max(0.,dot(normalize(n),normalize(vec3(.25,-.45,.86)))); gl_Position=vec4(p.x*scale.x,-(p.y*cp-p.z*sp)*scale.y,-(p.y*sp+p.z*cp)*.5,1.);}'));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, 'precision mediump float; uniform vec3 color; varying float light; void main(){gl_FragColor=vec4(color*light,1.);}'));
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  var positions = [], normals = [];
  mesh.triangles.forEach(function (ids) {
    var p = ids.map(function (i) { return mesh.vertices[i]; });
    var a = p[1].map(function (n,i) { return n-p[0][i]; }), b = p[2].map(function (n,i) { return n-p[0][i]; });
    var n = [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    var length = Math.hypot.apply(null,n) || 1;
    p.forEach(function (v) { for(var i=0;i<3;i++){positions.push((v[i]-center[i])/radius);normals.push(n[i]/length);} });
  });
  function buffer(name, values) {
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);
    var location = gl.getAttribLocation(program,name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,3,gl.FLOAT,false,0,0);
  }
  buffer('position',positions); buffer('normal',normals);
  var angleLocation = gl.getUniformLocation(program,'angle');
  gl.uniform2f(gl.getUniformLocation(program,'scale'),.86*Math.min(canvas.width,canvas.height)/canvas.width,.86*Math.min(canvas.width,canvas.height)/canvas.height);
  gl.uniform3f(gl.getUniformLocation(program,'color'),rgb[0]/255,rgb[1]/255,rgb[2]/255);
  gl.enable(gl.DEPTH_TEST); gl.clearColor(0,0,0,0); gl.viewport(0,0,canvas.width,canvas.height);
  var current = 0, rate = 1, playing = false, last = 0;
  function clock() { return (document.timeline && document.timeline.currentTime) || 0; }
  function draw(t) {
    var angle = Math.min(1, Math.max(0, t / Math.max(1, duration - 2))) * Math.PI * 2;
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(angleLocation,angle);
    gl.drawArrays(gl.TRIANGLES,0,positions.length/3);
  }
  function seek(t) {
    current = Math.min(duration, Math.max(0, Number(t) || 0));
    document.getAnimations().forEach(function (a) { a.pause(); a.currentTime = current*1000; });
    draw(current);
    last = clock();
    return timeline;
  }
  function time() {
    if(playing) { seek(current+(clock()-last)/1000*rate); if(current >= duration) playing = false; }
    return current;
  }
  function pause() { time(); playing = false; return timeline; }
  var timeline = {
    duration:function () { return duration; }, totalDuration:function () { return duration; },
    time:function (t) { return t === undefined ? time() : seek(t); }, totalTime:function (t) { return t === undefined ? time() : seek(t); },
    seek:seek, play:function () { last = clock(); playing = true; return timeline; }, pause:pause,
    timeScale:function (n) { if(n !== undefined && Number.isFinite(n) && n > 0) { time(); rate = n; } return rate; },
    getChildren:function () { return []; }, paused:function () { return !playing; }
  };
  window.__timelines = {main:timeline};
  seek(0);
  window.__renderReady = true;
})();
`;

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function cadComposition(input: { mesh: CadMesh; title: string; caption: string; width: number; height: number; duration: number; brand: BrandKit }): string {
  const { mesh, title, caption, width, height, duration, brand } = input;
  const safeColor = (color: string, fallback: string) => /^#[a-f0-9]{6}$/i.test(color) ? color : fallback;
  const bg = safeColor(brand.colors.background, '#0b1220');
  const ink = safeColor(brand.colors.ink, '#ffffff');
  const accent = safeColor(brand.colors.accent, '#2b7cff');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>
html,body{margin:0}*{box-sizing:border-box}#root{position:relative;width:${width}px;height:${height}px;overflow:hidden;container-type:size;background:${bg};color:${ink};font-family:Arial,sans-serif}.brand{position:absolute;left:8%;top:6%;font-size:2.7cqmin;font-weight:600;letter-spacing:.04em}h1{position:absolute;top:11%;left:8%;right:8%;margin:0;font-size:6cqmin;line-height:1.1;letter-spacing:-.04em}canvas{position:absolute;top:24%;left:8%;width:84%;height:58%}.caption{position:absolute;left:8%;right:8%;bottom:8%;font-size:3cqmin;line-height:1.45;opacity:.8}
</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${width}" data-height="${height}" data-cad-color="${accent.slice(1)}">
<section id="cad-product" class="clip scene" data-start="0" data-duration="${duration}" data-track-index="0"><div class="brand">${escape(brand.name)}</div><h1>${escape(title)}</h1><canvas id="cad-stage" width="${Math.round(width*.84)}" height="${Math.round(height*.58)}"></canvas><div class="caption">${escape(caption)}</div></section>
</div><script id="cad-mesh" type="application/json">${JSON.stringify(mesh)}</script><script>${KIT_JS}
hf('h1',[{opacity:0,transform:'translateY(3cqh)'},{opacity:1,transform:'none'}],{at:0,d:.7,ease:'apple'});
hf('.caption',[{opacity:0},{opacity:.8}],{at:.4,d:.7});
${CAD_VIEWER_JS}</script></body></html>`;
}
