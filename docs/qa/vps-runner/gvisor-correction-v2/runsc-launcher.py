#!/usr/bin/python3
"""Private executable selected only by the offline QA probe shim."""
import os
import sys

BINARY='/opt/hampton-qa-gvisor-probe/release-20261102.0/dist/runsc'
fixed=['--platform=systrap','--systemd-cgroup=true','--network=none','--debug=false','--strace=false','--log-packets=false','--sandbox-creation-cpu-policy=1x','--sandbox-lifecycle-cpu-policy=1x','--oci-seccomp=true']
reserved={flag.split('=',1)[0] for flag in fixed}
if any(arg.split('=',1)[0] in reserved for arg in sys.argv[1:]):
    sys.exit(2)
os.execv(BINARY,[BINARY,*fixed,*sys.argv[1:]])
