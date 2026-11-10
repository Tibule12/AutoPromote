"""Bound inference-only SDPA query memory without truncating key context.

Each non-causal query has its own softmax over ALL keys. Partitioning query
rows is the same operation; partitioning keys without global normalization is
not. The context restores PyTorch's original function on every exit path.
"""
from contextlib import contextmanager


@contextmanager
def bounded_attention(query_rows=128, *, cuda_only=True, record=None, verify_actual=False,
                      fallback_query_rows=None):
    import torch
    from torch.nn import functional as F
    if type(query_rows)is not int or not 1<=query_rows<=512:
        raise ValueError('Invalid bounded attention query size')
    if fallback_query_rows is not None and (not verify_actual or
            type(fallback_query_rows)is not int or not 1<=fallback_query_rows<query_rows):
        raise ValueError('Attention fallback requires a smaller block and actual verification')
    original=F.scaled_dot_product_attention
    verified=set()
    def forward(query,key,value,attn_mask=None,dropout_p=0.,is_causal=False,*,scale=None,enable_gqa=False):
        args={'attn_mask':attn_mask,'dropout_p':dropout_p,'is_causal':is_causal,
              'scale':scale,'enable_gqa':enable_gqa}
        if (query.shape[-2]<=query_rows or cuda_only and query.device.type!='cuda'
                or is_causal or dropout_p!=0):
            return original(query,key,value,**args)
        if attn_mask is not None and attn_mask.shape[-2] not in (1,query.shape[-2]):
            raise ValueError('Attention mask query dimension differs')
        def compute(rows):
            pieces=[]
            for start in range(0,query.shape[-2],rows):
                end=min(query.shape[-2],start+rows)
                mask=attn_mask
                if mask is not None and mask.shape[-2]!=1:mask=mask[...,start:end,:]
                pieces.append(original(query[...,start:end,:],key,value,**{**args,'attn_mask':mask}))
            return torch.cat(pieces,dim=-2)
        output=compute(query_rows)
        row={'queryShape':list(query.shape),'keyShape':list(key.shape),
             'queryRowsPerChunk':query_rows,'fullKeyContextRetained':True}
        identity=(tuple(query.shape),tuple(key.shape),str(query.dtype))
        if verify_actual and (identity not in verified or fallback_query_rows is not None):
            size=min(32,query_rows,fallback_query_rows or query_rows);mask=attn_mask
            if mask is not None and mask.shape[-2]!=1:mask=mask[...,:size,:]
            probe=original(query[...,:size,:],key,value,**{**args,'attn_mask':mask})
            try:
                torch.testing.assert_close(output[...,:size,:],probe,rtol=2e-5,atol=2e-6)
            except AssertionError:
                if fallback_query_rows is None:
                    raise
                row['candidateProbeMaximumDifference']=float((output[...,:size,:]-probe).abs().max())
                output=compute(fallback_query_rows)
                # Retry the conservative original operation. A failed retry
                # remains an error; the numerical bounds are never relaxed.
                torch.testing.assert_close(output[...,:size,:],probe,rtol=2e-5,atol=2e-6)
                row['queryRowsPerChunk']=fallback_query_rows
                row['requestedQueryRowsPerChunk']=query_rows
                row['numericalFallbackUsed']=True
            row['actualSourceProbeMaximumDifference']=float((output[...,:size,:]-probe).abs().max())
            row['actualSourceProbeQueries']=size
            verified.add(identity)
        if record is not None:record(row)
        return output
    F.scaled_dot_product_attention=forward
    try:yield
    finally:F.scaled_dot_product_attention=original
