// statusInstrument.js - lightweight wrapper around existing global instrumentation
module.exports = function(routeId, handler){
  return async function(req,res,next){
    if (global.__getRouteMetrics){
      // Use instrumentHandler defined in server via global symbol if available
      if (global.__instrumentWrapper){
        return global.__instrumentWrapper(routeId, handler)(req,res,next);
      }
    }
    try { return await handler(req,res,next); } catch(e){ return next(e); }
  };
};
