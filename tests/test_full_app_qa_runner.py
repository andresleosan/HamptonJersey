"""Offline adversarial checks of the proposed QA runner boundary."""
import importlib.util
import ipaddress
import json
from pathlib import Path
import unittest
import io
import tarfile
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
import sys

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / 'docs/qa/full-app/runner'


class QaRunnerTests(unittest.TestCase):
    def policy(self):
        path = BUNDLE / 'policy.py'
        self.assertTrue(path.is_file(), 'QA runner policy must be prepared')
        spec = importlib.util.spec_from_file_location('qa_runner_policy', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def compose(self):
        self.assertTrue((BUNDLE / 'compose.json').is_file(), 'QA compose must be prepared')
        return json.loads((BUNDLE / 'compose.json').read_text())

    def test_only_exact_https_targets_and_matching_authority(self):
        p = self.policy()
        for host in ['hamptonjersey-qa.pages.dev', 'challenges.cloudflare.com']:
            self.assertTrue(p.allowed_request('https', host, 443, host))
            self.assertTrue(p.allowed_request('https', host, 443, host + ':443'))
        for host in ['hamptonjersey.pages.dev', 'hamptonjersey-qa.pages.dev.evil.test',
                     'preview.hamptonjersey-qa.pages.dev', '127.0.0.1', 'host.docker.internal',
                     '169.254.169.254', 'example.test', 'hamptonjersey-qa.pages.dev.']:
            self.assertFalse(p.allowed_request('https', host, 443, host), host)
        self.assertFalse(p.allowed_request('http', 'hamptonjersey-qa.pages.dev', 80, 'hamptonjersey-qa.pages.dev'))
        self.assertFalse(p.allowed_request('https', 'hamptonjersey-qa.pages.dev', 443, 'hamptonjersey.pages.dev'))
        self.assertFalse(p.allowed_request('https', 'hamptonjersey-qa.pages.dev', 444, 'hamptonjersey-qa.pages.dev:444'))

    def test_rebinding_and_non_global_addresses_fail_closed(self):
        p = self.policy()
        self.assertEqual(p.public_ipv4(['1.1.1.1']), '1.1.1.1')
        for bad in ['127.0.0.1', '10.1.2.3', '172.30.230.1', '192.168.1.1',
                    '169.254.169.254', '0.0.0.0', '224.0.0.1', '255.255.255.255',
                    '::1', '::ffff:127.0.0.1', '100.64.0.1', 'not-an-ip']:
            with self.assertRaises(ValueError, msg=bad):
                p.public_ipv4(['1.1.1.1', bad])
        with self.assertRaises(ValueError):
            p.public_ipv4([])

    def test_external_redirects_and_credentials_are_rejected(self):
        p = self.policy()
        base = 'https://hamptonjersey-qa.pages.dev/admin/'
        self.assertTrue(p.allowed_redirect(base, '/api/qa-check'))
        for location in ['https://hamptonjersey.pages.dev/', '//evil.test/x',
                         'http://hamptonjersey-qa.pages.dev/', 'https://user@hamptonjersey-qa.pages.dev/',
                         'https://hamptonjersey-qa.pages.dev:444/']:
            self.assertFalse(p.allowed_redirect(base, location), location)

    def test_container_privileges_filesystems_and_limits(self):
        c = self.compose()
        for service in c['services'].values():
            self.assertEqual(service['user'], '1000:1000')
            self.assertTrue(service['read_only'])
            self.assertEqual(service['cap_drop'], ['ALL'])
            self.assertIn('no-new-privileges:true', service['security_opt'])
            self.assertFalse(service.get('privileged', False))
            self.assertFalse(service.get('ports'))
            self.assertFalse(service.get('env_file'))
            self.assertFalse(service.get('secrets'))
            self.assertEqual(service['restart'], 'no')
            self.assertEqual(service['logging']['driver'], 'none')
            self.assertTrue(service['pids_limit'] > 0)

    def test_runner_has_no_external_or_host_gateway(self):
        c = self.compose()
        runner = c['services']['runner']
        self.assertEqual(set(runner['networks']), {'internal'})
        self.assertEqual(runner['dns'], ['127.0.0.1'])
        self.assertTrue(c['networks']['internal']['internal'])
        self.assertEqual(c['networks']['internal']['driver_opts']['com.docker.network.bridge.gateway_mode_ipv4'], 'isolated')
        self.assertFalse(c['networks']['internal']['enable_ipv6'])
        self.assertEqual(set(c['services']['egress']['networks']), {'internal', 'egress'})

    def test_only_dedicated_code_and_results_bind_mounts(self):
        c = self.compose()
        expected = {'runner-package': ('/work', True), 'egress-package': ('/policy', True),
                    'results': ('/results', False)}
        mounts = [v for s in c['services'].values() for v in s['volumes']]
        self.assertEqual(len(mounts), 3)
        for mount in mounts:
            source = mount['source'].replace('\\', '/')
            name = source.rsplit('/', 1)[1]
            self.assertIn('/test-results/qa-agent-runtime/', source)
            self.assertEqual((mount['target'], mount['read_only']), expected[name])
            self.assertFalse(mount['bind']['create_host_path'])
            self.assertEqual(mount['type'], 'bind')

    def test_images_are_pinned_and_no_build_or_registry_access_in_runner(self):
        c = self.compose()
        for service in c['services'].values():
            self.assertRegex(service['image'], r'@sha256:[0-9a-f]{64}$')
            self.assertEqual(service['platform'], 'linux/amd64')
            self.assertEqual(service['pull_policy'], 'never')
            self.assertNotIn('build', service)
        p = self.policy()
        self.assertFalse(p.allowed_request('https', 'registry.npmjs.org', 443, 'registry.npmjs.org'))

    def test_staging_rejects_package_path_traversal_and_symlinks(self):
        path = BUNDLE / 'stage.py'
        self.assertTrue(path.is_file(), 'Stager must be prepared')
        spec = importlib.util.spec_from_file_location('qa_runner_stage', path)
        stage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(stage)
        for name, kind in [('package/../../escape', tarfile.REGTYPE), ('package/file:ads', tarfile.REGTYPE),
                           ('/absolute', tarfile.REGTYPE), ('package/link', tarfile.SYMTYPE)]:
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode='w:gz') as archive:
                item = tarfile.TarInfo(name); item.type = kind
                if kind == tarfile.SYMTYPE: item.linkname = '/etc/passwd'
                archive.addfile(item)
            with tempfile.TemporaryDirectory() as temp:
                with self.assertRaises(ValueError, msg=name):
                    stage.extract_package(data.getvalue(), Path(temp))

    def test_connect_sni_mismatch_remains_denied_for_allowed_http_host(self):
        policy = self.policy()
        response = SimpleNamespace(make=lambda code, body, headers: SimpleNamespace(status_code=code))
        spec = importlib.util.spec_from_file_location('qa_egress_adapter', BUNDLE / 'egress_addon.py')
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'mitmproxy': SimpleNamespace(http=SimpleNamespace(Response=response)),
                                      'policy': policy}):
            spec.loader.exec_module(module)
        proxy = module.QaEgress()
        client = SimpleNamespace(id='test-client', sni='challenges.cloudflare.com', tls_established=True, error=None)
        hello = SimpleNamespace(context=SimpleNamespace(server=SimpleNamespace(address=('hamptonjersey-qa.pages.dev',443)), client=client),
                                client_hello=SimpleNamespace(sni=client.sni))
        proxy.tls_clienthello(hello)
        flow = SimpleNamespace(client_conn=client, response=None, request=SimpleNamespace(
            host=client.sni, port=443, scheme='https', headers={'host':client.sni}))
        proxy.requestheaders(flow)
        self.assertIsNotNone(flow.response, 'A ClientHello mismatch must never forward a later allowed host')
        self.assertEqual(flow.response.status_code, 403)

    def test_declared_image_volume_is_shadowed_by_private_tmpfs(self):
        proxy = self.compose()['services']['egress']
        self.assertTrue(any(entry.startswith('/home/mitmproxy/.mitmproxy:') for entry in proxy['tmpfs']))


if __name__ == '__main__':
    unittest.main()
