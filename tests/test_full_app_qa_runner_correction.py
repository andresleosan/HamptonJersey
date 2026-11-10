"""Bound the proposed E1 correction without starting or changing containers."""
import copy
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/qa/full-app/runner'
FIX = ROOT / 'docs/qa/full-app/runner-correction-e1'


class RunnerCorrectionTests(unittest.TestCase):
    def test_original_fourteen_reviewed_files_are_unchanged(self):
        raw = (BASE.parent / 'runner-proposal.json').read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), '6db42ba2693bd3740a1d6cb571a6a52cf54c30b9547aba5a1c4d452e4ebf5dcb')
        for item in json.loads(raw)['files']:
            self.assertEqual(hashlib.sha256((ROOT / item['file']).read_bytes()).hexdigest(), item['sha256'])

    def test_custom_seccomp_adds_only_unconditional_chroot(self):
        self.assertTrue((FIX / 'seccomp_profile.json').is_file(), 'Custom profile must be reviewable')
        original = json.loads((BASE / 'seccomp_profile.json').read_text())
        derived = json.loads((FIX / 'seccomp_profile.json').read_text())
        rule = next(r for r in derived['syscalls'] if all(n in r['names'] for n in ['clone','setns','unshare']))
        self.assertIn('chroot', rule['names'])
        self.assertEqual(rule['action'], 'SCMP_ACT_ALLOW')
        self.assertFalse(rule.get('includes'))
        rule['names'].remove('chroot')
        self.assertEqual(derived, original)

    def test_compose_changes_only_the_seccomp_file_pointer(self):
        self.assertTrue((FIX / 'compose.json').is_file(), 'Derived Compose must be reviewable')
        original = json.loads((BASE / 'compose.json').read_text())
        derived = json.loads((FIX / 'compose.json').read_text())
        options = derived['services']['runner']['security_opt']
        self.assertEqual(options[0], 'no-new-privileges:true')
        self.assertEqual(options[1], 'seccomp=' + str((FIX / 'seccomp_profile.json').resolve()))
        derived['services']['runner']['security_opt'] = copy.deepcopy(original['services']['runner']['security_opt'])
        self.assertEqual(derived, original)


if __name__ == '__main__':
    unittest.main()
