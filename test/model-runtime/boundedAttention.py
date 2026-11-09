"""Compare actual SDPA outputs; no model weights, cloud calls or test doubles."""
import unittest
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


if __name__=='__main__':unittest.main()
