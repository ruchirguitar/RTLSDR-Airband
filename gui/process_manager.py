"""Starts/stops/monitors the rtl_airband binary and keeps a rolling log buffer."""
import collections
import os
import signal
import subprocess
import threading
import time

LOG_MAXLEN = 2000


class ProcessManager:
    def __init__(self):
        self._proc = None
        self._reader_thread = None
        self._log = collections.deque(maxlen=LOG_MAXLEN)
        self._lock = threading.Lock()
        self._started_at = None
        self._last_exit_code = None

    def status(self):
        with self._lock:
            running = self._proc is not None and self._proc.poll() is None
            return {
                "running": running,
                "pid": self._proc.pid if running else None,
                "started_at": self._started_at if running else None,
                "last_exit_code": self._last_exit_code,
            }

    def logs(self, since=0):
        with self._lock:
            lines = list(self._log)
        return lines[since:]

    def start(self, binary_path, config_path):
        with self._lock:
            if self._proc is not None and self._proc.poll() is None:
                raise RuntimeError("Process is already running")
            if not binary_path:
                raise RuntimeError("No binary path configured")
            if not os.path.isfile(config_path):
                raise RuntimeError(f"Config file not found: {config_path}")

            self._log.clear()
            self._last_exit_code = None
            try:
                self._proc = subprocess.Popen(
                    [binary_path, "-c", config_path],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                )
            except FileNotFoundError as e:
                raise RuntimeError(f"Binary not found or not executable: {binary_path}") from e
            self._started_at = time.time()

            def _reader(proc):
                try:
                    for line in proc.stdout:
                        with self._lock:
                            self._log.append(line.rstrip("\n"))
                finally:
                    proc.wait()
                    with self._lock:
                        self._last_exit_code = proc.returncode
                        self._log.append(f"[process exited with code {proc.returncode}]")

            self._reader_thread = threading.Thread(target=_reader, args=(self._proc,), daemon=True)
            self._reader_thread.start()

    def stop(self, timeout=5):
        with self._lock:
            proc = self._proc
        if proc is None or proc.poll() is not None:
            return
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=timeout)

    def restart(self, binary_path, config_path):
        self.stop()
        self.start(binary_path, config_path)
