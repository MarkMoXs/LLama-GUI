"""Monitor 标签页使用的只读系统与 GPU 遥测。

设计规则：

* 只读操作。不会安装任何内容、提权或运行包管理器。GPU 探测仅限于调用
    机器上已有的工具（``all-smi``、``nvidia-smi``、``amd-smi``），或显式配置的
    回环 all-smi API。
* 缺少厂商工具和不支持的字段属于正常能力状态：通过 ``gpu_setup`` 条目和各字段
    的 ``null`` 表示，不产生页面级错误。可选数值不可用时为 ``null``，绝不臆造为零。
* CPU 和磁盘吞吐量是累计计数器采样之间的差值。单调时钟与墙上时钟时间戳会紧邻
    计数器读取立即采集，较慢的 GPU 探测随后执行，因此探测既不会扭曲采样间隔，
    也不会改变 ``sampled_at``。
* ``state.system_stats_lock`` 保护上一次采样、响应缓存、缓存代数以及 all-smi/AMD
    探测缓存。GPU 子进程运行期间不会持有状态锁。``state.system_stats_collection_lock``
    串行化冷启动/强制采集；等待者在锁前后比较缓存代数，使并发轮询共享一次采集，
    连续点击“重新检查”也会合并，而不是排队执行多个强制探测。
"""

import csv
import ctypes
import glob
import hashlib
import io
import ipaddress
import json
import math
import os
import plistlib
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from .subprocess_utils import get_no_window_creationflags


# --------------------------------------------------------------------------
# 调优常量
# --------------------------------------------------------------------------

# 短生命周期响应缓存，时长接近 Monitor UI 的轮询间隔，因此每个周期最多执行一次
# 冷探测（包括启动缓慢的 all-smi/``amd-smi``）。
CACHE_TTL_SECONDS = 2.0

# 速率窗口。上限会有意丢弃系统挂起或长时间轮询间隔后的第一次平均值；下一次正常
# 采样会恢复速率计算。
MIN_RATE_INTERVAL_SECONDS = 0.1
MAX_RATE_INTERVAL_SECONDS = 30.0

NVIDIA_PROBE_TIMEOUT_SECONDS = 2.0
AMD_PROBE_TIMEOUT_SECONDS = 5.0
ALL_SMI_PROBE_TIMEOUT_SECONDS = 5.0
ALL_SMI_HTTP_TIMEOUT_SECONDS = 3.0
ALL_SMI_MAX_RESPONSE_BYTES = 1024 * 1024
# ``amd-smi`` 会启动 Python 解释器，比 nvidia-smi 慢得多；all-smi 也会执行完整的
# 多厂商扫描。短时间复用已解析的结果，避免每次采样都重新启动工具。
AMD_PROBE_CACHE_TTL_SECONDS = 5.0
ALL_SMI_PROBE_CACHE_TTL_SECONDS = 5.0

NVIDIA_QUERY_FIELDS = (
    "uuid,pci.bus_id,index,name,"
    "utilization.gpu,memory.used,memory.total,temperature.gpu"
)

NVIDIA_DOCS_URL = "https://docs.nvidia.com/deploy/nvidia-smi/index.html"
AMD_INSTALL_DOCS_URL = (
    "https://rocm.docs.amd.com/projects/amdsmi/en/latest/install/install.html"
)
# Fixed allowlist: setup commands are only ever displayed/copied, never
# executed, and never built from user input or string concatenation.
AMD_SETUP_COMMANDS = {
    "apt": "sudo apt install amdrocm-amdsmi",
    "dnf": "sudo dnf install amdrocm-amdsmi",
    "zypper": "sudo zypper install amdrocm-amdsmi",
}

_UNSET = ("", "N/A", "[N/A]", "n/a")


# --------------------------------------------------------------------------
# Validation helpers (shared by every collector and parser)
# --------------------------------------------------------------------------

def finite_non_negative(value):
    """有限且非负时返回 ``float(value)``，否则返回 ``None``。"""
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number < 0:
        return None
    return number


def finite_non_negative_int(value):
    number = finite_non_negative(value)
    if number is None:
        return None
    return int(number)


def clamp_percent(value):
    """将百分比限制在规定的 0-100 范围内。"""
    number = finite_non_negative(value)
    if number is None:
        return None
    return max(0.0, min(100.0, number))


def usage_percent(used, total):
    """计算已用/总量百分比；相除前要求总量为正数。"""
    used = finite_non_negative(used)
    total = finite_non_negative(total)
    if used is None or total is None or total <= 0:
        return None
    return clamp_percent(used / total * 100.0)


def valid_rate_interval(seconds):
    if seconds is None or not math.isfinite(seconds):
        return False
    return MIN_RATE_INTERVAL_SECONDS <= seconds <= MAX_RATE_INTERVAL_SECONDS


def compute_cpu_percent(prev_total, prev_idle, curr_total, curr_idle):
    """根据累计计数器差值计算 CPU 忙碌百分比。

    计数器回退或总量差值非正时返回 ``None``；调用方会保存当前采样并替换基线。
    """
    values = [finite_non_negative(v) for v in (prev_total, prev_idle, curr_total, curr_idle)]
    if any(value is None for value in values):
        return None
    prev_total, prev_idle, curr_total, curr_idle = values
    delta_total = curr_total - prev_total
    if delta_total <= 0:
        return None
    delta_idle = curr_idle - prev_idle
    if delta_idle < 0 or delta_idle > delta_total:
        return None
    busy = max(delta_total - delta_idle, 0.0)
    return clamp_percent(busy / delta_total * 100.0)


def compute_bytes_per_second(previous, current, interval_seconds):
    """根据累计计数器计算字节速率；计数器回退时返回 ``None``。"""
    previous = finite_non_negative(previous)
    current = finite_non_negative(current)
    if previous is None or current is None or not valid_rate_interval(interval_seconds):
        return None
    delta = current - previous
    if delta < 0:
        return None
    return delta / interval_seconds


def _normalize_uuid(raw):
    """返回有长度限制的规范 GPU UUID，否则返回 ``None``。"""
    value = str(raw or "").strip()
    if value.upper() in _UNSET or len(value) > 80:
        return None
    if not re.fullmatch(r"[A-Za-z0-9-]+", value):
        return None
    return value.upper()


def _normalize_bdf(raw):
    """返回有长度限制的规范 PCI 总线/BDF 标识，否则返回 ``None``。"""
    value = str(raw or "").strip()
    if value.upper() in _UNSET or len(value) > 32:
        return None
    value = value.lower()
    if not re.fullmatch(r"[0-9a-f:.-]+", value):
        return None
    return value


def _optional_number(raw):
    """厂商工具的数值字段；N/A 和无效值转换为 ``None``。"""
    value = str(raw or "").strip()
    if value.upper() in _UNSET:
        return None
    return finite_non_negative(value)


def _optional_name(raw):
    value = str(raw or "").strip()
    if value.upper() in _UNSET:
        return None
    return value[:120]


# --------------------------------------------------------------------------
# Linux 解析器（纯函数；由测试套件直接测试）
# --------------------------------------------------------------------------

def parse_proc_stat(text):
    """将 ``/proc/stat`` 中的 CPU 计数器聚合为 ``(total, idle)``。"""
    for line in str(text or "").splitlines():
        if not line.startswith("cpu "):
            continue
        parts = line.split()[1:]
        if len(parts) < 4:
            return None
        try:
            values = [float(part) for part in parts[:8]]
        except ValueError:
            return None
        if any(value < 0 for value in values):
            return None
        idle = values[3] + (values[4] if len(values) > 4 else 0.0)
        return (sum(values), idle)
    return None


def parse_proc_meminfo(text):
    """从 ``/proc/meminfo`` 获取系统 RAM，返回 ``(used_bytes, total_bytes)``。"""
    fields = {}
    for line in str(text or "").splitlines():
        key, sep, rest = line.partition(":")
        if not sep:
            continue
        parts = rest.split()
        if not parts:
            continue
        try:
            kib = float(parts[0])
        except ValueError:
            continue
        if kib < 0:
            continue
        fields[key.strip()] = kib * 1024.0
    total = fields.get("MemTotal")
    available = fields.get("MemAvailable")
    if available is None and "MemFree" in fields:
        available = fields["MemFree"] + fields.get("Buffers", 0.0) + fields.get("Cached", 0.0)
    if total is None or total <= 0 or available is None or available > total:
        return None
    return (max(total - available, 0.0), total)


_WHOLE_DISK_RE = re.compile(
    r"^(sd[a-z]+|hd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+|dasd[a-z]+)$"
)


def parse_proc_diskstats(text):
    """从 ``/proc/diskstats`` 获取各设备的累计 I/O 计数器。"""
    entries = []
    for line in str(text or "").splitlines():
        parts = line.split()
        # 现代内核有 18 个以上字段；这里要求包含本代码所用读写扇区列的经典 14 字段。
        if len(parts) < 14:
            continue
        try:
            major = int(parts[0])
            minor = int(parts[1])
            sectors_read = int(parts[5])
            sectors_written = int(parts[9])
        except ValueError:
            continue
        if min(major, minor, sectors_read, sectors_written) < 0:
            continue
        entries.append(
            {
                "major": major,
                "minor": minor,
                "name": parts[2],
                "bytes_read": sectors_read * 512,
                "bytes_written": sectors_written * 512,
            }
        )
    return entries


def select_disk_counters(entries, device):
    """选择承载应用根目录的设备的 I/O 计数器。

    返回 ``(source_identity, bytes_read, bytes_written)`` 或 ``None``。
    优先级为：精确的 major:minor（分区统计自身 I/O），然后是该 major 对应的整盘，
    最后是所有整盘设备之和。源标识用于关联差值基线，因此设备变化会丢弃速率。
    """
    if device is not None:
        major, minor = device
        for entry in entries:
            if entry["major"] == major and entry["minor"] == minor:
                return (
                    f"dev:{major}:{minor}",
                    entry["bytes_read"],
                    entry["bytes_written"],
                )
        for entry in entries:
            if entry["major"] == major and entry["minor"] == 0:
                return (
                    f"disk:{major}:0",
                    entry["bytes_read"],
                    entry["bytes_written"],
                )
    whole = [entry for entry in entries if _WHOLE_DISK_RE.match(entry["name"])]
    if not whole:
        return None
    return (
        "disk:all",
        sum(entry["bytes_read"] for entry in whole),
        sum(entry["bytes_written"] for entry in whole),
    )


def resolve_root_device(root_path):
    """返回承载 *root_path* 的文件系统的 ``(major, minor)``，否则返回 ``None``。"""
    try:
        stat_result = os.stat(root_path)
    except OSError:
        return None
    try:
        return (os.major(stat_result.st_dev), os.minor(stat_result.st_dev))
    except (AttributeError, TypeError, ValueError):
        return None


# --------------------------------------------------------------------------
# Windows 采集器（ctypes，无需额外包）
# --------------------------------------------------------------------------

class _FILETIME(ctypes.Structure):
    _fields_ = [("low", ctypes.c_uint32), ("high", ctypes.c_uint32)]


def _filetime_ticks(ft):
    return (ft.high << 32) | ft.low


def collect_windows_cpu():
    """通过 ``GetSystemTimes`` 获取累计 CPU 计数器。

    内核时间已经包含空闲时间，因此 total = kernel + user。
    """
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    idle = _FILETIME()
    kernel = _FILETIME()
    user = _FILETIME()
    if not kernel32.GetSystemTimes(
        ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)
    ):
        return None
    total = _filetime_ticks(kernel) + _filetime_ticks(user)
    idle_ticks = _filetime_ticks(idle)
    if total <= 0 or idle_ticks > total:
        return None
    return {"source": "cpu:GetSystemTimes", "total": float(total), "idle": float(idle_ticks)}


class _MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_uint32),
        ("dwMemoryLoad", ctypes.c_uint32),
        ("ullTotalPhys", ctypes.c_uint64),
        ("ullAvailPhys", ctypes.c_uint64),
        ("ullTotalPageFile", ctypes.c_uint64),
        ("ullAvailPageFile", ctypes.c_uint64),
        ("ullTotalVirtual", ctypes.c_uint64),
        ("ullAvailVirtual", ctypes.c_uint64),
        ("ullAvailExtendedVirtual", ctypes.c_uint64),
    ]


def collect_windows_memory():
    """通过 ``GlobalMemoryStatusEx`` 获取 ``(used_bytes, total_bytes)``。"""
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    status = _MEMORYSTATUSEX()
    status.dwLength = ctypes.sizeof(_MEMORYSTATUSEX)
    if not kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
        return None
    total = int(status.ullTotalPhys)
    available = int(status.ullAvailPhys)
    if total <= 0 or available < 0 or available > total:
        return None
    return (float(total - available), float(total))


# --------------------------------------------------------------------------
class _PDH_RAW_COUNTER(ctypes.Structure):
    _fields_ = [
        ("CStatus", ctypes.c_uint32),
        ("TimeStamp", _FILETIME),
        ("FirstValue", ctypes.c_int64),
        ("SecondValue", ctypes.c_int64),
        ("MultiCount", ctypes.c_uint32),
    ]


def collect_windows_disk_counters():
    """通过与语言无关的 Windows PDH 计数器获取累计物理磁盘字节数。

    读取原始值，以便共享采样器处理预热、间隔和回退。查询句柄仅属于一次采集，
    即使计数器失败也始终关闭。不启动子进程、不弹出管理员提示，也不依赖厂商工具。
    """
    pdh = ctypes.WinDLL("pdh")
    handle = ctypes.c_void_p
    for name, args in (
        ("PdhOpenQueryW", [ctypes.c_wchar_p, ctypes.c_size_t, ctypes.POINTER(handle)]),
        ("PdhAddEnglishCounterW", [handle, ctypes.c_wchar_p, ctypes.c_size_t, ctypes.POINTER(handle)]),
        ("PdhCollectQueryData", [handle]),
        ("PdhGetRawCounterValue", [handle, ctypes.POINTER(ctypes.c_uint32), ctypes.POINTER(_PDH_RAW_COUNTER)]),
        ("PdhCloseQuery", [handle]),
    ):
        function = getattr(pdh, name)
        function.argtypes = args
        function.restype = ctypes.c_uint32

    def check(status):
        if status != 0:
            raise OSError(f"Disk performance counter error 0x{status:08x}")

    query = handle()
    check(pdh.PdhOpenQueryW(None, 0, ctypes.byref(query)))
    try:
        handles = []
        for direction in ("Read", "Write"):
            counter = handle()
            check(pdh.PdhAddEnglishCounterW(
                query, rf"\PhysicalDisk(_Total)\Disk {direction} Bytes/sec", 0, ctypes.byref(counter),
            ))
            handles.append(counter)
        check(pdh.PdhCollectQueryData(query))
        values = []
        for counter in handles:
            raw = _PDH_RAW_COUNTER()
            check(pdh.PdhGetRawCounterValue(counter, None, ctypes.byref(raw)))
            # VALID_DATA 和 NEW_DATA 均可使用，包括第一次查询。
            if raw.CStatus not in (0, 1):
                check(raw.CStatus)
            if raw.FirstValue < 0:
                raise ValueError("Disk performance counter returned a negative byte count")
            values.append(raw.FirstValue)
        return {"source": "disk:pdh:physical-total", "label": "所有物理磁盘",
                "bytes_read": values[0], "bytes_written": values[1]}
    finally:
        pdh.PdhCloseQuery(query)


# --------------------------------------------------------------------------
# macOS 采集器（通过 ctypes 获取 Mach 主机统计和 I/O Registry 数据）
# --------------------------------------------------------------------------

_HOST_CPU_LOAD_INFO = 3
_HOST_CPU_LOAD_INFO_COUNT = 4
_HOST_VM_INFO64 = 4
_CPU_STATE_USER = 0
_CPU_STATE_SYSTEM = 1
_CPU_STATE_IDLE = 2
_KERN_SUCCESS = 0


class _vm_statistics64(ctypes.Structure):
    _fields_ = [
        ("free_count", ctypes.c_uint32),
        ("active_count", ctypes.c_uint32),
        ("inactive_count", ctypes.c_uint32),
        ("wire_count", ctypes.c_uint32),
        ("zero_fill_count", ctypes.c_uint64),
        ("reactivations", ctypes.c_uint64),
        ("pageins", ctypes.c_uint64),
        ("pageouts", ctypes.c_uint64),
        ("faults", ctypes.c_uint64),
        ("cow_faults", ctypes.c_uint64),
        ("lookups", ctypes.c_uint64),
        ("hits", ctypes.c_uint64),
        ("purges", ctypes.c_uint64),
        ("purgeable_count", ctypes.c_uint32),
        ("speculative_count", ctypes.c_uint32),
        ("decompressed_count", ctypes.c_uint64),
        ("compressions", ctypes.c_uint64),
        ("swapins", ctypes.c_uint64),
        ("swapouts", ctypes.c_uint64),
        ("compressor_page_count", ctypes.c_uint32),
        ("throttled_count", ctypes.c_uint32),
        ("external_page_count", ctypes.c_uint32),
        ("internal_page_count", ctypes.c_uint32),
        ("total_uncompressed_pages_in_compressor", ctypes.c_uint64),
    ]


def _macos_libc():
    return ctypes.CDLL("/usr/lib/libc.dylib", use_errno=True)


def collect_macos_cpu():
    libc = _macos_libc()
    host = libc.mach_host_self()
    info = (ctypes.c_uint32 * _HOST_CPU_LOAD_INFO_COUNT)()
    count = ctypes.c_uint32(_HOST_CPU_LOAD_INFO_COUNT)
    result = libc.host_statistics(host, _HOST_CPU_LOAD_INFO, info, ctypes.byref(count))
    if result != _KERN_SUCCESS or count.value < _HOST_CPU_LOAD_INFO_COUNT:
        return None
    ticks = [float(info[i]) for i in range(_HOST_CPU_LOAD_INFO_COUNT)]
    if any(tick < 0 for tick in ticks):
        return None
    return {
        "source": "cpu:host_statistics",
        "total": sum(ticks),
        "idle": ticks[_CPU_STATE_IDLE],
    }


def collect_macos_memory():
    """通过 hw.memsize 和 ``host_statistics64`` 获取 ``(used_bytes, total_bytes)``。

    “已用”是 active + wired + compressor 页面之和，即 Activity Monitor 作为应用内存
    压力统计的同一组分类。
    """
    libc = _macos_libc()
    total_size = ctypes.c_uint64(0)
    size_len = ctypes.c_size_t(ctypes.sizeof(total_size))
    if libc.sysctlbyname(b"hw.memsize", ctypes.byref(total_size), ctypes.byref(size_len), None, 0) != 0:
        return None
    total = int(total_size.value)
    if total <= 0:
        return None

    host = libc.mach_host_self()
    page_size = ctypes.c_uint64(0)
    if libc.host_page_size(host, ctypes.byref(page_size)) != _KERN_SUCCESS:
        return None
    page_bytes = int(page_size.value)
    if page_bytes <= 0:
        return None

    info = _vm_statistics64()
    count = ctypes.c_uint32(ctypes.sizeof(info) // ctypes.sizeof(ctypes.c_uint32))
    result = libc.host_statistics64(host, _HOST_VM_INFO64, ctypes.byref(info), ctypes.byref(count))
    if result != _KERN_SUCCESS:
        return None
    used_pages = int(info.active_count) + int(info.wire_count) + int(info.compressor_page_count)
    if used_pages < 0:
        return None
    used = min(used_pages * page_bytes, total)
    return (float(used), float(total))


# --------------------------------------------------------------------------
# 平台无关的计数器采集
# --------------------------------------------------------------------------

def _log_probe_failure(tool, exc):
    print(f"[system-stats] {tool} probe failed: {type(exc).__name__}: {exc}", file=sys.stderr)


def _probe_details(reason, executable=None, exit_code=None, stderr_text=None):
    """供 Monitor UI 使用的可序列化探测诊断信息。

    只输出探测实际观察到的事实，并使用固定键集合：``reason`` 是 ``not_found`` /
    ``timeout`` / ``exit_code`` / ``parse_error`` / ``no_devices`` /
    ``launch_failed`` 之一；未知时省略 ``exit_code`` 和 ``stderr``。``stderr``
    会截取第一行的前 200 个字符，避免嘈杂的厂商工具撑大载荷。
    """
    details = {"reason": reason}
    if executable is not None:
        details["executable"] = executable
    if exit_code is not None:
        details["exit_code"] = int(exit_code)
    if stderr_text:
        first_line = str(stderr_text).splitlines()
        if first_line:
            details["stderr"] = first_line[0][:200]
    return details


def parse_macos_disk_counters(payload):
    """从 ioreg plist 聚合 IOBlockStorageDriver 的字节计数器。"""
    roots = plistlib.loads(payload)
    stack = list(roots) if isinstance(roots, list) else [roots]
    devices = {}
    while stack:
        node = stack.pop()
        if not isinstance(node, dict):
            continue
        children = node.get("IORegistryEntryChildren")
        if isinstance(children, list):
            stack.extend(children)
        stats = node.get("Statistics")
        identity = node.get("IORegistryEntryID")
        if not isinstance(stats, dict) or identity is None:
            continue
        read = finite_non_negative_int(stats.get("Bytes (Read)"))
        written = finite_non_negative_int(stats.get("Bytes (Write)"))
        if read is not None and written is not None:
            devices[str(identity)] = (read, written)
    if not devices:
        return None
    # 设备出现或消失时，重新建立差值基线。
    return {"source": "disk:ioreg:" + ",".join(sorted(devices)), "label": "所有物理磁盘",
            "bytes_read": sum(values[0] for values in devices.values()),
            "bytes_written": sum(values[1] for values in devices.values())}


def collect_macos_disk_counters():
    result = subprocess.run(
        ["/usr/sbin/ioreg", "-a", "-r", "-c", "IOBlockStorageDriver"],
        capture_output=True, timeout=2.0, check=True,
    )
    return parse_macos_disk_counters(result.stdout)


def _read_text_file(path):
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        return handle.read()


def collect_linux_cpu():
    parsed = parse_proc_stat(_read_text_file("/proc/stat"))
    if parsed is None:
        return None
    return {"source": "cpu:/proc/stat", "total": parsed[0], "idle": parsed[1]}


def collect_linux_memory():
    parsed = parse_proc_meminfo(_read_text_file("/proc/meminfo"))
    if parsed is None:
        return None
    return parsed


def collect_linux_disk_counters(root_path):
    """以共享采样格式返回磁盘来源和字节计数器，否则返回 ``None``。"""
    entries = parse_proc_diskstats(_read_text_file("/proc/diskstats"))
    selected = select_disk_counters(entries, resolve_root_device(root_path))
    if selected is None:
        return None
    source, bytes_read, bytes_written = selected
    label = "所有物理磁盘" if source == "disk:all" else "应用文件系统设备"
    return {"source": source, "label": label, "bytes_read": bytes_read, "bytes_written": bytes_written}


def collect_system_counters(ctx, platform_name):
    """获取一份累计系统计数器及其时间戳快照。

    单调时钟和墙上时钟时间戳会在读取前采集，使其紧邻计数器读取；GPU 探测随后执行，
    不得影响这两个值。任何采集器失败都只会让对应指标降级为 ``None``。
    """
    counters = {
        "monotonic": time.monotonic(),
        "wall": time.time(),
        "cpu": None,
        "memory": None,
        "disk": None,
        "disk_usage": None,
    }

    if platform_name.startswith("linux"):
        collectors = {
            "cpu": collect_linux_cpu,
            "memory": collect_linux_memory,
            "disk": lambda: collect_linux_disk_counters(ctx.paths.root),
        }
    elif platform_name == "win32":
        collectors = {
            "cpu": collect_windows_cpu,
            "memory": collect_windows_memory,
            "disk": collect_windows_disk_counters,
        }
    elif platform_name == "darwin":
        collectors = {
            "cpu": collect_macos_cpu,
            "memory": collect_macos_memory,
            "disk": collect_macos_disk_counters,
        }
    else:
        collectors = {}

    # 各指标独立降级：一个采集器失败不能导致整个端点或其他指标失败。
    for key, collector in collectors.items():
        try:
            counters[key] = collector()
        except Exception as exc:
            print(
                f"[system-stats] {key} collector failed: "
                f"{type(exc).__name__}: {exc}",
                file=sys.stderr,
            )

    try:
        usage = shutil.disk_usage(str(ctx.paths.root))
        counters["disk_usage"] = (float(usage.used), float(usage.total))
    except OSError as exc:
        print(
            f"[system-stats] disk usage collection failed: "
            f"{type(exc).__name__}: {exc}",
            file=sys.stderr,
        )
    return counters


# --------------------------------------------------------------------------
# 可选的 all-smi 探测
# --------------------------------------------------------------------------

def resolve_all_smi():
    """定位可选的 all-smi 可执行文件。

    ``LLAMA_GUI_ALL_SMI_PATH`` 优先于 PATH，因此便携安装不需要修改全局 PATH。
    已配置但不存在的路径会作为已观察到的设置错误返回给调用方，而不会静默忽略。
    """
    configured = os.environ.get("LLAMA_GUI_ALL_SMI_PATH", "").strip()
    if configured:
        return os.path.abspath(os.path.expandvars(os.path.expanduser(configured))), True
    return shutil.which("all-smi"), False


def normalize_all_smi_url(raw_url):
    """返回规范的回环 all-smi 快照 URL；未设置时返回 ``None``。"""
    value = str(raw_url or "").strip()
    if not value:
        return None
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != "http" or not parsed.hostname:
        raise ValueError("all-smi URL must use http on a loopback host")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("all-smi URL must not contain credentials")
    host = parsed.hostname.rstrip(".").lower()
    if host != "localhost":
        try:
            if not ipaddress.ip_address(host).is_loopback:
                raise ValueError("all-smi URL host must be loopback")
        except ValueError as exc:
            raise ValueError("all-smi URL host must be loopback") from exc
    try:
        parsed.port
    except ValueError as exc:
        raise ValueError("all-smi URL has an invalid port") from exc
    if parsed.path.rstrip("/") not in ("", "/snapshot"):
        raise ValueError("all-smi URL path must be /snapshot")
    # 避免对友好的 localhost 写法执行 DNS 查询，防止修改后的 hosts 文件将显式的
    # 本地探测发送到其他位置。
    netloc = parsed.netloc
    if host == "localhost":
        netloc = "127.0.0.1"
        if parsed.port is not None:
            netloc += f":{parsed.port}"
    return urllib.parse.urlunparse(
        ("http", netloc, "/snapshot", "", "include=gpu", "")
    )


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _read_all_smi_snapshot_url(url):
    """在不使用代理或重定向的情况下读取一份有大小限制的快照。"""
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}), _NoRedirectHandler()
    )
    with opener.open(request, timeout=ALL_SMI_HTTP_TIMEOUT_SECONDS) as response:
        payload = response.read(ALL_SMI_MAX_RESPONSE_BYTES + 1)
    if len(payload) > ALL_SMI_MAX_RESPONSE_BYTES:
        raise ValueError("all-smi response exceeded 1 MiB")
    return payload.decode("utf-8")


def _all_smi_provider(node):
    text = " ".join(
        str(node.get(key) or "") for key in ("vendor", "name", "uuid")
    ).lower()
    if any(marker in text for marker in ("nvidia", "geforce", "quadro", "tesla", "ven_10de")):
        return "nvidia"
    if any(marker in text for marker in ("amd", "radeon", "ati", "ven_1002")):
        return "amd"
    return "all-smi"


def parse_all_smi_device(node, fallback_index):
    if not isinstance(node, dict):
        return None
    name = _optional_name(node.get("name"))
    raw_uuid = str(node.get("uuid") or "").strip()[:512]
    if name is None and not raw_uuid:
        return None

    normalized_uuid = _normalize_uuid(raw_uuid)
    if normalized_uuid is not None:
        gpu_id = f"all-smi:uuid:{normalized_uuid}"
        persistent = True
    elif raw_uuid:
        # Windows all-smi 可能使用包含斜杠、和号及其他不适合 UI 的字符的 PNP 设备标识。
        # 将其哈希为稳定且有长度限制的显卡标识，而不是暴露原始标识。
        digest = hashlib.sha256(raw_uuid.encode("utf-8", errors="replace")).hexdigest()[:24]
        gpu_id = f"all-smi:uuid-sha256:{digest}"
        persistent = True
    else:
        gpu_id = f"all-smi:index:{fallback_index}"
        persistent = False

    utilization = clamp_percent(node.get("utilization"))
    memory_used = finite_non_negative_int(node.get("used_memory"))
    memory_total = finite_non_negative_int(node.get("total_memory"))
    if memory_total is not None and memory_total <= 0:
        memory_total = None
    temperature = finite_non_negative(node.get("temperature"))
    if temperature is not None and temperature <= 0:
        temperature = None
    return {
        "provider": _all_smi_provider(node),
        "id": gpu_id,
        "id_persistent": persistent,
        "index": fallback_index,
        "name": name,
        "utilization_percent": utilization,
        "memory_used_bytes": memory_used,
        "memory_total_bytes": memory_total,
        "temperature_c": temperature,
    }


def parse_all_smi_json(text):
    """将 schema-1 all-smi 快照规范化为 Monitor GPU 记录。"""
    data = json.loads(text)
    if (
        not isinstance(data, dict)
        or isinstance(data.get("schema"), bool)
        or data.get("schema") != 1
    ):
        raise ValueError("unsupported all-smi snapshot schema")
    nodes = data.get("gpus")
    if not isinstance(nodes, list):
        raise ValueError("all-smi snapshot did not include a GPU list")
    devices = []
    for node in nodes:
        device = parse_all_smi_device(node, fallback_index=len(devices))
        if device is not None:
            devices.append(device)
    return devices


def probe_all_smi():
    """探测显式回环 API 或本地可选的 all-smi 二进制文件。"""
    configured_url = os.environ.get("LLAMA_GUI_ALL_SMI_URL", "").strip()
    executable = None
    source = configured_url
    try:
        if configured_url:
            url = normalize_all_smi_url(configured_url)
            output = _read_all_smi_snapshot_url(url)
        else:
            executable, configured_path = resolve_all_smi()
            source = executable
            if executable is None:
                return "missing", [], _probe_details("not_found")
            if configured_path and not os.path.isfile(executable):
                return "error", [], _probe_details("not_found", executable=executable)
            result = subprocess.run(
                [
                    executable,
                    "snapshot",
                    "--format", "json",
                    "--include", "gpu",
                    "--timeout-ms", "2000",
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=ALL_SMI_PROBE_TIMEOUT_SECONDS,
                shell=False,
                creationflags=get_no_window_creationflags(),
            )
            if result.returncode != 0:
                _log_probe_failure(
                    "all-smi", RuntimeError(f"exit code {result.returncode}")
                )
                return "error", [], _probe_details(
                    "exit_code",
                    executable=executable,
                    exit_code=result.returncode,
                    stderr_text=result.stderr,
                )
            output = result.stdout
        devices = parse_all_smi_json(output)
    except subprocess.TimeoutExpired as exc:
        _log_probe_failure("all-smi", exc)
        return "error", [], _probe_details("timeout", executable=source)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        _log_probe_failure("all-smi", exc)
        return "error", [], _probe_details(
            "launch_failed", executable=source, stderr_text=str(exc)
        )
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
        _log_probe_failure("all-smi", exc)
        return "error", [], _probe_details(
            "parse_error", executable=source, stderr_text=str(exc)
        )
    return "ok", devices, None if devices else _probe_details(
        "no_devices", executable=source
    )


# --------------------------------------------------------------------------
# NVIDIA 探测
# --------------------------------------------------------------------------

def resolve_nvidia_smi(platform_name):
    """在 PATH 及已知驱动位置中定位 ``nvidia-smi``。

    它随 NVIDIA 驱动环境提供；绝不单独下载。
    """
    found = shutil.which("nvidia-smi")
    if found:
        return found
    candidates = []
    if platform_name == "win32":
        system_root = os.environ.get("SystemRoot", r"C:\Windows")
        candidates = [
            os.path.join(system_root, "System32", "nvidia-smi.exe"),
            r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
        ]
    else:
        candidates = ["/usr/bin/nvidia-smi", "/usr/local/bin/nvidia-smi"]
    for candidate in candidates:
        if os.path.isfile(candidate):
            return candidate
    return None


def parse_nvidia_smi_row(row, fallback_index):
    """将一行 ``nvidia-smi`` CSV 转为 GPU 字典；格式错误时返回 ``None``。

    各行独立拒绝；错误行不会丢弃其周围的正常设备。``N/A`` 字段逐字段保留为 ``null``。
    """
    if len(row) != 8:
        return None
    uuid_raw, pci_raw, index_raw, name_raw, util_raw, mem_used_raw, mem_total_raw, temp_raw = (
        field.strip() for field in row
    )

    try:
        index = int(index_raw)
    except ValueError:
        index = fallback_index
    if index < 0:
        index = fallback_index

    name = _optional_name(name_raw)
    uuid = _normalize_uuid(uuid_raw)
    bdf = _normalize_bdf(pci_raw)
    utilization = clamp_percent(_optional_number(util_raw))
    memory_used_mib = _optional_number(mem_used_raw)
    memory_total_mib = _optional_number(mem_total_raw)
    temperature = _optional_number(temp_raw)

    # 既没有标识也没有可读名称的行无法提供显卡可显示的信息，将其视为格式错误。
    if uuid is None and bdf is None and name is None:
        return None

    if uuid is not None:
        gpu_id = f"nvidia:uuid:{uuid}"
        persistent = True
    elif bdf is not None:
        gpu_id = f"nvidia:pci:{bdf}"
        persistent = True
    else:
        gpu_id = f"nvidia:index:{index}"
        persistent = False

    return {
        "provider": "nvidia",
        "id": gpu_id,
        "id_persistent": persistent,
        "index": index,
        "name": name,
        "utilization_percent": utilization,
        "memory_used_bytes": (
            int(memory_used_mib * 1024 * 1024) if memory_used_mib is not None else None
        ),
        "memory_total_bytes": (
            int(memory_total_mib * 1024 * 1024) if memory_total_mib is not None else None
        ),
        "temperature_c": temperature,
    }


def parse_nvidia_smi_csv(text):
    """从一次有界的选择性 ``nvidia-smi`` CSV 查询中获取所有 GPU。"""
    devices = []
    # nvidia-smi 使用“逗号+空格”分隔字段；skipinitialspace 允许包含逗号的带引号名称
    # 作为单个字段解析。
    for row in csv.reader(io.StringIO(str(text or "")), skipinitialspace=True):
        if not row or all(not field.strip() for field in row):
            continue
        device = parse_nvidia_smi_row(row, fallback_index=len(devices))
        if device is not None:
            devices.append(device)
    return devices


def probe_nvidia(platform_name):
    """返回 ``(status, devices, details)``，状态为 ``ok`` / ``missing`` / ``error``。

    探测产生可用设备时 ``details`` 为 ``None``；否则包含原因（``not_found`` /
    ``timeout`` / ``exit_code`` / ``no_devices``）及观察到的事实（工具路径、退出码、
    stderr 第一行）。
    """
    executable = resolve_nvidia_smi(platform_name)
    if executable is None:
        return "missing", [], _probe_details("not_found")
    argv = [
        executable,
        f"--query-gpu={NVIDIA_QUERY_FIELDS}",
        "--format=csv,noheader,nounits",
    ]
    try:
        result = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=NVIDIA_PROBE_TIMEOUT_SECONDS,
            shell=False,
            creationflags=get_no_window_creationflags(),
        )
    except subprocess.TimeoutExpired as exc:
        _log_probe_failure("nvidia-smi", exc)
        return "error", [], _probe_details("timeout", executable=executable)
    except OSError as exc:
        _log_probe_failure("nvidia-smi", exc)
        return "error", [], _probe_details(
            "launch_failed", executable=executable, stderr_text=str(exc)
        )
    except UnicodeDecodeError as exc:
        _log_probe_failure("nvidia-smi", exc)
        return "error", [], _probe_details(
            "parse_error", executable=executable, stderr_text=str(exc)
        )
    if result.returncode != 0:
        _log_probe_failure(
            "nvidia-smi", RuntimeError(f"exit code {result.returncode}")
        )
        return "error", [], _probe_details(
            "exit_code",
            executable=executable,
            exit_code=result.returncode,
            stderr_text=result.stderr,
        )
    devices = parse_nvidia_smi_csv(result.stdout)
    return "ok", devices, None if devices else _probe_details(
        "no_devices", executable=executable
    )


# --------------------------------------------------------------------------
# AMD 探测
# --------------------------------------------------------------------------

def is_wsl_environment():
    if sys.platform != "linux":
        return False
    try:
        release = os.uname().release.lower()
    except (AttributeError, ValueError):
        return False
    return "microsoft" in release


def resolve_amd_smi():
    """在 PATH 及标准 ROCm 位置中定位 ``amd-smi``。

    ``/opt/rocm/core-*/bin`` 条目按解析后的版本排序，而非按路径字典序排序，因此
    ``core-10.0`` 会优先于 ``core-6.3``。独立的 ``amdrocm-amdsmi`` 包默认不会将
    二进制文件加入 PATH。
    """
    found = shutil.which("amd-smi")
    if found:
        return found
    versioned = []
    for candidate in glob.glob("/opt/rocm/core-*/bin/amd-smi"):
        match = re.search(r"core-(\d+(?:\.\d+)*)", candidate)
        if not match:
            continue
        version = tuple(int(part) for part in match.group(1).split("."))
        versioned.append((version, candidate))
    versioned.sort(key=lambda item: item[0], reverse=True)
    for _, candidate in versioned:
        if os.path.isfile(candidate):
            return candidate
    fixed = "/opt/rocm/bin/amd-smi"
    if os.path.isfile(fixed):
        return fixed
    return None


_AMD_NAME_KEYS = ("name", "product_name", "model", "board_name", "market_name")
_AMD_UTIL_KEYS = (
    "gfx_activity",
    "gpu_activity",
    "gpu_busy_percent",
    "gfx",
    "gpu_utilization",
    "utilization",
)
_AMD_TEMP_KEYS = (
    "edge_temperature",
    "gpu_edge_temp",
    "temperature",
    "temp_edge",
)
_AMD_MEM_KEYS = (
    "vram_mem_usage",
    "gpu_mem_usage",
    "mem_usage",
    "vram_usage",
    "memory_usage",
)
_AMD_BDF_KEYS = ("bdf", "pci_bdf", "pci_bus_id", "pcie_bdf")
_AMD_UUID_KEYS = ("uuid",)
_AMD_USED_KEYS = ("used", "used_memory")
_AMD_TOTAL_KEYS = ("total", "total_memory")

_AMD_UNIT_MULTIPLIERS = {
    "": 1,
    "b": 1,
    "k": 1024,
    "kb": 1024,
    "kib": 1024,
    "m": 1024 ** 2,
    "mb": 1024 ** 2,
    "mib": 1024 ** 2,
    "g": 1024 ** 3,
    "gb": 1024 ** 3,
    "gib": 1024 ** 3,
    "t": 1024 ** 4,
    "tb": 1024 ** 4,
    "tib": 1024 ** 4,
}


def _amd_walk(node, depth):
    """按广度优先生成 ``(key, value)`` 对，使较浅层的匹配优先。"""
    queue = [(node, depth)]
    while queue:
        current, remaining = queue.pop(0)
        if not isinstance(current, dict):
            continue
        for key, value in current.items():
            yield key, value
            if isinstance(value, dict) and remaining > 0:
                queue.append((value, remaining - 1))


def amd_number(value):
    """规范化 AMD SMI JSON 中的普通数值和带单位的值。"""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if math.isfinite(number) and number >= 0 else None
    if isinstance(value, dict):
        return amd_number(value.get("value"))
    if isinstance(value, str):
        match = re.match(r"\s*(-?[0-9]*\.?[0-9]+)", value)
        if match:
            number = float(match.group(1))
            return number if math.isfinite(number) and number >= 0 else None
    return None


def amd_bytes(value):
    """将数字或类似 ``"4.0 GB"`` 的带单位字符串转换为字节数。"""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        if not math.isfinite(number) or number < 0:
            return None
        return int(number)
    if isinstance(value, dict):
        inner = value.get("value")
        unit = value.get("unit")
        if isinstance(unit, str) and unit.strip():
            return amd_bytes(f"{inner} {unit}")
        return amd_bytes(inner)
    if isinstance(value, str):
        match = re.match(r"\s*([0-9]*\.?[0-9]+)\s*([a-zA-Z]*)", value)
        if not match:
            return None
        number = float(match.group(1))
        multiplier = _AMD_UNIT_MULTIPLIERS.get(match.group(2).lower())
        if multiplier is None:
            return None
        return int(number * multiplier)
    return None


def _amd_find_number(node, keys, depth=3):
    for key, value in _amd_walk(node, depth):
        if key in keys:
            number = amd_number(value)
            if number is not None:
                return number
    return None


def _amd_find_string(node, keys, depth=3):
    for key, value in _amd_walk(node, depth):
        if key in keys and isinstance(value, str) and value.strip():
            return value.strip()[:120]
    return None


def _amd_find_raw(node, keys, depth=3):
    for key, value in _amd_walk(node, depth):
        if key in keys and value is not None:
            return value
    return None


def _amd_memory_usage(node):
    """从不同版本采用的嵌套结构中获取 ``(used_bytes, total_bytes)``。"""
    usage = _amd_find_raw(node, _AMD_MEM_KEYS)
    if isinstance(usage, dict):
        used = usage.get(_AMD_USED_KEYS[0], usage.get(_AMD_USED_KEYS[1]))
        total = usage.get(_AMD_TOTAL_KEYS[0], usage.get(_AMD_TOTAL_KEYS[1]))
        return amd_bytes(used), amd_bytes(total)
    return None, None


def _amd_device_nodes(data):
    """从不同版本形态的 AMD SMI 指标输出中提取设备字典。"""
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        nodes = [
            value
            for key, value in data.items()
            if isinstance(value, dict)
            and str(key).lower().startswith(("card", "gpu"))
        ]
        if nodes:
            return nodes
        for key in ("gpu_data", "gpu"):
            gpu = data.get(key)
            if isinstance(gpu, list):
                return [item for item in gpu if isinstance(item, dict)]
            if isinstance(gpu, dict):
                return [gpu]
    return []


def parse_amd_device(node, fallback_index):
    """规范化一个 AMD 设备；各字段彼此独立。"""
    raw_index = node.get("gpu")
    has_reported_index = (
        isinstance(raw_index, int) and not isinstance(raw_index, bool) and raw_index >= 0
    )
    index = raw_index if has_reported_index else fallback_index
    name = _amd_find_string(node, _AMD_NAME_KEYS)
    utilization = clamp_percent(_amd_find_number(node, _AMD_UTIL_KEYS))
    temperature = _amd_find_number(node, _AMD_TEMP_KEYS)
    memory_used, memory_total = _amd_memory_usage(node)
    if memory_used is not None and memory_total is not None and memory_used > memory_total:
        memory_used = None
    uuid = _normalize_uuid(_amd_find_string(node, _AMD_UUID_KEYS) or "")
    bdf = _normalize_bdf(_amd_find_string(node, _AMD_BDF_KEYS) or "")

    if (uuid is None and bdf is None and name is None and utilization is None
            and temperature is None and memory_used is None and memory_total is None
            and not has_reported_index):
        return None

    if uuid is not None:
        gpu_id = f"amd:uuid:{uuid}"
        persistent = True
    elif bdf is not None:
        gpu_id = f"amd:bdf:{bdf}"
        persistent = True
    else:
        gpu_id = f"amd:index:{index}"
        persistent = False

    return {
        "provider": "amd",
        "id": gpu_id,
        "id_persistent": persistent,
        "index": index,
        "name": name,
        "utilization_percent": utilization,
        "memory_used_bytes": memory_used,
        "memory_total_bytes": memory_total,
        "temperature_c": temperature,
    }


def parse_amd_smi_json(text):
    """从一次有界的 ``amd-smi metric --json`` 探测中获取所有 GPU。

    解析器特意保持隔离且宽松：AMD SMI 的字段名称和嵌套结构在不同版本间发生过变化，
    因此只规范化实际提供的字段，缺失值保留为 ``null``。
    """
    data = json.loads(text)
    devices = []
    for node in _amd_device_nodes(data):
        device = parse_amd_device(node, fallback_index=len(devices))
        if device is not None:
            devices.append(device)
    return devices


def probe_amd(platform_name):
    """返回 ``(status, devices, details)``。

    状态为 ``ok`` / ``missing`` / ``error`` / ``unsupported_platform``。原生 Windows
    和 macOS 不会执行 PATH 中偶然找到的 ``amd-smi``；WSL 可以使用已正常工作的工具，
    但不会提供安装指导。探测产生可用设备时 ``details`` 为 ``None``；否则包含原因
    及观察到的事实（工具路径、退出码、stderr 第一行）。
    """
    if platform_name == "win32" or platform_name == "darwin" or not platform_name.startswith("linux"):
        return "unsupported_platform", [], None
    executable = resolve_amd_smi()
    if executable is None:
        return "missing", [], _probe_details("not_found")
    try:
        result = subprocess.run(
            [executable, "metric", "--json"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=AMD_PROBE_TIMEOUT_SECONDS,
            shell=False,
            creationflags=get_no_window_creationflags(),
        )
    except subprocess.TimeoutExpired as exc:
        _log_probe_failure("amd-smi", exc)
        return "error", [], _probe_details("timeout", executable=executable)
    except OSError as exc:
        _log_probe_failure("amd-smi", exc)
        return "error", [], _probe_details(
            "launch_failed", executable=executable, stderr_text=str(exc)
        )
    except UnicodeDecodeError as exc:
        _log_probe_failure("amd-smi", exc)
        return "error", [], _probe_details(
            "parse_error", executable=executable, stderr_text=str(exc)
        )
    if result.returncode != 0:
        _log_probe_failure("amd-smi", RuntimeError(f"exit code {result.returncode}"))
        return "error", [], _probe_details(
            "exit_code",
            executable=executable,
            exit_code=result.returncode,
            stderr_text=result.stderr,
        )
    try:
        devices = parse_amd_smi_json(result.stdout)
    except (json.JSONDecodeError, ValueError) as exc:
        _log_probe_failure("amd-smi", exc)
        return "error", [], _probe_details(
            "parse_error", executable=executable, stderr_text=str(exc)
        )
    return "ok", devices, None if devices else _probe_details(
        "no_devices", executable=executable
    )


# --------------------------------------------------------------------------
# 设置状态生成（按提供方、以探测证据为准）
# --------------------------------------------------------------------------

def provider_hints(backend_name):
    """仅根据已安装后端返回 ``(nvidia, amd)`` 提示。

    ``cuda`` 表示 NVIDIA；``hip``/``rocm``/Lemonade 表示 AMD。其他后端（包括两个
    自定义槽位）不表示任何厂商，也不生成设置行。
    """
    backend = str(backend_name or "").strip().lower()
    nvidia = backend.startswith("cuda")
    amd = (
        backend == "hip"
        or backend.startswith("rocm")
        or backend.startswith("lemonade")
    )
    return nvidia, amd


def detect_package_manager(os_release_text):
    """根据 ``/etc/os-release`` 返回允许列表中的包管理器，否则返回 ``None``。"""
    if os_release_text is None:
        return None
    values = {}
    for line in str(os_release_text).splitlines():
        key, sep, rest = line.partition("=")
        if sep:
            values[key.strip().upper()] = rest.strip().strip('"').strip("'").lower()
    identities = [values.get("ID", "")] + values.get("ID_LIKE", "").split()
    for identity in identities:
        if identity in ("debian", "ubuntu"):
            return "apt"
        if identity in ("fedora", "rhel", "centos", "rocky", "almalinux"):
            return "dnf"
        if identity in ("suse", "opensuse", "opensuse-leap", "opensuse-tumbleweed", "sles"):
            return "zypper"
    return None


def read_os_release():
    try:
        return _read_text_file("/etc/os-release")
    except OSError:
        return None


def _nvidia_setup_entry(nvidia_status, details=None):
    if nvidia_status == "missing":
        entry = {
            "provider": "nvidia",
            "state": "setup_required",
            "action": "open_docs",
            "command": None,
            "package_manager": None,
            "docs_url": NVIDIA_DOCS_URL,
            "message": (
                "未找到 nvidia-smi。它随 NVIDIA 驱动环境提供，请按照官方文档安装或更新驱动，"
                "然后重新检查。"
            ),
        }
    else:
        # 探测失败，或虽正常退出但没有可用设备。
        entry = {
            "provider": "nvidia",
            "state": "error",
            "action": "open_docs",
            "command": None,
            "package_manager": None,
            "docs_url": NVIDIA_DOCS_URL,
            "message": (
                "nvidia-smi 已运行，但没有返回可用的 GPU 数据。请检查 NVIDIA 驱动安装，"
                "然后重新检查。"
            ),
        }
    if details is not None:
        entry["details"] = details
    return entry


def _amd_setup_entry(amd_status, is_wsl, os_release_text, details=None):
    if is_wsl or amd_status == "unsupported_platform":
        return {
            "provider": "amd",
            "state": "unsupported",
            "action": "open_docs",
            "command": None,
            "package_manager": None,
            "docs_url": AMD_INSTALL_DOCS_URL,
            "message": (
                "AMD SMI 遥测仅在 Linux 裸机上可用。在 Windows 上，可选的跨厂商 all-smi 工具"
                "可以提供 AMD GPU 遥测；在硬件受支持的情况下，WSL 和 macOS 也可以使用"
                "all-smi。模型仍可正常运行。"
            ),
        }
    if amd_status == "missing":
        # WSL 已在上方排除，因此这里采用普通发行版规则。
        manager = detect_package_manager(os_release_text)
        command = AMD_SETUP_COMMANDS.get(manager)
        entry = {
            "provider": "amd",
            "state": "setup_required",
            "action": "copy_command" if command else "open_docs",
            "command": command,
            "package_manager": manager,
            "docs_url": AMD_INSTALL_DOCS_URL,
            "message": (
                "未找到 amd-smi。必须先配置 AMD 软件源和兼容的 amdgpu 驱动；"
                + (
                    "然后使用所示命令安装 AMD SMI。"
                    if command
                    else "然后使用发行版的包管理器安装 amdrocm-amdsmi 包。"
                )
                + "Llama GUI 会显示安装指导，但绝不运行包管理器命令。"
            ),
        }
        if details is not None:
            entry["details"] = details
        return entry
    entry = {
        "provider": "amd",
        "state": "error",
        "action": "open_docs",
        "command": None,
        "package_manager": None,
        "docs_url": AMD_INSTALL_DOCS_URL,
        "message": (
            "amd-smi 已运行，但没有返回可用的 GPU 数据。请检查 ROCm 安装，然后重新检查。"
        ),
    }
    if details is not None:
        entry["details"] = details
    return entry


def _generic_gpu_state_entry(platform_name, is_wsl):
    if platform_name == "win32":
        message = (
            "未检测到受支持的GPU遥测工具，在Windows系统上，"
            "NVIDIA 监控可直接使用NVIDIA驱动自带的nvidia-smi工具；"
            "AMD SMI本身仅支持Linux系统，但可选用跨厂商的all-smi工具，"
            "在Windows上实现AMD GPU的遥测采集。大模型仍可正常运行，"
            "系统基础指标也会持续更新。"
        )
    elif is_wsl:
        message = (
            "在 WSL 中未检测到受支持的 GPU 遥测工具。NVIDIA 监控可在 WSL 内使用 all-smi "
            "或 nvidia-smi。WSL 下的 AMD SMI 支持仍处于实验阶段；Monitor 可以使用已正常"
            "工作的 all-smi 或 amd-smi，但不会为其提供发行版设置指导。"
        )
    elif platform_name.startswith("linux"):
        message = (
            "未检测到受支持的 GPU 遥测工具。请安装可选的跨厂商 all-smi 工具，或使用 NVIDIA "
            "驱动提供的 nvidia-smi / AMD SMI 提供的 amd-smi，然后重新检查。"
        )
    elif platform_name == "darwin":
        message = (
            "未检测到受支持的 GPU 遥测工具。可选的 all-smi 工具可以在 macOS 上提供 Apple "
            "Silicon GPU 遥测。模型仍可正常运行，系统指标也会持续更新。"
        )
    else:
        message = (
            "未检测到受支持的 GPU 遥测工具。请尝试使用可选的 all-smi 工具进行跨厂商监控。"
            "系统指标会持续更新；更改已安装的后端或驱动环境后，请重新检查。"
        )
    return {"provider": "", "state": "unavailable", "message": message}


def _all_smi_state_entry(status, details):
    no_devices = status == "ok"
    return {
        "provider": "all-smi",
        "state": "error",
        "message": (
            "all-smi 未返回可用的 GPU 设备。也已尝试现有的厂商探测；请直接运行 all-smi "
            "快照检查其输出，然后重新检查。"
            if no_devices
            else
            "已检测到或配置了 all-smi，但无法读取其 GPU 快照。也已尝试现有的厂商探测；"
            "请检查探测详情和 all-smi 安装，然后重新检查。"
        ),
        "details": details,
    }


def build_gpu_setup_entries(
    platform_name,
    is_wsl,
    backend_name,
    nvidia_status,
    nvidia_device_count,
    amd_status,
    amd_device_count,
    os_release_text=None,
    nvidia_details=None,
    amd_details=None,
):
    """仅生成相关的设置、错误或不支持状态行。

    正常工作的探测只会隐藏自身提供方的状态行；提供方状态相互独立，因此成功和失败
    状态可以同时存在。未识别出提供方时，用一条平台特定的通用状态说明可用选项。
    探测观察到失败或未找到可用设备时，将诊断信息作为 ``details`` 附加。
    """
    nvidia_hint, amd_hint = provider_hints(backend_name)
    entries = []

    if nvidia_hint:
        if nvidia_status == "ok" and nvidia_device_count == 0:
            # 已正常退出，但没有产生有效设备。
            entries.append(_nvidia_setup_entry("error", details=nvidia_details))
        elif nvidia_status != "ok":
            entries.append(_nvidia_setup_entry(nvidia_status, details=nvidia_details))

    if amd_hint:
        if amd_status == "unsupported_platform":
            entries.append(_amd_setup_entry(amd_status, is_wsl, os_release_text))
        elif amd_status == "ok" and amd_device_count == 0:
            if is_wsl:
                # 没有已正常工作的探测时，WSL 显示平台限制消息，而不是 Linux 包安装指导。
                entries.append(
                    _amd_setup_entry("unsupported_platform", is_wsl, os_release_text)
                )
            else:
                entries.append(
                    _amd_setup_entry("error", is_wsl, os_release_text, details=amd_details)
                )
        elif amd_status != "ok":
            entries.append(
                _amd_setup_entry(amd_status, is_wsl, os_release_text, details=amd_details)
            )
    if (
        not entries
        and not nvidia_hint
        and not amd_hint
        and nvidia_device_count == 0
        and amd_device_count == 0
    ):
        entries.append(_generic_gpu_state_entry(platform_name, is_wsl))
    return entries


# --------------------------------------------------------------------------
# Sample assembly and caching orchestration
# --------------------------------------------------------------------------

def _build_cpu_metric(previous, current_cpu, interval_ok):
    if current_cpu is None:
        return {"available": False, "percent": None}
    percent = None
    prev_cpu = previous.get("cpu") if previous else None
    if (
        prev_cpu is not None
        and interval_ok
        and prev_cpu.get("source") == current_cpu.get("source")
    ):
        percent = compute_cpu_percent(
            prev_cpu.get("total"),
            prev_cpu.get("idle"),
            current_cpu.get("total"),
            current_cpu.get("idle"),
        )
    return {"available": True, "percent": percent}


def _build_memory_metric(current_memory):
    if current_memory is None:
        return {
            "available": False,
            "used_bytes": None,
            "total_bytes": None,
            "percent": None,
        }
    used, total = current_memory
    used = finite_non_negative(used)
    total = finite_non_negative(total)
    if used is None or total is None:
        return {
            "available": False,
            "used_bytes": None,
            "total_bytes": None,
            "percent": None,
        }
    return {
        "available": True,
        "used_bytes": int(used),
        "total_bytes": int(total),
        "percent": usage_percent(used, total),
    }


def _build_disk_metric(previous, counters, interval_seconds, interval_ok):
    usage = counters.get("disk_usage")
    read_rate = None
    write_rate = None
    current_disk = counters.get("disk")
    prev_disk = previous.get("disk") if previous else None
    if (
        current_disk is not None
        and prev_disk is not None
        and interval_ok
        and prev_disk.get("source") == current_disk.get("source")
    ):
        read_rate = compute_bytes_per_second(
            prev_disk.get("bytes_read"),
            current_disk.get("bytes_read"),
            interval_seconds,
        )
        write_rate = compute_bytes_per_second(
            prev_disk.get("bytes_written"),
            current_disk.get("bytes_written"),
            interval_seconds,
        )

    used, total = usage if usage is not None else (None, None)
    return {
        "available": usage is not None,
        "path_label": "应用磁盘",
        "used_bytes": int(used) if used is not None else None,
        "total_bytes": int(total) if total is not None else None,
        "percent": usage_percent(used, total),
        "io_available": current_disk is not None,
        "io_label": current_disk.get("label", "应用文件系统设备") if current_disk else "",
        "read_bytes_per_second": read_rate,
        "write_bytes_per_second": write_rate,
    }


def get_backend_name(ctx):
    try:
        cfg = ctx.services.load_config()
    except Exception as exc:
        print(
            f"[system-stats] failed to read backend config: "
            f"{type(exc).__name__}: {exc}",
            file=sys.stderr,
        )
        return None
    return cfg.get("backend") if isinstance(cfg, dict) else None


def _cached_amd_probe(state, allow_cache):
    """经过新鲜度检查的 AMD 探测结果；需要探测时返回 ``None``。"""
    if not allow_cache:
        return None
    with state.system_stats_lock:
        cached = state.system_stats_probe_cache.get("amd")
    if cached is not None and cached[0] >= time.monotonic():
        return cached[1]
    return None


def _store_amd_probe(state, probe_result):
    with state.system_stats_lock:
        state.system_stats_probe_cache["amd"] = (
            time.monotonic() + AMD_PROBE_CACHE_TTL_SECONDS,
            probe_result,
        )


def _cached_all_smi_probe(state, allow_cache):
    if not allow_cache:
        return None
    with state.system_stats_lock:
        cached = state.system_stats_probe_cache.get("all_smi")
    if cached is not None and cached[0] >= time.monotonic():
        return cached[1]
    return None


def _store_all_smi_probe(state, probe_result):
    with state.system_stats_lock:
        state.system_stats_probe_cache["all_smi"] = (
            time.monotonic() + ALL_SMI_PROBE_CACHE_TTL_SECONDS,
            probe_result,
        )


def collect_sample(ctx, previous, allow_probe_cache=True):
    """获取一份完整响应载荷及下一条 ``previous`` 记录。

    计数器会先连同时间戳读取；较慢的 GPU 探测随后运行，不能影响 ``sampled_at`` 或
    ``interval_seconds``。
    """
    services = ctx.services
    platform_name = getattr(services, "current_platform", "") or sys.platform
    if platform_name == "unknown":
        platform_name = sys.platform
    counters = collect_system_counters(ctx, platform_name)

    interval_seconds = None
    if previous is not None:
        previous_monotonic = previous.get("monotonic")
        if previous_monotonic is not None:
            interval_seconds = counters["monotonic"] - previous_monotonic
    interval_ok = valid_rate_interval(interval_seconds)

    is_wsl = platform_name.startswith("linux") and is_wsl_environment()
    cached_all_smi = _cached_all_smi_probe(ctx.state, allow_probe_cache)
    if cached_all_smi is not None:
        all_smi_status, all_smi_devices, all_smi_details = cached_all_smi
    else:
        all_smi_status, all_smi_devices, all_smi_details = probe_all_smi()
        if all_smi_status in ("ok", "error"):
            _store_all_smi_probe(
                ctx.state, (all_smi_status, all_smi_devices, all_smi_details)
            )

    if all_smi_status == "ok" and all_smi_devices:
        gpu_devices = list(all_smi_devices)
        gpu_setup = []
    else:
        nvidia_status, nvidia_devices, nvidia_details = probe_nvidia(platform_name)
        cached_amd = _cached_amd_probe(ctx.state, allow_probe_cache)
        if cached_amd is not None:
            amd_status, amd_devices, amd_details = cached_amd
        else:
            amd_status, amd_devices, amd_details = probe_amd(platform_name)
            if amd_status in ("ok", "error"):
                _store_amd_probe(ctx.state, (amd_status, amd_devices, amd_details))

        gpu_devices = list(nvidia_devices) + list(amd_devices)
        gpu_setup = build_gpu_setup_entries(
            platform_name,
            is_wsl,
            get_backend_name(ctx),
            nvidia_status,
            len(nvidia_devices),
            amd_status,
            len(amd_devices),
            os_release_text=read_os_release() if platform_name.startswith("linux") else None,
            nvidia_details=nvidia_details,
            amd_details=amd_details,
        )
        if not gpu_devices and all_smi_status in ("ok", "error"):
            gpu_setup.insert(0, _all_smi_state_entry(all_smi_status, all_smi_details))

    data = {
        "sampled_at": counters["wall"],
        "interval_seconds": interval_seconds if interval_ok else None,
        "system": {
            "cpu": _build_cpu_metric(previous, counters.get("cpu"), interval_ok),
            "memory": _build_memory_metric(counters.get("memory")),
            "disk": _build_disk_metric(previous, counters, interval_seconds, interval_ok),
        },
        "gpus": gpu_devices,
        "gpu_setup": gpu_setup,
    }
    new_previous = {
        "monotonic": counters["monotonic"],
        "cpu": counters.get("cpu"),
        "disk": counters.get("disk"),
    }
    return data, new_previous


def get_system_stats(ctx, force_refresh=False):
    """返回 Monitor 载荷，可能时从短生命周期缓存提供。

    缓存未命中或强制刷新会记录观察到的缓存代数、获取采集锁并再次检查：如果等待期间
    另一个请求推进了代数，即使是 ``refresh=1`` 也会返回已完成的采样。因此连续点击
    “重新检查”会合并，而不是排队执行多个强制探测。
    """
    state = ctx.state
    now = time.monotonic()
    with state.system_stats_lock:
        cache = state.system_stats_cache
        if cache is not None and not force_refresh and now < cache["expires_at"]:
            return cache["data"]
        observed_generation = state.system_stats_generation

    with state.system_stats_collection_lock:
        with state.system_stats_lock:
            if (
                state.system_stats_generation != observed_generation
                and state.system_stats_cache is not None
            ):
                return state.system_stats_cache["data"]
            previous = state.system_stats_previous

        data, new_previous = collect_sample(
            ctx, previous, allow_probe_cache=not force_refresh
        )

        with state.system_stats_lock:
            state.system_stats_previous = new_previous
            state.system_stats_cache = {
                "data": data,
                "expires_at": time.monotonic() + CACHE_TTL_SECONDS,
            }
            state.system_stats_generation += 1
            return data
