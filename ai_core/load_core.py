"""Load cctv_core.py's pure logic into a namespace, without booting the server.

Stubs out socketio / flask / ultralytics and neutralises the module-level
backend connect, so the fall logic can be exercised in isolation.
"""
import sys, types, os, json

os.environ.setdefault("AI_SERVICE_TOKEN", "test-token")
os.environ.setdefault("VERBOSE_LOGS", "0")


def _stub(name, **attrs):
    m = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(m, k, v)
    sys.modules[name] = m
    return m


class _Sio:
    connected = False
    def emit(self, *a, **k): pass
    def connect(self, *a, **k): raise RuntimeError("stubbed")
    def on(self, *a, **k):
        return lambda f: f
    def event(self, f): return f
    def disconnect(self): pass


_stub("socketio", Client=lambda **k: _Sio())


class _Flask:
    def __init__(self, *a, **k): pass
    def route(self, *a, **k):
        return lambda f: f
    def run(self, *a, **k): pass


_stub("flask", Flask=_Flask, Response=object)
_stub("flask_cors", CORS=lambda *a, **k: None)
_stub("ultralytics", YOLO=lambda *a, **k: None)


def load(path="cctv_core.py"):
    src = open(path, encoding="utf-8").read()
    src = src.replace("\n_connect_to_backend()", "\n# _connect_to_backend()  # stubbed for tests")
    ns = {"__name__": "cctv_core_under_test", "__file__": os.path.abspath(path)}
    exec(compile(src, path, "exec"), ns)
    return ns
