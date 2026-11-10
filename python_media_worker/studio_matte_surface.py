"""Optional light/reflection on a full-canvas isolated track-matte result."""
import math,re
def validate_surface(s):
    if s is None:return None
    allowed={'enabled','glowColor','glowRadius','glowIntensity','reflectionEnabled','floorY','reflectionOpacity','fadeHeight'}
    if (not isinstance(s,dict) or set(s)!=allowed or type(s['enabled'])is not bool or type(s['reflectionEnabled'])is not bool or not isinstance(s['glowColor'],str) or not re.fullmatch(r'#[a-fA-F0-9]{6}',s['glowColor'])):raise ValueError('Invalid isolated surface effects')
    for k,lo,hi in [('glowRadius',0,24),('glowIntensity',0,1),('floorY',20,95),('reflectionOpacity',0,.8),('fadeHeight',3,45)]:
        n=s[k]
        if type(n)not in(int,float)or not math.isfinite(n)or not lo<=n<=hi:raise ValueError('Invalid surface '+k)
    return s
def surface_filters(source,s,width,height,duration,fps,prefix):
    s=validate_surface(s)
    if not s or not s['enabled']:return [],source
    parts=[];current=source
    if s['glowIntensity']>0:
        c=s['glowColor'];rgb=[int(c[i:i+2],16)for i in(1,3,5)];sigma=max(.01,s['glowRadius']*height/720)
        parts.extend([f'[{current}]split=2[{prefix}_body][{prefix}_ginput];',f'[{prefix}_ginput]alphaextract,gblur=sigma={sigma:.6f},lut=y=val*{s["glowIntensity"]:.6f}[{prefix}_ga];',f'color=c={c}:s={width}x{height}:r={fps:.9f}:d={duration:.6f},format=rgba[{prefix}_gc];',f'[{prefix}_gc][{prefix}_ga]alphamerge[{prefix}_glow];',f'[{prefix}_glow][{prefix}_body]overlay=0:0:format=auto:eof_action=pass[{prefix}_lit];']);current=f'{prefix}_lit'
    if s['reflectionEnabled'] and s['reflectionOpacity']>0:
        floor=s['floorY']/100*height;fade=s['fadeHeight']/100*height;offset=round(2*floor-height)
        # After vflip, source Y is H-1-Y. Fade farther original pixels first.
        factor=f'{s["reflectionOpacity"]:.8f}*max(0,min(1,((H-0.5-Y)-{floor-fade:.8f})/{fade:.8f}))'
        parts.extend([f'[{current}]split=2[{prefix}_original][{prefix}_ri];',f'[{prefix}_ri]vflip,format=rgba,geq=r=\'r(X,Y)\':g=\'g(X,Y)\':b=\'b(X,Y)\':a=\'alpha(X,Y)*({factor})\'[{prefix}_reflection];',f'color=c=black:s={width}x{height}:r={fps:.9f}:d={duration:.6f},format=rgba,colorchannelmixer=aa=0[{prefix}_blank];',f'[{prefix}_blank][{prefix}_reflection]overlay=0:{offset}:format=auto:eof_action=pass[{prefix}_floor];',f'[{prefix}_floor][{prefix}_original]overlay=0:0:format=auto:eof_action=pass[{prefix}_result];']);current=f'{prefix}_result'
    return parts,current
