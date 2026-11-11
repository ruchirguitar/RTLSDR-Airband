/*
 * test_spectrum.cpp
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

#include <gtest/gtest.h>

#include <cmath>
#include <cstring>
#include <vector>

#include "spectrum.h"

namespace {

const size_t kBins = 8;

std::vector<float> fft_with(size_t bin, float magnitude) {
    std::vector<float> re_im(2 * kBins, 0.0f);
    re_im[2 * bin] = magnitude;
    return re_im;
}

TEST(Spectrum, line_is_ready_after_the_set_number_of_ffts) {
    SpectrumAccumulator acc(kBins, 3);
    std::vector<float> fft = fft_with(0, 1.0f);
    EXPECT_FALSE(acc.add(fft.data()));
    EXPECT_FALSE(acc.add(fft.data()));
    EXPECT_TRUE(acc.add(fft.data()));
    EXPECT_EQ(acc.take_line().size(), kBins);
    EXPECT_FALSE(acc.add(fft.data())) << "counting restarts after a line";
}

TEST(Spectrum, lines_run_from_low_to_high_frequency) {
    SpectrumAccumulator acc(kBins, 1);
    std::vector<float> fft(2 * kBins, 0.0f);
    fft[2 * 0] = 1.0f;             // DC
    fft[2 * 1] = 1.0f;             // just above the centre
    fft[2 * (kBins - 1)] = 1.0f;   // just below the centre
    ASSERT_TRUE(acc.add(fft.data()));
    std::vector<float> line = acc.take_line();
    const size_t mid = kBins / 2;
    EXPECT_GT(line[mid], line[0] + 100);
    EXPECT_GT(line[mid + 1], line[0] + 100);
    EXPECT_GT(line[mid - 1], line[0] + 100);
    EXPECT_LT(line[mid + 2], line[mid] - 100);
}

TEST(Spectrum, averages_power_in_db_full_scale) {
    SpectrumAccumulator acc(kBins, 2);
    // a full-scale tone puts magnitude `bins` in its bin
    std::vector<float> loud = fft_with(1, (float)kBins);
    std::vector<float> silent(2 * kBins, 0.0f);
    acc.add(loud.data());
    ASSERT_TRUE(acc.add(silent.data()));
    std::vector<float> line = acc.take_line();
    EXPECT_NEAR(line[kBins / 2 + 1], 10.0f * log10f(0.5f), 0.01f) << "half the power on average";
    EXPECT_LE(line[0], -150.0f) << "empty bins are finite and very low";
    EXPECT_TRUE(std::isfinite(line[0]));
}

TEST(Spectrum, magnitude_on_the_line_scale) {
    // a full-scale tone has magnitude `bins` in its bin: 0 dB on both scales
    EXPECT_NEAR(magnitude_db((float)kBins, kBins), 0.0f, 1e-4);
    EXPECT_NEAR(magnitude_db((float)kBins / 10.0f, kBins), -20.0f, 1e-4);
    EXPECT_TRUE(std::isfinite(magnitude_db(0.0f, kBins)));
}

TEST(Spectrum, packet_carries_channel_squelch) {
    std::vector<float> line = {-50.0f};
    std::vector<SpectrumChannel> ch = {{145400000u, -90.0f, -80.0f, -60.0f, true}, {145200000u, -91.0f, -79.0f, -95.0f, false}};
    std::vector<unsigned char> p = encode_spectrum_packet(line, 145300000u, 2560000u, ch);
    ASSERT_EQ(p.size(), 20u + 4 + 4 + 2 * 20);
    uint32_t count, freq;
    float threshold;
    memcpy(&count, &p[24], 4);
    EXPECT_EQ(count, 2u);
    memcpy(&freq, &p[28 + 20], 4);
    memcpy(&threshold, &p[28 + 20 + 8], 4);
    EXPECT_EQ(freq, 145200000u);
    EXPECT_FLOAT_EQ(threshold, -79.0f);
    EXPECT_EQ(p[28 + 16], 1);
    EXPECT_EQ(p[28 + 20 + 16], 0);
}

TEST(Spectrum, packet_layout) {
    std::vector<float> line = {-50.0f, -60.5f};
    std::vector<unsigned char> p = encode_spectrum_packet(line, 145300000u, 2560000u);
    ASSERT_EQ(p.size(), 20u + 2 * 4 + 4);
    EXPECT_EQ(memcmp(p.data(), "FRSP", 4), 0);
    EXPECT_EQ(p[4], 2);
    uint32_t centre, rate, bins;
    memcpy(&centre, &p[8], 4);
    memcpy(&rate, &p[12], 4);
    memcpy(&bins, &p[16], 4);
    EXPECT_EQ(centre, 145300000u);
    EXPECT_EQ(rate, 2560000u);
    EXPECT_EQ(bins, 2u);
    float second;
    memcpy(&second, &p[24], 4);
    EXPECT_FLOAT_EQ(second, -60.5f);
}

}  // namespace
