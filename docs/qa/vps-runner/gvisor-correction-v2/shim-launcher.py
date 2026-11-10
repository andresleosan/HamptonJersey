#!/usr/bin/python3
"""QA-only optional shim discovery; never changes Docker's default runtime."""
import os
import sys

BIN='/opt/hampton-qa-gvisor-v2/bin'
DIST='/opt/hampton-qa-gvisor-probe/release-20261102.0/dist'
# This PATH belongs only to this shim and its children, not the host or daemon.
os.environ['PATH']=BIN+':/usr/sbin:/usr/bin:/sbin:/bin'
os.execv(DIST+'/containerd-shim-runsc-v1',[DIST+'/containerd-shim-runsc-v1',*sys.argv[1:]])
