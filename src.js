import { removeBackground } from '@imgly/background-removal';
import './style.css';
const app=document.querySelector('#app');
app.innerHTML=`<main class="shell"><header><div class="mark">✦</div><div><div class="eyebrow">CREATIVE TOOLS</div><h1>Outline Studio</h1><p>Turn a photo into a crisp, transparent black-line PNG.</p></div></header><div class="layout"><section class="panel"><div class="sectionTitle">01 / Upload a photo</div><label class="drop" id="drop"><input id="file" type="file" accept="image/*"><span class="uploadIcon">↥</span><b>Choose an image</b><small>Tap or drop a JPG, PNG, or WebP</small></label><div id="fileName" class="muted">No image selected</div><div class="actions"><button id="cut" class="primary" disabled>✦ Remove background & outline</button></div><div class="status" id="status" role="status" aria-live="polite">Images are processed on your device. The first background removal loads an AI model and may take a little longer.</div><hr><div class="sectionTitle">02 / Fine tune</div><label class="setting">Detail level <output id="detailValue">28</output><input id="detail" type="range" min="5" max="90" value="28"></label><label class="setting">Line thickness <output id="thickValue">1</output><input id="thick" type="range" min="1" max="5" value="1"></label><label class="setting">Edge contrast <output id="contrastValue">45</output><input id="contrast" type="range" min="10" max="130" value="45"></label><label class="check"><input id="silhouette" type="checkbox" checked>Include subject's outer silhouette</label><label class="check"><input id="white" type="checkbox">Preview on white instead of checkerboard</label><button id="download" class="secondary" disabled>↓ Download transparent PNG</button><button id="reset" class="subtle" disabled>Start over</button></section><section class="panel previewPanel"><div class="sectionTitle">03 / Preview</div><div class="tabs"><button class="tab active" id="resultTab">Outline</button><button class="tab" id="originalTab">Original</button></div><div class="canvasWrap" id="canvasWrap"><div id="empty">Your outline will appear here.<span>Black lines · Transparent background</span></div><canvas id="canvas" hidden></canvas><img id="original" alt="Uploaded original" hidden></div><p class="tip">Tip: For laser engraving, start with thin lines and increase the detail level only if important features are missing. Busy photos may need manual cleanup.</p></section></div><footer>Preserves the source image's geometry. No generative redrawing. Made for creative work, tracing and LaserGRBL.</footer></main>`;
const $=id=>document.getElementById(id);
let inputFile=null,cutout=null,viewing='result',busy=false;
const canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
function status(msg,error=false){$('status').textContent=msg;$('status').classList.toggle('error',error)}
function updateButtons(){$('cut').disabled=!inputFile||busy;$('download').disabled=!cutout||busy;$('reset').disabled=!inputFile||busy}
function showTab(tab){viewing=tab;$('resultTab').classList.toggle('active',tab==='result');$('originalTab').classList.toggle('active',tab==='original');$('original').hidden=tab!=='original'||!inputFile;canvas.hidden=tab!=='result'||!cutout;$('empty').hidden=(tab==='original'&&!!inputFile)||(tab==='result'&&!!cutout)}
let originalUrl=null;
function loadImage(file){if(!file||!file.type.startsWith('image/'))return status('Please choose an image file.',true);if(file.size>25*1024*1024)return status('Please select an image smaller than 25 MB.',true);inputFile=file;cutout=null;if(originalUrl)URL.revokeObjectURL(originalUrl);originalUrl=URL.createObjectURL(file);const im=new Image();im.onload=()=>{$('original').src=originalUrl;$('fileName').textContent=file.name;status('Ready! Tap “Remove background & outline”.');updateButtons();showTab('original')};im.onerror=()=>status('Could not open that image.',true);im.src=originalUrl}
$('file').addEventListener('change',e=>loadImage(e.target.files[0]));const drop=$('drop');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('over')});drop.addEventListener('dragleave',()=>drop.classList.remove('over'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('over');loadImage(e.dataTransfer.files[0])});
$('cut').addEventListener('click',async()=>{if(!inputFile||busy)return;busy=true;updateButtons();status('Removing the background… The first run downloads the processing model (internet required).');try{const blob=await removeBackground(inputFile,{progress:(key,current,total)=>{if(total>0)status('Preparing background removal… '+Math.round(current/total*100)+'%')}});const url=URL.createObjectURL(blob);const im=new Image();await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=reject;im.src=url});cutout=im;render();showTab('result');status('Done! Adjust the sliders, then save your transparent PNG.');URL.revokeObjectURL(url)}catch(e){console.error(e);status('Background removal failed. Check your connection, then try again. Large mobile photos may exhaust device memory.',true)}finally{busy=false;updateButtons()}});
function render(){
if(!cutout)return;
const max=3000,scale=Math.min(1,max/Math.max(cutout.naturalWidth,cutout.naturalHeight));
const w=Math.max(1,Math.round(cutout.naturalWidth*scale)),h=Math.max(1,Math.round(cutout.naturalHeight*scale)),n=w*h;
canvas.width=w;canvas.height=h;
const source=document.createElement('canvas');source.width=w;source.height=h;
const c=source.getContext('2d',{willReadFrequently:true});c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(cutout,0,0,w,h);
const rgba=c.getImageData(0,0,w,h).data;
const lum=new Float32Array(n),alpha=new Uint8Array(n);
for(let i=0;i<n;i++){const p=i*4;alpha[i]=rgba[p+3];lum[i]=.2126*rgba[p]+.7152*rgba[p+1]+.0722*rgba[p+2]}
// A separable five-tap Gaussian removes single-pixel noise without blurring character features.
const kernel=[1,4,6,4,1],tmp=new Float32Array(n),smooth=new Float32Array(n);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=-2;k<=2;k++)sum+=lum[y*w+Math.max(0,Math.min(w-1,x+k))]*kernel[k+2];tmp[y*w+x]=sum/16}
for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=-2;k<=2;k++)sum+=tmp[Math.max(0,Math.min(h-1,y+k))*w+x]*kernel[k+2];smooth[y*w+x]=sum/16}
// Sobel gradient + non-maximum suppression produces single-pixel ridges.
const mag=new Float32Array(n),direction=new Uint8Array(n);
for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;
if(alpha[i]<110)continue;
const a=smooth[i-w-1],b=smooth[i-w],d=smooth[i-w+1],e=smooth[i-1],g=smooth[i+1],j=smooth[i+w-1],k=smooth[i+w],l=smooth[i+w+1];
const gx=-a+d-2*e+2*g-j+l,gy=-a-2*b-d+j+2*k+l;
mag[i]=Math.hypot(gx,gy);
let ang=(Math.atan2(gy,gx)*180/Math.PI+180)%180;
direction[i]=ang<22.5||ang>=157.5?0:ang<67.5?1:ang<112.5?2:3;
}
const detail=+$('detail').value,contrast=+$('contrast').value;
const high=Math.max(22,145-detail*1.12)*(contrast/45),low=high*.46;
const strong=new Uint8Array(n),weak=new Uint8Array(n),edge=new Uint8Array(n);
for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const i=y*w+x;if(alpha[i]<125||mag[i]<low)continue;
const offsets=direction[i]===0?[1,-1]:direction[i]===1?[w-1,-w+1]:direction[i]===2?[w,-w]:[w+1,-w-1];
if(mag[i]<mag[i+offsets[0]]||mag[i]<mag[i+offsets[1]])continue;
if(mag[i]>=high)strong[i]=1;else weak[i]=1;
}
// Link faint edge pixels only when connected to reliable high-contrast lines.
const stack=[];for(let i=0;i<n;i++)if(strong[i]){edge[i]=1;stack.push(i)}
while(stack.length){const i=stack.pop(),x=i%w,y=(i/w)|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<1||ny<1||nx>=w-1||ny>=h-1)continue;const j=ny*w+nx;if(weak[j]&&!edge[j]){edge[j]=1;stack.push(j)}}}
if($('silhouette').checked){for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(alpha[i]>=145&&(alpha[i-1]<145||alpha[i+1]<145||alpha[i-w]<145||alpha[i+w]<145))edge[i]=1}}
// Subtle alpha feathering smooths the 1-pixel stair steps without thick black blocks.
const thick=+$('thick').value,rad=thick-1,output=ctx.createImageData(w,h),pixels=output.data;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!edge[i])continue;
for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++){if(dx*dx+dy*dy>rad*rad)continue;let nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;pixels[(ny*w+nx)*4+3]=255}
}
if(thick===1){const base=pixels.slice();for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,p=i*4;if(base[p+3])continue;
const sides=(base[(i-1)*4+3]>0?1:0)+(base[(i+1)*4+3]>0?1:0)+(base[(i-w)*4+3]>0?1:0)+(base[(i+w)*4+3]>0?1:0);
if(sides>=2)pixels[p+3]=55;
}}
ctx.putImageData(output,0,0);
}
for(const id of ['detail','thick','contrast'])$(id).addEventListener('input',()=>{$(id+'Value').value=$(id).value;render()});$('silhouette').addEventListener('change',render);$('white').addEventListener('change',()=>{$('canvasWrap').classList.toggle('white',$('white').checked)});$('resultTab').addEventListener('click',()=>showTab('result'));$('originalTab').addEventListener('click',()=>showTab('original'));$('download').addEventListener('click',()=>{if(!cutout)return;canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(inputFile.name.replace(/\.[^.]+$/,'')||'image')+'-outline.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)},'image/png')});$('reset').addEventListener('click',()=>{inputFile=null;cutout=null;$('file').value='';$('fileName').textContent='No image selected';$('original').removeAttribute('src');if(originalUrl)URL.revokeObjectURL(originalUrl);originalUrl=null;status('Choose another image to get started.');updateButtons();showTab('result')});updateButtons();
