"""Local fixtures only. Windows adapter tests do not certify Linux isolation."""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest import mock

REPO = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location('vps_' + name, REPO / 'docs/qa/vps-runner' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def request(number=1, **changes):
    value = dict(v=1, id=f'{number:032x}', task='SPR-02', suite='smoke', source_sha='a' * 40)
    value.update(changes)
    return value


def report():
    return dict(status='passed', run_id='qa-123', build_id='b' * 64,
                api_checks=137, ui_checks=2, credentials_removed=True, evidence_sha256='c' * 64)


class ParserTests(unittest.TestCase):
    def setUp(self):
        self.q = load('queue')

    def test_accepts_only_closed_request_schema(self):
        self.assertEqual(self.q.parse_request(json.dumps(request()).encode()), request())
        for changes in ({'url': 'https://example.test'}, {'path': '../x'}, {'command': 'true'},
                        {'env': {}}, {'v': True}, {'id': '../x'}, {'source_sha': 'A' * 40},
                        {'task': 'SPR-2'}, {'suite': 'history-b', 'task': 'SPR-03'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.q.parse_request(json.dumps(request(**changes)).encode())

    def test_rejects_invalid_duplicate_oversize_json(self):
        for data in (b'{', b'[]', b'null', b'\xff', b' ' * 2049,
                     json.dumps(request()).replace('"v": 1', '"v": 1, "v": 1').encode()):
            with self.subTest(data=data[:40]), self.assertRaises(ValueError):
                self.q.parse_request(data)

    def test_report_rejects_unsanitized_fields_and_values(self):
        for changes in ({'logs': 'secret'}, {'run_id': 'https://secret/x'}, {'api_checks': True},
                        {'credentials_removed': False, 'status': 'passed'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.q.validate_report(dict(report(), **changes))

    @unittest.skipIf(os.name == 'posix', 'Windows fail-closed contract')
    def test_native_windows_queue_refuses_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(RuntimeError):
                self.q.run_pending({}, Path(directory), lambda *_: report())


class PortableDirectory:
    """Explicit test double for unavailable Windows openat/dir_fd primitives."""
    def __init__(self, path, private=False):
        self.path = Path(path)
        if self.path.is_symlink() or not self.path.is_dir():
            raise ValueError('unsafe test directory')

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def names(self):
        return os.listdir(self.path)

    def read(self, name, maximum=2048, owner=None):
        path = self.path / name
        stat = path.lstat()
        if path.is_symlink() or not path.is_file() or stat.st_nlink != 1 or stat.st_size > maximum:
            raise ValueError('unsafe test input')
        return path.read_bytes()

    def move(self, name, target, target_name=None):
        os.replace(self.path / name, target.path / (target_name or name))

    def remove(self, name):
        if (self.path / name).is_dir() and not (self.path / name).is_symlink():
            raise IsADirectoryError(name)
        (self.path / name).unlink(missing_ok=True)

    def write(self, name, data, mode=0o600):
        target = self.path / name
        with target.open('xb') as stream:
            stream.write(data)

    @property
    def owner(self):
        return self.path.stat().st_uid

    @property
    def sqlite_path(self):
        return str(self.path / 'journal.sqlite3')


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.q = load('queue')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / 'state'
        self.state.mkdir(mode=0o700)
        self.actors = {actor: self.root / actor for actor in ('hermes1', 'hermes2')}
        for root in self.actors.values():
            for child in ('incoming', 'processing', 'results'):
                (root / child).mkdir(parents=True, mode=0o755 if child == 'results' else 0o700)
        self.calls = []
        if os.name != 'posix':
            self.addCleanup(mock.patch.stopall)
            mock.patch.object(self.q, 'Directory', PortableDirectory).start()
            self.lock = threading.Lock()

            @contextlib.contextmanager
            def lock(state):
                acquired = self.lock.acquire(blocking=False)
                try:
                    yield acquired
                finally:
                    if acquired:
                        self.lock.release()
            mock.patch.object(self.q, 'exclusive', lock).start()
            mock.patch.object(self.q, 'require_posix', lambda: None).start()

    def put(self, job=None, actor='hermes1'):
        job = job or request()
        path = self.actors[actor] / 'incoming' / (job['id'] + '.json')
        path.write_text(json.dumps(job), encoding='utf-8')
        return path

    def execute(self, job, actor):
        self.calls.append((job, actor))
        return report()

    def run_queue(self, execute=None):
        return self.q.run_pending(self.actors, self.state, execute or self.execute)

    def result(self, job=None, actor='hermes1'):
        return json.loads((self.actors[actor] / 'results' / ((job or request())['id'] + '.json')).read_text())

    def test_executes_once_and_replays_canonical_result(self):
        self.put()
        self.assertEqual(self.run_queue()['executed'], 1)
        initial = self.result()
        self.assertEqual(initial['report']['status'], 'passed')
        self.assertEqual(initial['source_sha'], 'a' * 40)
        self.assertEqual(initial['actor'], 'hermes1')
        self.assertEqual(self.run_queue()['executed'], 0)
        self.put()
        self.assertEqual(self.run_queue()['duplicates'], 1)
        self.assertEqual(self.result(), initial)
        self.assertEqual(len(self.calls), 1)

    def test_idempotency_is_per_actor_and_rejects_changed_request(self):
        self.put()
        self.run_queue()
        self.put(request(suite='history-b'))
        self.assertEqual(self.run_queue()['rejected'], 1)
        self.assertEqual(self.result()['suite'], 'smoke')
        self.put(actor='hermes2')
        self.assertEqual(self.run_queue()['executed'], 1)
        self.assertEqual(len(self.calls), 2)

    def test_rejects_invalid_json_and_hardlink_before_callback(self):
        self.put().write_bytes(b'{bad')
        self.assertEqual(self.run_queue()['rejected'], 1)
        file = self.put(request(2))
        os.link(file, self.root / 'outside-hardlink')
        self.assertEqual(self.run_queue()['rejected'], 1)
        self.assertEqual(self.calls, [])

    def test_ignores_in_progress_client_temporary_files(self):
        temporary = self.actors['hermes1'] / 'incoming' / ('.' + request()['id'] + '.tmp')
        temporary.write_bytes(b'partial JSON')
        self.assertEqual(self.run_queue()['rejected'], 0)
        self.assertTrue(temporary.exists())
        self.assertEqual(self.calls, [])

    def test_result_is_fully_written_before_visible_publication(self):
        self.put()
        seen = []
        original_write = self.q.Directory.write

        def inspect_write(directory, name, data, mode=0o600):
            if 'report' in data.decode('ascii', errors='ignore'):
                seen.append((name, (self.actors['hermes1'] / 'results' / (request()['id'] + '.json')).exists()))
            return original_write(directory, name, data, mode)
        with mock.patch.object(self.q.Directory, 'write', inspect_write):
            self.run_queue()
        self.assertEqual(len(seen), 1)
        self.assertTrue(seen[0][0].endswith('.tmp'))
        self.assertFalse(seen[0][1])
        self.assertEqual(self.result()['report'], report())

    def test_result_can_be_validated_by_portable_client(self):
        job = request()
        self.put(job)
        self.run_queue()
        self.assertEqual(load('client').read_result(self.actors['hermes1'], job), self.result(job))

    @unittest.skipUnless(os.name == 'posix', 'requires native POSIX umask/fchmod')
    def test_restrictive_service_umask_keeps_results_actor_readable_and_state_private(self):
        previous = os.umask(0o077)
        try:
            self.put()
            self.run_queue()
        finally:
            os.umask(previous)
        result = self.actors['hermes1'] / 'results' / (request()['id'] + '.json')
        self.assertEqual(result.stat().st_mode & 0o777, 0o644)
        self.assertEqual((self.state / 'journal.sqlite3').stat().st_mode & 0o777, 0o600)

    def test_file_with_different_id_is_rejected(self):
        self.put().write_text(json.dumps(request(2)))
        self.assertEqual(self.run_queue()['rejected'], 1)
        self.assertEqual(self.calls, [])

    def test_directory_request_is_quarantined_without_recursing(self):
        target = self.actors['hermes1'] / 'incoming' / (request()['id'] + '.json')
        target.mkdir()
        (target / 'child').write_text('do not recurse into requester directories')
        self.assertEqual(self.run_queue()['rejected'], 1)
        self.assertEqual(self.calls, [])
        self.assertFalse(target.exists())
        quarantined = list((self.actors['hermes1'] / 'processing').glob('.quarantine-*'))
        self.assertEqual(len(quarantined), 1)
        self.assertTrue((quarantined[0] / 'child').exists())

    @unittest.skipUnless(os.name == 'posix', 'requires native POSIX FIFO/openat')
    def test_fifo_rejected_without_blocking(self):
        os.mkfifo(self.actors['hermes1'] / 'incoming' / (request()['id'] + '.json'))
        self.assertEqual(self.run_queue()['rejected'], 1)
        self.assertEqual(self.calls, [])

    @unittest.skipUnless(os.name == 'posix', 'requires native POSIX directory descriptors')
    def test_symlink_ancestor_is_rejected(self):
        alias = self.root / 'alias'
        alias.symlink_to(self.actors['hermes1'], target_is_directory=True)
        self.actors['hermes1'] = alias
        with self.assertRaises(OSError):
            self.run_queue()
        self.assertEqual(self.calls, [])

    def test_rejects_symlink_before_callback(self):
        original = self.root / 'outside'
        original.write_text(json.dumps(request()))
        path = self.actors['hermes1'] / 'incoming' / (request()['id'] + '.json')
        try:
            path.symlink_to(original)
        except OSError:
            self.skipTest('Windows symlink privilege unavailable')
        self.assertEqual(self.run_queue()['rejected'], 1)
        self.assertEqual(self.calls, [])
        self.assertTrue(original.exists())

    def test_uncertain_is_sticky_and_consumes_later_jobs_as_blocked(self):
        self.put()

        def uncertain(*args):
            self.calls.append(args)
            raise self.q.ExecutionUncertain('do not publish private exception text')
        self.assertEqual(self.run_queue(uncertain)['blocked'], 1)
        self.assertEqual(self.result()['report']['status'], 'blocked')
        self.put(request(2))
        self.assertEqual(self.run_queue()['blocked'], 1)
        self.assertEqual(self.result(request(2))['report']['status'], 'blocked')
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(list((self.actors['hermes1'] / 'incoming').iterdir()), [])
        self.assertNotIn('private', json.dumps(self.result()))

    def test_unexpected_callback_exception_and_invalid_report_also_latch(self):
        self.put()
        self.assertEqual(self.run_queue(lambda *_: {'status': 'passed', 'secret': 'x'})['blocked'], 1)
        self.put(request(2))
        self.assertEqual(self.run_queue()['blocked'], 1)
        self.assertEqual(self.calls, [])

    def test_global_lock_excludes_nested_second_actor_execution(self):
        self.put()
        nested = []

        def execute(job, actor):
            self.put(request(2), 'hermes2')
            nested.append(self.run_queue())
            return self.execute(job, actor)
        self.run_queue(execute)
        self.assertTrue(nested[0]['busy'])
        self.assertEqual(nested[0]['executed'], 0)

    def test_interrupted_running_journal_is_never_retried(self):
        self.put()

        def interrupted(*_):
            raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            self.run_queue(interrupted)
        self.put(request(2))
        self.assertGreaterEqual(self.run_queue()['blocked'], 1)
        self.assertEqual(self.calls, [])


class ClientTests(unittest.TestCase):
    def test_submit_and_read_only_safe_result(self):
        client = load('client')
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'incoming').mkdir()
            (root / 'results').mkdir()
            job = client.submit(root, 'smoke', 'SPR-02', 'a' * 40)
            stored = json.loads((root / 'incoming' / (job['id'] + '.json')).read_text())
            self.assertEqual(stored, job)
            self.assertEqual(set(stored), {'v', 'id', 'suite', 'task', 'source_sha'})
            self.assertIsNone(client.read_result(root, job))
            malicious = dict(v=1, id=job['id'], secret='never print')
            (root / 'results' / (job['id'] + '.json')).write_text(json.dumps(malicious))
            with self.assertRaises(ValueError):
                client.read_result(root, job)

    def test_exclusive_submit_does_not_overwrite_existing_job(self):
        client = load('client')
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'incoming').mkdir()
            target = root / 'incoming' / ('d' * 32 + '.json')
            target.write_bytes(b'keep existing')
            with mock.patch.object(client.uuid, 'uuid4', return_value=mock.Mock(hex='d' * 32)):
                with self.assertRaises(OSError):
                    client.submit(root, 'smoke', 'SPR-02', 'a' * 40)
            self.assertEqual(target.read_bytes(), b'keep existing')

    def test_wait_returns_safe_own_report_and_does_not_resubmit(self):
        client = load('client')
        job = request()
        with mock.patch.object(client, 'submit', return_value=job) as submit:
            with mock.patch.object(client, 'read_result', return_value={'report': report()}):
                with mock.patch('builtins.print'):
                    self.assertEqual(client.main(['submit', 'smoke', '--task', 'SPR-02',
                                                  '--source-sha', 'a' * 40, '--wait']), 0)
        self.assertEqual(submit.call_count, 1)

    def test_nan_timeout_is_rejected_before_submission(self):
        client = load('client')
        with mock.patch.object(client, 'submit', side_effect=AssertionError('must not submit')):
            with mock.patch('sys.stderr'), self.assertRaises(SystemExit):
                client.main(['submit', 'smoke', '--task', 'SPR-02', '--source-sha', 'a' * 40,
                             '--timeout', 'nan'])


class ClientEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.client = load('client')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'results').mkdir()
        self.job = request()
        self.evidence = {
            'v': 1, 'actor': 'hermes1', 'suite': 'smoke', 'task': 'SPR-02',
            'source_sha': 'a' * 40, 'manifest_sha256': 'd' * 64,
            'build_id': 'b' * 64, 'run_id': 'qa-123', 'runner_package_sha256': 'e' * 64,
            'api': [{'case': 'fixture/read-existing', 'passed': True}],
            'ui': [{'case': 'history:1280', 'passed': True}],
            'network': {'off_origin_attempts': 0, 'redirects': 0, 'transport_failures': 0},
            'credentials_removed': True, 'owned_entity_cleanup_verified': True,
            'provider_integrations': 'simulated-or-disabled', 'scope': 'general-baseline',
            'limits': ['Not proof of all workflows', 'No production verification',
                       'Synthetic audit and maintenance rows may remain'], 'passed': True}

    def store(self, evidence=None, raw=None):
        value = self.evidence if evidence is None else evidence
        data = raw if raw is not None else (json.dumps(value) + '\n').encode()
        safe_report = report()
        safe_report.update(api_checks=1, ui_checks=1, evidence_sha256=hashlib.sha256(data).hexdigest())
        result = dict(self.job, actor='hermes1', request_hash=hashlib.sha256(
            json.dumps(self.job, sort_keys=True, separators=(',', ':')).encode()).hexdigest(), report=safe_report)
        (self.root / 'results' / (self.job['id'] + '.json')).write_text(json.dumps(result))
        evidence_path = self.root / 'results' / (self.job['id'] + '.evidence.json')
        evidence_path.write_bytes(data)
        return result, evidence_path

    def invoke(self, details=True):
        arguments = ['--root', str(self.root), 'submit', self.job['suite'], '--task', self.job['task'],
                     '--source-sha', self.job['source_sha'], '--wait']
        if details:
            arguments.append('--details')
        output = io.StringIO()
        with mock.patch.object(self.client, 'submit', return_value=self.job):
            with contextlib.redirect_stdout(output), mock.patch('sys.stderr'):
                try:
                    status = self.client.main(arguments)
                except SystemExit as exc:
                    status = exc.code
        return status, output.getvalue()

    def test_details_prints_one_verified_fake_report_with_matching_identity(self):
        result, _ = self.store()
        status, output = self.invoke()
        self.assertEqual(status, 0)
        self.assertEqual(json.loads(output), dict(result, evidence=self.evidence))
        self.assertEqual(len(output.splitlines()), 1)

    def test_history_details_use_its_exact_scope(self):
        self.job['suite'] = 'history-b'
        self.evidence.update(suite='history-b', scope='SPR-02-B-existing-fixture-readonly')
        result, _ = self.store()
        self.assertEqual(self.client.read_result(self.root, self.job, details=True),
                         dict(result, evidence=self.evidence))

    def test_failed_details_preserve_only_safe_check_failure_labels(self):
        self.evidence.update(passed=False)
        self.evidence['api'] = [{'case': 'fixture/read-existing', 'passed': False, 'failure': 'assertion_failed'}]
        result, _ = self.store()
        result['report']['status'] = 'failed'
        (self.root / 'results' / (self.job['id'] + '.json')).write_text(json.dumps(result))
        status, output = self.invoke()
        self.assertEqual(status, 1)
        self.assertEqual(json.loads(output), dict(result, evidence=self.evidence))

    def test_default_summary_ignores_evidence_file_and_keeps_old_schema(self):
        result, path = self.store()
        path.write_bytes(b'not a report')
        status, output = self.invoke(details=False)
        self.assertEqual(status, 0)
        self.assertEqual(json.loads(output), result)
        self.assertNotIn('evidence', json.loads(output))

    def test_hash_mismatch_rejects_before_decode_or_print(self):
        _, path = self.store()
        path.write_bytes(b'not JSON: must fail digest first')
        with self.assertRaisesRegex(ValueError, 'digest'):
            self.client.read_result(self.root, self.job, details=True)
        self.assertEqual(self.invoke(), (2, ''))

    def test_unknown_fields_and_mismatched_source_reject_without_print(self):
        for change in ({'raw_logs': 'private-data'}, {'source_sha': 'f' * 40},
                       {'actor': 'hermes2'}, {'run_id': 'qa-other'}, {'build_id': 'f' * 64},
                       {'task': 'SPR-03'}, {'suite': 'history-b'}):
            with self.subTest(change=change):
                self.store(dict(self.evidence, **change))
                self.assertEqual(self.invoke(), (2, ''))

    def test_nested_schema_labels_limits_and_safety_flags_are_closed(self):
        for change in (
                {'api': [{'case': 'fixture', 'passed': True, 'raw_error': 'private'}]},
                {'api': [{'case': 'label with whitespace', 'passed': True}]},
                {'api': [{'case': 'fixture', 'passed': True, 'failure': 'https://secret'}]},
                {'api': [{'case': 'fixture', 'passed': 1}]},
                {'ui': []}, {'network': {'off_origin_attempts': 0, 'redirects': 0, 'transport_failures': True}},
                {'limits': ['private arbitrary text']}, {'scope': 'all-workflows'},
                {'provider_integrations': 'real'}, {'manifest_sha256': '../manifest'},
                {'runner_package_sha256': 'F' * 64}, {'credentials_removed': False},
                {'owned_entity_cleanup_verified': False}, {'passed': False}, {'v': True}):
            with self.subTest(change=change):
                self.store(dict(copy.deepcopy(self.evidence), **change))
                self.assertEqual(self.invoke(), (2, ''))

    def test_hardlinked_and_oversize_evidence_rejected(self):
        _, path = self.store()
        os.link(path, self.root / 'outside-hardlink')
        self.assertEqual(self.invoke(), (2, ''))
        path.unlink()
        self.store(raw=b' ' * (256 * 1024 + 1))
        self.assertEqual(self.invoke(), (2, ''))

    @unittest.skipUnless(os.name == 'posix', 'requires native POSIX FIFO/openat')
    def test_fifo_and_symlink_evidence_are_rejected_without_following(self):
        _, path = self.store()
        path.unlink()
        os.mkfifo(path)
        self.assertEqual(self.invoke(), (2, ''))
        path.unlink()
        original = self.root / 'outside-evidence.json'
        original.write_text(json.dumps(self.evidence))
        path.symlink_to(original)
        self.assertEqual(self.invoke(), (2, ''))
        self.assertTrue(original.exists())

    def test_blocked_details_have_null_evidence_without_opening_a_file(self):
        result, path = self.store()
        result['report'] = dict(status='blocked', run_id=None, build_id=None, api_checks=0,
                                ui_checks=0, credentials_removed=False, evidence_sha256=None)
        (self.root / 'results' / (self.job['id'] + '.json')).write_text(json.dumps(result))
        path.unlink()
        status, output = self.invoke()
        self.assertEqual(status, 1)
        self.assertEqual(json.loads(output), dict(result, evidence=None))

    def test_details_requires_wait_before_submitting(self):
        with mock.patch.object(self.client, 'submit', side_effect=AssertionError('must not submit')):
            with mock.patch('sys.stderr'), self.assertRaises(SystemExit) as error:
                self.client.main(['submit', 'smoke', '--task', 'SPR-02', '--source-sha', 'a' * 40,
                                  '--details'])
        self.assertEqual(error.exception.code, 2)


if __name__ == '__main__':
    unittest.main()
