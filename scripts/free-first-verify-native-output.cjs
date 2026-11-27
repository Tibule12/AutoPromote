const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pipeline}=require('node:stream/promises');
const {Readable,Transform}=require('node:stream');
const {execFileSync}=require('node:child_process');
const PRIVATE='/home/tibule12/.local/share/autopromote-qa/free-first-launch-20261127';
const env=require('dotenv').parse(fs.readFileSync('/home/tibule12/Projects/AutoPromte/AutoPromote/.env'));
for(const[k,v]of Object.entries(env))if(/^(FIREBASE_|GOOGLE_)/.test(k))process.env[k]=v;
const {db,storage}=require('../src/firebaseAdmin');
async function main(){
 const attempt=process.argv[2];if(!/^Q[1-7]-[a-zA-Z0-9-]+$/.test(attempt||''))throw Error('Exact retained qualification attempt required');
 const receipt=JSON.parse(fs.readFileSync(path.join(PRIVATE,attempt+'.execution.private.json')));
 const native=(await db.collection('video_edits').doc(receipt.nativeJobId).get()).data();
 if(native?.userId!==receipt.uid||native.status!=='completed'||!native.processingResult)throw Error('Completed owned native output required');
 const object=native.outputStoragePath||native.processingResult.output_storage_path;
 if(!object?.startsWith('processed/'))throw Error('Native private storage output required');
 const file=storage.bucket().file(object);const [metadata]=await file.getMetadata();
 if(metadata.metadata?.autopromoteJobId!==receipt.nativeJobId||metadata.metadata?.ownerUid!==receipt.uid||
    Number(metadata.size)>128*1024**2||Number(metadata.size)<=0)throw Error('Output metadata binding mismatch');
 const directory=path.join(PRIVATE,'completed-outputs');fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const filename=path.join(directory,attempt+'.mp4');
 if(!fs.existsSync(filename)){
  const [url]=await file.getSignedUrl({action:'read',expires:Date.now()+10*60000,queryParams:{generation:String(metadata.generation)}});
  const response=await fetch(url,{signal:AbortSignal.timeout(90000),redirect:'error'});
  if(!response.ok)throw Error('Native output download failed: '+response.status);
  let bytes=0;const cap=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;
   if(bytes>Number(metadata.size))return callback(Error('Output size exceeded'));callback(null,chunk);}});
  await pipeline(Readable.fromWeb(response.body),cap,fs.createWriteStream(filename,{flags:'wx',mode:0o600}));
  if(bytes!==Number(metadata.size))throw Error('Incomplete native film download');
 }
 const sha=crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
 if(sha!==metadata.metadata.sha256)throw Error('Downloaded film hash mismatch');
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels',
  '-of','json',filename],{encoding:'utf8',timeout:15000,maxBuffer:1024**2}));
 execFileSync('ffmpeg',['-v','error','-i',filename,'-f','null','-'],{timeout:120000,maxBuffer:1024**2});
 const proof={attempt,status:'completed',bytes:Number(metadata.size),sha256:sha,generation:metadata.generation,
  durationSeconds:Number(probe.format.duration),streams:probe.streams,fullDecodePassed:true,
  cloudOutputMeasured:true,actualCloudInvoiceUsd:null,costBasis:'Cloud Run allocation/rate envelope; not an invoice',
  captionBurnQualified:false,creativeApproval:false};
 fs.writeFileSync(path.resolve('reports/free-first-launch-20261127/'+attempt.toLowerCase()+'-output-proof.json'),JSON.stringify(proof,null,2)+'\n');
 console.log(JSON.stringify(proof));await db.terminate();
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
