"""Private float32 CUDA SDPA, checked against math on actual model queries.

Every query retains all keys. No approximation, dtype conversion, CPU-model
admission, or unsupported-kernel fallback is hidden by this diagnostic path.
"""
from contextlib import contextmanager


@contextmanager
def verified_efficient_attention(*, record=None):
    import torch
    from torch.nn import functional as functional
    from torch.nn.attention import SDPBackend, sdpa_kernel
    original = functional.scaled_dot_product_attention
    diagnostics = {}

    def math_chunks(query, key, value, options):
        chunks = []
        with sdpa_kernel(SDPBackend.MATH):
            for first in range(0, query.shape[-2], 128):
                mask = options['attn_mask']
                if mask is not None and mask.shape[-2] != 1:
                    mask = mask[..., first:first+128, :]
                chunks.append(original(query[..., first:first+128, :], key,
                                       value, **{**options, 'attn_mask': mask}))
        return torch.cat(chunks, dim=-2)

    def forward(query, key, value, attn_mask=None, dropout_p=0., is_causal=False,
                *, scale=None, enable_gqa=False):
        options = dict(attn_mask=attn_mask, dropout_p=dropout_p,
                       is_causal=is_causal, scale=scale, enable_gqa=enable_gqa)
        if query.device.type != 'cuda' or dropout_p or is_causal:
            return original(query, key, value, **options)
        # The actual small prompt decoder exceeded the unchanged numerical
        # bound with the efficient kernel. Retain math there. Acceleration is
        # confined to the large image/memory attention that passed that check.
        if query.shape[-2] <= 128:
            with sdpa_kernel(SDPBackend.MATH):
                return original(query, key, value, **options)
        with sdpa_kernel(SDPBackend.EFFICIENT_ATTENTION):
            output = original(query, key, value, **options)
        identity = (tuple(query.shape), tuple(key.shape), tuple(value.shape),
                    str(query.dtype), scale, enable_gqa,
                    None if attn_mask is None else tuple(attn_mask.shape))
        size = min(32, query.shape[-2])
        mask = attn_mask
        if mask is not None and mask.shape[-2] != 1:
            if mask.shape[-2] != query.shape[-2]:
                raise ValueError('Attention query-mask dimension differs')
            mask = mask[..., :size, :]
        with sdpa_kernel(SDPBackend.MATH):
            expected = original(query[..., :size, :], key, value,
                                **{**options, 'attn_mask': mask})
        difference = float((output[..., :size, :]-expected).abs().max())
        row = diagnostics.setdefault(identity, dict(
            queryShape=list(query.shape), keyShape=list(key.shape),
            fullKeyContextRetained=True, dtype=str(query.dtype),
            actualSourceProbeQueries=size, efficientCalls=0, mathFallbackCalls=0,
            actualSourceMathProbeMaximumDifference=0.,
            backend='per-call verified efficient or original bounded math',
            comparisonRtol=2e-5, comparisonAtol=2e-6))
        row['actualSourceMathProbeMaximumDifference'] = max(
            row['actualSourceMathProbeMaximumDifference'], difference)
        try:
            torch.testing.assert_close(output[..., :size, :], expected,
                                       rtol=2e-5, atol=2e-6)
        except AssertionError:
            # A failed candidate probe never reaches the model. Recompute ALL
            # queries using the original full-key math path at the same bounds.
            output = math_chunks(query, key, value, options)
            row['mathFallbackCalls'] += 1
        else:
            row['efficientCalls'] += 1
        if record is not None and (row['efficientCalls'] == 1 or
                                  row['mathFallbackCalls'] == 1 or
                                  (row['efficientCalls']+row['mathFallbackCalls']) % 128 == 0):
            record(dict(row))
        return output

    functional.scaled_dot_product_attention = forward
    try:
        yield
    finally:
        functional.scaled_dot_product_attention = original
        if record is not None:
            for row in diagnostics.values():
                record(dict(row))
