/*
 * Minimal syslog.h for Windows (MinGW). Windows has no syslog daemon, so
 * messages that would go to syslog are written to stderr instead; the GUI
 * captures the engine's stderr as its log.
 */
#ifndef _WIN32_SYSLOG_H
#define _WIN32_SYSLOG_H

#include <stdarg.h>
#include <stdio.h>

#define LOG_EMERG 0
#define LOG_ALERT 1
#define LOG_CRIT 2
#define LOG_ERR 3
#define LOG_WARNING 4
#define LOG_NOTICE 5
#define LOG_INFO 6
#define LOG_DEBUG 7

#define LOG_PID 0x01
#define LOG_DAEMON (3 << 3)

static inline void openlog(const char*, int, int) {}
static inline void closelog(void) {}
static inline void vsyslog(int, const char* format, va_list args) {
    vfprintf(stderr, format, args);
    fflush(stderr);
}
static inline void syslog(int priority, const char* format, ...) {
    va_list args;
    va_start(args, format);
    vsyslog(priority, format, args);
    va_end(args);
}

#endif /* _WIN32_SYSLOG_H */
