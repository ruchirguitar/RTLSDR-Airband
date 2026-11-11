/*
 * control.h
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

#ifndef _CONTROL_H
#define _CONTROL_H

#include <string>

// Commands a controlling program can send on the engine's stdin (one per
// line) to change settings without a restart:
//   gain <device> <dB>
//   squelch <device> <channel> <SNR dB>
struct ControlCommand {
    enum Kind { GAIN, SQUELCH } kind;
    int device;
    int channel;  // SQUELCH only
    float value;
};

// Parses one line. On failure returns false and says why in `error`.
bool parse_control_command(const std::string& line, ControlCommand* out, std::string* error);

#endif /* _CONTROL_H */
