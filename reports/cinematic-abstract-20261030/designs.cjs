// Intended actions only; native-abstract applies each value through normal UI.
const fs=require('fs'),path=require('path');
const fields=['x','y','z','scaleX','scaleY','scaleZ','rotationX','rotationY','rotationZ'];
const designs=['current','prism','fold'].map(id=>{
 const {scene}=JSON.parse(fs.readFileSync(path.join('/dev/shm/autopromote-abstract-20261030',id,'authoring-intent.json')));
 const objects=scene.objects.map((object,index)=>{
  const base=Object.fromEntries(fields.map(field=>[field,object[field]]));
  let keys=[];
  if(object.shape==='ribbon')keys=[{time:0,values:base,easing:'linear'},{time:scene.duration/2,values:{...base,rotationY:base.rotationY+(id==='fold'?12:18),rotationZ:base.rotationZ+(id==='fold'?3:8)},easing:'ease_in_out'},{time:scene.duration-.1,values:{...base,rotationY:base.rotationY+(id==='fold'?22:32),rotationZ:base.rotationZ+(id==='fold'?6:15)},easing:'ease_in_out'}];
  else if(object.shape==='sphere')keys=[{time:0,values:base,easing:'linear'},{time:scene.duration-.1,values:{...base,x:base.x+(index%2?.25:-.25),y:base.y+.3},easing:'ease_in_out'}];
  return {...object,keys};
 });
 return {id,name:scene.name,objects,duration:scene.duration,pitch:0,yaw:0,scale:scene.scale,focal:scene.focalLength,light:scene.lightColor,lightIntensity:scene.lightIntensity,bloom:0,rootKeys:[]};
});
module.exports={designs};
