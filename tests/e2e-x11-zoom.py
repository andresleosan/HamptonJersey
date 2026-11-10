"""Send native zoom keys to the disposable WebKit window in its private X server."""
import ctypes
import ctypes.util
import sys
import time

x = ctypes.CDLL(ctypes.util.find_library('X11'))
t = ctypes.CDLL(ctypes.util.find_library('Xtst'))
x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XOpenDisplay.restype = ctypes.c_void_p
x.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x.XDefaultRootWindow.restype = ctypes.c_ulong
x.XQueryTree.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)), ctypes.POINTER(ctypes.c_uint)]
x.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
x.XStringToKeysym.argtypes = [ctypes.c_char_p]
x.XStringToKeysym.restype = ctypes.c_ulong
x.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x.XKeysymToKeycode.restype = ctypes.c_ubyte
x.XFlush.argtypes = [ctypes.c_void_p]
t.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]

d = x.XOpenDisplay(None)
if not d: raise SystemExit('No private display')
root = x.XDefaultRootWindow(d)
r = ctypes.c_ulong(); parent = ctypes.c_ulong(); children = ctypes.POINTER(ctypes.c_ulong)(); count = ctypes.c_uint()
x.XQueryTree(d, root, ctypes.byref(r), ctypes.byref(parent), ctypes.byref(children), ctypes.byref(count))
if not count.value: raise SystemExit('No browser window')
x.XSetInputFocus(d, children[count.value - 1], 1, 0)
ctrl = x.XKeysymToKeycode(d, x.XStringToKeysym(b'Control_L'))
key = x.XKeysymToKeycode(d, x.XStringToKeysym(b'0' if sys.argv[1] == 'reset' else b'equal'))
for _ in range(1 if sys.argv[1] == 'reset' else 4):
    t.XTestFakeKeyEvent(d, ctrl, 1, 0); t.XTestFakeKeyEvent(d, key, 1, 0)
    t.XTestFakeKeyEvent(d, key, 0, 0); t.XTestFakeKeyEvent(d, ctrl, 0, 0)
    x.XFlush(d); time.sleep(0.1)
