# RTLSDR-Airband

![version tag](https://img.shields.io/github/v/tag/rtl-airband/RTLSDR-Airband?label=)

## This fork: a Repeater Recorder GUI

This is a personal fork of [rtl-airband/RTLSDR-Airband](https://github.com/rtl-airband/RTLSDR-Airband). The engine itself is unmodified — everything below is upstream's own documentation. What's new here lives entirely in **[`gui/`](gui/)**: a local web app for running this engine as a dedicated **FM repeater recorder**, without hand-editing libconfig files.

- **Repeater cards, not raw config** — add a channel, set its frequency, and pick NFM or AM from a dropdown. No `modulation = "nfm";` syntax to remember.
- **A squelch knob, not a dB number** — a single 0–9 level like the SQL knob on a handheld radio, instead of guessing at `squelch_snr_threshold` values.
- **Live listening in the browser** — click "Listen live" on any repeater and hear it in real time (Web Audio, streamed over a local UDP bridge) while it keeps recording.
- **A recordings archive** — browse, play back, and download clips by date, right from the browser.
- **Process control with a live log** — start/stop/restart the engine and watch its output, instead of managing it by hand in a terminal.
- **Advanced / Raw Config tabs** — the full config tree and raw text editor are still there underneath, for multi-device setups, mixers, or scan mode that the simplified view doesn't cover.

### Quick start

```bash
git clone https://github.com/ruchirguitar/RTLSDR-Airband.git
cd RTLSDR-Airband

# build the engine - -DNFM=ON is required for FM/repeater support
sudo apt-get install build-essential cmake pkg-config libmp3lame-dev libshout3-dev 'libconfig++-dev' libfftw3-dev
mkdir build && cd build && cmake -DNFM=ON ../ && make && sudo make install
cd ..

# run the GUI
cd gui && pip install -r requirements.txt && python3 app.py
```

Open `http://127.0.0.1:5050`. See the [wiki](https://github.com/ruchirguitar/RTLSDR-Airband/wiki) for the full walkthrough.

---

### CI Workflow Status

<table>
  <thead>
    <tr>
      <th></th>
      <th><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml">Run CI</a></th>
      <th><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/platform_build.yml">Platform Build</a></th>
      <th><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/code_formatting.yml">Code Formatting</a></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>x86_64 ubuntu-22.04</td>
      <td align="center"><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml"><img src="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml/badge.svg?branch=main" alt="Run CI"></a></td>
      <td></td>
      <td align="center" rowspan="10"><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/code_formatting.yml"><img src="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/code_formatting.yml/badge.svg?branch=main" alt="Code Formatting"></a></td>
    </tr>
    <tr>
      <td>x86_64 ubuntu-24.04</td>
      <td align="center"><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml"><img src="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml/badge.svg?branch=main" alt="Run CI"></a></td>
      <td></td>
    </tr>
    <tr>
      <td>ARM64 ubuntu-22.04</td>
      <td align="center"><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml"><img src="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml/badge.svg?branch=main" alt="Run CI"></a></td>
      <td align="center"><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/platform_build.yml"><img src="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/platform_build.yml/badge.svg?branch=main" alt="Platform Build"></a></td>
    </tr>
    <tr>
      <td>ARM64 ubuntu-24.04</td>
      <td align="center"><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml"><img src="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml/badge.svg?branch=main" alt="Run CI"></a></td>
      <td></td>
    </tr>
    <tr>
      <td>ARM64 macos-14</td>
      <td align="center"><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml"><img src="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml/badge.svg?branch=main" alt="Run CI"></a></td>
      <td></td>
    </tr>
    <tr>
      <td>ARM64 macos-15</td>
      <td align="center"><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml"><img src="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml/badge.svg?branch=main" alt="Run CI"></a></td>
      <td></td>
    </tr>
    <tr>
      <td>ARM64 macos-26</td>
      <td align="center"><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml"><img src="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml/badge.svg?branch=main" alt="Run CI"></a></td>
      <td></td>
    </tr>
    <tr>
      <td>x86_64 macos-15 (Intel)</td>
      <td align="center"><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml"><img src="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml/badge.svg?branch=main" alt="Run CI"></a></td>
      <td></td>
    </tr>
    <tr>
      <td>x86_64 macos-26 (Intel)</td>
      <td align="center"><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml"><img src="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/ci_build.yml/badge.svg?branch=main" alt="Run CI"></a></td>
      <td></td>
    </tr>
    <tr>
      <td>ARM64 Debian Trixie (Pi 4B)</td>
      <td></td>
      <td align="center"><a href="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/platform_build.yml"><img src="https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/platform_build.yml/badge.svg?branch=main" alt="Platform Build"></a></td>
    </tr>
  </tbody>
</table>

### [Published Containers](https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/build_docker_containers.yml)

| linux/amd64 | linux/386 | linux/arm64 | linux/arm/v6 | linux/arm/v7 |
|:---:|:---:|:---:|:---:|:---:|
| [![Build Containers](https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/build_docker_containers.yml/badge.svg?branch=main)](https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/build_docker_containers.yml) | [![Build Containers](https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/build_docker_containers.yml/badge.svg?branch=main)](https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/build_docker_containers.yml) | [![Build Containers](https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/build_docker_containers.yml/badge.svg?branch=main)](https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/build_docker_containers.yml) | [![Build Containers](https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/build_docker_containers.yml/badge.svg?branch=main)](https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/build_docker_containers.yml) | [![Build Containers](https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/build_docker_containers.yml/badge.svg?branch=main)](https://github.com/rtl-airband/RTLSDR-Airband/actions/workflows/build_docker_containers.yml) |


### Major / Minor Version Changes:

Changes as of v5.1.0:
 - License is now GPLv2 [#503](https://github.com/rtl-airband/RTLSDR-Airband/discussions/503)

NOTE: Repo URL has moved to https://github.com/rtl-airband/RTLSDR-Airband see [#502](https://github.com/rtl-airband/RTLSDR-Airband/discussions/502) for info

Changes as of v5.0.0:
 - PRs will be opened directly against `main` and the `unstable` branch will no longer be used
 - Version tags will be automatically created on each merge to `main`
 - A release will be created on each `major` or `minor` version tag but not `minor` tags
 - Checking out `main` is recommended over using a release artifact to stay on the latest version
 - This repo has significantly diverged from the original project [microtony/RTLSDR-Airband](https://github.com/microtony/RTLSDR-Airband) so it has been been detached (ie no longer a fork).
 - Specific build support for `rpiv1`, `armv7-generic`, and `armv8-generic` have been deprecated for the new default `native`, see [#447](https://github.com/rtl-airband/RTLSDR-Airband/discussions/447)


## Overview

RTLSDR-Airband receives analog radio voice channels and produces
audio streams which can be routed to various outputs, such as online
streaming services like LiveATC.net. Originally the only SDR type
supported by the program was Realtek DVB-T dongle (hence the project's
name). However, thanks to SoapySDR vendor-neutral SDR library, other
radios are now supported as well.

## Documentation

User's manual is now on the [wiki](https://github.com/rtl-airband/RTLSDR-Airband/wiki).

## Credits and thanks

I hereby express my gratitude to everybody who helped with the development and testing
of RTLSDR-Airband. Special thanks go to:

* Dave Pascoe
* SDR Guru
* Marcus Ströbel
* strix-technica
* Tomasz Lemiech
* charlie-foxtrot

## License

Copyright (C) 2022-2025 charlie-foxtrot

Copyright (C) 2015-2022 Tomasz Lemiech <szpajder@gmail.com>

Based on original work by Wong Man Hang <microtony@gmail.com>

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, see <https://www.gnu.org/licenses/>.

## Open Source Licenses of bundled code

### gpu_fft

BCM2835 "GPU_FFT" release 2.0
Copyright (c) 2014, Andrew Holme.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright
  notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright
  notice, this list of conditions and the following disclaimer in the
  documentation and/or other materials provided with the distribution.
* Neither the name of the copyright holder nor the
  names of its contributors may be used to endorse or promote products
  derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

### rtl-sdr

* Copyright (C) 2012 by Steve Markgraf <steve@steve-m.de>
* Copyright (C) 2015 by Kyle Keen <keenerd@gmail.com>
* GNU General Public License Version 2
