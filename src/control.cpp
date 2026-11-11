/*
 * control.cpp
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

#include "control.h"

#include <cmath>
#include <sstream>

bool parse_control_command(const std::string& line, ControlCommand* out, std::string* error) {
    std::istringstream in(line);
    std::string verb;
    in >> verb;
    if (verb.empty()) {
        *error = "empty command";
        return false;
    }

    ControlCommand cmd = {};
    std::string extra;
    if (verb == "gain") {
        cmd.kind = ControlCommand::GAIN;
        if (!(in >> cmd.device >> cmd.value) || (in >> extra)) {
            *error = "usage: gain <device> <dB>";
            return false;
        }
        if (!std::isfinite(cmd.value) || cmd.value < 0.0f || cmd.value > 100.0f) {
            *error = "gain must be between 0 and 100 dB";
            return false;
        }
    } else if (verb == "squelch") {
        cmd.kind = ControlCommand::SQUELCH;
        if (!(in >> cmd.device >> cmd.channel >> cmd.value) || (in >> extra)) {
            *error = "usage: squelch <device> <channel> <SNR dB>";
            return false;
        }
        if (cmd.channel < 0) {
            *error = "channel must not be negative";
            return false;
        }
        if (!std::isfinite(cmd.value) || cmd.value < 0.0f || cmd.value > 100.0f) {
            *error = "squelch SNR must be between 0 and 100 dB";
            return false;
        }
    } else {
        *error = "unknown command: " + verb;
        return false;
    }
    if (cmd.device < 0) {
        *error = "device must not be negative";
        return false;
    }
    *out = cmd;
    return true;
}
