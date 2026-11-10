"""Compare actual SDPA outputs; no model weights, cloud calls or test doubles."""
import unittest
from unittest.mock import patch
import torch
from torch.nn import functional as F
from model_workers.adapters.bounded_attention import bounded_attention


class BoundedAttention(unittest.TestCase):
    def inputs(self):
        torch.manual_seed(352)
        return [torch.randn(2,3,n,32)for n in [347,501,501]]

    def compare(self,mask=None,**kwargs):
        q,k,v=self.inputs();original=F.scaled_dot_product_attention
        expected=original(q,k,v,attn_mask=mask,**kwargs);records=[]
        with bounded_attention(73,cuda_only=False,record=records.append):
            actual=F.scaled_dot_product_attention(q,k,v,attn_mask=mask,**kwargs)
        torch.testing.assert_close(actual,expected,rtol=2e-5,atol=2e-6)
        self.assertIs(F.scaled_dot_product_attention,original)
        self.assertEqual(records[0]['keyShape'][-2],501)

    def test_full_key_context_and_nondivisible_query_tail(self):self.compare()
    def test_boolean_query_mask(self):
        mask=torch.ones(347,501,dtype=torch.bool);mask[:,:20]=False;self.compare(mask)
    def test_additive_broadcast_mask_and_custom_scale(self):
        mask=torch.zeros(1,501);mask[:,3:13]=-10000;self.compare(mask,scale=.12)
    def test_per_query_additive_mask(self):
        mask=torch.zeros(2,1,347,501);mask[:,:,41:180,30:250]=-10000;self.compare(mask)
    def test_restores_original_after_failure_and_rejects_bad_chunk_bounds(self):
        original=F.scaled_dot_product_attention
        with self.assertRaisesRegex(RuntimeError,'intentional'):
            with bounded_attention(64,cuda_only=False):raise RuntimeError('intentional')
        self.assertIs(F.scaled_dot_product_attention,original)
        for size in [0,513,True]:
            with self.assertRaises(ValueError):
                with bounded_attention(size):pass
    def test_causal_attention_keeps_original_offset_semantics(self):
        q,k,v=self.inputs();expected=F.scaled_dot_product_attention(q,k,v,is_causal=True);records=[]
        with bounded_attention(73,cuda_only=False,record=records.append):
            actual=F.scaled_dot_product_attention(q,k,v,is_causal=True)
        torch.testing.assert_close(actual,expected,rtol=0,atol=0);self.assertEqual(records,[])

    def test_actual_numerical_failure_retries_smaller_blocks_without_relaxing_bounds(self):
        q,k,v=self.inputs();original=F.scaled_dot_product_attention
        # Reproduce a backend that rounds larger GEMMs outside the real guard.
        def rounded(query,key,value,**kwargs):
            result=original(query,key,value,**kwargs)
            return result+.01 if query.shape[-2]>32 else result
        records=[]
        with patch.object(F,'scaled_dot_product_attention',rounded):
            with bounded_attention(128,cuda_only=False,verify_actual=True,
                                   fallback_query_rows=32,record=records.append):
                actual=F.scaled_dot_product_attention(q,k,v)
        with bounded_attention(32,cuda_only=False):
            expected=F.scaled_dot_product_attention(q,k,v)
        torch.testing.assert_close(actual,expected,rtol=0,atol=0)
        self.assertTrue(records[0]['numericalFallbackUsed'])
        self.assertEqual(records[0]['queryRowsPerChunk'],32)
        self.assertGreater(records[0]['candidateProbeMaximumDifference'],.009)
        self.assertLessEqual(records[0]['actualSourceProbeMaximumDifference'],2e-6)

    def test_fallback_is_bounded_and_requires_actual_verification(self):
        for kwargs in [dict(fallback_query_rows=32),
                       dict(fallback_query_rows=128,verify_actual=True),
                       dict(fallback_query_rows=True,verify_actual=True)]:
            with self.assertRaises(ValueError):
                with bounded_attention(128,**kwargs):pass


if __name__=='__main__':unittest.main()
