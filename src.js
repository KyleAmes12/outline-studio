import { removeBackground } from '@imgly/background-removal';
import './style.css';
import { traceCenterlines } from './trace.js';
const app=document.querySelector('#app');
app.innerHTML=`<main class="shell"><header><div class="mark">✦</div><div><div class="eyebrow">CREATIVE TOOLS</div><h1>Outline Studio</h1><p>Turn a photo into a crisp, transparent black-line PNG.</p></div></header><div class="layout"><section class="panel"><div class="sectionTitle">01 / Upload a photo</div><label class="drop" id="drop"><input id="file" type="file" accept="image/*"><span class="uploadIcon">↥</span><b>Choose an image</b><small>Tap or drop a JPG, PNG, or WebP</small></label><div id="fileName" class="muted">No image selected</div><div class="actions"><button id="cut" class="primary" disabled>✦ Remove background & outline</button><button id="art" class="secondary" disabled>✎ Clean Artwork (recommended for cartoons)</button></div><div class="status" id="status" role="status" aria-live="polite">Images are processed on your device. The first background removal loads an AI model and may take a little longer.</div><hr><div class="sectionTitle">02 / Fine tune</div><label class="setting">Detail level <output id="detailValue">28</output><input id="detail" type="range" min="5" max="90" value="28"></label><label class="setting">Line thickness <output id="thickValue">1</output><input id="thick" type="range" min="1" max="5" value="1"></label><label class="setting">Edge contrast <output id="contrastValue">45</output><input id="contrast" type="range" min="10" max="130" value="45"></label><label class="check"><input id="silhouette" type="checkbox" checked>Include subject's outer silhouette</label><label class="check"><input id="white" type="checkbox">Preview on white instead of checkerboard</label><button id="download" class="secondary" disabled>↓ Download transparent PNG</button><button id="vector" class="secondary" disabled>✧ Clean Vector Outline (SVG)</button><button id="svgDownload" class="secondary" disabled>↓ Download smooth SVG</button><button id="reset" class="subtle" disabled>Start over</button></section><section class="panel previewPanel"><div class="sectionTitle">03 / Preview</div><div class="tabs"><button class="tab active" id="resultTab">Outline</button><button class="tab" id="originalTab">Original</button></div><div class="canvasWrap" id="canvasWrap"><div id="empty">Your outline will appear here.<span>Black lines · Transparent background</span></div><canvas id="canvas" hidden></canvas><img id="original" alt="Uploaded original" hidden></div><p class="tip">Tip: For laser engraving, start with thin lines and increase the detail level only if important features are missing. Busy photos may need manual cleanup.</p></section></div><footer>Preserves the source image's geometry. No generative redrawing. Made for creative work, tracing and LaserGRBL.</footer></main>`;
const $=id=>document.getElementById(id);
let inputFile=null,cutout=null,viewing='result',busy=false,vectorMode=false,vectorSVG='',artMode=false;
const canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
function status(msg,error=false){$('status').textContent=msg;$('status').classList.toggle('error',error)}
function updateButtons(){$('cut').disabled=!inputFile||busy;$('art').disabled=!inputFile||busy;$('download').disabled=!cutout||busy;$('vector').disabled=!cutout||busy;$('svgDownload').disabled=!vectorSVG||busy;$('reset').disabled=!inputFile||busy}
function showTab(tab){viewing=tab;$('resultTab').classList.toggle('active',tab==='result');$('originalTab').classList.toggle('active',tab==='original');$('original').hidden=tab!=='original'||!inputFile;canvas.hidden=tab!=='result'||!cutout;$('empty').hidden=(tab==='original'&&!!inputFile)||(tab==='result'&&!!cutout)}
let originalUrl=null;
function loadImage(file){if(!file||!file.type.startsWith('image/'))return status('Please choose an image file.',true);if(file.size>25*1024*1024)return status('Please select an image smaller than 25 MB.',true);inputFile=file;cutout=null;artMode=false;vectorSVG='';if(originalUrl)URL.revokeObjectURL(originalUrl);originalUrl=URL.createObjectURL(file);const im=new Image();im.onload=()=>{$('original').src=originalUrl;$('fileName').textContent=file.name;status('Ready! Tap “Remove background & outline”.');updateButtons();showTab('original')};im.onerror=()=>status('Could not open that image.',true);im.src=originalUrl}
$('file').addEventListener('change',e=>loadImage(e.target.files[0]));const drop=$('drop');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('over')});drop.addEventListener('dragleave',()=>drop.classList.remove('over'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('over');loadImage(e.dataTransfer.files[0])});
$('cut').addEventListener('click',async()=>{if(!inputFile||busy)return;busy=true;updateButtons();status('Removing the background… The first run downloads the processing model (internet required).');try{const blob=await removeBackground(inputFile,{progress:(key,current,total)=>{if(total>0)status('Preparing background removal… '+Math.round(current/total*100)+'%')}});const url=URL.createObjectURL(blob);const im=new Image();await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=reject;im.src=url});cutout=im;artMode=false;render();showTab('result');status('Done! Adjust the sliders, then save your transparent PNG.');URL.revokeObjectURL(url)}catch(e){console.error(e);status('Background removal failed. Check your connection, then try again. Large mobile photos may exhaust device memory.',true)}finally{busy=false;updateButtons()}});

function renderArt(){
 if(!inputFile)return;
 const image=$('original');
 if(!image.complete||!image.naturalWidth)return;
 vectorSVG='';vectorMode=false;$('vector').textContent='✧ Clean Vector Outline (SVG)';
 const maxSide=2200, scale=Math.min(2,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
 const w=Math.max(1,Math.round(image.naturalWidth*scale)),h=Math.max(1,Math.round(image.naturalHeight*scale));
 const temp=document.createElement('canvas');temp.width=w;temp.height=h;
 const t=temp.getContext('2d',{willReadFrequently:true});t.imageSmoothingEnabled=true;t.imageSmoothingQuality='high';t.fillStyle='white';t.fillRect(0,0,w,h);t.drawImage(image,0,0,w,h);
 const src=t.getImageData(0,0,w,h).data,n=w*h,gray=new Uint8Array(n);
 for(let i=0;i<n;i++){const p=4*i;gray[i]=Math.round(.2126*src[p]+.7152*src[p+1]+.0722*src[p+2])}
 // Dark-ink segmentation preserves ink interior instead of detecting two outlines around each stroke.
 const threshold=Math.min(210,Math.max(70,130+(+$('detail').value-28)*.8-(+$('contrast').value-45)*.45));
 const bitmap=new Uint8Array(n);
 for(let i=0;i<n;i++)if(gray[i]<threshold)bitmap[i]=1;
 // Join only isolated one-pixel gaps between established ink strokes.
 const joined=new Uint8Array(bitmap);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const i=y*w+x;if(bitmap[i])continue;
  const l=bitmap[i-1],r=bitmap[i+1],u=bitmap[i-w],d=bitmap[i+w];
  if((l&&r)||(u&&d))joined[i]=1;
 }
 // Remove disconnected dust fragments rather than losing entire facial or belly strokes.
 const seen=new Uint8Array(n),queue=new Int32Array(n),minArea=Math.max(3,Math.round(n/1600000*3));
 for(let i=0;i<n;i++){
  if(!joined[i]||seen[i])continue;
  let head=0,tail=1;queue[0]=i;seen[i]=1;
  while(head<tail){
   const k=queue[head++],x=k%w,y=(k/w)|0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;
    const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;
    const j=yy*w+xx;if(joined[j]&&!seen[j]){seen[j]=1;queue[tail++]=j}
   }
  }
  if(tail<minArea)for(let k=0;k<tail;k++)joined[queue[k]]=0;
 }
 const ink=document.createElement('canvas');ink.width=w;ink.height=h;
 const ic=ink.getContext('2d',{willReadFrequently:true}),out=ic.createImageData(w,h),dst=out.data;
 for(let i=0;i<n;i++)if(joined[i])dst[4*i+3]=255;
 ic.putImageData(out,0,0);
 const thickness=+$('thick').value;
 // Do not thicken default fine line mode. Small dilations only when requested.
 if(thickness>1){
  const expanded=ic.createImageData(w,h),a=expanded.data,r=Math.min(3,thickness-1);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(joined[y*w+x])
   for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h&&dx*dx+dy*dy<=r*r)a[(yy*w+xx)*4+3]=255;
   }
  ic.putImageData(expanded,0,0);
 }
 canvas.width=w;canvas.height=h;ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(ink,0,0);
 updateButtons();
}
$('art').addEventListener('click',()=>{
 if(!inputFile)return;
 artMode=true;renderArt();cutout=$('original');showTab('result');
 status('Clean Artwork mode: original dark strokes retained, white background made transparent. Adjust Detail and Contrast for cleaner ink.');
 updateButtons();
});

function render(){if(artMode){renderArt();return}vectorSVG='';vectorMode=false;$('vector').textContent='✧ Clean Vector Outline (SVG)';updateButtons();
if(!cutout)return;
const max=2800,scale=Math.min(1.65,max/Math.max(cutout.naturalWidth,cutout.naturalHeight));
const w=Math.max(1,Math.round(cutout.naturalWidth*scale)),h=Math.max(1,Math.round(cutout.naturalHeight*scale)),n=w*h;
const outScale=Math.min(1,2300/Math.max(cutout.naturalWidth,cutout.naturalHeight));
const outW=Math.max(1,Math.round(cutout.naturalWidth*outScale)),outH=Math.max(1,Math.round(cutout.naturalHeight*outScale));
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
// Bridge one-pixel fractures in curves, without expanding all the outlines.
for(let pass=0;pass<2;pass++){
 const joins=[];
 for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
  const i=y*w+x;if(edge[i]||alpha[i]<95)continue;
  const L=edge[i-1],R=edge[i+1],U=edge[i-w],D=edge[i+w];
  const UL=edge[i-w-1],UR=edge[i-w+1],DL=edge[i+w-1],DR=edge[i+w+1];
  if((L&&R)||(U&&D)||(UL&&DR)||(UR&&DL)||(L&&D)||(L&&U)||(R&&D)||(R&&U))joins.push(i);
 }
 for(const i of joins)edge[i]=1;
}
// Remove isolated single-pixel sparks.
const cleaned=new Uint8Array(edge);
for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
 const i=y*w+x;if(!edge[i])continue;let count=0;
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)count+=edge[i+dy*w+dx];
 if(count===0)cleaned[i]=0;
}
edge.set(cleaned);
// Render in a larger offscreen bitmap and downsample with antialiasing.
const thick=+$('thick').value,rad=thick-1,hi=document.createElement('canvas');hi.width=w;hi.height=h;
const hiCtx=hi.getContext('2d',{willReadFrequently:true}),output=hiCtx.createImageData(w,h),pixels=output.data;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!edge[i])continue;
for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++){if(dx*dx+dy*dy>rad*rad)continue;let nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;pixels[(ny*w+nx)*4+3]=255}
}
if(thick===1){const base=pixels.slice();for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,p=i*4;if(base[p+3])continue;
const sides=(base[(i-1)*4+3]>0?1:0)+(base[(i+1)*4+3]>0?1:0)+(base[(i-w)*4+3]>0?1:0)+(base[(i+w)*4+3]>0?1:0);
if(sides>=2)pixels[p+3]=55;
}}
hiCtx.putImageData(output,0,0);
canvas.width=outW;canvas.height=outH;
ctx.clearRect(0,0,outW,outH);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(hi,0,0,outW,outH);
}

function makeVector(){
 if(artMode){
  const result=traceCenterlines(canvas,{stroke:Math.max(.9,Number($('thick').value)*1.15),threshold:70,gap:5});
  vectorSVG=result.svg;return result.count;
 }
 return traceRasterContours();
}
function traceRasterContours(){

  // Trace the boundaries of each connected black region. This yields actual SVG geometry,
  // not an embedded raster image. A small closing pass bridges pinholes in strokes.
  const width=canvas.width,height=canvas.height;
  const px=ctx.getImageData(0,0,width,height).data;
  const mask=new Uint8Array(width*height);
  for(let i=0;i<mask.length;i++)mask[i]=px[i*4+3]>=75?1:0;
  const filled=new Uint8Array(mask);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;
    if(mask[i])continue;
    if((mask[i-1]&&mask[i+1])||(mask[i-width]&&mask[i+width])||(mask[i-width-1]&&mask[i+width+1])||(mask[i-width+1]&&mask[i+width-1]))filled[i]=1;
  }
  // Generate oriented boundary edges for SVG even-odd filled contours.
  const neighbors=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&filled[y*width+x];
  const segments=new Map();
  const add=(ax,ay,bx,by)=>{
    const k=ax+','+ay;
    const arr=segments.get(k)||[];
    arr.push([bx,by]);segments.set(k,arr);
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(!filled[y*width+x])continue;
    if(!neighbors(x,y-1))add(x,y,x+1,y);
    if(!neighbors(x+1,y))add(x+1,y,x+1,y+1);
    if(!neighbors(x,y+1))add(x+1,y+1,x,y+1);
    if(!neighbors(x-1,y))add(x,y+1,x,y);
  }
  const paths=[];let count=0;
  while(segments.size && count++<400000){
    const first=segments.keys().next().value;
    let start=first.split(',').map(Number),current=start.slice(),points=[start];
    let steps=0,closed=false;
    while(steps++<width*height*4){
      const key=current.join(',');
      const choices=segments.get(key);
      if(!choices||!choices.length)break;
      const next=choices.pop();
      if(!choices.length)segments.delete(key);
      if(next[0]===start[0]&&next[1]===start[1]){closed=true;break}
      points.push(next);current=next;
    }
    if(!closed||points.length<5)continue;
    // Remove tiny dust fragments and near-collinear pixel stair steps.
    if(points.length<12)continue;
    const step=Math.max(1,Math.floor(points.length/650));
    const sampled=points.filter((_,i)=>i%step===0);
    if(sampled.length<4)continue;
    // Midpoint quadratic curves soften stair-stepped boundaries while preserving geometry.
    const fmt=n=>Number(n.toFixed(2));
    let path='M '+fmt((sampled[0][0]+sampled.at(-1)[0])/2)+' '+fmt((sampled[0][1]+sampled.at(-1)[1])/2);
    for(let i=0;i<sampled.length;i++){
      const a=sampled[i],b=sampled[(i+1)%sampled.length];
      path+=' Q '+a[0]+' '+a[1]+' '+fmt((a[0]+b[0])/2)+' '+fmt((a[1]+b[1])/2);
    }
    paths.push(path+' Z');
  }
  const body=paths.join(' ');
  vectorSVG='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><path fill="#000000" fill-rule="evenodd" d="'+body+'"/></svg>';
  return paths.length;
}

function downloadFile(blob,name){
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$('vector').addEventListener('click',()=>{
 if(!cutout)return;
 if(vectorMode){render();status('Raster outline restored.');return}
 try{
  const paths=makeVector();
  if(!paths){status('Could not trace lines. Increase detail or contrast, then retry.',true);return}
  vectorMode=true;
  $('vector').textContent='↶ Return to raster outline';
  updateButtons();
  const svgBlob=new Blob([vectorSVG],{type:'image/svg+xml'});
  const url=URL.createObjectURL(svgBlob);
  const preview=new Image();
  preview.onload=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(preview,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url)};
  preview.onerror=()=>URL.revokeObjectURL(url);
  preview.src=url;
  status('Clean vector mode ready: '+paths+' smooth paths. Download the SVG or transparent PNG.');
 }catch(err){console.error(err);status('Vector tracing failed for this image. Try a smaller image.',true)}
});
$('svgDownload').addEventListener('click',()=>{
 if(!vectorSVG||!inputFile)return;
 downloadFile(new Blob([vectorSVG],{type:'image/svg+xml'}),inputFile.name.replace(/\.[^.]+$/,'')+'-smooth-outline.svg');
});
for(const id of ['detail','thick','contrast'])$(id).addEventListener('input',()=>{$(id+'Value').value=$(id).value;render()});$('silhouette').addEventListener('change',render);$('white').addEventListener('change',()=>{$('canvasWrap').classList.toggle('white',$('white').checked)});$('resultTab').addEventListener('click',()=>showTab('result'));$('originalTab').addEventListener('click',()=>showTab('original'));$('download').addEventListener('click',()=>{if(!cutout)return;canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(inputFile.name.replace(/\.[^.]+$/,'')||'image')+'-outline.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)},'image/png')});$('reset').addEventListener('click',()=>{inputFile=null;cutout=null;vectorSVG='';vectorMode=false;artMode=false;$('file').value='';$('fileName').textContent='No image selected';$('original').removeAttribute('src');if(originalUrl)URL.revokeObjectURL(originalUrl);originalUrl=null;status('Choose another image to get started.');updateButtons();showTab('result')});updateButtons();
