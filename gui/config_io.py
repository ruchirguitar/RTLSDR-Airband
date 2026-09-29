"""Conversion helpers between libconf's AttrDict/tuple tree and a plain JSON-friendly
dict/list tree.

JSON (and JavaScript) numbers have no separate int/float types, so a whole-number
float like 120.0 would be indistinguishable from the int 120 once it crosses into
the browser. libconfig itself DOES distinguish them (120.0 vs 120 serialize
differently), and RTLSDR-Airband's own parser cares about that distinction for some
fields. To preserve it, every scalar leaf is sent to the frontend wrapped as
{"__scalar__": true, "type": "int"|"float"|"bool"|"string", "value": ...} instead of
a bare JSON value, so the original libconfig type always round-trips correctly.
"""
import libconf

# libconf.dump_value() formats a Python bool with plain str.format(), which
# yields "True"/"False" (Python's capitalization) - but real libconfig++ (what
# rtl_airband actually links against) only recognizes the lowercase keywords
# true/false as boolean literals; "True" is a syntax error to it. libconf's own
# reader is case-insensitive on the way in, so writing and re-reading a config
# with this module round-trips fine and never surfaces the bug - only the real
# engine ever rejects it. Patched narrowly here rather than relying on
# something a real libconfig++ user configures for themselves.
_original_dump_value = libconf.dump_value


def _dump_value_lowercase_bool(key, value, f, indent=0):
    if isinstance(value, bool):
        spaces = " " * indent
        key_prefix = (key + " = ") if key is not None else ""
        f.write("{}{}{}".format(spaces, key_prefix, "true" if value else "false"))
        return
    _original_dump_value(key, value, f, indent)


libconf.dump_value = _dump_value_lowercase_bool


def _wrap_scalar(v):
    if isinstance(v, bool):
        t = "bool"
    elif isinstance(v, float):
        t = "float"
    elif isinstance(v, int):
        t = "int"
    else:
        t = "string"
        v = "" if v is None else str(v)
    return {"__scalar__": True, "type": t, "value": v}


def _unwrap_scalar(obj):
    t = obj.get("type")
    v = obj.get("value")
    if t == "bool":
        return bool(v)
    if t == "int":
        try:
            return int(v)
        except (TypeError, ValueError):
            return 0
    if t == "float":
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0
    return "" if v is None else str(v)


def to_plain(obj):
    if isinstance(obj, libconf.AttrDict):
        return {k: to_plain(v) for k, v in obj.items()}
    if isinstance(obj, (tuple, list)):
        return [to_plain(v) for v in obj]
    return _wrap_scalar(obj)


def to_libconf(obj):
    if isinstance(obj, dict):
        if obj.get("__scalar__"):
            return _unwrap_scalar(obj)
        d = libconf.AttrDict()
        for k, v in obj.items():
            d[k] = to_libconf(v)
        return d
    if isinstance(obj, list):
        return tuple(to_libconf(v) for v in obj)
    return obj


def parse_text(text):
    """Returns plain dict, or raises libconf.ConfigParseError on bad syntax."""
    return to_plain(libconf.loads(text))


def dump_text(data):
    """data: plain dict (with wrapped scalar leaves) -> libconfig text."""
    return libconf.dumps(to_libconf(data))
