exec(open(__file__.replace('probe-plate.py','probe.py')).read().split('seed=frame(8)')[0])
ref=frame(4);rx,ry,rw,rh=400,665,176,275
gray=lambda a:cv2.cvtColor(a,cv2.COLOR_BGR2GRAY).astype('float32')/255
samples=[]
for st in np.arange(0,4.51,.5):
    a=frame(st);m=np.zeros((1024,576),np.uint8);m[ry:ry+rh,rx:]=255
    for im0 in [a,ref]:
        chroma=im0.max(2).astype(float)-im0.min(2);m[chroma>45]=0
    warp=np.eye(2,3,dtype=np.float32)
    try:cc,warp=cv2.findTransformECC(gray(ref),gray(a),warp,cv2.MOTION_TRANSLATION,(cv2.TERM_CRITERIA_COUNT|cv2.TERM_CRITERIA_EPS,100,.0001),m,5)
    except cv2.error:continue
    a=cv2.warpAffine(a,warp,(576,1024),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP,borderMode=cv2.BORDER_REFLECT)
    chroma=a.max(2).astype(float)-a.min(2);valid=cv2.dilate((chroma>45).astype('uint8'),np.ones((7,7),np.uint8))==0
    a=a.astype(float);a[~valid]=np.nan;samples.append(a)
stack=np.stack(samples);ref=np.nanmedian(stack,axis=0);missing=np.any(~np.isfinite(ref),axis=2).astype('uint8')*255
ref=cv2.inpaint(np.nan_to_num(ref).astype('uint8'),missing,3,cv2.INPAINT_TELEA)
board=Image.new('RGB',(3*292,4*382),'#11151c');d=ImageDraw.Draw(board)
for row,t in enumerate([9.5,12,13.75,13.875]):
    im=frame(t);mask=np.ones((1024,576),np.uint8)*255;mask[:ry]=0;mask[ry+rh:]=0;mask[:,:rx]=0;mask[754:900,438:]=0
    b,g,red=cv2.split(im);mask[(red.astype(float)>g*1.3)&(red.astype(float)>b*1.3)]=0
    gray=lambda a:cv2.cvtColor(a,cv2.COLOR_BGR2GRAY).astype('float32')/255
    warp=np.eye(2,3,dtype=np.float32)
    try:cc,warp=cv2.findTransformECC(gray(im),gray(ref),warp,cv2.MOTION_TRANSLATION,(cv2.TERM_CRITERIA_COUNT|cv2.TERM_CRITERIA_EPS,100,.0001),mask,5)
    except cv2.error:cc=0
    aligned=cv2.warpAffine(ref,warp,(576,1024),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP,borderMode=cv2.BORDER_REFLECT)
    # Estimate per-row exposure from untouched rightmost pixels and the clean
    # background band above the badge, rather than the covered content.
    delta=np.median(im[650:925,570:].astype(float)-aligned[650:925,570:].astype(float),axis=1)
    delta=cv2.GaussianBlur(delta.astype('float32'),(1,25),0)
    corrected=aligned.astype(float);corrected[650:925]+=delta[:,None,:]
    corrected=np.clip(corrected,0,255).astype('uint8')
    alpha=np.zeros((1024,576),np.float32);alpha[762:890,440:576]=1;alpha=cv2.GaussianBlur(alpha,(19,19),0)
    chroma=im.max(2).astype(float)-im.min(2);n,labels,stats,_=cv2.connectedComponentsWithStats((chroma>45).astype('uint8'));protected=np.zeros_like(alpha,dtype='uint8')
    for i in range(1,n):
        if stats[i,4]>350 and (stats[i,0]<438 or stats[i,1]<754):protected[labels==i]=255
    alpha[cv2.dilate(protected,np.ones((3,3),np.uint8))>0]=0
    paint=np.clip(im*(1-alpha[:,:,None])+corrected*alpha[:,:,None],0,255).astype('uint8')
    for col,(label,a) in enumerate([('original',im),(f'plate cc={cc:.3f}',aligned),('matched patch',paint)]):
        crop=Image.fromarray(cv2.cvtColor(a[740:910,430:576],cv2.COLOR_BGR2RGB)).resize((292,340));board.paste(crop,(col*292,row*382+42));d.text((col*292+5,row*382+5),f'{t}s / {label}',fill='white')
    print(t,cc,warp.tolist(),flush=True)
board.save(r/'private/plate-probe.jpg',quality=96)
