#!/usr/bin/env python3
"""Orchestrator: crawl → embed → index_tantivy"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent

def run_step(name, command, cwd):
    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"{'='*60}")
    result = subprocess.run(command, shell=True, cwd=cwd)
    if result.returncode != 0:
        print(f"[FAIL] {name} — exit code {result.returncode}")
        sys.exit(1)
    print(f"[OK]   {name} done\n")

if __name__ == "__main__":
    run_step("Crawl (npm start)", "npm start", ROOT / "crawler")
    run_step("Embed → Qdrant", f"{sys.executable} embed.py", ROOT)
    run_step("Index → Tantivy", f"{sys.executable} index_tantivy.py", ROOT)
    print("Pipeline complete. All indices fresh.")