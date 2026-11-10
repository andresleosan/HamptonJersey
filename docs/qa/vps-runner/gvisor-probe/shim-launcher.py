#!/usr/bin/python3
"""QA-only optional shim discovery; never changes Docker's default runtime."""
import os
import sys

ROOT='/opt/hampton-qa-gvisor-probe/release-20261102.0'
# This PATH belongs only to this shim and its children, not the host or daemon.
os.environ['PATH']=ROOT+'/bin:/usr/sbin:/usr/bin:/sbin:/bin'
os.execv(ROOT+'/dist/containerd-shim-runsc-v1',[ROOT+'/dist/containerd-shim-runsc-v1',*sys.argv[1:]])
