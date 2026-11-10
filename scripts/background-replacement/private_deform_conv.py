"""Exact bounded CPU inference compatibility for the private model comparison.

An initial private model load segfaulted in deform_conv2d; inspection then found
unmaterialized Swin position buffers left by meta initialization. This uses
the same bilinear sample/modulation/convolution definition, with no approximation
to model weights or learned offsets. Only the single-group case in this model
is supported; unsupported configurations fail explicitly. The corrected actual
model evaluation uses the original operator; this comparison helper is unused.
"""
import torch
import torch.nn.functional as F

def deform_conv2d(input,offset,weight,bias=None,stride=(1,1),padding=(0,0),dilation=(1,1),mask=None):
    pair=lambda value:(value,value) if isinstance(value,int) else tuple(value)
    stride,padding,dilation=map(pair,(stride,padding,dilation))
    n,c,h,w=input.shape;out_channels,in_channels,kh,kw=weight.shape;oh,ow=offset.shape[-2:]
    if in_channels!=c or offset.shape!=(n,2*kh*kw,oh,ow):raise ValueError('Only one convolution/deformation group is supported')
    if mask is not None and mask.shape!=(n,kh*kw,oh,ow):raise ValueError('Modulation geometry differs')
    y,x=torch.meshgrid(torch.arange(oh,device=input.device,dtype=input.dtype),torch.arange(ow,device=input.device,dtype=input.dtype),indexing='ij')
    result=input.new_zeros((n,out_channels,oh,ow))
    for ky in range(kh):
        for kx in range(kw):
            k=ky*kw+kx
            sy=y*stride[0]-padding[0]+ky*dilation[0]+offset[:,2*k]
            sx=x*stride[1]-padding[1]+kx*dilation[1]+offset[:,2*k+1]
            grid=torch.stack(((sx+.5)*2/w-1,(sy+.5)*2/h-1),dim=-1)
            samples=F.grid_sample(input,grid,mode='bilinear',padding_mode='zeros',align_corners=False)
            if mask is not None:samples=samples*mask[:,k:k+1]
            result+=F.conv2d(samples,weight[:,:,ky:ky+1,kx:kx+1])
    if bias is not None:result+=bias[None,:,None,None]
    return result

def verify():
    import numpy as np
    from scipy.ndimage import map_coordinates
    torch.manual_seed(12);torch.set_num_threads(2);checks=[]
    for stride,pad in [(1,1),(2,1),(1,2)]:
        image=torch.randn(1,3,11,13);weight=torch.randn(4,3,3,3);bias=torch.randn(4)
        expected=F.conv2d(image,weight,bias,stride=stride,padding=pad);oh,ow=expected.shape[-2:]
        offsets=torch.zeros(1,18,oh,ow);mask=torch.ones(1,9,oh,ow)
        actual=deform_conv2d(image,offsets,weight,bias,stride,pad,mask=mask)
        torch.testing.assert_close(actual,expected,atol=2e-5,rtol=1e-5);checks.append({'case':'zero_offset_matches_convolution','stride':stride,'padding':pad,'maxError':float((actual-expected).abs().max())})
    image=torch.randn(1,2,7,9);weight=torch.randn(3,2,3,3);bias=torch.randn(3);offset=torch.randn(1,18,7,9)*1.4;mask=torch.rand(1,9,7,9)
    actual=deform_conv2d(image,offset,weight,bias,padding=1,mask=mask).numpy();reference=np.zeros_like(actual);y,x=np.mgrid[:7,:9]
    for ky in range(3):
        for kx in range(3):
            k=ky*3+kx;sy=y-1+ky+offset[0,2*k].numpy();sx=x-1+kx+offset[0,2*k+1].numpy()
            for channel in range(2):
                sampled=map_coordinates(image[0,channel].numpy(),[sy,sx],order=1,mode='grid-constant',cval=0)*mask[0,k].numpy()
                for out in range(3):reference[0,out]+=sampled*float(weight[out,channel,ky,kx])
    reference+=bias.numpy()[None,:,None,None];np.testing.assert_allclose(actual,reference,atol=2e-5,rtol=1e-5)
    checks.append({'case':'random_offsets_and_modulation_independent_scipy_reference','maxError':float(np.max(np.abs(actual-reference)))})
    return checks

if __name__=='__main__':
    import json
    print(json.dumps({'passed':verify()},indent=2))
