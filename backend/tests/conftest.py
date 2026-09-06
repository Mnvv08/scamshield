"""Disable rate limiting for the test suite.

The tests intentionally make many rapid requests to the same endpoint, which is
precisely the behaviour the limiter blocks in production. Set before app import.
"""
import os

os.environ["RATE_LIMIT_ENABLED"] = "false"
