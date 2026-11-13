import csv
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / 'scripts' / 'reconcile_accepted_directory.py'
if MODULE.is_file():
    spec = importlib.util.spec_from_file_location('reconcile_accepted_directory', MODULE)
    reconcile = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reconcile)
else:
    reconcile = None


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ref(source, url):
    return 'bus19-review-' + hashlib.sha256((source + '\0' + url).encode()).hexdigest()[:16]


class ManifestReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        (self.root / 'proposal.md').write_text('Synthetic accepted proposal\n')
        self.rows = [
            {'source_id': 'fixture-a', 'channel_url': 'https://fixture.invalid/listings/'},
            {'source_id': 'fixture-b', 'channel_url': ''},
        ]
        self._write_handoff()
        self.acceptance = {'schema_version': 1, 'event_kind': 'research_accepted', 'task_id': 'BUS-23',
                           'status': 'accepted_locally', 'proposal': self._item('proposal.md'),
                           'evidence': [self._item('handoff.csv')]}
        self._write_json('acceptance.json', self.acceptance)
        self.reviews = {'schema_version': 1, 'task_id': 'BUS-19', 'status': 'documentary_review_only_not_executable',
                        'runtime_decisions_created': False, 'reader_or_connector_activated': False,
                        'acceptance_source': self._item('acceptance.json'),
                        'handoff_source': {**self._item('handoff.csv'), 'rows': 2},
                        'reviews': [{**row, 'review_ref': ref(row['source_id'], row['channel_url']),
                                     'review_state': state} for row, state in zip(self.rows, ['terms_and_method_review', 'excluded_by_project'])]}
        self._write_json('reviews.json', self.reviews)
        (self.root / 'evidence.md').write_text('Synthetic evidence\n')
        (self.root / 'queue.csv').write_text('review_ref\n')
        self.manifest = {'schema_version': 1, 'status': 'documentary_review_only_not_executable',
                         'acceptance': self._item('acceptance.json'),
                         'handoff': {**self._item('handoff.csv'), 'rows': 2},
                         'decisions': {**self._item('reviews.json'), 'rows': 2},
                         'legal_evidence': self._item('evidence.md'), 'queue': self._item('queue.csv'),
                         'review_state_counts': {'terms_and_method_review': 1, 'excluded_by_project': 1}}
        self._write_json('review-manifest.json', self.manifest)

    def _item(self, name):
        return {'path': name, 'sha256': digest(self.root / name)}

    def _write_json(self, name, value):
        (self.root / name).write_text(json.dumps(value, ensure_ascii=False) + '\n', encoding='utf-8')

    def _write_handoff(self):
        with (self.root / 'handoff.csv').open('w', newline='', encoding='utf-8') as stream:
            writer = csv.DictWriter(stream, fieldnames=['source_id', 'channel_url'])
            writer.writeheader()
            writer.writerows(self.rows)

    def build(self):
        self.assertIsNotNone(reconcile, 'La reconciliación del manifiesto todavía no está implementada')
        return reconcile.build_candidate(self.root, 'acceptance.json', 'review-manifest.json')

    def test_every_channel_remains_unclassified_and_not_authorized(self):
        candidate = self.build()
        self.assertEqual(candidate['status'], 'candidate_not_authorized')
        self.assertEqual(candidate['counts'], {'sources': 2, 'channels': 2, 'without_url': 1})
        self.assertEqual([row['channel_id'] for row in candidate['channels']],
                         [ref(row['source_id'], row['channel_url']) for row in self.rows])
        self.assertEqual({row['source_class'] for row in candidate['channels']}, {'unclassified'})
        self.assertEqual({row['access_status'] for row in candidate['channels']}, {'pending'})
        self.assertEqual(candidate['channels'][1]['review_state'], 'excluded_by_project')
        self.assertNotIn('https://fixture.invalid', json.dumps(candidate))

    def test_duplicate_json_keys_are_rejected_even_when_hashes_match(self):
        path = self.root / 'reviews.json'
        raw = path.read_text(encoding='utf-8')
        raw = raw.replace('"runtime_decisions_created": false',
                          '"runtime_decisions_created": true, "runtime_decisions_created": false')
        path.write_text(raw, encoding='utf-8')
        self.manifest['decisions'] = {**self._item('reviews.json'), 'rows': 2}
        self._write_json('review-manifest.json', self.manifest)
        with self.assertRaises(ValueError): self.build()

    def test_duplicate_nested_key_is_rejected(self):
        path = self.root / 'reviews.json'
        raw = path.read_text(encoding='utf-8')
        raw = raw.replace('"review_state": "terms_and_method_review"',
                          '"review_state": "excluded_by_project", "review_state": "terms_and_method_review"', 1)
        path.write_text(raw, encoding='utf-8')
        self.manifest['decisions'] = {**self._item('reviews.json'), 'rows': 2}
        self._write_json('review-manifest.json', self.manifest)
        with self.assertRaises(ValueError): self.build()

    def test_escaped_equivalent_key_is_rejected_without_creating_or_overwriting_output(self):
        path = self.root / 'review-manifest.json'
        raw = path.read_text(encoding='utf-8')
        raw = raw.replace('"status": "documentary_review_only_not_executable"',
                          '"st\\u0061tus": "other", "status": "documentary_review_only_not_executable"', 1)
        path.write_text(raw, encoding='utf-8')
        output = self.root / 'candidate.local.json'
        args = ['--workspace', str(self.root), '--acceptance', 'acceptance.json',
                '--review-manifest', 'review-manifest.json', '--output', str(output)]
        self.assertEqual(reconcile.main(args), 1)
        self.assertFalse(output.exists())
        output.write_text('existing output', encoding='utf-8')
        self.assertEqual(reconcile.main(args), 1)
        self.assertEqual(output.read_text(encoding='utf-8'), 'existing output')

    def test_valid_unicode_evidence_remains_accepted(self):
        self.reviews['note'] = 'Revisión sintética: café y 日本語'
        self._write_json('reviews.json', self.reviews)
        self.manifest['decisions'] = {**self._item('reviews.json'), 'rows': 2}
        self._write_json('review-manifest.json', self.manifest)
        self.assertEqual(self.build()['status'], 'candidate_not_authorized')

    def test_tampered_accepted_handoff_is_rejected(self):
        (self.root / 'handoff.csv').write_text('modified\n')
        with self.assertRaises(ValueError): self.build()

    def test_unaccepted_research_is_rejected(self):
        self.acceptance['status'] = 'pending'
        self._write_json('acceptance.json', self.acceptance)
        self.reviews['acceptance_source'] = self._item('acceptance.json')
        self._write_json('reviews.json', self.reviews)
        self.manifest['acceptance'] = self._item('acceptance.json')
        self.manifest['decisions'] = {**self._item('reviews.json'), 'rows': 2}
        self._write_json('review-manifest.json', self.manifest)
        with self.assertRaises(ValueError): self.build()

    def test_review_cannot_reassign_a_channel_even_with_a_matching_file_hash(self):
        self.reviews['reviews'][0]['source_id'] = 'different-source'
        self._write_json('reviews.json', self.reviews)
        self.manifest['decisions'] = {**self._item('reviews.json'), 'rows': 2}
        self._write_json('review-manifest.json', self.manifest)
        with self.assertRaises(ValueError): self.build()

    def test_executable_decisions_are_not_imported_as_documentary_evidence(self):
        self.reviews['runtime_decisions_created'] = True
        self._write_json('reviews.json', self.reviews)
        self.manifest['decisions'] = {**self._item('reviews.json'), 'rows': 2}
        self._write_json('review-manifest.json', self.manifest)
        with self.assertRaises(ValueError): self.build()

    def test_evidence_cannot_escape_the_workspace(self):
        self.acceptance['proposal']['path'] = '../outside.md'
        self._write_json('acceptance.json', self.acceptance)
        self.reviews['acceptance_source'] = self._item('acceptance.json')
        self._write_json('reviews.json', self.reviews)
        self.manifest['acceptance'] = self._item('acceptance.json')
        self.manifest['decisions'] = {**self._item('reviews.json'), 'rows': 2}
        self._write_json('review-manifest.json', self.manifest)
        with self.assertRaises(ValueError): self.build()

    def test_output_never_overwrites_an_existing_file(self):
        candidate = self.build()
        output = self.root / 'candidate.json'
        output.write_text('keep this file')
        with self.assertRaises(FileExistsError): reconcile.write_candidate(output, candidate)
        self.assertEqual(output.read_text(), 'keep this file')

    def test_concurrent_change_cannot_replace_verified_review_bytes(self):
        self.assertIsNotNone(reconcile)
        original = reconcile._bytes
        modified = False
        def read_then_change(path, **kwargs):
            nonlocal modified
            result = original(path, **kwargs)
            if path.name == 'reviews.json' and not modified:
                modified = True
                changed = json.loads(result)
                changed['unreviewed_extra'] = 'changed after validation'
                path.write_text(json.dumps(changed))
            return result
        with patch.object(reconcile, '_bytes', side_effect=read_then_change):
            candidate = self.build()
        self.assertTrue(modified)
        self.assertEqual(candidate['provenance']['review_decisions_sha256'], self.manifest['decisions']['sha256'])

    def test_evidence_replaced_by_external_symlink_cannot_be_read(self):
        self.assertIsNotNone(reconcile)
        other = tempfile.TemporaryDirectory()
        self.addCleanup(other.cleanup)
        external = Path(other.name) / 'synthetic.md'
        external.write_bytes((self.root / 'proposal.md').read_bytes())
        original = reconcile._inside
        swapped = False
        def resolve_then_swap(root, name):
            nonlocal swapped
            path = original(root, name)
            if path.name == 'proposal.md' and not swapped:
                swapped = True
                path.unlink()
                path.symlink_to(external)
            return path
        with patch.object(reconcile, '_inside', side_effect=resolve_then_swap):
            with self.assertRaises(ValueError): self.build()
        self.assertTrue(swapped)

    def test_output_directory_replaced_by_symlink_cannot_escape_workspace(self):
        self.assertIsNotNone(reconcile)
        target = self.root / 'output'
        target.mkdir()
        other = tempfile.TemporaryDirectory()
        self.addCleanup(other.cleanup)
        original = reconcile.write_candidate
        def swap_then_write(*args, **kwargs):
            target.rename(self.root / 'original-output')
            target.symlink_to(other.name, target_is_directory=True)
            return original(*args, **kwargs)
        with patch.object(reconcile, 'write_candidate', side_effect=swap_then_write):
            result = reconcile.main(['--workspace', str(self.root), '--acceptance', 'acceptance.json',
                                     '--review-manifest', 'review-manifest.json', '--output', 'output/candidate.local.json'])
        self.assertEqual(result, 1)
        self.assertFalse((Path(other.name) / 'candidate.local.json').exists())

    def test_source_identifier_cannot_embed_a_url(self):
        self.rows[0]['source_id'] = 'https://fixture.invalid/not-an-identifier'
        self._write_handoff()
        self.acceptance['evidence'] = [self._item('handoff.csv')]
        self._write_json('acceptance.json', self.acceptance)
        self.reviews['acceptance_source'] = self._item('acceptance.json')
        self.reviews['handoff_source'] = {**self._item('handoff.csv'), 'rows': 2}
        self.reviews['reviews'][0].update(self.rows[0])
        self.reviews['reviews'][0]['review_ref'] = ref(self.rows[0]['source_id'], self.rows[0]['channel_url'])
        self._write_json('reviews.json', self.reviews)
        self.manifest['acceptance'] = self._item('acceptance.json')
        self.manifest['handoff'] = {**self._item('handoff.csv'), 'rows': 2}
        self.manifest['decisions'] = {**self._item('reviews.json'), 'rows': 2}
        self._write_json('review-manifest.json', self.manifest)
        with self.assertRaises(ValueError): self.build()


if __name__ == '__main__':
    unittest.main()
