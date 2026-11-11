/*
 * spectrum.cpp
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

#include "spectrum.h"

#include <algorithm>
#include <cmath>
#include <cstring>

SpectrumAccumulator::SpectrumAccumulator(size_t bins, size_t ffts_per_line) : bins_(bins), ffts_per_line_(std::max<size_t>(1, ffts_per_line)), power_(bins, 0.0) {}

bool SpectrumAccumulator::add(const float* re_im) {
    for (size_t i = 0; i < bins_; i++) {
        const double re = re_im[2 * i], im = re_im[2 * i + 1];
        power_[i] += re * re + im * im;
    }
    return ++count_ >= ffts_per_line_;
}

std::vector<float> SpectrumAccumulator::take_line() {
    // a full-scale tone reaches magnitude `bins` in its bin
    const double full_scale = (double)bins_ * (double)bins_ * (double)std::max<size_t>(1, count_);
    const size_t half = bins_ / 2;
    std::vector<float> line(bins_);
    for (size_t i = 0; i < bins_; i++) {
        const size_t out = (i + half) % bins_;  // negative frequencies (upper half) first
        line[out] = (float)(10.0 * log10(std::max(power_[i] / full_scale, 1e-20)));
    }
    std::fill(power_.begin(), power_.end(), 0.0);
    count_ = 0;
    return line;
}

std::vector<unsigned char> encode_spectrum_packet(const std::vector<float>& line, uint32_t centre_hz, uint32_t sample_rate) {
    const uint32_t bins = (uint32_t)line.size();
    std::vector<unsigned char> p(20 + line.size() * sizeof(float), 0);
    memcpy(&p[0], "FRSP", 4);
    p[4] = 1;
    memcpy(&p[8], &centre_hz, 4);
    memcpy(&p[12], &sample_rate, 4);
    memcpy(&p[16], &bins, 4);
    if (!line.empty()) {
        memcpy(&p[20], line.data(), line.size() * sizeof(float));
    }
    return p;
}
