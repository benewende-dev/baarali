// BAARALI(13/10/2026): one bundled, offline editor serves Electron and the
// native WebView. Its bridge carries only a declarative CAD request; the
// authenticated host calls the engine, never the iframe or a workspace page.
export function cadEditorPage(t: (key: string) => string, scheme: 'light' | 'dark' | 'system' = 'system'): string {
  const words = Object.fromEntries([
    '3D modeler','Shapes','Operation','Box','Cylinder','Sphere','Add material','Cut material','Dimensions','Position','Rotation','Width','Depth','Height','Radius','Rounded edges','Name','Duplicate','Delete','Undo','Redo','Reset view','Project title','Caption','Create a variant','Calculating the model…','Draft preview','Drag to rotate. Pinch or scroll to zoom.','The previous variant remains available.','The first shape must add material.','Check the dimensions and operations.','Unable to calculate the model. Your changes are preserved.','Model ready','Numeric parameters','This model is edited through its parameters.','New 3D model','Duration','Format','Close','No editable parameters. Ask the agent to expose dimensions.','The 3D preview requires WebGL.'
  ].map(key => [key, t(key)]));
  return `<!doctype html><html data-theme="${scheme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  :root{color-scheme:light dark;--bg:#f7f8fa;--panel:#fff;--ink:#101522;--muted:#697384;--line:#dce1e8;--accent:#196bff}
  @media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0c1018;--panel:#151b26;--ink:#f1f5fc;--muted:#a3afc3;--line:#30394a;--accent:#4d8dff}}
  :root[data-theme=dark]{color-scheme:dark;--bg:#0c1018;--panel:#151b26;--ink:#f1f5fc;--muted:#a3afc3;--line:#30394a;--accent:#4d8dff}:root[data-theme=light]{color-scheme:light}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px -apple-system,BlinkMacSystemFont,Arial,sans-serif}button,input,select{font:inherit}button{cursor:pointer;min-height:40px;border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:var(--panel);color:var(--ink)}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.main{background:var(--accent);color:#fff;border:0;font-weight:600}.toolbar{display:flex;align-items:center;gap:8px;padding:12px 18px;border-bottom:1px solid var(--line)}.toolbar strong{flex:1;font-size:18px}.layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;height:calc(100vh - 65px)}.viewport{position:relative;min-width:0;min-height:240px;overflow:hidden;background:radial-gradient(at 50% 45%,var(--panel),var(--bg));touch-action:none}canvas{display:block;width:100%;height:100%;touch-action:none}.hint{position:absolute;left:16px;bottom:16px;color:var(--muted);font-size:12px;pointer-events:none}.badge{position:absolute;left:16px;top:16px;color:var(--muted);font-size:12px}.tools{overflow-y:auto;padding:16px;border-left:1px solid var(--line);display:flex;flex-direction:column;gap:14px}h2{margin:0;font-size:13px;font-weight:600}.row{display:flex;gap:6px;flex-wrap:wrap}.row button{flex:1;padding:8px}.part{display:flex;gap:4px;align-items:center}.part>button:first-child{flex:1;text-align:left}.selected{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--panel))}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}label{display:flex;flex-direction:column;gap:5px;color:var(--muted);font-size:12px}input,select{width:100%;min-height:40px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);padding:8px;min-width:0}input[aria-invalid=true]{border-color:#df4b51}.wide{grid-column:1/-1}.note{font-size:12px;line-height:1.5;color:var(--muted);margin:0}.error{color:#df4b51;min-height:18px}.hide{display:none!important}
  @media(max-width:680px){.layout{grid-template-columns:1fr;height:auto}.viewport{height:38vh;min-height:230px}.tools{border-left:0;border-top:1px solid var(--line);overflow:visible;padding-bottom:24px}.toolbar{padding:10px}.toolbar strong{font-size:16px}.toolbar button{padding:6px 9px}.fields{grid-template-columns:repeat(3,minmax(0,1fr))}}
  </style></head><body><header class="toolbar"><strong data-word="3D modeler"></strong><button id="undo" data-word="Undo"></button><button id="redo" data-word="Redo"></button><button id="close" data-word="Close"></button></header><main class="layout"><section class="viewport"><canvas id="view" aria-label="3D"></canvas><span id="badge" class="badge" data-word="Draft preview"></span><span class="hint" data-word="Drag to rotate. Pinch or scroll to zoom."></span></section><aside class="tools">
  <button id="reset" data-word="Reset view"></button><div id="scene-tools"><h2 data-word="Shapes"></h2><div class="row" style="margin:8px 0"><button data-add="box" data-word="Box"></button><button data-add="cylinder" data-word="Cylinder"></button><button data-add="sphere" data-word="Sphere"></button></div><div id="parts"></div><div id="properties" style="display:flex;flex-direction:column;gap:12px;margin-top:12px"></div></div>
  <section id="parameter-tools" class="hide"><h2 data-word="Numeric parameters"></h2><p class="note" data-word="This model is edited through its parameters."></p><div id="parameters" class="fields" style="margin-top:12px"></div></section>
  <section class="fields"><label class="wide"><span data-word="Project title"></span><input id="title" maxlength="120"></label><label class="wide"><span data-word="Caption"></span><input id="caption" maxlength="240"></label><label><span data-word="Format"></span><select id="format"><option>9:16</option><option>1:1</option><option>4:5</option><option>16:9</option></select></label><label><span data-word="Duration"></span><input id="duration" type="number" min="4" max="60" step="1" value="8"></label></section>
  <p class="note" data-word="The previous variant remains available."></p><p id="error" role="alert" class="note error"></p><button id="apply" class="main" data-word="Create a variant"></button></aside></main><script>
  const W=${JSON.stringify(words).replace(/</g,'\\u003c')};
  ${CAD_EDITOR_JS}
  </script></body></html>`;
}

export const CAD_EDITOR_JS = String.raw`
(() => {
  const $ = id => document.getElementById(id), word = key => W[key] || key;
  document.querySelectorAll('[data-word]').forEach(el => el.textContent = word(el.dataset.word));
  const send = data => { const message = JSON.stringify({type:'baarali-cad',...data}); if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message); else window.parent.postMessage(JSON.parse(message),'*'); };
  let state=null, selected='', history=[], future=[], busy=false, model=null, yaw=.5, pitch=.6, zoom=1;
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const defaults = (kind='box') => ({id:'p-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:'',kind,operation:'add',width:40,depth:30,height:20,radius:10,fillet:0,x:0,y:0,z:0,rx:0,ry:0,rz:0});
  const snapshot = () => { history.push(clone(state)); if(history.length>50)history.shift();future=[]; };
  const changed = () => { if(state.mode==='scene')model=null; $('badge').textContent=word('Draft preview');$('error').textContent='';render(); };
  function button(label, action) { const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;return b; }
  function field(label,value,onChange,options={}) {
    const l=document.createElement('label'), name=document.createElement('span');name.textContent=label;l.append(name);
    const input=document.createElement(options.choices?'select':'input');
    if(options.choices) options.choices.forEach(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=word(label);input.append(o);});
    else {input.type=options.text?'text':'number';if(!options.text){input.step='0.1';input.min=options.min??-2000;input.max=options.max??2000;} input.maxLength=80;}
    input.disabled=busy;input.value=String(value);input.onchange=()=>{if(busy)return;const v=options.text||options.choices?input.value:Number(input.value);if(!options.text&&!options.choices&&(!Number.isFinite(v)||!input.checkValidity())){input.setAttribute('aria-invalid','true');return;}input.removeAttribute('aria-invalid');snapshot();onChange(v);changed();};l.append(input);return l;
  }
  function group(label,keys,part,options={}) {const h=document.createElement('h2');h.textContent=word(label);$('properties').append(h);const g=document.createElement('div');g.className='fields';keys.forEach(([key,label])=>g.append(field(word(label),part[key],v=>{part[key]=v;},options)));$('properties').append(g);}
  function render() {
    if(!state)return;
    $('undo').disabled=busy||!history.length;$('redo').disabled=busy||!future.length;
    $('scene-tools').classList.toggle('hide',state.mode!=='scene');$('parameter-tools').classList.toggle('hide',state.mode==='scene');
    $('parts').replaceChildren();$('properties').replaceChildren();$('parameters').replaceChildren();
    if(state.mode==='scene') {
      state.scene.parts.forEach((part,index)=>{const row=document.createElement('div');row.className='part';const b=button(part.name||word({box:'Box',cylinder:'Cylinder',sphere:'Sphere'}[part.kind])+' '+(index+1),()=>{selected=part.id;render();});b.className=selected===part.id?'selected':'';b.setAttribute('aria-pressed',selected===part.id);row.append(b);$('parts').append(row);});
      const part=state.scene.parts.find(p=>p.id===selected)||state.scene.parts[0];selected=part.id;
      $('properties').append(field(word('Name'),part.name,v=>part.name=v,{text:true}));
      $('properties').append(field(word('Shapes'),part.kind,v=>{part.kind=v;part.fillet=0;},{choices:[['box','Box'],['cylinder','Cylinder'],['sphere','Sphere']]}));
      $('properties').append(field(word('Operation'),part.operation,v=>part.operation=v,{choices:[['add','Add material'],['cut','Cut material']]}));
      group('Dimensions',part.kind==='box'?[['width','Width'],['depth','Depth'],['height','Height'],['fillet','Rounded edges']]:part.kind==='cylinder'?[['radius','Radius'],['height','Height'],['fillet','Rounded edges']]:[['radius','Radius']],part,{min:0,max:1000});
      group('Position',[['x','X · mm'],['y','Y · mm'],['z','Z · mm']],part);
      group('Rotation',[['rx','X · °'],['ry','Y · °'],['rz','Z · °']],part,{min:-360,max:360});
      const row=document.createElement('div');row.className='row';row.append(button(word('Duplicate'),()=>{if(busy||state.scene.parts.length>=16)return;snapshot();const p={...clone(part),id:defaults().id,x:part.x+10,operation:'add'};state.scene.parts.push(p);selected=p.id;changed();}),button(word('Delete'),()=>{if(busy||state.scene.parts.length===1)return;snapshot();state.scene.parts=state.scene.parts.filter(p=>p.id!==selected);state.scene.parts[0].operation='add';selected=state.scene.parts[0].id;changed();}));$('properties').append(row);
    } else {
      const entries=Object.entries(state.parameters||{}).filter(([,v])=>typeof v==='number'||typeof v==='string'||typeof v==='boolean');
      entries.forEach(([key,value])=>$('parameters').append(field(key,value,v=>state.parameters[key]=typeof value==='boolean'?v==='true':v,typeof value==='boolean'?{choices:[['true','true'],['false','false']]}:{text:typeof value==='string',min:-1e6,max:1e6})));
      if(!entries.length){$('parameters').textContent=word('No editable parameters. Ask the agent to expose dimensions.');}
    }
    draw();
  }
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{if(busy||!state||state.mode!=='scene'||state.scene.parts.length>=16)return;snapshot();const p=defaults(b.dataset.add);p.x=state.scene.parts.length*10;state.scene.parts.push(p);selected=p.id;changed();});
  $('undo').onclick=()=>{if(!history.length||busy)return;future.push(clone(state));state=history.pop();changed();};
  $('redo').onclick=()=>{if(!future.length||busy)return;history.push(clone(state));state=future.pop();changed();};
  $('reset').onclick=()=>{yaw=.5;pitch=.6;zoom=1;draw();};$('close').onclick=()=>{if(!busy)send({action:'close'});};
  $('apply').onclick=()=>{
    if(busy||!state)return;
    if(state.mode==='scene' && state.scene.parts[0].operation!=='add'){$('error').textContent=word('The first shape must add material.');return;}
    const title=$('title').value.trim(),duration=Number($('duration').value);
    if(!title||!Number.isFinite(duration)||duration<4||duration>60){$('error').textContent=word('Check the dimensions and operations.');return;}
    busy=true;$('apply').disabled=true;$('close').disabled=true;$('apply').textContent=word('Calculating the model…');
    render();document.querySelectorAll('input,select,[data-add],#properties button').forEach(el=>el.disabled=true);
    send({action:'apply',mode:state.mode,project:state.project,scene:state.scene,parameters:state.parameters,title,caption:$('caption').value,format:$('format').value,duration});
  };
  window.__cadEditor={theme(scheme){document.documentElement.dataset.theme=scheme==='dark'?'dark':'light';},init(data){state=clone(data);state.mode=state.mode||'scene';state.scene=state.scene||{version:1,parts:[defaults()]};selected=state.scene.parts[0].id;model=state.mesh||null;$('title').value=state.title||word('New 3D model');$('caption').value=state.caption||'';$('format').value=state.format||'1:1';$('duration').value=state.duration||8;const readonly=state.mode!=='scene';['title','caption','format','duration'].forEach(id=>$(id).disabled=readonly);render();},error(message){busy=false;$('apply').disabled=false;$('close').disabled=false;$('apply').textContent=word('Create a variant');document.querySelectorAll('input,select,[data-add],#properties button').forEach(el=>el.disabled=false);if(state.mode!=='scene')['title','caption','format','duration'].forEach(id=>$(id).disabled=true);$('error').textContent=word('Unable to calculate the model. Your changes are preserved.');render();}};
  window.addEventListener('message',e=>{if(e.source!==window.parent)return;const m=e.data;if(m&&m.type==='baarali-cad-theme')window.__cadEditor.theme(m.scheme);if(m&&m.type==='baarali-cad-init')window.__cadEditor.init(m.data);if(m&&m.type==='baarali-cad-error')window.__cadEditor.error(m.message);});
  const canvas=$('view'),gl=canvas.getContext('webgl',{alpha:true,antialias:true});
  if(!gl){$('error').textContent=word('The 3D preview requires WebGL.');$('apply').disabled=true;send({action:'ready'});return;}
  const shader=(type,text)=>{const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec3 n;attribute vec4 color;uniform vec2 angle;uniform vec2 scale;varying vec4 c;void main(){float ca=cos(angle.x),sa=sin(angle.x),cp=cos(angle.y),sp=sin(angle.y);vec3 q=vec3(p.x*ca-p.y*sa,p.x*sa+p.y*ca,p.z);vec3 nn=vec3(n.x*ca-n.y*sa,n.x*sa+n.y*ca,n.z);nn=vec3(nn.x,nn.y*cp-nn.z*sp,nn.y*sp+nn.z*cp);float l=.4+.6*max(0.,dot(normalize(nn),normalize(vec3(.25,-.45,.86))));c=vec4(color.rgb*l,color.a);gl_Position=vec4(q.x*scale.x,-(q.y*cp-q.z*sp)*scale.y,-(q.y*sp+q.z*cp)*.18,1.);}'));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec4 c;void main(){gl_FragColor=c;}'));gl.linkProgram(program);gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
  const buffers={};['p','n','color'].forEach(key=>{buffers[key]=gl.createBuffer();gl.enableVertexAttribArray(gl.getAttribLocation(program,key));});
  function geometry(part){
    const vertices=[],triangles=[];const add=(a,b,c)=>triangles.push([a,b,c]);
    if(part.kind==='box') {const w=part.width/2,d=part.depth/2,h=part.height/2;vertices.push([-w,-d,-h],[w,-d,-h],[w,d,-h],[-w,d,-h],[-w,-d,h],[w,-d,h],[w,d,h],[-w,d,h]);[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].forEach(t=>triangles.push(t));}
    else if(part.kind==='cylinder'){const N=32;vertices.push([0,0,-part.height/2],[0,0,part.height/2]);for(let i=0;i<N;i++){const a=i/N*2*Math.PI;vertices.push([part.radius*Math.cos(a),part.radius*Math.sin(a),-part.height/2],[part.radius*Math.cos(a),part.radius*Math.sin(a),part.height/2]);}for(let i=0;i<N;i++){const a=2+i*2,b=2+((i+1)%N)*2;add(0,b,a);add(1,a+1,b+1);add(a,b,b+1);add(a,b+1,a+1);}}
    else {const U=32,V=16;for(let j=0;j<=V;j++)for(let i=0;i<=U;i++){const a=i/U*2*Math.PI,b=j/V*Math.PI;vertices.push([part.radius*Math.sin(b)*Math.cos(a),part.radius*Math.sin(b)*Math.sin(a),part.radius*Math.cos(b)]);}for(let j=0;j<V;j++)for(let i=0;i<U;i++){const a=j*(U+1)+i,b=a+U+1;add(a,b,a+1);add(a+1,b,b+1);}}
    const rotate=(v,axis,a)=>{const c=Math.cos(a),s=Math.sin(a),[x,y,z]=v;return axis===0?[x,y*c-z*s,y*s+z*c]:axis===1?[x*c+z*s,y,-x*s+z*c]:[x*c-y*s,x*s+y*c,z];};
    return {vertices:vertices.map(v=>{['rx','ry','rz'].forEach((key,i)=>v=rotate(v,i,part[key]*Math.PI/180));return [v[0]+part.x,v[1]+part.y,v[2]+part.z];}),triangles};
  }
  function draw(){
    if(!state||!gl)return;
    const pieces=model?[{mesh:model,color:[.2,.48,1,1]}]:state.mode==='scene'?state.scene.parts.map(p=>({mesh:geometry(p),color:p.operation==='cut'?[1,.25,.3,.6]:p.id===selected?[.2,.48,1,1]:[.65,.71,.8,1]})):[];
    const points=pieces.flatMap(p=>p.mesh.vertices);if(!points.length)return;
    const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];points.forEach(v=>v.forEach((n,i)=>{low[i]=Math.min(low[i],n);high[i]=Math.max(high[i],n);}));const center=low.map((n,i)=>(n+high[i])/2),radius=points.reduce((r,v)=>Math.max(r,Math.hypot(...v.map((n,i)=>n-center[i]))),1),positions=[],normals=[],colors=[];
    pieces.forEach(({mesh,color})=>mesh.triangles.forEach(ids=>{const p=ids.map(i=>mesh.vertices[i]),a=p[1].map((n,i)=>n-p[0][i]),b=p[2].map((n,i)=>n-p[0][i]),normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...normal)||1;p.forEach(v=>{positions.push(...v.map((n,i)=>(n-center[i])/radius));normals.push(...normal.map(n=>n/length));colors.push(...color);});}));
    const dpr=Math.min(window.devicePixelRatio||1,2),rect=canvas.getBoundingClientRect();canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);[['p',positions,3],['n',normals,3],['color',colors,4]].forEach(([key,data,size])=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffers[key]);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);gl.vertexAttribPointer(gl.getAttribLocation(program,key),size,gl.FLOAT,false,0,0);});gl.uniform2f(gl.getUniformLocation(program,'angle'),yaw,pitch);const scale=.85*zoom*Math.min(canvas.width,canvas.height);gl.uniform2f(gl.getUniformLocation(program,'scale'),scale/canvas.width,scale/canvas.height);gl.drawArrays(gl.TRIANGLES,0,positions.length/3);
  }
  const pointers=new Map();let distance=0;
  canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);distance=0;};
  canvas.onpointermove=e=>{if(!pointers.has(e.pointerId))return;const prev=pointers.get(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===1){yaw+=(e.clientX-prev[0])*.009;pitch=Math.max(-1.4,Math.min(1.4,pitch+(e.clientY-prev[1])*.009));}else{const p=[...pointers.values()];const d=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);if(distance>0)zoom=Math.max(.4,Math.min(4,zoom*d/distance));distance=d;}draw();};
  canvas.onpointerup=canvas.onpointercancel=e=>{pointers.delete(e.pointerId);distance=0;};canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.4,Math.min(4,zoom*Math.exp(-e.deltaY*.001)));draw();};new ResizeObserver(draw).observe(canvas);
  send({action:'ready'});
})();
`;
