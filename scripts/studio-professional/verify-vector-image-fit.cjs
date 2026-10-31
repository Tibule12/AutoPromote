// Actual browser SVG-image versus raster-image fit regression; no cloud access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),babel=require('@babel/core'),Module=require('node:module'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),file=path.join(root,'frontend/src/components/studioVectorShape.js');
const mod=new Module(file);
mod._compile(babel.transformFileSync(file,{babelrc:false,configFile:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code,file);
const shape={version:1,closed:false,nodes:[{x:5,y:20,in:[0,0],out:[0,0]},{x:35,y:80,in:[0,0],out:[0,0]},{x:65,y:20,in:[0,0],out:[0,0]},{x:95,y:80,in:[0,0],out:[0,0]}],fill:{kind:'none',color:'#ddb983',endColor:'#ddb983',start:[0,0],end:[100,100]},stroke:{color:'#ddb983',width:4}};
function bounds(buffer){return JSON.parse(execFileSync('python3',['-c','import sys,io,json;from PIL import Image;im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB");mask=im.getchannel("R").point(lambda n:255 if n>100 else 0);b=mask.getbbox();print(json.dumps([b[0],b[1],b[2]-1,b[3]-1]))'],{input:buffer}).toString());}
async function main(){const b=await chromium.launch({headless:true,args:['--mute-audio','--disable-gpu']}),p=await b.newPage({viewport:{width:1000,height:400}});const results=[];
try{for(const [w,h] of [[280,70],[70,280],[140,140]])for(const fit of ['contain','cover','fill']){
 const svg=mod.exports.studioVectorSvg(shape,{strokeStart:10,strokeEnd:90});
 await p.setContent('<body style="margin:0;background:#000;display:flex;gap:8px"></body>');
 await p.evaluate(async({svg,w,h,fit})=>{const image=async(src)=>{const i=new Image();i.src=src;await i.decode();i.style=`display:block;flex:none;width:${w}px;height:${h}px;object-fit:${fit};background:#000`;document.body.append(i);return i;};const uri='data:image/svg+xml;base64,'+btoa(svg);const source=await image(uri);const c=document.createElement('canvas');c.width=1024;c.height=1024;c.getContext('2d').drawImage(source,0,0,1024,1024);await image(c.toDataURL('image/png'));await image('data:image/svg+xml;base64,'+btoa(svg.replace(' preserveAspectRatio="none"','')));},{svg,w,h,fit});
 const images=p.locator('img'),actual=bounds(await images.nth(0).screenshot()),reference=bounds(await images.nth(1).screenshot()),legacy=bounds(await images.nth(2).screenshot());
 const error=Math.max(...actual.map((n,i)=>Math.abs(n-reference[i]))),legacyError=Math.max(...legacy.map((n,i)=>Math.abs(n-reference[i])));
 results.push({width:w,height:h,fit,actual,reference,legacy,error,legacyError,pass:error<=1});
}if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({actualBrowser:true,headlessMuted:true,thresholdPx:1,cases:results},null,2));
assert(results.every(x=>x.pass),'SVG and raster image fit must agree within one pixel');assert(results.some(x=>x.fit==='fill'&&x.legacyError>10),'Must reproduce the previous non-square stretch failure');
console.log(JSON.stringify({passed:results.filter(x=>x.pass).length,cases:results.length,legacyStretchErrors:results.filter(x=>x.fit==='fill').map(x=>x.legacyError)}));
}finally{await b.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
