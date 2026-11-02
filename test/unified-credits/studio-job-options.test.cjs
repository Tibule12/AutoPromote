const {test}=require('node:test'),assert=require('node:assert/strict');
const {encodeStudioJobOptions,decodeStudioJobOptions}=require('../../src/services/studioJobOptions');

test('large native Studio options retain every key and exact JSON bytes in a bounded job record',()=>{
 const input={renderViral:true,quality:'high',viralData:{brand_watermark:{enabled:false},
  editor_timeline:{motion_keyframes:Array.from({length:12000},(_,i)=>({id:'key-'+i,targetId:'person',property:'maskPoint0X',time:i/24,value:50+i/12000}))}}};
 const original=JSON.stringify(input),record=encodeStudioJobOptions(input);
 assert(Buffer.byteLength(original)>1024*1024);assert(record.optionsArchive.data.length<512*1024);
 assert.equal(record.options.renderViral,true);assert.deepEqual(record.options.viralData.brand_watermark,{enabled:false});
 assert.equal(record.options.viralData.editor_timeline,undefined);
 assert.equal(JSON.stringify(decodeStudioJobOptions(record)),original);assert.equal(JSON.stringify(input),original);
});
test('archive corruption, inconsistent bytes, oversized input and decompression expansion fail closed',()=>{
 const input={renderViral:true,viralData:{text:'a'.repeat(300000)}},record=encodeStudioJobOptions(input);
 assert.throws(()=>decodeStudioJobOptions({...record,optionsArchive:{...record.optionsArchive,sha256:'0'.repeat(64)}}),/identity/);
 assert.throws(()=>decodeStudioJobOptions({...record,optionsArchive:{...record.optionsArchive,bytes:2}}),/identity/);
 assert.throws(()=>encodeStudioJobOptions({renderViral:true,text:'a'.repeat(4*1024*1024)}),/4 MiB/);
 const {gzipSync}=require('node:zlib');assert.throws(()=>decodeStudioJobOptions({...record,optionsArchive:{...record.optionsArchive,data:gzipSync(Buffer.alloc(4*1024*1024+1))}}));
});
test('small and retained legacy option records preserve their existing representation',()=>{
 for(const options of [{renderViral:true,viralData:{overlays:[]}},{smartCrop:true}]){
  const record=encodeStudioJobOptions(options);assert.equal(record.options,options);assert.equal(record.optionsArchive,undefined);assert.equal(decodeStudioJobOptions(record),options);
 }
});
test('dense native documents fit a bounded archive while oversized compressed documents still reject',()=>{
 const {randomBytes}=require('node:crypto');
 const options={renderViral:true,viralData:{nativeDocument:randomBytes(600*1024).toString('base64')}};
 const record=encodeStudioJobOptions(options);
 assert(record.optionsArchive.data.length>512*1024);
 assert(record.optionsArchive.data.length<=768*1024);
 assert.deepEqual(decodeStudioJobOptions(record),options);
 assert.throws(()=>encodeStudioJobOptions({renderViral:true,viralData:{nativeDocument:randomBytes(800*1024).toString('base64')}}),/768 KiB/);
 assert.throws(()=>decodeStudioJobOptions({...record,optionsArchive:{...record.optionsArchive,data:Buffer.alloc(768*1024+1)}}),/Invalid/);
});
