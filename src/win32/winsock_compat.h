/* POSIX socket headers mapped onto Winsock for Windows (MinGW). */
#ifndef _WIN32_WINSOCK_COMPAT_H
#define _WIN32_WINSOCK_COMPAT_H

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>

#ifndef MSG_DONTWAIT
#define MSG_DONTWAIT 0
#endif
#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif

#endif /* _WIN32_WINSOCK_COMPAT_H */
