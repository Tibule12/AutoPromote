"""Retire unmetered optional API spend when renewable processing is enabled.

CPU render admission is not an external-model budget. There is intentionally no
client/environment authorization override: a future separately priced provider
adapter must supply enforced model/token limits and verified usage settlement.
"""
import os


def assert_provider_budget():
    if os.getenv("FREE_FIRST_USAGE_ENABLED") == "true" or os.getenv("PROCESSING_BUDGET_REQUIRED") == "true":
        raise RuntimeError("BOUNDED_EXTERNAL_API_ADAPTER_REQUIRED")
