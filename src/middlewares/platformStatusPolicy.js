'use strict';
const {createHash}=require('node:crypto');
// Public unsigned status remains a harmless connected:false response. Supplied
// authentication must use the normal validator, not be silently discarded.
function optionalPlatformStatusAuth(authenticate){
  return (req,res,next)=>{
    if(req.userId||req.user?.uid)return next();
    if(req.headers?.authorization)return authenticate(req,res,next);
    return next();
  };
}
// This cache runs before route authentication. Partition by the complete
// credential/workspace request without retaining tokens/cookies in map keys.
function statusRequestCacheKey(req){
  return createHash('sha256').update(JSON.stringify([
    req.originalUrl||req.path,req.userId||req.user?.uid||'',
    req.headers?.authorization||'',req.headers?.cookie||'',
    req.headers?.['x-workspace-id']||'',req.headers?.['x-workspace']||''
  ])).digest('hex');
}
module.exports={optionalPlatformStatusAuth,statusRequestCacheKey};
