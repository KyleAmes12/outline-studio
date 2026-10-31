import { removeBackground } from '@imgly/background-removal';
import { traceCenterlines } from './trace.js';
import './style.css';

document.querySelector('#app').innerHTML = `
<main class="shell"><header><div class="mark">✦</div><div><div class="eyebrow">LASER PREP STUDIO</div><h1>Outline Studio</h1><p>Preserve the drawing. Remove only the background. Prepare clean engraving artwork.</p></div></header>
<div class="layout">
<section class="panel">
<div class="sectionTitle">01 / IMAGE</div>
<label class="drop" id="drop"><input type="file" id="file" accept="image/png,image/jpeg,image/webp,image/gif"><span class="uploadIcon">↥</span><b>Choose image</b><small>Tap here or drop a PNG, JPG or WebP</small></label>
<div class="muted" id="filename">No image selected</div>
<div class="sectionTitle">02 / BACKGROUND REMOVAL</div>
<p class="tip">For illustrations with a plain background, use Artwork (recommended). For busy photographic backgrounds, use AI.</p>
<div class="tabs"><button class="tab active" id="plainMode">Artwork</button><button class="tab" id="aiMode">Photograph / AI</button></div>
<label class="setting">Background tolerance <output id="toleranceValue">35</output><input type="range" id="tolerance" min="5" max="110" value="35"></label>
<button class="primary" id="process" disabled>1. Remove background & prepare lines</button>
<div class="status" id="status" role="status" aria-live="polite">Choose an image. Artwork mode removes the outside background without deleting enclosed white character details.</div>
<hr>
<div class="sectionTitle">03 / CLEANUP</div>
<p class="tip">Need to fix the selection? Paint directly over the preview. Restore brings parts back; Erase removes leftovers. This edits the background mask before tracing.</p>
<div class="tabs"><button class="tab active" id="inspectTool">Inspect</button><button class="tab" id="restoreTool">Restore</button><button class="tab" id="eraseTool">Erase</button></div>
<label class="setting">Brush size <output id="brushValue">25</output><input type="range" id="brush" min="3" max="90" value="25"></label>
<div class="tabs"><button class="tab" id="maskTab">Subject mask</button><button class="tab active" id="outlineTab">Outline</button></div>
<label class="setting">Ink sensitivity <output id="inkValue">150</output><input type="range" id="ink" min="45" max="225" value="150"></label>
<label class="setting">Line thickness <output id="thickValue">1</output><input type="range" id="thick" min="1" max="4" value="1"></label>
<label class="check"><input type="checkbox" id="fills" checked>Keep black fills (eyes and intentional shaded areas)</label>
<label class="check"><input type="checkbox" id="white">Preview on white</label>
<div class="tabs"><button id="undo" class="tab" disabled>Undo brush</button><button id="redo" class="tab" disabled>Redo</button></div>
<button class="secondary" id="png" disabled>Download engraving PNG (transparent)</button>
<button class="secondary" id="svg" disabled>Download centerline SVG (experimental)</button>
<button class="subtle" id="reset">Start over</button>
</section>
<section class="panel"><div class="sectionTitle">04 / PREVIEW</div>
<div class="tabs"><button class="tab" id="originalTab">Original</button><button class="tab active" id="resultTab">Processed</button></div>
<div class="canvasWrap" id="wrap"><div id="empty">Your artwork will appear here.</div><canvas id="canvas" hidden></canvas><img id="original" alt="Original uploaded artwork" hidden></div>
<p class="tip" id="dimensions">The canvas stays transparent. A checkerboard means there is no ink there.</p>
<p class="tip">For woodburning, inspect the design at its actual size and do a test burn on scrap wood. The engraving PNG is the safer export for LaserGRBL; SVG centerline reconstruction can simplify complex features.</p>
</section></div><footer>Outline Studio · Background-first editing · No generative redrawing</footer></main>`;

const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
let file=null,url=null,original=null,mode='art',tab='result',stage='outline',tool='inspect',busy=false;
let W=0,H=0,source=null,mask=null,output=null,history=[],redo=[],drawing=false,started=false;
const cap=2200;
function status(msg,error=false){$('status').textContent=msg;$('status').classList.toggle('error',error)}
function controls(){for(const id of ['process'])$(id).disabled=!file||busy;for(const id of ['png','svg'])$(id).disabled=!output||busy;$('undo').disabled=!history.length;$('redo').disabled=!redo.length}
function switchTab(v){tab=v;$('originalTab').classList.toggle('active',v==='original');$('resultTab').classList.toggle('active',v==='result');$('original').hidden=v!=='original'||!file;canvas.hidden=v!=='result'||!output;$('empty').hidden=!!file;show()}
function load(f){if(!f||!f.type.startsWith('image/'))return status('Choose an image file.',true);if(f.size>25e6)return status('Use an image under 25 MB.',true);if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(f);file=f;mask=null;output=null;history=[];redo=[];started=false;const im=new Image();im.onload=()=>{original=im;$('original').src=url;$('filename').textContent=f.name;switchTab('original');status('Image loaded. Choose Artwork or Photograph/AI, then process.');controls()};im.onerror=()=>status('Could not read this image.',true);im.src=url}
$('file').onchange=e=>load(e.target.files[0]);$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('over')};$('drop').ondragleave=()=>$('drop').classList.remove('over');$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('over');load(e.dataTransfer.files[0])};
function setMode(m){mode=m;$('plainMode').classList.toggle('active',m==='art');$('aiMode').classList.toggle('active',m==='ai');status(m==='art'?'Artwork mode: removes contiguous background at the edges and keeps enclosed shapes.':'AI mode: segments the main subject. Inspect and restore areas the model misses.')}
$('plainMode').onclick=()=>setMode('art');$('aiMode').onclick=()=>setMode('ai');
for(const id of ['tolerance','brush','ink','thick'])$(id).oninput=()=>{$(id+'Value').textContent=$(id).value;if(id==='tolerance'&&started&&mode==='art'&&!history.length){runArtworkMask();extract();show()}else if((id==='ink'||id==='thick')&&mask){extract();show()}};
function prep(image){const scale=Math.min(1,cap/Math.max(image.naturalWidth,image.naturalHeight));W=Math.max(2,Math.round(image.naturalWidth*scale));H=Math.max(2,Math.round(image.naturalHeight*scale));const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(image,0,0,W,H);return g.getImageData(0,0,W,H).data}
function runArtworkMask(){
 const n=W*H,rgba=source,tol=+$('tolerance').value;
 // Flood from borders only. Enclosed white regions survive, unlike global keying.
 const bg=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
 function borderSample(){const samples=[];const stride=Math.max(1,Math.floor(Math.min(W,H)/30));for(let x=0;x<W;x+=stride){samples.push(x,(H-1)*W+x)}for(let y=0;y<H;y+=stride){samples.push(y*W,y*W+W-1)}
 const rs=[],gs=[],bs=[];for(const i of samples){const p=i*4;rs.push(rgba[p]);gs.push(rgba[p+1]);bs.push(rgba[p+2])}const median=a=>{a.sort((x,y)=>x-y);return a[(a.length/2)|0]};return[median(rs),median(gs),median(bs)]}
 const [R,G,B]=borderSample();const t2=tol*tol*3;
 function eligible(i){const p=i*4;const dr=rgba[p]-R,dg=rgba[p+1]-G,db=rgba[p+2]-B;return rgba[p+3]<30||dr*dr+dg*dg+db*db<t2}
 function push(i){if(bg[i]||!eligible(i))return;bg[i]=1;queue[tail++]=i}
 for(let x=0;x<W;x++){push(x);push((H-1)*W+x)}
 for(let y=0;y<H;y++){push(y*W);push(y*W+W-1)}
 while(head<tail){const i=queue[head++],x=i%W,y=(i/W)|0;if(x>0)push(i-1);if(x<W-1)push(i+1);if(y>0)push(i-W);if(y<H-1)push(i+W)}
 mask=new Uint8Array(n);for(let i=0;i<n;i++)mask[i]=bg[i]?0:source[i*4+3];
}
async function runAI(){
 const blob=await removeBackground(file);
 const image=new Image(),url2=URL.createObjectURL(blob);
 try{await new Promise((ok,fail)=>{image.onload=ok;image.onerror=fail;image.src=url2});const rgba=prep(image);mask=new Uint8Array(W*H);for(let i=0;i<mask.length;i++)mask[i]=rgba[i*4+3]}finally{URL.revokeObjectURL(url2)}
}
$('process').onclick=async()=>{if(!file||busy)return;busy=true;controls();status('Removing background first…');try{source=prep(original);if(mode==='ai')await runAI();else runArtworkMask();history=[];redo=[];started=true;extract();stage='outline';setStage('outline');switchTab('result');status('Ready. Inspect the result. If a part is missing, choose Restore and paint it back.');$('dimensions').textContent=W+' × '+H+' pixels · transparent PNG'}catch(e){console.error(e);status('Processing failed. Try Artwork mode, or an image with simpler background.',true)}finally{busy=false;controls()}};
function extract(){
 if(!mask)return;const n=W*H,ink=+$('ink').value,thick=+$('thick').value;
 const black=new Uint8Array(n);
 for(let i=0;i<n;i++){const p=i*4;if(mask[i]<85)continue;const lum=.2126*source[p]+.7152*source[p+1]+.0722*source[p+2];if(lum<ink)black[i]=1}
 // When fills are disabled, keep contour pixels of broad fills rather than their full interiors.
 if(!$('fills').checked){const old=black.slice();for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(old[i]&&old[i-1]&&old[i+1]&&old[i-W]&&old[i+W])black[i]=0}}
 // Connect a single missing pixel, never invent long lines.
 const joined=black.slice();for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(!black[i]&&mask[i]>85&&((black[i-1]&&black[i+1])||(black[i-W]&&black[i+W])))joined[i]=1}
 const pixels=new Uint8ClampedArray(n*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!joined[i])continue;for(let dy=0;dy<thick;dy++)for(let dx=0;dx<thick;dx++){const xx=x+dx,yy=y+dy;if(xx<W&&yy<H)pixels[(yy*W+xx)*4+3]=255}}
 output=new ImageData(pixels,W,H);controls();
}
$('fills').onchange=()=>{if(mask){extract();show()}};
function setStage(s){stage=s;$('maskTab').classList.toggle('active',s==='mask');$('outlineTab').classList.toggle('active',s==='outline');show()}
$('maskTab').onclick=()=>setStage('mask');$('outlineTab').onclick=()=>setStage('outline');
function setTool(t){tool=t;for(const id of ['inspect','restore','erase'])$(id+'Tool').classList.toggle('active',id===t);canvas.style.touchAction=t==='inspect'?'auto':'none';if(t!=='inspect')setStage('mask')}
for(const id of ['inspect','restore','erase'])$(id+'Tool').onclick=()=>setTool(id);
function show(){if(!file)return;if(tab==='original')return;if(!mask||!source)return;canvas.width=W;canvas.height=H;const d=ctx.createImageData(W,H);
 if(stage==='outline'){if(!output)return;d.data.set(output.data)}
 else for(let i=0;i<W*H;i++){const p=i*4;d.data[p]=source[p];d.data[p+1]=source[p+1];d.data[p+2]=source[p+2];d.data[p+3]=mask[i]}
 ctx.putImageData(d,0,0);$('wrap').classList.toggle('white',$('white').checked)}
$('white').onchange=show;
function paint(e){if(!drawing||!mask)return;const r=canvas.getBoundingClientRect();const x=Math.floor((e.clientX-r.left)*W/r.width),y=Math.floor((e.clientY-r.top)*H/r.height);const radius=+$('brush').value,rr=radius*radius;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){if(dx*dx+dy*dy>rr)continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;mask[yy*W+xx]=tool==='erase'?0:source[(yy*W+xx)*4+3]}show()}
canvas.addEventListener('pointerdown',e=>{if(tool==='inspect'||tab==='original'||!mask)return;e.preventDefault();drawing=true;history.push(mask.slice());if(history.length>12)history.shift();redo=[];canvas.setPointerCapture(e.pointerId);paint(e);controls()});
canvas.addEventListener('pointermove',e=>{if(drawing)paint(e)});
function finish(){if(!drawing)return;drawing=false;extract();show();controls()}canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
$('undo').onclick=()=>{if(!history.length)return;redo.push(mask.slice());mask=history.pop();extract();show();controls()};
$('redo').onclick=()=>{if(!redo.length)return;history.push(mask.slice());mask=redo.pop();extract();show();controls()};
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000)}
$('png').onclick=()=>{if(!output)return;const c=document.createElement('canvas');c.width=W;c.height=H;c.getContext('2d').putImageData(output,0,0);c.toBlob(b=>{if(b)download(b,(file.name.replace(/\\.[^.]+$/,'')||'art')+'-woodburn.png')},'image/png')};
$('svg').onclick=()=>{if(!output)return;try{const c=document.createElement('canvas');c.width=W;c.height=H;c.getContext('2d').putImageData(output,0,0);const traced=traceCenterlines(c,{stroke:1.2,gap:2});download(new Blob([traced.svg],{type:'image/svg+xml'}),(file.name.replace(/\\.[^.]+$/,'')||'art')+'-centerline.svg')}catch(e){console.error(e);status('SVG tracing failed; PNG is still available.',true)}};
$('reset').onclick=()=>{file=null;original=null;source=null;mask=null;output=null;history=[];redo=[];started=false;$('file').value='';$('filename').textContent='No image selected';if(url)URL.revokeObjectURL(url);url=null;$('original').removeAttribute('src');$('empty').hidden=false;canvas.hidden=true;controls();status('Choose a new image.')};
controls();