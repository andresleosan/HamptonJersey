"""Root-owned POSIX queue controller; never accepts executable requester input.

The installer must create actor roots and incoming/processing/results first.
processing is root-only, results is root-owned and actor-readable, incoming is
owned by its submitting actor. State must be outside all actor volumes. No
Windows execution fallback exists. Windows unit adapters are explicitly tests.
"""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import uuid

MAX_REQUEST = 2048
REQUEST_FIELDS = {'v', 'id', 'task', 'suite', 'source_sha'}
REPORT_FIELDS = {'status', 'run_id', 'build_id', 'api_checks', 'ui_checks',
                 'credentials_removed', 'evidence_sha256'}
RESULT_FIELDS = {'v', 'id', 'actor', 'request_hash', 'suite', 'task', 'source_sha', 'report'}


class ExecutionUncertain(Exception):
    """The executor cannot prove its run stopped and credentials were removed."""


def _matches(value, pattern):
    return isinstance(value, str) and re.fullmatch(pattern, value, re.ASCII) is not None


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def decode_json(data, maximum):
    if not isinstance(data, bytes) or len(data) > maximum:
        raise ValueError('invalid JSON size')
    try:
        return json.loads(data.decode('utf-8'), object_pairs_hook=_object,
                          parse_constant=lambda _: (_ for _ in ()).throw(ValueError('invalid constant')))
    except (UnicodeError, json.JSONDecodeError, RecursionError) as exc:
        raise ValueError('invalid JSON') from exc


def encode_json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')


def parse_request(data):
    job = decode_json(data, MAX_REQUEST)
    if (not isinstance(job, dict) or set(job) != REQUEST_FIELDS or type(job['v']) is not int
            or job['v'] != 1 or not _matches(job['id'], r'[0-9a-f]{32}')
            or not _matches(job['task'], r'[A-Z]{2,6}-[0-9]{2}')
            or job['suite'] not in ('smoke', 'history-b')
            or not _matches(job['source_sha'], r'[0-9a-f]{40}')
            or (job['suite'] == 'history-b' and job['task'] != 'SPR-02')):
        raise ValueError('invalid request schema')
    return job


def validate_report(report):
    if not isinstance(report, dict) or set(report) != REPORT_FIELDS:
        raise ValueError('invalid report schema')
    if report['status'] not in ('passed', 'failed', 'blocked'):
        raise ValueError('invalid status')
    for name in ('run_id', 'build_id'):
        if report[name] is not None and not _matches(report[name], r'[A-Za-z0-9_.:-]{1,128}'):
            raise ValueError('invalid report identifier')
    for name in ('api_checks', 'ui_checks'):
        if type(report[name]) is not int or not 0 <= report[name] <= 100000:
            raise ValueError('invalid check count')
    if type(report['credentials_removed']) is not bool:
        raise ValueError('invalid cleanup flag')
    digest = report['evidence_sha256']
    if digest is not None and not _matches(digest, r'[0-9a-f]{64}'):
        raise ValueError('invalid evidence digest')
    if report['status'] in ('passed', 'failed') and (
            not report['credentials_removed'] or report['run_id'] is None
            or report['build_id'] is None or digest is None):
        raise ValueError('completed result lacks verified cleanup/evidence')
    return report


def validate_result(value, job=None):
    if not isinstance(value, dict) or set(value) != RESULT_FIELDS:
        raise ValueError('invalid result schema')
    request = {key: value[key] for key in REQUEST_FIELDS}
    # Results do not contain request v separately.
    parse_request(encode_json(request))
    if (not _matches(value['actor'], r'[a-z][a-z0-9-]{0,31}')
            or value['request_hash'] != hashlib.sha256(encode_json(request)).hexdigest()):
        raise ValueError('invalid result identity')
    if job is not None and request != job:
        raise ValueError('result does not match request')
    validate_report(value['report'])
    return value


def require_posix():
    if os.name != 'posix' or not hasattr(os, 'O_NOFOLLOW') or not hasattr(os, 'O_DIRECTORY'):
        raise RuntimeError('queue execution requires POSIX openat/O_NOFOLLOW and flock')


class Directory:
    """Pinned directory descriptor; every ancestor is opened with O_NOFOLLOW."""
    def __init__(self, path, private=False):
        require_posix()
        path = Path(path)
        if not path.is_absolute() or '..' in path.parts:
            raise ValueError('absolute unambiguous directory required')
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
        fd = os.open('/', flags)
        try:
            for part in path.parts[1:]:
                next_fd = os.open(part, flags, dir_fd=fd)
                os.close(fd)
                fd = next_fd
            info = os.fstat(fd)
            forbidden = 0o022 if private == 'readable' else 0o077
            if private and (info.st_uid != os.geteuid() or info.st_mode & forbidden):
                raise ValueError('controller directory ownership/mode unsafe')
            self.fd = fd
            self.owner = info.st_uid
        except BaseException:
            os.close(fd)
            raise

    def __enter__(self):
        return self

    def __exit__(self, *_):
        os.close(self.fd)

    def names(self):
        return os.listdir(self.fd)

    def read(self, name, maximum=MAX_REQUEST, owner=None):
        # O_NONBLOCK prevents even a malicious FIFO from stalling the root loop.
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                     dir_fd=self.fd)
        try:
            info = os.fstat(fd)
            if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                    or info.st_size > maximum or (owner is not None and info.st_uid != owner)):
                raise ValueError('unsafe queue file')
            data = os.read(fd, maximum + 1)
            if len(data) > maximum or os.fstat(fd).st_nlink != 1:
                raise ValueError('queue file changed')
            return data
        finally:
            os.close(fd)

    def move(self, name, target, target_name=None):
        os.rename(name, target_name or name, src_dir_fd=self.fd, dst_dir_fd=target.fd)
        os.fsync(self.fd)
        os.fsync(target.fd)

    def remove(self, name):
        try:
            os.unlink(name, dir_fd=self.fd)
            os.fsync(self.fd)
        except FileNotFoundError:
            pass

    def write(self, name, data, mode=0o600):
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                     mode, dir_fd=self.fd)
        try:
            # The service deliberately uses umask 0077. The newly created,
            # exclusively owned descriptor must receive the intended mode so
            # sanitized reports remain readable by the submitting actor.
            os.fchmod(fd, mode)
            with os.fdopen(fd, 'wb', closefd=False) as stream:
                stream.write(data)
                stream.flush()
                os.fsync(fd)
        finally:
            os.close(fd)
        os.fsync(self.fd)

    @property
    def sqlite_path(self):
        # Linux /proc descriptor path keeps SQLite and its rollback journal on
        # the pinned root-only directory, even if a pathname ancestor is renamed.
        return f'/proc/self/fd/{self.fd}/journal.sqlite3'


@contextlib.contextmanager
def exclusive(state):
    import fcntl
    fd = os.open('controller.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC,
                 0o600, dir_fd=state.fd)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                or info.st_uid != os.geteuid() or info.st_mode & 0o077):
            raise ValueError('unsafe controller lock')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
        else:
            try:
                yield True
            finally:
                fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)


def _blocked():
    return dict(status='blocked', run_id=None, build_id=None, api_checks=0,
                ui_checks=0, credentials_removed=False, evidence_sha256=None)


def _latch(state):
    try:
        state.write('uncertain', b'Inspection required before further execution.\n')
    except FileExistsError:
        pass


def _publish(results, name, value):
    # The canonical JSON is committed in the root journal first; publish only
    # complete bytes. A crash before rename leaves a harmless root-owned temp.
    temporary = '.' + name + '.tmp'
    results.remove(temporary)
    results.write(temporary, encode_json(value), mode=0o644)
    results.move(temporary, results, name)


def _discard(processing, name):
    try:
        processing.remove(name)
    except IsADirectoryError:
        # Never traverse an actor-supplied directory, even during rejection.
        processing.move(name, processing, '.quarantine-' + uuid.uuid4().hex)


def _database(state):
    try:
        state.write('journal.sqlite3', b'')
    except FileExistsError:
        state.read('journal.sqlite3', maximum=256 * 1024 * 1024, owner=state.owner)
    connection = sqlite3.connect(state.sqlite_path)
    connection.execute('PRAGMA synchronous=FULL')
    connection.execute('CREATE TABLE IF NOT EXISTS jobs (actor TEXT, id TEXT, request_hash TEXT NOT NULL, '
                       'phase TEXT NOT NULL, result TEXT, PRIMARY KEY(actor,id))')
    connection.commit()
    return connection


def run_pending(actor_roots, state_dir, execute):
    """Claim and serialize pending jobs; return counts without exception/log data.

    Any interruption after journaling phase=running is uncertain. Neither
    uncertain jobs nor subsequent requests are executed until root inspects and
    explicitly resolves BOTH the journal and sticky marker. This function never
    deletes the marker. Exceptions from execute are never included in a report.
    """
    require_posix()
    counts = dict(executed=0, duplicates=0, rejected=0, blocked=0, busy=False)
    state_path = Path(state_dir).absolute()
    roots = {}
    for actor, root in actor_roots.items():
        root = Path(root).absolute()
        if (not _matches(actor, r'[a-z][a-z0-9-]{0,31}') or '..' in root.parts
                or root == state_path or root in state_path.parents or state_path in root.parents):
            raise ValueError('unsafe actor/state mapping')
        roots[actor] = root
    with Directory(state_path, private=True) as state, exclusive(state) as acquired:
        if not acquired:
            counts['busy'] = True
            return counts
        with contextlib.closing(_database(state)) as database:
            if database.execute("SELECT 1 FROM jobs WHERE phase='running' LIMIT 1").fetchone():
                _latch(state)
            for actor, root in sorted(roots.items()):
                with (Directory(root / 'incoming') as incoming,
                      Directory(root / 'processing', private=True) as processing,
                      Directory(root / 'results', private='readable') as results):
                    # Orphaned claimed jobs are recovered before fresh claims.
                    for source in (processing, incoming):
                        for name in sorted(source.names()):
                            if source is processing and _matches(name, r'\.quarantine-[0-9a-f]{32}'):
                                continue
                            if source is incoming and _matches(name, r'\.[0-9a-f]{32}\.tmp'):
                                continue  # atomic client submission is still being written
                            if source is incoming:
                                try:
                                    source.move(name, processing)
                                except FileNotFoundError:
                                    continue
                            if not _matches(name, r'[0-9a-f]{32}\.json'):
                                # Never follow or interpret requester-controlled names.
                                counts['rejected'] += 1
                                _discard(processing, name)
                                continue
                            try:
                                job = parse_request(processing.read(name, owner=incoming.owner))
                                if name != job['id'] + '.json':
                                    raise ValueError('filename/request mismatch')
                            except (ValueError, OSError):
                                counts['rejected'] += 1
                                _discard(processing, name)
                                continue
                            request_hash = hashlib.sha256(encode_json(job)).hexdigest()
                            row = database.execute('SELECT request_hash,phase,result FROM jobs WHERE actor=? AND id=?',
                                                   (actor, job['id'])).fetchone()
                            if row and row[0] != request_hash:
                                counts['rejected'] += 1
                                processing.remove(name)
                                continue
                            if row and row[1] == 'done':
                                _publish(results, name, json.loads(row[2]))
                                counts['duplicates'] += 1
                                processing.remove(name)
                                continue
                            if 'uncertain' in state.names() or row:
                                safe_report = _blocked()
                                counts['blocked'] += 1
                            else:
                                database.execute('INSERT INTO jobs VALUES (?,?,?,?,NULL)',
                                                 (actor, job['id'], request_hash, 'running'))
                                database.commit()  # durable BEFORE handing off any mutable QA
                                try:
                                    safe_report = validate_report(execute(dict(job), actor))
                                    counts['executed'] += 1
                                    if safe_report['status'] == 'blocked':
                                        counts['blocked'] += 1
                                except Exception:
                                    _latch(state)
                                    safe_report = _blocked()
                                    counts['blocked'] += 1
                            result = dict(job, actor=actor, request_hash=request_hash, report=safe_report)
                            database.execute('INSERT OR REPLACE INTO jobs VALUES (?,?,?,?,?)',
                                             (actor, job['id'], request_hash, 'done', encode_json(result).decode('ascii')))
                            database.commit()
                            _publish(results, name, result)
                            processing.remove(name)
    return counts
