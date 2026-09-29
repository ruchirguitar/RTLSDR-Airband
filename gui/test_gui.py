import unittest

import config_io
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


if __name__ == "__main__":
    unittest.main()
