import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]


class InstallTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        s=importlib.util.spec_from_file_location('qa_vps_install',ROOT/'docs/qa/vps-runner/install.py');cls.i=importlib.util.module_from_spec(s);s.loader.exec_module(cls.i)

    def test_approval_rejection_precedes_any_copy_or_docker(self):
        with mock.patch.object(self.i.rt,'load_manifest',side_effect=self.i.rt.CheckError('manifest-hash')),mock.patch.object(self.i.shutil,'copytree') as copy,mock.patch.object(self.i.rt,'docker') as docker:
            with self.assertRaises(self.i.rt.CheckError):self.i.bootstrap('a'*64)
            copy.assert_not_called();docker.assert_not_called()

    def test_identity_invalid_input_is_rejected_before_directory_creation(self):
        with mock.patch.object(self.i,'installed',return_value=({}, {'isolation_passed':True})),mock.patch.object(self.i.rt.IDENTITY.__class__,'mkdir') as mkdir:
            with self.assertRaises(self.i.rt.CheckError):self.i.store_identity('a'*64,{'sessionSecret':'invalid'})
            mkdir.assert_not_called()

    def test_unit_template_keeps_only_fixed_entry_and_stoppost(self):
        text=self.i.service_text('a'*64)
        self.assertIn('controller.py work --approved-manifest-sha256 '+'a'*64,text)
        self.assertIn('controller.py emergency-stop --approved-manifest-sha256 '+'a'*64,text)
        self.assertIn('RestrictAddressFamilies=AF_UNIX',text)
        self.assertNotIn('Environment=',text)

    def test_failed_compose_start_stops_owned_resources_and_saves_failed_receipt(self):
        with mock.patch.object(self.i.rt,'docker',side_effect=self.i.rt.CheckError('compose-failed')),mock.patch.object(self.i,'stop_owned',return_value={'runner':True}) as stop,mock.patch.object(self.i,'save') as save:
            with self.assertRaises(self.i.rt.CheckError):self.i.start_runtime('a'*64,{'runner':'sha256:r','egress':'sha256:e'},{},{})
            stop.assert_called_once_with('a'*64)
            self.assertFalse(save.call_args.args[1]['isolation_passed'])

    @unittest.skipUnless(__import__('os').name=='posix','native POSIX permissions')
    def test_public_copy_has_explicit_modes_and_excludes_unlisted_files_under_umask077(self):
        import os
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);source=root/'source';source.mkdir();(source/'nested').mkdir()
            (source/'nested/public.txt').write_text('public');(source/'unlisted').write_text('not-copied');(source/'manifest.json').write_text('{}')
            old=os.umask(0o077)
            try:self.i.copy_public(source,root/'copy',{'files':[{'file':'nested/public.txt'}]})
            finally:os.umask(old)
            self.assertEqual((root/'copy/nested').stat().st_mode&0o777,0o755)
            self.assertEqual((root/'copy/nested/public.txt').stat().st_mode&0o777,0o644)
            self.assertFalse((root/'copy/unlisted').exists())


if __name__=='__main__':unittest.main()
