/*
 * spectrum.h
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, see <https://www.gnu.org/licenses/>.
 */

#ifndef _SPECTRUM_H
#define _SPECTRUM_H

#include <cstddef>
#include <cstdint>
#include <vector>

// Averages the device's FFT power into spectrum lines for a waterfall display.
// Lines run from the lowest to the highest frequency (the FFT's negative
// frequencies first), in dB relative to a full-scale tone.
class SpectrumAccumulator {
   public:
    SpectrumAccumulator(size_t bins, size_t ffts_per_line);

    // One FFT output as interleaved re/im floats (an fftwf_complex array).
    // Returns true when a line is ready.
    bool add(const float* re_im);

    std::vector<float> take_line();

    size_t bins() const { return bins_; }

   private:
    size_t bins_;
    size_t ffts_per_line_;
    size_t count_ = 0;
    std::vector<double> power_;
};

// The UDP datagram for one line (host byte order, little-endian on every supported platform):
//   "FRSP", u8 version (1), 3 bytes zero, u32 centre_hz, u32 sample_rate, u32 bins, f32 dB[bins]
std::vector<unsigned char> encode_spectrum_packet(const std::vector<float>& line, uint32_t centre_hz, uint32_t sample_rate);

#endif /* _SPECTRUM_H */
