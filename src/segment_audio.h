/*
 * segment_audio.h
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

#ifndef _SEGMENT_AUDIO_H
#define _SEGMENT_AUDIO_H

#include <sys/time.h>

#include <cstddef>
#include <functional>
#include <string>
#include <vector>

// Audio processing for a split_on_transmission file that holds several
// transmissions ("segments") joined without the silence between them:
// an optional marker tone between segments, optional per-segment loudness
// normalization, and the position of each segment in the file.

struct SegmentAudioOptions {
    bool gap_tone = false;
    bool normalize = false;
    float normalize_target_dbfs = -20.0f;
    // longest stretch of one segment held in memory before it is written
    // out with the gain chosen so far (that gain is then kept for the rest
    // of the segment)
    double max_buffer_sec = 30.0;
};

struct SegmentInfo {
    double start_sec;  // position in the file's audio, gap tones included
    double end_sec;
    timeval wallclock_start;
};

class SegmentAudio {
   public:
    using Sink = std::function<void(const float* samples, size_t count)>;

    SegmentAudio(const SegmentAudioOptions& options, int sample_rate, Sink sink);

    // One batch that the file output writes. `signal` is false for the
    // trailing batch written after squelch closes, which ends the segment.
    void push(const float* samples, size_t count, bool signal, const timeval& now);

    // Ends a segment still in progress (the file is closing).
    void finish();

    // Segments that ended since the previous call.
    std::vector<SegmentInfo> take_finished_segments();

    size_t samples_emitted() const { return emitted_; }

   private:
    void emit(const float* samples, size_t count);
    void flush_pending();
    void end_segment();

    SegmentAudioOptions options_;
    int sample_rate_;
    Sink sink_;

    bool in_segment_ = false;
    size_t segments_started_ = 0;
    size_t emitted_ = 0;
    std::vector<float> pending_;
    bool gain_locked_ = false;
    float gain_ = 1.0f;
    SegmentInfo current_ = {};
    std::vector<SegmentInfo> finished_;
};

// Gain that brings the speech in `samples` to `target_dbfs` RMS, measured over
// 20 ms blocks with near-silent blocks left out, limited to +/-20 dB and so
// the loudest sample stays below full scale. 1.0 when there is nothing to measure.
float normalize_gain(const float* samples, size_t count, int sample_rate, float target_dbfs);

// The marker placed between two segments: two short soft 880 Hz pips with
// silence before, between and after them.
std::vector<float> gap_tone_samples(int sample_rate);

// One tab-separated line per segment (with its trailing newline) and the
// header line that starts the file.
std::string segment_log_header();
std::string format_segment_line(const SegmentInfo& segment, int frequency_hz);

#endif /* _SEGMENT_AUDIO_H */
