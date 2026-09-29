import socket
import time
import unittest

import live_audio


def free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class LiveChannelTest(unittest.TestCase):
    def setUp(self):
        self.port = free_port()
        self.channel = live_audio.LiveChannel(self.port)
        self.addCleanup(self.channel.stop)

    def _send(self, payload):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(payload, ("127.0.0.1", self.port))
        sock.close()

    def _wait_for(self, since, expected_len, timeout=2.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            chunk, next_offset = self.channel.read_since(since)
            if len(chunk) >= expected_len:
                return chunk, next_offset
            time.sleep(0.02)
        self.fail("timed out waiting for UDP payload to arrive")

    def _wait_for_offset(self, target_offset, timeout=2.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            chunk, next_offset = self.channel.read_since(0)
            if next_offset >= target_offset:
                return chunk, next_offset
            time.sleep(0.02)
        self.fail("timed out waiting for total received offset to advance")

    def test_receives_and_offsets_udp_payload(self):
        self.channel.ensure_started()
        self.assertIsNone(self.channel.error)

        payload = b"\x01\x02\x03\x04" * 10
        self._send(payload)
        chunk, next_offset = self._wait_for(0, len(payload))
        self.assertEqual(chunk, payload)
        self.assertEqual(next_offset, len(payload))

        # nothing new since next_offset
        chunk2, next_offset2 = self.channel.read_since(next_offset)
        self.assertEqual(chunk2, b"")
        self.assertEqual(next_offset2, next_offset)

    def test_buffer_trims_and_advances_base_offset(self):
        live_audio.MAX_BUFFERED_BYTES = 16  # shrink for a fast, deterministic test
        try:
            self.channel.ensure_started()
            self._send(b"A" * 10)
            self._wait_for(0, 10)
            self._send(b"B" * 10)
            chunk, next_offset = self._wait_for_offset(20)  # buffer capped at 16 bytes
            self.assertEqual(next_offset, 20)
            self.assertEqual(chunk, (b"A" * 10 + b"B" * 10)[-16:])
        finally:
            live_audio.MAX_BUFFERED_BYTES = 16000 * 4 * 10

    def test_second_bind_to_same_port_reports_error_not_exception(self):
        self.channel.ensure_started()
        self.assertIsNone(self.channel.error)
        other = live_audio.LiveChannel(self.port)
        other.ensure_started()
        self.assertIsNotNone(other.error)


if __name__ == "__main__":
    unittest.main()
