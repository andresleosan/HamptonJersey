from pathlib import Path
import importlib.util
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PUBLISH = ROOT / 'docs/qa/full-app/publish'

class BackendOverlayTests(unittest.TestCase):
    def load_overlay(self):
        self.assertTrue((PUBLISH / 'overlay_backend.py').is_file(), 'backend overlay implementation is missing')
        spec = importlib.util.spec_from_file_location('qa_backend_overlay', PUBLISH / 'overlay_backend.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def stage(self, path):
        for folder in ('server', 'shared'):
            shutil.copytree(ROOT / folder, path / folder)
        (path / 'site').mkdir()
        for name in ('requirements.js', 'lib.js'):
            shutil.copyfile(ROOT / 'site' / name, path / 'site' / name)
        shutil.copyfile(ROOT / 'docs/qa/full-app/setup.sql', path / 'setup.sql')
        (path / 'package.json').write_text('{"type":"module"}')

    def test_refuses_source_checkout_and_unknown_source_without_writing(self):
        overlay = self.load_overlay()
        with self.assertRaises(ValueError):
            overlay.apply_backend(ROOT)
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            self.stage(work)
            target = work / 'server/chat.js'
            target.write_text(target.read_text() + '\n// unexpected source change\n')
            before = {p.relative_to(work): p.read_bytes() for p in work.rglob('*') if p.is_file()}
            with self.assertRaises(ValueError):
                overlay.apply_backend(work)
            after = {p.relative_to(work): p.read_bytes() for p in work.rglob('*') if p.is_file()}
            self.assertEqual(before, after)

    def test_staged_integrations_run_without_network_or_source_mutation(self):
        overlay = self.load_overlay()
        source_before = {p: (ROOT / 'server' / p).read_bytes() for p in ('drive.js', 'email.js', 'chat.js', 'turnstile.js')}
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            self.stage(work)
            result = overlay.apply_backend(work)
            self.assertEqual(result['status'], 'prepared')
            self.assertTrue((work / 'server/qa-integrations.js').is_file())
            modules = os.environ.get('QA_F_DEPS')
            if modules:
                if os.name == 'nt':
                    subprocess.run(['cmd', '/c', 'mklink', '/J', str(work / 'node_modules'), modules], check=True, capture_output=True)
                else:
                    (work / 'node_modules').symlink_to(Path(modules), target_is_directory=True)
            env = dict(os.environ, QA_BACKEND_ROOT=str(work), QA_BACKEND_FULL='1' if modules else '0')
            run = subprocess.run(['node', '--test', str(ROOT / 'tests/test_full_app_qa_integrations.mjs')], env=env, text=True, capture_output=True)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual(source_before, {p: (ROOT / 'server' / p).read_bytes() for p in source_before})

if __name__ == '__main__':
    unittest.main()
