"""Capture the private X server's viewport, including WebKit's native zoom, as a PNG."""
import ctypes
import ctypes.util
import struct
import sys
import zlib

x = ctypes.CDLL(ctypes.util.find_library('X11'))
x.XOpenDisplay.argtypes = [ctypes.c_char_p]; x.XOpenDisplay.restype = ctypes.c_void_p
x.XDefaultScreen.argtypes = [ctypes.c_void_p]; x.XDefaultScreen.restype = ctypes.c_int
x.XDefaultRootWindow.argtypes = [ctypes.c_void_p]; x.XDefaultRootWindow.restype = ctypes.c_ulong
x.XDisplayWidth.argtypes = [ctypes.c_void_p, ctypes.c_int]; x.XDisplayWidth.restype = ctypes.c_int
x.XDisplayHeight.argtypes = [ctypes.c_void_p, ctypes.c_int]; x.XDisplayHeight.restype = ctypes.c_int
x.XGetImage.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_ulong, ctypes.c_int]
x.XGetImage.restype = ctypes.c_void_p
x.XGetPixel.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]; x.XGetPixel.restype = ctypes.c_ulong
x.XDestroyImage.argtypes = [ctypes.c_void_p]

display = x.XOpenDisplay(None)
if not display: raise SystemExit('No private display')
screen = x.XDefaultScreen(display)
width = min(int(sys.argv[2]), x.XDisplayWidth(display, screen))
height = min(int(sys.argv[3]), x.XDisplayHeight(display, screen))
frame = x.XGetImage(display, x.XDefaultRootWindow(display), 0, 0, width, height, ctypes.c_ulong(-1).value, 2)
if not frame: raise SystemExit('Screen capture failed')
rows = bytearray()
for y in range(height):
    rows.append(0)
    for col in range(width):
        color = x.XGetPixel(frame, col, y)
        rows.extend(((color >> 16) & 255, (color >> 8) & 255, color & 255))
x.XDestroyImage(frame)
def chunk(kind, data):
    return struct.pack('!I',len(data)) + kind + data + struct.pack('!I',zlib.crc32(kind + data))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('!IIBBBBB',width,height,8,2,0,0,0)) + chunk(b'IDAT',zlib.compress(rows)) + chunk(b'IEND',b'')
with open(sys.argv[1],'wb') as output: output.write(png)
