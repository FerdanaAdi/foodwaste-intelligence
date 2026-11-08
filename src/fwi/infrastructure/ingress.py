"""Local-only ingress: capture the socket peer with Uvicorn proxy parsing disabled.

Use local_server_config, not a bare `uvicorn fwi.api.app:app` security entrypoint.
The unwrapped application cannot authenticate because it has no trusted peer mark.
"""
from ipaddress import ip_address

from starlette.responses import JSONResponse
from uvicorn import Config

_PEER_MARK = object()
_SCOPE_KEY = 'fwi.trusted_socket_peer'
_FORWARDING = {b'forwarded', b'x-forwarded-for', b'x-forwarded-proto',
               b'x-forwarded-host', b'x-forwarded-port', b'x-real-ip'}


def trusted_peer(scope):
    mark = scope.get(_SCOPE_KEY)
    if not mark or mark[0] is not _PEER_MARK or scope.get('client') != mark[1]:
        raise ValueError('trusted socket peer unavailable')
    return mark[1][0]


class _LocalIngress:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'http':
            peer = scope.get('client')
            try:
                allowed = peer and ip_address(peer[0]).is_loopback
            except ValueError:
                allowed = False
            if not allowed:
                await JSONResponse({'detail': 'forbidden'}, status_code=403,
                                   headers={'Cache-Control': 'no-store'})(scope, receive, send)
                return
            scope = dict(scope)
            scope[_SCOPE_KEY] = (_PEER_MARK, peer)
            # No reverse proxy is trusted in this synthetic direct-peer profile.
            scope['headers'] = [(k, v) for k, v in scope['headers'] if k.lower() not in _FORWARDING]
        await self.app(scope, receive, send)


def local_server_config(app, *, port=8000, ssl_certfile=None, ssl_keyfile=None):
    """Fixed ingress policy; callers cannot enable proxy headers or public binding.

    Without TLS, protected endpoints still fail closed. No trust-store changes.
    """
    return Config(_LocalIngress(app), host='127.0.0.1', port=port,
                  proxy_headers=False, forwarded_allow_ips='', access_log=False,
                  log_level='warning', ssl_certfile=ssl_certfile, ssl_keyfile=ssl_keyfile)
