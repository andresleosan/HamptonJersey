"""Prepare ONLY the reviewed allowlist after written E approval; never run Docker."""
import argparse
import base64
import hashlib
import io
import json
import tarfile
import urllib.request
from pathlib import Path, PurePosixPath

BUNDLE = Path(__file__).resolve().parent
ROOT = BUNDLE.parents[3]
RUNTIME = ROOT / 'test-results/qa-agent-runtime'
RUNNER_FILES = ['idle.mjs', 'isolation.mjs', 'package.json', 'package-lock.json']
EGRESS_FILES = ['policy.py', 'egress_addon.py', 'proxy_selftest.py']


def extract_package(raw, destination):
    """Extract regular npm package files only, with explicit size/path bounds."""
    total = 0
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        for index, item in enumerate(archive):
            path = PurePosixPath(item.name)
            if (index >= 5000 or path.is_absolute() or not path.parts or
                    path.parts[0] != 'package' or '..' in path.parts or '\\' in item.name or ':' in item.name):
                raise ValueError('Unsafe package path')
            if item.isdir():
                continue
            if not item.isfile() or len(path.parts) < 2:
                raise ValueError('Unsafe package type')
            total += item.size
            if total > 100_000_000 or item.size > 25_000_000:
                raise ValueError('Package exceeds size budget')
            target = destination.joinpath(*path.parts[1:])
            if not target.resolve().is_relative_to(destination.resolve()):
                raise ValueError('Package escapes destination')
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(item) as source:
                target.write_bytes(source.read())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--authorized-proposal-sha256', required=True)
    args = parser.parse_args()
    proposal_file = BUNDLE.parent / 'runner-proposal.json'
    raw = proposal_file.read_bytes()
    if hashlib.sha256(raw).hexdigest() != args.authorized_proposal_sha256:
        raise SystemExit('Proposal hash differs: stop')
    proposal = json.loads(raw)
    for item in proposal['files']:
        if hashlib.sha256((ROOT / item['file']).read_bytes()).hexdigest() != item['sha256']:
            raise SystemExit('Reviewed file differs: stop')
    if RUNTIME.exists():
        raise SystemExit('Runtime staging already exists: inspect; do not replace or delete')
    lock = json.loads((BUNDLE / 'package-lock.json').read_text())
    package = lock['packages']['node_modules/playwright-core']
    if package['resolved'] != 'https://registry.npmjs.org/playwright-core/-/playwright-core-1.65.0.tgz':
        raise SystemExit('Unexpected package URL')
    with urllib.request.urlopen(package['resolved'], timeout=60) as response:
        package_bytes = response.read(25_000_001)
    if len(package_bytes) > 25_000_000:
        raise SystemExit('Compressed package exceeds budget')
    integrity = 'sha512-' + base64.b64encode(hashlib.sha512(package_bytes).digest()).decode()
    if integrity != package['integrity']:
        raise SystemExit('Package integrity differs')
    # No npm execution, install hooks, profile reads, credentials or browser download.
    runner = RUNTIME / 'runner-package'
    egress = RUNTIME / 'egress-package'
    for directory in [runner, egress, RUNTIME / 'results']:
        directory.mkdir(parents=True, exist_ok=False)
    for names, destination in [(RUNNER_FILES, runner), (EGRESS_FILES, egress)]:
        for name in names:
            (destination / name).write_bytes((BUNDLE / name).read_bytes())
    extract_package(package_bytes, runner / 'node_modules/playwright-core')
    installed = json.loads((runner / 'node_modules/playwright-core/package.json').read_text())
    if installed['name'] != 'playwright-core' or installed['version'] != '1.65.0':
        raise SystemExit('Package identity differs; staging must be inspected')
    print('QA allowlist staged; no Docker operations or credentials loaded')


if __name__ == '__main__':
    main()
