/*
 * segment_audio.cpp
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

#include "segment_audio.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <ctime>

namespace {

const float kGateDbfs = -70.0f;  // blocks quieter than this are not speech
const float kMaxGain = 10.0f;    // +20 dB
const float kMinGain = 0.1f;     // -20 dB
const float kPeakCeiling = 0.98f;

const float kToneHz = 880.0f;
const float kToneAmplitude = 0.1f;  // about 6 dB under speech normalized to -20 dBFS
const int kTonePadMs = 100;
const int kPipMs = 70;
const int kPipGapMs = 60;
const int kFadeMs = 8;

void append_silence(std::vector<float>& out, int sample_rate, int ms) {
    out.insert(out.end(), (size_t)(sample_rate * ms / 1000), 0.0f);
}

void append_pip(std::vector<float>& out, int sample_rate) {
    const int n = sample_rate * kPipMs / 1000;
    const int fade = sample_rate * kFadeMs / 1000;
    for (int i = 0; i < n; i++) {
        float envelope = 1.0f;
        int edge = std::min(i, n - 1 - i);
        if (edge < fade) {
            envelope = 0.5f - 0.5f * cosf((float)M_PI * (float)edge / (float)fade);
        }
        out.push_back(kToneAmplitude * envelope * sinf(2.0f * (float)M_PI * kToneHz * (float)i / (float)sample_rate));
    }
}

}  // namespace

SegmentAudio::SegmentAudio(const SegmentAudioOptions& options, int sample_rate, Sink sink) : options_(options), sample_rate_(sample_rate), sink_(sink) {}

void SegmentAudio::emit(const float* samples, size_t count) {
    if (count == 0) {
        return;
    }
    sink_(samples, count);
    emitted_ += count;
}

void SegmentAudio::flush_pending() {
    if (pending_.empty()) {
        return;
    }
    if (!gain_locked_) {
        gain_ = normalize_gain(pending_.data(), pending_.size(), sample_rate_, options_.normalize_target_dbfs);
        gain_locked_ = true;
    }
    for (float& v : pending_) {
        v *= gain_;
    }
    emit(pending_.data(), pending_.size());
    pending_.clear();
}

void SegmentAudio::push(const float* samples, size_t count, bool signal, const timeval& now) {
    if (!in_segment_) {
        if (options_.gap_tone && segments_started_ > 0) {
            std::vector<float> tone = gap_tone_samples(sample_rate_);
            emit(tone.data(), tone.size());
        }
        in_segment_ = true;
        segments_started_++;
        gain_locked_ = false;
        gain_ = 1.0f;
        current_ = SegmentInfo();
        current_.start_sec = (double)emitted_ / sample_rate_;
        current_.wallclock_start = now;
    }

    if (!options_.normalize) {
        emit(samples, count);
    } else if (gain_locked_) {
        pending_.assign(samples, samples + count);
        flush_pending();
    } else {
        pending_.insert(pending_.end(), samples, samples + count);
        if ((double)pending_.size() >= options_.max_buffer_sec * sample_rate_) {
            flush_pending();
        }
    }

    if (!signal) {
        end_segment();
    }
}

void SegmentAudio::end_segment() {
    if (!in_segment_) {
        return;
    }
    flush_pending();
    current_.end_sec = (double)emitted_ / sample_rate_;
    finished_.push_back(current_);
    in_segment_ = false;
}

void SegmentAudio::finish() {
    end_segment();
}

std::vector<SegmentInfo> SegmentAudio::take_finished_segments() {
    std::vector<SegmentInfo> out;
    out.swap(finished_);
    return out;
}

float normalize_gain(const float* samples, size_t count, int sample_rate, float target_dbfs) {
    const size_t block = std::max<size_t>(1, (size_t)sample_rate / 50);
    const double gate_power = pow(10.0, kGateDbfs / 10.0);
    double power_sum = 0;
    size_t blocks_used = 0;
    float peak = 0;

    for (size_t start = 0; start < count; start += block) {
        const size_t end = std::min(count, start + block);
        double sum = 0;
        for (size_t i = start; i < end; i++) {
            sum += (double)samples[i] * samples[i];
            peak = std::max(peak, fabsf(samples[i]));
        }
        const double power = sum / (double)(end - start);
        if (power >= gate_power) {
            power_sum += power;
            blocks_used++;
        }
    }
    if (blocks_used == 0) {
        return 1.0f;
    }

    const double rms = sqrt(power_sum / (double)blocks_used);
    float gain = (float)(pow(10.0, target_dbfs / 20.0) / rms);
    gain = std::min(kMaxGain, std::max(kMinGain, gain));
    if (peak > 0 && peak * gain > kPeakCeiling) {
        gain = kPeakCeiling / peak;
    }
    return gain;
}

std::vector<float> gap_tone_samples(int sample_rate) {
    std::vector<float> out;
    append_silence(out, sample_rate, kTonePadMs);
    append_pip(out, sample_rate);
    append_silence(out, sample_rate, kPipGapMs);
    append_pip(out, sample_rate);
    append_silence(out, sample_rate, kTonePadMs);
    return out;
}

std::string segment_log_header() {
    return "start_sec\tend_sec\tstart_unix\tstart_utc\tfrequency_hz\n";
}

std::string format_segment_line(const SegmentInfo& segment, int frequency_hz) {
    const time_t seconds = (time_t)segment.wallclock_start.tv_sec;
    const int millis = (int)(segment.wallclock_start.tv_usec / 1000);
    struct tm utc;
#ifdef _WIN32
    gmtime_s(&utc, &seconds);
#else
    gmtime_r(&seconds, &utc);
#endif
    char stamp[32];
    strftime(stamp, sizeof(stamp), "%Y-%m-%dT%H:%M:%S", &utc);

    char line[160];
    snprintf(line, sizeof(line), "%.3f\t%.3f\t%lld.%03d\t%s.%03dZ\t%d\n", segment.start_sec, segment.end_sec, (long long)seconds, millis, stamp, millis, frequency_hz);
    return line;
}
