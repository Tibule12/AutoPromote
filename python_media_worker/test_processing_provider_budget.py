import os
import unittest
from unittest.mock import patch
from python_media_worker.processing_provider_budget import assert_provider_budget


class ProcessingProviderBudgetTests(unittest.TestCase):
    def test_legacy_mode_retains_its_existing_explicit_provider_configuration(self):
        with patch.dict(os.environ,{},clear=True): assert_provider_budget()

    def test_renewable_cpu_reservation_does_not_authorize_external_models(self):
        for key in ['FREE_FIRST_USAGE_ENABLED','PROCESSING_BUDGET_REQUIRED']:
            with self.subTest(key=key),patch.dict(os.environ,{key:'true'},clear=True):
                with self.assertRaisesRegex(RuntimeError,'BOUNDED_EXTERNAL_API_ADAPTER_REQUIRED'):
                    assert_provider_budget()

    def test_an_environment_or_client_claim_cannot_self_authorize_paid_provider_work(self):
        with patch.dict(os.environ,{'FREE_FIRST_USAGE_ENABLED':'true','PROCESSING_EXTERNAL_API_AUTHORIZED':'true'},clear=True):
            with self.assertRaises(RuntimeError): assert_provider_budget()


if __name__=='__main__': unittest.main()
