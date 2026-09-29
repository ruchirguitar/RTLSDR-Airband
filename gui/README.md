# Repeater Recorder GUI

A local web app for running RTLSDR-Airband as a frequency recorder: add any AM/NFM frequency as a card instead of editing libconfig, listen to it live in your browser, browse and manage recorded clips, and control the engine process — all from `http://127.0.0.1:5050`. Not limited to repeaters — any frequency your receiver's bandwidth covers works (aviation, marine, simplex, ...).

The engine itself (`src/`) is unmodified. This is a layer on top: it reads and writes the same `.conf` files RTLSDR-Airband has always used, and starts/stops the same `rtl_airband` binary.

## Requirements

- Python 3.9+
- `rtl_airband` built **with `-DNFM=ON`** — required for FM demodulation, which is the whole point of this tool. Without it, any channel set to NFM will make the engine refuse to start ("unknown modulation").
  ```bash
  sudo apt-get install build-essential cmake pkg-config libmp3lame-dev libshout3-dev 'libconfig++-dev' libfftw3-dev
  mkdir build && cd build && cmake -DNFM=ON ../ && make && sudo make install
  ```

## Run it

```bash
cd gui
pip install -r requirements.txt
python3 app.py
```

Open `http://127.0.0.1:5050`.

## Tabs

**Repeaters** — the main view. One "Receiver" panel (device index, gain, center frequency, correction — assumes a single SDR) with an inline reminder that every frequency below must fall within the receiver's tuned bandwidth around Center frequency (roughly ±1.2 MHz by default), and a card per frequency ("Frequency 1", "Frequency 2", ... — not "Repeater", since any AM/NFM frequency works here):
- Frequency and a modulation dropdown (NFM / AM). A channel with no modulation set at all shows as AM (the engine's real default) rather than silently picking one for you — the field is only written once you actually change it.
- A squelch level, 0–9, like the SQL knob on a handheld radio. 0 is "always open" (the engine's own meaning for that setting), 5 is close to the engine's built-in auto default, 9 needs a strong signal. This maps to `squelch_snr_threshold` (2 dB per level) under the hood; a channel using the older absolute `squelch_threshold` (dBFS) instead shows a note pointing at the Advanced tab rather than fighting with it.
- **Record to file** or **Stream to Icecast** per channel. New file outputs default to a frequency-first filename (e.g. `145.400_MyRepeater_...`), so clips are identifiable in a file browser without opening them.
- **Enable live listening** — adds a `udp_stream` output on a fixed local port and shows a Listen/volume/mute control once you Save and Restart. See "Live listening" below.

**Recordings** — lists clips from a configurable recordings folder, grouped by date, with inline playback, download, **Open folder** (opens it in the file manager of whichever machine runs this GUI — not useful over an SSH tunnel), and **Delete** (permanent, confirmed before it happens).

**Process Control** — the binary path, the live-audio sample rate setting, and a live tailing log. Start/Stop/Restart themselves live in the bar under the header, not this tab (see below).

**Advanced** — the full config tree (every field RTLSDR-Airband supports: multiple devices, mixers, scan mode, ...), for anything the Repeaters tab doesn't model. Editing here or in Repeaters updates the same in-memory config either way.

**Raw Config** — the config file as text, with syntax validation before saving.

**Help / FAQ** — an in-app reference for every setting above (what gain/correction/squelch actually do, the bandwidth constraint in detail, the live-listening sample rate, recordings management, and why there's no waterfall), so you don't need to leave the app to look anything up.

**Start / Restart / Stop**, and the running/stopped status, sit in a bar directly under the header — visible on every tab, not just Process Control, since it's the action you'll reach for constantly. Start and Restart save the current config first (RTLSDR-Airband reads its config once at startup, so restarting against a stale on-disk file would defeat the point); Stop just stops. The header's own **Save** button is there for saving without also (re)starting anything.

## Live listening

Each channel with live listening enabled gets its own fixed UDP port (127.0.0.1, base port 17300 + channel index) carrying the engine's raw demodulated audio (see `src/udp_stream.cpp`). The GUI's Python server listens on that port, buffers incoming audio, and the browser polls for new bytes and schedules them through the Web Audio API.

One setting to get right: **the sample rate**. RTLSDR-Airband demodulates at 16 kHz if built with `-DNFM=ON`, or 8 kHz otherwise. The GUI can't detect this from the running binary, so it's a setting on the Process Control tab (default 16000) — if audio sounds sped up or slowed down, that's the first thing to check.

Live listening requires Save + Restart after checking the box, since it adds a new output to the config and the engine only reads config at startup.

## Recordings archive

Points at a single folder (Recordings tab → Recordings folder). Any `.mp3`/`.wav`/`.ogg` file found anywhere under it (recursively, so `dated_subdirectories = true` output layouts work) is listed, newest first. Serving is restricted to that folder — no path traversal outside it.

## Theme

The 🌙/☀️ button in the header switches between dark and light; the choice is remembered per-browser (`localStorage`), not shared between devices or with the server.

## Known limitations

- The Repeaters tab assumes a single SDR device (`devices[0]`). Multiple devices, mixers, and scan mode work fine but only through the Advanced or Raw Config tabs.
- No waterfall/spectrum display. The engine has no output that exposes spectrum data today (only demodulated audio), and a single RTL-SDR dongle can't be shared with a second process to get it elsewhere — this would need a new feature added to the C++ engine itself, not just the GUI.
- This is a development server (Flask's built-in one), meant for local/LAN use on the same machine as the SDR — not hardened for exposing over the open internet.

## Tests

```bash
cd gui
python3 -m unittest discover -s . -p "test_*.py" -v
```
