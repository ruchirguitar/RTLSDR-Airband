/*
 * test_segment_audio.cpp
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

#include <algorithm>
#include <cmath>
#include <vector>

#include "segment_audio.h"

namespace {

const int kRate = 16000;
const size_t kBatch = 2000;

std::vector<float> sine(float amplitude, size_t count, float hz = 440.0f) {
    std::vector<float> out(count);
    for (size_t i = 0; i < count; i++) {
        out[i] = amplitude * sinf(2.0f * (float)M_PI * hz * (float)i / (float)kRate);
    }
    return out;
}

float rms_dbfs(const std::vector<float>& s, size_t from, size_t to) {
    double sum = 0;
    for (size_t i = from; i < to; i++) {
        sum += (double)s[i] * s[i];
    }
    return 20.0f * log10f((float)sqrt(sum / (double)(to - from)));
}

timeval at(long sec) {
    timeval tv = {};
    tv.tv_sec = sec;
    return tv;
}

class SegmentAudioTest : public ::testing::Test {
   protected:
    std::vector<float> out;
    SegmentAudio::Sink sink() {
        return [this](const float* s, size_t n) { out.insert(out.end(), s, s + n); };
    }
    // push `batches` signal batches of `audio` followed by the trailing no-signal batch
    void transmission(SegmentAudio& seg, const std::vector<float>& audio, long sec) {
        for (size_t i = 0; i + kBatch <= audio.size(); i += kBatch) {
            seg.push(&audio[i], kBatch, true, at(sec));
        }
        std::vector<float> tail(kBatch, 0.0f);
        seg.push(tail.data(), kBatch, false, at(sec));
    }
};

TEST_F(SegmentAudioTest, passes_audio_through_unchanged_by_default) {
    SegmentAudio seg(SegmentAudioOptions(), kRate, sink());
    std::vector<float> audio = sine(0.3f, 3 * kBatch);
    transmission(seg, audio, 100);

    ASSERT_EQ(out.size(), 4 * kBatch);
    EXPECT_TRUE(std::equal(audio.begin(), audio.end(), out.begin()));
    std::vector<SegmentInfo> done = seg.take_finished_segments();
    ASSERT_EQ(done.size(), 1u);
    EXPECT_DOUBLE_EQ(done[0].start_sec, 0.0);
    EXPECT_DOUBLE_EQ(done[0].end_sec, 4.0 * kBatch / kRate);
    EXPECT_EQ(done[0].wallclock_start.tv_sec, 100);
    EXPECT_TRUE(seg.take_finished_segments().empty());
}

TEST_F(SegmentAudioTest, gap_tone_goes_between_segments_only) {
    SegmentAudioOptions opt;
    opt.gap_tone = true;
    SegmentAudio seg(opt, kRate, sink());
    const std::vector<float> tone = gap_tone_samples(kRate);

    transmission(seg, sine(0.3f, 2 * kBatch), 100);
    ASSERT_EQ(out.size(), 3 * kBatch) << "no tone before the first segment";

    transmission(seg, sine(0.3f, kBatch), 160);
    ASSERT_EQ(out.size(), 3 * kBatch + tone.size() + 2 * kBatch);
    EXPECT_TRUE(std::equal(tone.begin(), tone.end(), out.begin() + 3 * kBatch));

    std::vector<SegmentInfo> done = seg.take_finished_segments();
    ASSERT_EQ(done.size(), 2u);
    EXPECT_DOUBLE_EQ(done[1].start_sec, (double)(3 * kBatch + tone.size()) / kRate);
    EXPECT_DOUBLE_EQ(done[1].end_sec, (double)out.size() / kRate);
    EXPECT_EQ(done[1].wallclock_start.tv_sec, 160);
}

TEST_F(SegmentAudioTest, no_gap_tone_when_disabled) {
    SegmentAudio seg(SegmentAudioOptions(), kRate, sink());
    transmission(seg, sine(0.3f, kBatch), 100);
    transmission(seg, sine(0.3f, kBatch), 110);
    EXPECT_EQ(out.size(), 4 * kBatch);
}

TEST_F(SegmentAudioTest, normalize_evens_out_quiet_and_loud_segments) {
    SegmentAudioOptions opt;
    opt.normalize = true;
    SegmentAudio seg(opt, kRate, sink());

    transmission(seg, sine(0.02f, 4 * kBatch), 100);
    transmission(seg, sine(0.6f, 4 * kBatch), 110);

    ASSERT_EQ(out.size(), 10 * kBatch);
    EXPECT_NEAR(rms_dbfs(out, 0, 4 * kBatch), -20.0f, 0.5f);
    EXPECT_NEAR(rms_dbfs(out, 5 * kBatch, 9 * kBatch), -20.0f, 0.5f);
}

TEST_F(SegmentAudioTest, normalize_holds_audio_until_the_segment_ends) {
    SegmentAudioOptions opt;
    opt.normalize = true;
    SegmentAudio seg(opt, kRate, sink());
    std::vector<float> audio = sine(0.02f, 2 * kBatch);
    seg.push(&audio[0], kBatch, true, at(100));
    seg.push(&audio[kBatch], kBatch, true, at(100));
    EXPECT_TRUE(out.empty());
    EXPECT_EQ(seg.samples_emitted(), 0u);
}

TEST_F(SegmentAudioTest, normalize_writes_long_segments_in_chunks_with_one_gain) {
    SegmentAudioOptions opt;
    opt.normalize = true;
    opt.max_buffer_sec = (double)(2 * kBatch) / kRate;
    SegmentAudio seg(opt, kRate, sink());
    std::vector<float> audio = sine(0.05f, 6 * kBatch);
    for (size_t i = 0; i < 6; i++) {
        seg.push(&audio[i * kBatch], kBatch, true, at(100));
    }
    EXPECT_GE(out.size(), 4 * kBatch) << "audio past max_buffer_sec is written before the segment ends";

    std::vector<float> tail(kBatch, 0.0f);
    seg.push(tail.data(), kBatch, false, at(100));
    ASSERT_EQ(out.size(), 7 * kBatch);
    EXPECT_NEAR(rms_dbfs(out, 0, 2 * kBatch), rms_dbfs(out, 4 * kBatch, 6 * kBatch), 0.01f);
}

TEST_F(SegmentAudioTest, finish_ends_an_open_segment) {
    SegmentAudioOptions opt;
    opt.normalize = true;
    SegmentAudio seg(opt, kRate, sink());
    std::vector<float> audio = sine(0.1f, 2 * kBatch);
    seg.push(&audio[0], kBatch, true, at(100));
    seg.push(&audio[kBatch], kBatch, true, at(100));
    seg.finish();

    EXPECT_EQ(out.size(), 2 * kBatch);
    std::vector<SegmentInfo> done = seg.take_finished_segments();
    ASSERT_EQ(done.size(), 1u);
    EXPECT_DOUBLE_EQ(done[0].end_sec, 2.0 * kBatch / kRate);

    seg.finish();
    EXPECT_TRUE(seg.take_finished_segments().empty()) << "finish without an open segment adds nothing";
}

TEST(SegmentAudioHelpers, normalize_gain_reaches_target_rms) {
    std::vector<float> s = sine(0.05f, kRate);
    float gain = normalize_gain(s.data(), s.size(), kRate, -20.0f);
    float rms = 0.05f / sqrtf(2.0f);
    EXPECT_NEAR(20.0f * log10f(rms * gain), -20.0f, 0.1f);
}

TEST(SegmentAudioHelpers, normalize_gain_ignores_silent_parts) {
    std::vector<float> s = sine(0.05f, kRate);
    s.insert(s.end(), 4 * kRate, 0.0f);
    float gain = normalize_gain(s.data(), s.size(), kRate, -20.0f);
    EXPECT_NEAR(20.0f * log10f(0.05f / sqrtf(2.0f) * gain), -20.0f, 0.5f);
}

TEST(SegmentAudioHelpers, normalize_gain_keeps_peaks_below_full_scale) {
    std::vector<float> s(kRate, 0.0f);
    for (size_t i = 0; i < s.size(); i += 50) {
        s[i] = 0.5f;  // sparse spikes: low RMS, high peak
    }
    float gain = normalize_gain(s.data(), s.size(), kRate, -20.0f);
    EXPECT_LE(0.5f * gain, 1.0f);
}

TEST(SegmentAudioHelpers, normalize_gain_is_limited_to_20_db) {
    std::vector<float> quiet = sine(0.001f, kRate);
    EXPECT_FLOAT_EQ(normalize_gain(quiet.data(), quiet.size(), kRate, -20.0f), 10.0f);
}

TEST(SegmentAudioHelpers, normalize_gain_is_unity_for_silence) {
    std::vector<float> s(kRate, 0.0f);
    EXPECT_FLOAT_EQ(normalize_gain(s.data(), s.size(), kRate, -20.0f), 1.0f);
    EXPECT_FLOAT_EQ(normalize_gain(s.data(), 0, kRate, -20.0f), 1.0f);
}

TEST(SegmentAudioHelpers, gap_tone_is_short_soft_and_click_free) {
    std::vector<float> tone = gap_tone_samples(kRate);
    ASSERT_FALSE(tone.empty());
    EXPECT_LE(tone.size(), (size_t)(kRate / 2)) << "at most half a second";
    float peak = 0;
    for (float v : tone) {
        peak = std::max(peak, fabsf(v));
    }
    EXPECT_GT(peak, 0.05f);
    EXPECT_LE(peak, 0.15f) << "quieter than speech at the default -20 dBFS target";
    EXPECT_FLOAT_EQ(tone.front(), 0.0f);
    EXPECT_FLOAT_EQ(tone.back(), 0.0f);
}

TEST(SegmentAudioHelpers, segment_line_format) {
    SegmentInfo s;
    s.start_sec = 12.5;
    s.end_sec = 20.25;
    s.wallclock_start.tv_sec = 1700000000;
    s.wallclock_start.tv_usec = 123000;
    EXPECT_EQ(segment_log_header(), "start_sec\tend_sec\tstart_unix\tstart_utc\tfrequency_hz\n");
    EXPECT_EQ(format_segment_line(s, 145400000), "12.500\t20.250\t1700000000.123\t2023-11-14T22:13:20.123Z\t145400000\n");
}

}  // namespace
