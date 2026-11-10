"""Portable, credential-free file queue client. No network/API/process execution."""
import argparse
import hashlib
import importlib.util
import math
import os
from pathlib import Path
import stat
import time
import uuid

MAX_EVIDENCE = 256 * 1024
EVIDENCE_FIELDS = {'v', 'actor', 'suite', 'task', 'source_sha', 'manifest_sha256', 'build_id',
                   'run_id', 'runner_package_sha256', 'api', 'ui', 'network', 'credentials_removed',
                   'owned_entity_cleanup_verified', 'provider_integrations', 'scope', 'limits', 'passed'}
PUBLIC_LIMITS = ['Not proof of all workflows', 'No production verification',
                 'Synthetic audit and maintenance rows may remain']

# Avoid the standard-library module named queue when loaded by absolute path.
_spec = importlib.util.spec_from_file_location('hampton_qa_queue_contract', Path(__file__).with_name('queue.py'))
contract = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(contract)


def _directory(path):
    path = Path(path).absolute()
    if '..' in path.parts:
        raise ValueError('ambiguous queue path')
    for current in (path, *path.parents):
        if current.is_symlink():
            raise ValueError('symlink queue directory')
    if not path.is_dir():
        raise ValueError('queue directory absent')
    return path


def submit(root, suite, task, source_sha):
    job = dict(v=1, id=uuid.uuid4().hex, suite=suite, task=task, source_sha=source_sha)
    contract.parse_request(contract.encode_json(job))
    incoming = _directory(Path(root) / 'incoming')
    # Publish fully flushed bytes with atomic exclusive rename. A hardlink would
    # transiently violate the consumer's mandatory single-link check.
    temporary_name = '.' + job['id'] + '.tmp'
    target_name = job['id'] + '.json'
    if os.name == 'posix':
        import ctypes
        libc = ctypes.CDLL(None, use_errno=True)
        rename = getattr(libc, 'renameat2', None)
        if rename is None:
            raise RuntimeError('Linux renameat2 required for atomic exclusive submission')
        rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
        rename.restype = ctypes.c_int
        with contract.Directory(incoming) as directory:
            directory.write(temporary_name, contract.encode_json(job))
            try:
                if rename(directory.fd, os.fsencode(temporary_name), directory.fd,
                          os.fsencode(target_name), 1) != 0:
                    raise OSError(ctypes.get_errno(), 'atomic exclusive submission failed')
                os.fsync(directory.fd)
            finally:
                directory.remove(temporary_name)
        return job
    temporary = incoming / temporary_name
    target = incoming / target_name
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0)
    fd = os.open(temporary, flags, 0o600)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(contract.encode_json(job))
            stream.flush()
            os.fsync(stream.fileno())
        os.rename(temporary, target)  # Windows rename refuses an existing target
    finally:
        temporary.unlink(missing_ok=True)
    return job


def _read_file(root, name, maximum):
    directory = _directory(Path(root) / 'results')
    if os.name == 'posix':
        with contract.Directory(directory) as handle:
            try:
                return handle.read(name, maximum=maximum)
            except FileNotFoundError:
                return None
    path = directory / name
    try:
        info = path.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > maximum:
        raise ValueError('unsafe result file')
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        actual = os.fstat(fd)
        if (not stat.S_ISREG(actual.st_mode) or actual.st_nlink != 1
                or (actual.st_dev, actual.st_ino) != (info.st_dev, info.st_ino)):
            raise ValueError('result changed')
        data = os.read(fd, maximum + 1)
        if len(data) > maximum:
            raise ValueError('oversize result')
        return data
    finally:
        os.close(fd)


def _validate_evidence(evidence, result):
    if (not isinstance(evidence, dict) or set(evidence) != EVIDENCE_FIELDS
            or type(evidence['v']) is not int or evidence['v'] != 1):
        raise ValueError('invalid evidence schema')
    for key in ('actor', 'suite', 'task', 'source_sha'):
        if evidence[key] != result[key]:
            raise ValueError('evidence request identity mismatch')
    report = result['report']
    for key in ('run_id', 'build_id'):
        if evidence[key] != report[key]:
            raise ValueError('evidence execution identity mismatch')
    for key in ('manifest_sha256', 'runner_package_sha256'):
        if not contract._matches(evidence[key], r'[0-9a-f]{64}'):
            raise ValueError('invalid evidence digest field')
    for group, count in (('api', report['api_checks']), ('ui', report['ui_checks'])):
        rows = evidence[group]
        if not isinstance(rows, list) or len(rows) != count:
            raise ValueError('evidence check count mismatch')
        for row in rows:
            if (not isinstance(row, dict) or set(row) not in ({'case', 'passed'}, {'case', 'passed', 'failure'})
                    or not contract._matches(row['case'], r'[A-Za-z0-9_:+./-]{1,240}')
                    or type(row['passed']) is not bool
                    or ('failure' in row and not contract._matches(row['failure'], r'[A-Za-z0-9_-]{1,64}'))):
                raise ValueError('invalid evidence check')
    network = evidence['network']
    if (not isinstance(network, dict)
            or set(network) != {'off_origin_attempts', 'redirects', 'transport_failures'}
            or any(type(count) is not int or not 0 <= count <= 100000 for count in network.values())):
        raise ValueError('invalid evidence network counters')
    scope = 'general-baseline' if result['suite'] == 'smoke' else 'SPR-02-B-existing-fixture-readonly'
    if (type(evidence['credentials_removed']) is not bool
            or evidence['credentials_removed'] != report['credentials_removed']
            or evidence['owned_entity_cleanup_verified'] is not True
            or evidence['provider_integrations'] != 'simulated-or-disabled'
            or evidence['scope'] != scope or evidence['limits'] != PUBLIC_LIMITS
            or type(evidence['passed']) is not bool
            or evidence['passed'] != (report['status'] == 'passed')):
        raise ValueError('invalid evidence outcome/scope')
    if evidence['passed'] and (any(network.values()) or not all(
            row['passed'] for row in evidence['api'] + evidence['ui'])):
        raise ValueError('passed evidence contains failed checks')
    return evidence


def read_result(root, job, details=False):
    contract.parse_request(contract.encode_json(job))
    data = _read_file(root, job['id'] + '.json', 8192)
    if data is None:
        return None
    result = contract.validate_result(contract.decode_json(data, 8192), job)
    if not details:
        return result
    digest = result['report']['evidence_sha256']
    if result['report']['status'] == 'blocked':
        if digest is not None:
            raise ValueError('blocked result has an evidence digest')
        return dict(result, evidence=None)
    evidence_bytes = _read_file(root, job['id'] + '.evidence.json', MAX_EVIDENCE)
    if evidence_bytes is None or hashlib.sha256(evidence_bytes).hexdigest() != digest:
        raise ValueError('evidence digest mismatch')
    evidence = _validate_evidence(contract.decode_json(evidence_bytes, MAX_EVIDENCE), result)
    return dict(result, evidence=evidence)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.home() / 'encargos/hampton-qa')
    subparsers = parser.add_subparsers(dest='action', required=True)
    submit_parser = subparsers.add_parser('submit')
    submit_parser.add_argument('suite', choices=('smoke', 'history-b'))
    submit_parser.add_argument('--task', required=True)
    submit_parser.add_argument('--source-sha', required=True)
    submit_parser.add_argument('--wait', action='store_true')
    submit_parser.add_argument('--details', action='store_true', help='include verified safe evidence with --wait')
    submit_parser.add_argument('--timeout', type=float, default=1800)
    args = parser.parse_args(argv)
    if not math.isfinite(args.timeout) or args.timeout < 0 or args.timeout > 86400:
        parser.error('timeout must be 0..86400 seconds')
    if args.details and not args.wait:
        parser.error('--details requires --wait')
    try:
        job = submit(args.root, args.suite, args.task, args.source_sha)
        if not args.wait:
            print(contract.encode_json(job).decode('ascii'))
            return 0
        deadline = time.monotonic() + args.timeout
        while True:
            value = read_result(args.root, job, details=args.details)
            if value is not None:
                print(contract.encode_json(value).decode('ascii'))
                return 0 if value['report']['status'] == 'passed' else 1
            if time.monotonic() >= deadline:
                print(contract.encode_json(dict(id=job['id'], status='pending')).decode('ascii'))
                return 2  # Never resubmit or retry an uncertain/pending execution.
            time.sleep(min(1, max(0, deadline - time.monotonic())))
    except (ValueError, OSError, RuntimeError):
        parser.exit(2, 'Queue request/result rejected; inspect the safe queue configuration.\n')


if __name__ == '__main__':
    raise SystemExit(main())
