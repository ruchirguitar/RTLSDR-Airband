"""
Bridges RTLSDR-Airband's `udp_stream` output (raw 32-bit float PCM, mono,
sent as one UDP datagram per WAVE_BATCH - see src/udp_stream.cpp and
src/rtl_airband.h) to the browser, which polls for new bytes and schedules
them for playback via the Web Audio API.

Each channel that has live listening enabled gets its own fixed localhost
port (see app.py); a listener here is created lazily the first time the
browser asks for that port's audio.
"""
import socket
import threading

MAX_BUFFERED_BYTES = 16000 * 4 * 10  # ~10s of mono float32 at 16kHz


class LiveChannel:
    def __init__(self, port):
        self.port = port
        self._lock = threading.Lock()
        self._buffer = bytearray()
        self._base_offset = 0  # stream offset of _buffer[0]
        self._sock = None
        self._thread = None
        self._running = False
        self.error = None

    def ensure_started(self):
        if self._running or self.error is not None:
            return
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.bind(("127.0.0.1", self.port))
        except OSError as e:
            sock.close()
            self.error = str(e)
            return
        sock.settimeout(1.0)
        self._sock = sock
        self._running = True
        self._thread = threading.Thread(target=self._recv_loop, daemon=True)
        self._thread.start()

    def _recv_loop(self):
        while self._running:
            try:
                data, _addr = self._sock.recvfrom(65536)
            except socket.timeout:
                continue
            except OSError:
                break
            with self._lock:
                self._buffer.extend(data)
                if len(self._buffer) > MAX_BUFFERED_BYTES:
                    trim = len(self._buffer) - MAX_BUFFERED_BYTES
                    del self._buffer[:trim]
                    self._base_offset += trim

    def read_since(self, since):
        with self._lock:
            start = max(since, self._base_offset) - self._base_offset
            start = max(0, min(start, len(self._buffer)))
            chunk = bytes(self._buffer[start:])
            next_offset = self._base_offset + len(self._buffer)
            return chunk, next_offset

    def stop(self):
        self._running = False
        if self._sock is not None:
            self._sock.close()


class LiveAudioManager:
    def __init__(self):
        self._channels = {}
        self._lock = threading.Lock()

    def get(self, port):
        with self._lock:
            channel = self._channels.get(port)
            if channel is None:
                channel = LiveChannel(port)
                self._channels[port] = channel
        channel.ensure_started()
        return channel
