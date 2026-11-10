"""E only, inside the pinned proxy image: real HTTP API, no real DNS/network."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from mitmproxy import http
from egress_addon import QaEgress
from policy import QA_HOST


async def main():
    addon = QaEgress()
    client = SimpleNamespace(id='selftest-client', sni='challenges.cloudflare.com', tls_established=True, error=None)
    addon.tls_clienthello(SimpleNamespace(context=SimpleNamespace(client=client,
        server=SimpleNamespace(address=(QA_HOST, 443))), client_hello=SimpleNamespace(sni=client.sni)))
    flow = SimpleNamespace(client_conn=client, response=None,
        request=http.Request.make('GET', 'https://challenges.cloudflare.com/', headers={'Host':'challenges.cloudflare.com'}))
    addon.requestheaders(flow)
    assert flow.response.status_code == 403
    addon.client_disconnected(client)
    assert not addon.denied_clients
    client.sni = QA_HOST
    for host in [QA_HOST, 'forbidden.example.test']:
        flow = SimpleNamespace(client_conn=client, response=None,
            request=http.Request.make('GET', 'https://' + QA_HOST + '/', headers={'Host':host}))
        flow.request.headers['Host'] = host  # Constructor normalizes Host; mutate afterward for adversarial input.
        addon.requestheaders(flow)
        assert (flow.response is None) == (host == QA_HOST)
    flow = SimpleNamespace(request=http.Request.make('GET', 'https://' + QA_HOST + '/'),
        response=http.Response.make(302, b'', {'Location':'https://forbidden.example.test/'}))
    addon.responseheaders(flow)
    assert flow.response.status_code == 403
    for address, allowed in [('127.0.0.1',False), ('1.1.1.1',True)]:
        server = SimpleNamespace(address=(QA_HOST,443), error=None, sni=None)
        with patch.object(asyncio.get_running_loop(), 'getaddrinfo', new=AsyncMock(return_value=[(None,None,None,None,(address,443))])):
            await addon.server_connect(SimpleNamespace(server=server))
        assert (server.error is None) == allowed
        if allowed:
            assert server.address == ('1.1.1.1',443) and server.sni == QA_HOST
    print('PROXY_API_AND_POLICY_SELFTEST=PASS; REAL_NETWORK_REQUESTS=0')


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception:
        print('PROXY_API_AND_POLICY_SELFTEST=FAIL; NO_ERROR_VALUES_DISCLOSED')
        raise SystemExit(1)
