// securityHeaders.js - opinionated security headers (layered on top of helmet)
module.exports = function securityHeaders(){
  return function(req,res,next){
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    next();
  };
};