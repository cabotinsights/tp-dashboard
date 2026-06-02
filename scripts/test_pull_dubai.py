#!/usr/bin/env python3
"""Tests for pull-dubai-fast.py response-validation guards.

Regression cover for the 2026-06-02 incident: a transient DNS failure made the
TP MCP return {"isError": true, ...} as a *successful* tool result (not an
exception), which got written to disk over good data and stamped pulled_at=TODAY.
"""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

# Load the hyphenated module by path.
_spec = importlib.util.spec_from_file_location(
    "pull_dubai_fast", Path(__file__).resolve().parent / "pull-dubai-fast.py"
)
pdf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pdf)

GOOD_FITNESS = {
    "current": {"ctl": 67.7, "atl": 67.6, "tsb": 7.5, "fitness_status": "Neutral"},
    "daily_data": [{"date": "2026-06-01", "ctl": 67.7, "atl": 67.6, "tsb": 7.5}],
}
ERROR_RESPONSE = {
    "isError": True,
    "error_code": "NETWORK_ERROR",
    "message": "Network error: [Errno 8] nodename nor servname provided, or not known",
}


class HasUsableFitness(unittest.TestCase):
    def test_rejects_iserror_response(self):
        self.assertFalse(pdf.has_usable_fitness(ERROR_RESPONSE))

    def test_rejects_missing_current(self):
        self.assertFalse(pdf.has_usable_fitness({"daily_data": []}))

    def test_rejects_non_numeric_ctl(self):
        self.assertFalse(pdf.has_usable_fitness({"current": {"ctl": None}}))
        self.assertFalse(pdf.has_usable_fitness({"current": {"ctl": True}}))

    def test_accepts_good_fitness(self):
        self.assertTrue(pdf.has_usable_fitness(GOOD_FITNESS))


class AlreadyPulled(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.raw_dir = Path(self._tmp.name)
        self._orig = pdf.RAW_DIR
        pdf.RAW_DIR = self.raw_dir

    def tearDown(self):
        pdf.RAW_DIR = self._orig
        self._tmp.cleanup()

    def _write(self, aid, fitness):
        (self.raw_dir / f"{aid}.json").write_text(json.dumps({
            "id": aid, "name": "x", "pulled_at": pdf.TODAY,
            "fitness": fitness, "workouts": {"workouts": []}, "recovery": [],
        }))

    def test_error_file_is_not_already_pulled(self):
        # A file stamped TODAY but holding an error response must be re-pulled.
        self._write("111", ERROR_RESPONSE)
        self.assertFalse(pdf.already_pulled("111"))

    def test_good_fresh_file_is_already_pulled(self):
        self._write("222", GOOD_FITNESS)
        self.assertTrue(pdf.already_pulled("222"))


if __name__ == "__main__":
    unittest.main()
