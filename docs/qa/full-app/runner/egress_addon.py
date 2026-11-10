"""Mitmproxy adapter. Never dump flows, headers, URLs, credentials or errors."""
import asyncio
import socket
from pathlib import Path
from mitmproxy import http
from policy import ALLOWED_HOSTS, QA_HOST, POLICY_VERSION, allowed_request, allowed_redirect, public_ipv4


def deny(flow):
    flow.response = http.Response.make(403, b'QA egress denied', {'Content-Type': 'text/plain'})


class QaEgress:
    def __init__(self):
        self.denied_clients = set()

    def client_disconnected(self, client):
        self.denied_clients.discard(client.id)

    def running(self):
        Path('/run/qa/policy-ready').write_text(POLICY_VERSION)

    def http_connect(self, flow):
        r = flow.request
        authority = r.headers.get('host') or r.authority
        if not allowed_request('https', r.host, r.port, authority):
            deny(flow)

    def tls_clienthello(self, data):
        address = data.context.server.address
        if not address or data.client_hello.sni not in ALLOWED_HOSTS or data.client_hello.sni != address[0]:
            # client.error alone is not an abort hook in mitmproxy 12.3.1.
            self.denied_clients.add(data.context.client.id)
            data.context.client.error = 'QA egress denied'

    def requestheaders(self, flow):
        r = flow.request
        authority = r.headers.get('host', '')
        if (flow.client_conn.id in self.denied_clients or not flow.client_conn.tls_established or flow.client_conn.sni != r.host or
                not allowed_request(r.scheme, r.host, r.port, authority)):
            deny(flow)
            return
        # E has no secrets. This also prevents forwarding identity to Turnstile.
        if r.host != QA_HOST:
            for name in ['CF-Access-Client-Id', 'CF-Access-Client-Secret', 'Authorization', 'Cookie']:
                r.headers.pop(name, None)

    async def server_connect(self, data):
        try:
            host, port = data.server.address
            if host not in ALLOWED_HOSTS or port != 443:
                raise ValueError('Target denied')
            addresses = await asyncio.wait_for(asyncio.get_running_loop().getaddrinfo(
                host, 443, family=socket.AF_INET, type=socket.SOCK_STREAM), timeout=5)
            ip = public_ipv4([entry[4][0] for entry in addresses])
            data.server.address = (ip, 443)  # Pin the validated lookup; no second DNS lookup.
            data.server.sni = host          # Preserve certificate-name verification.
        except Exception:
            data.server.error = 'QA egress denied'

    def responseheaders(self, flow):
        location = flow.response.headers.get('location')
        if location and not allowed_redirect(flow.request.url, location):
            deny(flow)


addons = [QaEgress()]
