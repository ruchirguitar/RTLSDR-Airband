import os
import stat
import tempfile
import textwrap
import time
import unittest

from process_manager import ProcessManager

FAKE_BINARY = textwrap.dedent("""\
    #!/usr/bin/env python3
    import sys, time
    print("ARGS:" + " ".join(sys.argv[1:]), flush=True)
    while True:
        time.sleep(0.05)
""")


class ProcessManagerTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.binary_path = os.path.join(self.tmpdir.name, "fake_rtl_airband")
        with open(self.binary_path, "w") as f:
            f.write(FAKE_BINARY)
        os.chmod(self.binary_path, os.stat(self.binary_path).st_mode | stat.S_IEXEC)
        self.config_path = os.path.join(self.tmpdir.name, "test.conf")
        open(self.config_path, "w").close()
        self.mgr = ProcessManager()
        self.addCleanup(self.mgr.stop)

    def _wait_until(self, predicate, timeout=2.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if predicate():
                return
            time.sleep(0.02)
        self.fail("condition not met in time")

    def test_start_passes_foreground_flag(self):
        # rtl_airband double-forks into a daemon unless told to stay in the
        # foreground; without -F, the process we spawn would exit(0) right
        # after forking, and we'd be watching a dead PID (see start() comment).
        self.mgr.start(self.binary_path, self.config_path)
        self._wait_until(lambda: self.mgr.status()["running"])
        self._wait_until(lambda: any(line.startswith("ARGS:") for line in self.mgr.logs()))
        args_line = next(line for line in self.mgr.logs() if line.startswith("ARGS:"))
        self.assertIn("-F", args_line[len("ARGS:"):].split())

    def test_stop_ends_the_process(self):
        self.mgr.start(self.binary_path, self.config_path)
        self._wait_until(lambda: self.mgr.status()["running"])
        self.mgr.stop()
        self._wait_until(lambda: not self.mgr.status()["running"])


if __name__ == "__main__":
    unittest.main()
