#!/usr/bin/env python3
"""Reconcile accepted local research into a private, non-authorizing candidate.

This is an offline preparation step. It creates no runtime source, decision,
database record or permission, and never performs network access.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import stat
import sys
import uuid
from collections import Counter
from pathlib import Path

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_CHANNELS = 20000
REVIEW_STATES = {
    'automation_and_reuse_review', 'automation_restricted_review', 'channel_url_missing',
    'deferred_connector', 'excluded_by_project', 'historical_reference',
    'identity_and_rights_review', 'manual_review_required', 'reference_only',
    'social_manual_out_of_scope', 'specific_restriction_review', 'terms_and_method_review',
}


def _inside(root, name):
    if not isinstance(name, (str, os.PathLike)):
        raise ValueError('Invalid evidence reference')
    name = os.fspath(name)
    if not name or '\0' in name:
        raise ValueError('Invalid evidence reference')
    path = Path(name)
    path = path if path.is_absolute() else root / path
    if '..' in path.parts or not path.is_relative_to(root) or path == root:
        raise ValueError('Evidence must be a file within the workspace')
    return path


def _open_directory(root_fd, parts):
    current = os.dup(root_fd)
    try:
        for part in parts:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=current)
            os.close(current)
            current = next_fd
        return current
    except OSError as error:
        os.close(current)
        raise ValueError('Workspace directory is unavailable or is a symlink') from error


def _bytes(path, *, root, root_fd):
    parts = path.relative_to(root).parts
    directory = _open_directory(root_fd, parts[:-1])
    descriptor = None
    try:
        descriptor = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_FILE_BYTES:
            raise ValueError('Evidence is not a bounded regular file')
        chunks, total = [], 0
        while True:
            chunk = os.read(descriptor, min(65536, MAX_FILE_BYTES + 1 - total))
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_FILE_BYTES:
                raise ValueError('Evidence exceeds size limit')
            chunks.append(chunk)
        return b''.join(chunks)
    except OSError as error:
        raise ValueError('Evidence is unavailable or is a symlink') from error
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(directory)


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate evidence JSON key')
        result[key] = value
    return result


def _identifier(value):
    return isinstance(value, str) and bool(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,159}', value))


def build_candidate(workspace, acceptance_path, review_manifest_path):
    root = Path(workspace).resolve(strict=True)
    if not root.is_dir():
        raise ValueError('Workspace must be a directory')
    try:
        root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    except OSError as error:
        raise ValueError('Workspace is unavailable') from error
    try:
        return _build_candidate(root, root_fd, acceptance_path, review_manifest_path)
    finally:
        os.close(root_fd)


def _build_candidate(root, root_fd, acceptance_path, review_manifest_path):
    acceptance_file = _inside(root, acceptance_path)
    review_manifest_file = _inside(root, review_manifest_path)
    snapshot = {}

    def read(path):
        if path not in snapshot:
            snapshot[path] = _bytes(path, root=root, root_fd=root_fd)
        return snapshot[path]

    def digest(path):
        return hashlib.sha256(read(path)).hexdigest()

    def json_object(path):
        try:
            value = json.loads(read(path), object_pairs_hook=_unique_object)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError('Invalid evidence JSON') from error
        if not isinstance(value, dict):
            raise ValueError('Invalid evidence object')
        return value

    def checked_ref(reference):
        if not isinstance(reference, dict):
            raise ValueError('Missing evidence reference')
        expected = reference.get('sha256')
        if not isinstance(expected, str) or not re.fullmatch(r'[0-9a-f]{64}', expected):
            raise ValueError('Invalid evidence hash')
        path = _inside(root, reference.get('path'))
        if digest(path) != expected:
            raise ValueError('Evidence hash mismatch')
        return path

    acceptance = json_object(acceptance_file)
    if (acceptance.get('schema_version'), acceptance.get('event_kind'), acceptance.get('task_id'), acceptance.get('status')) != (
            1, 'research_accepted', 'BUS-23', 'accepted_locally'):
        raise ValueError('Research acceptance is missing')
    checked_ref(acceptance.get('proposal'))
    evidence = acceptance.get('evidence')
    if not isinstance(evidence, list) or not evidence or len(evidence) > 1000:
        raise ValueError('Accepted evidence is missing')
    accepted_files = [checked_ref(item) for item in evidence]
    if len(set(accepted_files)) != len(accepted_files):
        raise ValueError('Duplicate accepted evidence')

    manifest = json_object(review_manifest_file)
    if (manifest.get('schema_version'), manifest.get('status')) != (1, 'documentary_review_only_not_executable'):
        raise ValueError('Documentary review is missing')
    references = {key: checked_ref(manifest.get(key)) for key in
                  ('acceptance', 'handoff', 'decisions', 'legal_evidence', 'queue')}
    if references['acceptance'] != acceptance_file or references['handoff'] not in accepted_files:
        raise ValueError('Review does not match accepted evidence')
    decisions = json_object(references['decisions'])
    if (decisions.get('schema_version'), decisions.get('task_id'), decisions.get('status'),
            decisions.get('runtime_decisions_created'), decisions.get('reader_or_connector_activated')) != (
            1, 'BUS-19', 'documentary_review_only_not_executable', False, False):
        raise ValueError('Review is not documentary only')
    if (checked_ref(decisions.get('acceptance_source')) != acceptance_file or
            checked_ref(decisions.get('handoff_source')) != references['handoff']):
        raise ValueError('Review source references do not match')

    try:
        with io.StringIO(read(references['handoff']).decode('utf-8'), newline='') as stream:
            reader = csv.DictReader(stream)
            if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames) or not {'source_id', 'channel_url'}.issubset(reader.fieldnames):
                raise ValueError('Invalid handoff columns')
            handoff = list(reader)
    except (UnicodeDecodeError, csv.Error) as error:
        raise ValueError('Invalid handoff CSV') from error
    reviews = decisions.get('reviews')
    if not isinstance(reviews, list) or not handoff or len(handoff) > MAX_CHANNELS or len(reviews) != len(handoff):
        raise ValueError('Channel counts do not match')
    if (manifest['handoff'].get('rows') != len(handoff) or manifest['decisions'].get('rows') != len(reviews) or
            decisions['handoff_source'].get('rows') != len(handoff)):
        raise ValueError('Recorded channel counts do not match')

    review_map = {}
    states = Counter()
    for review in reviews:
        if not isinstance(review, dict):
            raise ValueError('Invalid review row')
        sid, url, state = review.get('source_id'), review.get('channel_url'), review.get('review_state')
        if not _identifier(sid) or not isinstance(url, str) or len(url) > 8192 or state not in REVIEW_STATES:
            raise ValueError('Invalid review identity or state')
        key = (sid, url)
        expected = 'bus19-review-' + hashlib.sha256((sid + '\0' + url).encode('utf-8')).hexdigest()[:16]
        if key in review_map or review.get('review_ref') != expected:
            raise ValueError('Duplicate or mismatched review reference')
        review_map[key] = review
        states[state] += 1
    if manifest.get('review_state_counts') != dict(states):
        raise ValueError('Recorded review states do not match')

    channels, seen, seen_refs = [], set(), set()
    for number, row in enumerate(handoff, 2):
        if None in row or any(value is None for value in row.values()):
            raise ValueError('Invalid handoff row')
        sid, url = row['source_id'], row['channel_url']
        if not _identifier(sid) or len(url) > 8192:
            raise ValueError('Invalid handoff identity')
        key = (sid, url)
        review = review_map.get(key)
        if key in seen or not review or review['review_ref'] in seen_refs:
            raise ValueError('Handoff and review do not match uniquely')
        seen.add(key)
        seen_refs.add(review['review_ref'])
        channels.append({'source_ref': sid, 'channel_id': review['review_ref'], 'source_kind': 'external',
                         'source_class': 'unclassified', 'access_status': 'pending', 'coverage_claim': 'unknown',
                         'channel_url_known': bool(url), 'review_state': review['review_state'], 'handoff_row': number})
    if len(seen) != len(review_map):
        raise ValueError('Review contains extra channels')
    provenance = {'acceptance_sha256': digest(acceptance_file), 'handoff_sha256': digest(references['handoff']),
                  'review_manifest_sha256': digest(review_manifest_file), 'review_decisions_sha256': digest(references['decisions'])}
    revision = hashlib.sha256(json.dumps(provenance, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return {'schema_version': 1, 'status': 'candidate_not_authorized', 'revision': 'bus23-' + revision,
            'research_status': 'accepted_locally', 'provenance': provenance,
            'counts': {'sources': len({item['source_ref'] for item in channels}), 'channels': len(channels),
                       'without_url': sum(not item['channel_url_known'] for item in channels)}, 'channels': channels}


def write_candidate(output, candidate, *, workspace=None):
    output = Path(output)
    root = Path(workspace).resolve(strict=True) if workspace is not None else output.parent.resolve(strict=True)
    output = _inside(root, output)
    body = (json.dumps(candidate, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8')
    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    directory = None
    temporary = '.candidate-' + uuid.uuid4().hex
    created = False
    try:
        directory = _open_directory(root_fd, output.relative_to(root).parts[:-1])
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=directory)
        created = True
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, output.name, src_dir_fd=directory, dst_dir_fd=directory, follow_symlinks=False)
    finally:
        if created:
            os.unlink(temporary, dir_fd=directory)
        if directory is not None:
            os.close(directory)
        os.close(root_fd)
    return hashlib.sha256(body).hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description='Prepare a private non-authorizing directory candidate.')
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--acceptance', required=True)
    parser.add_argument('--review-manifest', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args(argv)
    try:
        root = Path(args.workspace).resolve(strict=True)
        output = _inside(root, args.output)
        if not output.name.endswith('.local.json'):
            raise ValueError('Output must be a local JSON file within the workspace')
        candidate = build_candidate(root, args.acceptance, args.review_manifest)
        checksum = write_candidate(output, candidate, workspace=root)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print('No se pudo reconciliar el manifiesto: evidencia inválida, no accesible o salida existente.', file=sys.stderr)
        return 1
    print(json.dumps({'status': candidate['status'], 'counts': candidate['counts'], 'sha256': checksum}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
