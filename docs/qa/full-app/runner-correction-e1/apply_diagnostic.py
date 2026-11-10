"""After written E1 approval, replace ONLY the stopped proxy's diagnostic file."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

BUNDLE = Path(__file__).resolve().parent
ROOT = BUNDLE.parents[3]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--authorized-proposal-sha256', required=True)
    args = parser.parse_args()
    raw = (BUNDLE.parent / 'runner-correction-e1-proposal.json').read_bytes()
    if hashlib.sha256(raw).hexdigest() != args.authorized_proposal_sha256:
        raise SystemExit('Correction proposal differs: stop')
    proposal = json.loads(raw)
    for item in proposal['files']:
        if hashlib.sha256((ROOT / item['file']).read_bytes()).hexdigest() != item['sha256']:
            raise SystemExit('Correction file differs: stop')
    original_raw = (BUNDLE.parent / 'runner-proposal.json').read_bytes()
    if hashlib.sha256(original_raw).hexdigest() != proposal['original_proposal_sha256']:
        raise SystemExit('Original proposal differs: stop')
    for item in json.loads(original_raw)['files']:
        if hashlib.sha256((ROOT / item['file']).read_bytes()).hexdigest() != item['sha256']:
            raise SystemExit('Original reviewed file differs: stop')
    for name, expected in proposal['existing_containers'].items():
        fmt = '{"id":{{json .Id}},"status":{{json .State.Status}},"image_id":{{json .Image}}}'
        actual = json.loads(subprocess.check_output(
            ['docker','--context','desktop-linux','inspect',name,'--format',fmt], text=True))
        if actual != expected:
            raise SystemExit('Expected stopped container differs: stop')
    for name, expected_id in proposal['existing_networks'].items():
        actual_id = subprocess.check_output(
            ['docker','--context','desktop-linux','network','inspect',name,'--format','{{.Id}}'], text=True).strip()
        if actual_id != expected_id:
            raise SystemExit('Expected existing network differs: stop')
    target = ROOT / 'test-results/qa-agent-runtime/egress-package/proxy_selftest.py'
    if target.is_symlink() or target.resolve() != target.absolute():
        raise SystemExit('Unexpected diagnostic target: stop')
    before = hashlib.sha256(target.read_bytes()).hexdigest()
    corrected = (BUNDLE / 'proxy_selftest.py').read_bytes()
    after = hashlib.sha256(corrected).hexdigest()
    if before not in {proposal['original_diagnostic_sha256'], after}:
        raise SystemExit('Staged diagnostic differs: stop')
    if before != after:
        target.write_bytes(corrected)
    print('Only reviewed diagnostic updated; no Docker start/recreate or secrets read')


if __name__ == '__main__':
    main()
