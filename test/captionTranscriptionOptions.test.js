const {test}=require('node:test'),assert=require('node:assert/strict');
const {captionTranscriptionOptions}=require('../src/services/captionTranscriptionOptions');
test('source language survives JSON/form requests independently of translation',()=>{
  assert.deepEqual(captionTranscriptionOptions({source_language:'ZA-mixed',translate_to_english:'false'}),{sourceLanguage:'za-mixed',translateToEnglish:false});
  assert.deepEqual(captionTranscriptionOptions({sourceLanguage:'en',translateToEnglish:true}),{sourceLanguage:'en',translateToEnglish:true});
  assert.deepEqual(captionTranscriptionOptions(),{sourceLanguage:'auto',translateToEnglish:false});
});
test('unsupported choices fail before starting a durable job',()=>{
  assert.throws(()=>captionTranscriptionOptions({source_language:'unsupported'}),{status:400});
  assert.throws(()=>captionTranscriptionOptions({source_language:'xh',translate_to_english:true}),{status:400});
});
