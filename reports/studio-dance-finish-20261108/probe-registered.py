exec(open(__file__.replace('probe-registered.py','probe.py')).read().split('seed=frame(8)')[0])
from python_media_worker.studio_watermark_cleanup import source_background_plate,fit_source_background,connected_colour_foreground
cv2.setNumThreads(2)
seed=frame(8);box=(443,768,126,112);x,y,w,h=box;core,mask,_=badge_ink_mask(seed[y:y+h,x:x+w]);region={'box':box,'core':core};plate=source_background_plate('/home/tibule12/Videos/number two dance.mp4',seed,region);assert plate is not None
mask=platform_icon_envelope(core,mask,77);alpha=np.zeros(seed.shape[:2],np.float32);alpha[y:y+h,x:x+w]=1;alpha=cv2.GaussianBlur(alpha,(15,15),0)
board=Image.new('RGB',(2*292,4*382),'#11151c');d=ImageDraw.Draw(board)
for row,t in enumerate([9.5,12,13.75,13.875]):
    im=frame(t);clean=fit_source_background(im,plate,box);assert clean is not None,t
    a=alpha.copy();a[connected_colour_foreground(im,box)>0]=0;paint=np.clip(im*(1-a[:,:,None])+clean*a[:,:,None],0,255).astype('uint8')
    for col,(label,image) in enumerate([('original',im),('native source-guided repair',paint)]):
        crop=Image.fromarray(cv2.cvtColor(image[740:910,430:576],cv2.COLOR_BGR2RGB)).resize((292,340));board.paste(crop,(col*292,row*382+42));d.text((col*292+4,row*382+5),f'{t}s / {label}',fill='white')
board.save(r/'private/registered-repair-probe.jpg',quality=96)
print('Source plate samples',plate['samples'],flush=True)
