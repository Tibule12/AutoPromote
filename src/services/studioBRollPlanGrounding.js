// Model choices reference literal transcript tokens; no retyped quotations.
const abstractSubjects=new Set('i we you he she they it my our me us was were am are is grew up well everything going happy life story truth back long time lovely viewers special sensational great other child childhood grandmother grandfather family sitting studio guest host introduction love that much most every first last one into born moved'.split(' '));
function visualSubjectsForCaption(cue) {
  return [...new Set((cue.text.toLowerCase().match(/\p{L}{3,}/gu) || [])
    .filter(word=>!abstractSubjects.has(word)))];
}
module.exports={visualSubjectsForCaption};
