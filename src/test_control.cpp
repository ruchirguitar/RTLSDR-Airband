/*
 * test_control.cpp
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

#include "control.h"

namespace {

TEST(Control, parses_gain) {
    ControlCommand c;
    std::string err;
    ASSERT_TRUE(parse_control_command("gain 0 29.7", &c, &err)) << err;
    EXPECT_EQ(c.kind, ControlCommand::GAIN);
    EXPECT_EQ(c.device, 0);
    EXPECT_FLOAT_EQ(c.value, 29.7f);
    ASSERT_TRUE(parse_control_command("  gain 1 40\r", &c, &err)) << "tolerates spaces and a CR";
    EXPECT_EQ(c.device, 1);
}

TEST(Control, parses_squelch) {
    ControlCommand c;
    std::string err;
    ASSERT_TRUE(parse_control_command("squelch 0 2 12.5", &c, &err)) << err;
    EXPECT_EQ(c.kind, ControlCommand::SQUELCH);
    EXPECT_EQ(c.device, 0);
    EXPECT_EQ(c.channel, 2);
    EXPECT_FLOAT_EQ(c.value, 12.5f);
}

TEST(Control, rejects_bad_commands) {
    ControlCommand c;
    std::string err;
    EXPECT_FALSE(parse_control_command("", &c, &err));
    EXPECT_FALSE(parse_control_command("volume 0 3", &c, &err));
    EXPECT_NE(err.find("unknown command"), std::string::npos);
    EXPECT_FALSE(parse_control_command("gain 0", &c, &err));
    EXPECT_FALSE(parse_control_command("gain 0 abc", &c, &err));
    EXPECT_FALSE(parse_control_command("gain 0 30 extra", &c, &err));
    EXPECT_FALSE(parse_control_command("gain -1 30", &c, &err));
    EXPECT_FALSE(parse_control_command("gain 0 -5", &c, &err));
    EXPECT_FALSE(parse_control_command("squelch 0 1", &c, &err));
    EXPECT_FALSE(parse_control_command("squelch 0 -1 10", &c, &err));
    EXPECT_FALSE(parse_control_command("squelch 0 1 -3", &c, &err));
}

}  // namespace
