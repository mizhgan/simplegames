#!/usr/bin/env python3
"""Оставлено для совместимости: sw.js теперь собирает tools/build.py вместе со всем сайтом."""
import os
import runpy
import sys

sys.argv = [sys.argv[0]]
runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'), run_name='__main__')
