// Centerline tracing for line art. Keeps strokes as scalable SVG paths.
export function traceCenterlines(canvas,{stroke=1.35,threshold=85,gap=5}={}){
 const iw=canvas.width,ih=canvas.height,scale=Math.min(1,1500/Math.max(iw,ih));
 const w=Math.max(2,Math.round(iw*scale)),h=Math.max(2,Math.round(ih*scale)),n=w*h;
 const c=document.createElement('canvas');c.width=w;c.height=h;
 const g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(canvas,0,0,w,h);
 const rgba=g.getImageData(0,0,w,h).data,mask=new Uint8Array(n);
 for(let i=0;i<n;i++) mask[i]=rgba[i*4+3]>=threshold?1:0;
 // Suppress pinholes and one-pixel breaks before skeletonization.
 for(let pass=0;pass<2;pass++){
  const add=[];
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
   let i=y*w+x;if(mask[i])continue;
   if((mask[i-1]&&mask[i+1])||(mask[i-w]&&mask[i+w]))add.push(i);
  }
  for(const i of add)mask[i]=1;
 }
 // Zhang-Suen iterative thinning. Preserves 8-connected topology.
 const offsets=[-w,-w+1,1,w+1,w,w-1,-1,-w-1];
 for(let iteration=0;iteration<70;iteration++){
  let changed=false;
  for(let phase=0;phase<2;phase++){
   const rem=[];
   for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    let i=y*w+x;if(!mask[i])continue;
    const p=offsets.map(o=>mask[i+o]);
    const count=p.reduce((a,b)=>a+b,0);if(count<2||count>6)continue;
    let transitions=0;for(let j=0;j<8;j++)if(!p[j]&&p[(j+1)%8])transitions++;
    if(transitions!==1)continue;
    if(phase===0?(p[0]*p[2]*p[4]||p[2]*p[4]*p[6]):(p[0]*p[2]*p[6]||p[0]*p[4]*p[6]))continue;
    rem.push(i);
   }
   for(const i of rem)mask[i]=0;
   if(rem.length)changed=true;
  }
  if(!changed)break;
 }
 const degree=new Uint8Array(n);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  let i=y*w+x;if(!mask[i])continue;
  for(const o of offsets)degree[i]+=mask[i+o];
 }
 // Connect nearby free endpoints only if their separation is small.
 const ends=[];for(let i=0;i<n;i++)if(mask[i]&&degree[i]===1)ends.push(i);
 const used=new Set();
 for(let a=0;a<ends.length;a++){
  if(used.has(a))continue;
  const i=ends[a],x=i%w,y=Math.floor(i/w);
  let best=-1,dist=gap*gap+1;
  for(let b=a+1;b<ends.length;b++){
   if(used.has(b))continue;
   const j=ends[b],dx=x-j%w,dy=y-Math.floor(j/w),d=dx*dx+dy*dy;
   if(d<dist&&d>1){best=b;dist=d}
  }
  if(best<0)continue;
  const j=ends[best],x2=j%w,y2=Math.floor(j/w),steps=Math.ceil(Math.sqrt(dist)*2);
  for(let k=1;k<steps;k++){
   const xx=Math.round(x+(x2-x)*k/steps),yy=Math.round(y+(y2-y)*k/steps);
   if(xx>=0&&yy>=0&&xx<w&&yy<h)mask[yy*w+xx]=1;
  }
  used.add(a);used.add(best);
 }
 // Build graph of neighboring ink pixels, preserving branching and closed loops.
 const adj=new Map();
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const i=y*w+x;if(!mask[i])continue;
  const ns=[];for(const o of offsets)if(mask[i+o])ns.push(i+o);
  adj.set(i,ns);
 }
 const visited=new Set(),paths=[];
 const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
 const follow=(start,next)=>{
  const line=[start];let prev=start,cur=next;
  visited.add(edgeKey(prev,cur));
  for(let k=0;k<100000;k++){
   line.push(cur);
   const choices=(adj.get(cur)||[]).filter(v=>v!==prev&&!visited.has(edgeKey(cur,v)));
   if((adj.get(cur)||[]).length!==2||!choices.length)break;
   const nextNode=choices[0];visited.add(edgeKey(cur,nextNode));prev=cur;cur=nextNode;
  }
  if(line.length>=4)paths.push(line);
 };
 for(const [i,ns] of adj)if(ns.length!==2)for(const j of ns)if(!visited.has(edgeKey(i,j)))follow(i,j);
 for(const [i,ns] of adj)for(const j of ns)if(!visited.has(edgeKey(i,j)))follow(i,j);
 // Ramer-Douglas-Peucker: reduce stair-stepping before cubic smoothing.
 const xy=i=>[i%w,Math.floor(i/w)];
 function simplify(points,tol=.75){
  if(points.length<3)return points;
  const a=points[0],b=points[points.length-1];
  let max=0,index=0,dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
  for(let i=1;i<points.length-1;i++){
   const p=points[i],t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
   const d=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;
   if(d>max){max=d;index=i}
  }
  if(max<=tol*tol)return[a,b];
  return simplify(points.slice(0,index+1),tol).slice(0,-1).concat(simplify(points.slice(index),tol));
 }
 const fmt=x=>Number(x.toFixed(2));
 const toPath=(line)=>{
  const pts=simplify(line.map(xy),.7);
  if(pts.length<2)return'';
  let d='M '+fmt(pts[0][0])+' '+fmt(pts[0][1]);
  if(pts.length===2)return d+' L '+fmt(pts[1][0])+' '+fmt(pts[1][1]);
  for(let i=0;i<pts.length-1;i++){
   const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
   const k=.17;
   const c1=[p1[0]+(p2[0]-p0[0])*k,p1[1]+(p2[1]-p0[1])*k];
   const c2=[p2[0]-(p3[0]-p1[0])*k,p2[1]-(p3[1]-p1[1])*k];
   d+=' C '+fmt(c1[0])+' '+fmt(c1[1])+' '+fmt(c2[0])+' '+fmt(c2[1])+' '+fmt(p2[0])+' '+fmt(p2[1]);
  }
  return d;
 };
 const d=paths.map(toPath).filter(Boolean).join(' ');
 return {svg:'<svg xmlns="http://www.w3.org/2000/svg" width="'+iw+'" height="'+ih+'" viewBox="0 0 '+w+' '+h+'"><path d="'+d+'" fill="none" stroke="#000" stroke-width="'+stroke+'" stroke-linecap="round" stroke-linejoin="round"/></svg>',count:paths.length};
}