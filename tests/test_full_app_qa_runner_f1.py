"""F1 must accept owner-only inheritance without opening the identity boundary."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]


class RunnerF1Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec=importlib.util.spec_from_file_location('qa_f1',ROOT/'docs/qa/full-app/runner-correction-f1/host.py')
        cls.f1=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.f1)

    def acl_fixture(self,directory):
        private=Path(directory).resolve()/'private';private.mkdir()
        script="""$ErrorActionPreference='Stop';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;
$p='"""+str(private).replace("'","''")+"""';$a=Get-Acl -LiteralPath $p;$a.SetOwner($sid);$a.SetAccessRuleProtection($true,$false);
foreach($r in @($a.Access)){$a.RemoveAccessRuleSpecific($r)};
$r=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r);Set-Acl -LiteralPath $p -AclObject $a;
foreach($n in @('client-id.txt','client-secret.txt','session-secret.txt')){[IO.File]::WriteAllText((Join-Path $p $n),'synthetic-placeholder')};"""
        result=subprocess.run(['pwsh.exe','-NoProfile','-NonInteractive','-Command',script],capture_output=True)
        self.assertEqual(result.returncode,0)
        return private

    def test_actual_windows_owner_only_inheritance_is_accepted_without_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            private=self.acl_fixture(directory)
            before={p.name:p.stat().st_mtime_ns for p in private.iterdir()}
            self.f1.check_private_acl(private)
            self.assertEqual(before,{p.name:p.stat().st_mtime_ns for p in private.iterdir()})

    def test_actual_windows_other_reader_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            private=self.acl_fixture(directory);file=private/'client-id.txt'
            script="$p='"+str(file).replace("'","''")+"';$a=Get-Acl -LiteralPath $p;$sid=New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545');$r=New-Object Security.AccessControl.FileSystemAccessRule($sid,'Read','Allow');$a.AddAccessRule($r);Set-Acl -LiteralPath $p -AclObject $a"
            self.assertEqual(subprocess.run(['pwsh.exe','-NoProfile','-NonInteractive','-Command',script],capture_output=True).returncode,0)
            with self.assertRaises(self.f1.base.HostError):self.f1.check_private_acl(private)

    def test_acl_failure_precedes_any_private_read(self):
        with mock.patch.object(self.f1,'check_private_acl',side_effect=self.f1.base.HostError('private-acl')),mock.patch.object(self.f1.base,'read_private_file') as read:
            with self.assertRaises(self.f1.base.HostError):self.f1.load_private(Path('C:/synthetic'))
            read.assert_not_called()

    def test_unapproved_hash_rejected_before_original_manifest_or_private_access(self):
        with tempfile.TemporaryDirectory() as directory,mock.patch.object(self.f1.base,'load_approved') as original:
            root=Path(directory);path=root/'docs/qa/full-app/runner-correction-f1-proposal.json';path.parent.mkdir(parents=True);path.write_text('{}')
            with self.assertRaises(self.f1.base.HostError):self.f1.load_correction(root,'a'*64)
            original.assert_not_called()

    def test_non_synthetic_or_malformed_private_values_are_not_logged(self):
        with mock.patch.object(self.f1,'check_private_acl'),mock.patch.object(self.f1.base,'no_reparse'),mock.patch.object(self.f1.base,'read_private_file',return_value='sensitive-placeholder'):
            with self.assertRaises(self.f1.base.HostError) as error:self.f1.load_private(Path('C:/synthetic'))
            self.assertNotIn('sensitive-placeholder',str(error.exception))

    def test_uncertain_prior_run_blocks_before_private_values(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);runtime=root/self.f1.base.RUNTIME;runtime.mkdir(parents=True)
            pending=runtime/'.qa-f-in-flight';pending.write_text('prior-uncertain-run')
            proposal={'runner_manifest_data':{'files':[]},'runner_sha256':'a'*64}
            with mock.patch.object(self.f1,'load_correction',return_value=proposal),mock.patch.object(self.f1.base,'verify_tree'),mock.patch.object(self.f1.base,'verify_runtime'),mock.patch.object(self.f1,'audit_private'),mock.patch.object(self.f1,'load_private') as read:
                with self.assertRaises(self.f1.base.HostError):self.f1.execute(root,'a'*64,'run-test')
                read.assert_not_called()
            self.assertEqual(pending.read_text(),'prior-uncertain-run')

    def test_open_private_directory_inheritance_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            private=Path(directory).resolve()/'private';private.mkdir()
            for name in ['client-id.txt','client-secret.txt','session-secret.txt']:(private/name).write_text('synthetic')
            with self.assertRaises(self.f1.base.HostError):self.f1.check_private_acl(private)


if __name__=='__main__':unittest.main()
