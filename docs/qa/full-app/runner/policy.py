"""Fixed QA-only policy; no network, credentials or logging in this module."""
import ipaddress
from urllib.parse import urljoin, urlsplit

QA_HOST = 'hamptonjersey-qa.pages.dev'
ALLOWED_HOSTS = frozenset([QA_HOST, 'challenges.cloudflare.com'])
POLICY_VERSION = 'hampton-app-qa-egress-v1'


def allowed_request(scheme, host, port, authority):
    if not isinstance(host, str) or not isinstance(authority, str):
        return False
    host = host.lower()
    return (scheme == 'https' and type(port) is int and port == 443 and
            host in ALLOWED_HOSTS and authority.lower() in {host, host + ':443'})


def public_ipv4(addresses):
    if not addresses:
        raise ValueError('No public address')
    parsed = [ipaddress.ip_address(address) for address in addresses]
    if any(ip.version != 4 or not ip.is_global or ip.is_multicast or ip.is_reserved
           for ip in parsed):
        raise ValueError('Non-public address')
    return str(parsed[0])


def allowed_redirect(base, location):
    try:
        target = urlsplit(urljoin(base, location))
        return (target.username is None and target.password is None and
                allowed_request(target.scheme, target.hostname, target.port or 443, target.netloc))
    except (ValueError, TypeError):
        return False
