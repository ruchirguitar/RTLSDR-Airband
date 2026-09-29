import os
import tempfile
import unittest
from unittest import mock

import config_io
import app as app_module
from app import safe_recordings_subpath


class ConfigIoRoundTrip(unittest.TestCase):
    def test_modulation_string_round_trips(self):
        text = (
            'devices: ( { type = "rtlsdr"; centerfreq = 145.3; channels: '
            '( { freq = 145.4; modulation = "nfm"; outputs: ( { type = "file"; '
            'directory = "/tmp/x"; filename_template = "a"; } ); } ); } );'
        )
        data = config_io.parse_text(text)
        channel = data["devices"][0]["channels"][0]
        self.assertEqual(channel["modulation"]["value"], "nfm")

        # simulate the browser flipping modulation to "am" and saving back
        channel["modulation"]["value"] = "am"
        out_text = config_io.dump_text(data)
        reparsed = config_io.parse_text(out_text)
        self.assertEqual(reparsed["devices"][0]["channels"][0]["modulation"]["value"], "am")

    def test_whole_number_float_keeps_decimal(self):
        data = config_io.parse_text('x = { freq = 145.0; };')
        self.assertEqual(data["x"]["freq"]["type"], "float")
        out_text = config_io.dump_text(data)
        self.assertIn("145.0", out_text)


class RecordingsPathSafety(unittest.TestCase):
    def test_normal_relative_path_allowed(self):
        result = safe_recordings_subpath("/base/recordings", "2026/09/30/clip.mp3")
        self.assertEqual(result, "/base/recordings/2026/09/30/clip.mp3")

    def test_traversal_is_rejected(self):
        with self.assertRaises(ValueError):
            safe_recordings_subpath("/base/recordings", "../../../etc/passwd")

    def test_absolute_escape_is_rejected(self):
        with self.assertRaises(ValueError):
            safe_recordings_subpath("/base/recordings", "/etc/passwd")


class RecordingsEndpoints(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.client = app_module.app.test_client()

    def test_delete_removes_existing_file(self):
        clip_path = os.path.join(self.tmpdir.name, "clip.mp3")
        open(clip_path, "w").close()
        with mock.patch("app.load_state", return_value={"recordings_dir": self.tmpdir.name}):
            res = self.client.delete("/api/recordings/clip.mp3")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(os.path.exists(clip_path))

    def test_delete_rejects_traversal(self):
        outside = tempfile.NamedTemporaryFile(delete=False)
        outside.close()
        self.addCleanup(lambda: os.path.exists(outside.name) and os.remove(outside.name))
        with mock.patch("app.load_state", return_value={"recordings_dir": self.tmpdir.name}):
            res = self.client.delete("/api/recordings/../" + os.path.basename(outside.name))
        self.assertEqual(res.status_code, 403)
        self.assertTrue(os.path.exists(outside.name))

    def test_delete_missing_file_is_404(self):
        with mock.patch("app.load_state", return_value={"recordings_dir": self.tmpdir.name}):
            res = self.client.delete("/api/recordings/does-not-exist.mp3")
        self.assertEqual(res.status_code, 404)

    def test_open_folder_success_when_opener_available(self):
        with mock.patch("app.load_state", return_value={"recordings_dir": self.tmpdir.name}), \
             mock.patch("app.folder_opener_command", return_value=["true"]), \
             mock.patch("app.subprocess.Popen") as popen:
            res = self.client.post("/api/recordings/open")
        self.assertEqual(res.status_code, 200)
        popen.assert_called_once_with(["true"])

    def test_open_folder_no_opener_found(self):
        with mock.patch("app.load_state", return_value={"recordings_dir": self.tmpdir.name}), \
             mock.patch("app.folder_opener_command", return_value=None):
            res = self.client.post("/api/recordings/open")
        self.assertEqual(res.status_code, 400)

    def test_open_folder_missing_directory(self):
        with mock.patch("app.load_state", return_value={"recordings_dir": "/no/such/dir-xyz"}):
            res = self.client.post("/api/recordings/open")
        self.assertEqual(res.status_code, 400)


if __name__ == "__main__":
    unittest.main()
