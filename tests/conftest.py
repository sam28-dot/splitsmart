import sys
import os
# Allow imports from backend/ when running pytest from splitsmart/ root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
