// Native rig SVGs used the legacy percent-encoded form. The shared media
// boundary accepts base64 data images, so normalise that representation before
// applying its existing validation. Saved projects retain their original bytes.
export function studioNodeImageSource(source) {
  if(typeof source!=='string'||!/^data:image\/svg\+xml;(?:utf8|charset=utf-8),/i.test(source))return source;
  try {
    const text=decodeURIComponent(source.slice(source.indexOf(',')+1));
    const bytes=encodeURIComponent(text).replace(/%([0-9A-F]{2})/g,(_match,hex)=>String.fromCharCode(parseInt(hex,16)));
    return 'data:image/svg+xml;base64,'+btoa(bytes);
  }catch(_error){return undefined;}
}
