#!/usr/bin/env python3
"""Persistent Machine Tools monitor and command probe.

The only non-standard-library dependency is ``websockets``. Debian and Ubuntu
ship it as the ``python3-websockets`` package.
"""

import asyncio
import fcntl
import ipaddress
import json
import os
import re
import signal
import socket
import struct
import subprocess
import sys
import time
import traceback
import urllib.parse

try:
    import websockets
except ImportError:
    sys.stderr.write(
        "machine-tools-probe cannot start because the image is missing "
        "its preinstalled python3-websockets package\n"
    )
    raise


SEAT_CONFIG_PATH = "/var/lib/icpc/config.json"
DEFAULT_STATE_PATH = "/var/lib/icpc/machine-tools-state.json"
REPORT_INTERVAL = 30
COMMAND_TIMEOUT = 600
OUTPUT_LIMIT = 64 * 1024
PROCESS_STOP_GRACE = 2
active_socket = None
active_send_lock = None
state_lock = None
command_tasks = set()
last_cpu_sample = None


def log(level, message, error=None):
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    suffix = ""
    if error is not None:
        suffix = ": {}".format(error)
    sys.stderr.write("{}Z [{}] {}{}\n".format(timestamp, level, message, suffix))
    if error is not None and os.environ.get("MACHINE_TOOLS_DEBUG") == "1":
        traceback.print_exception(type(error), error, error.__traceback__, file=sys.stderr)
    sys.stderr.flush()


def is_private_ipv4(value):
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    return address.version == 4 and (
        address in ipaddress.ip_network("10.0.0.0/8")
        or address in ipaddress.ip_network("172.16.0.0/12")
        or address in ipaddress.ip_network("192.168.0.0/16")
    )


def interface_ipv4(name):
    request = struct.pack("256s", name[:15].encode("utf-8"))
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as handle:
        try:
            result = fcntl.ioctl(handle.fileno(), 0x8915, request)
        except OSError:
            return ""
    return socket.inet_ntoa(result[20:24])


def default_route_interface():
    candidates = []
    for line in read_text("/proc/net/route").splitlines()[1:]:
        fields = line.split()
        if len(fields) < 8 or fields[1] != "00000000":
            continue
        try:
            flags = int(fields[3], 16)
            metric = int(fields[6])
        except ValueError:
            continue
        if flags & 0x1:
            candidates.append((metric, fields[0]))
    return min(candidates, default=(0, ""))[1]


def interface_mac(name):
    try:
        with open("/sys/class/net/{}/address".format(name), encoding="ascii") as stream:
            return stream.read().strip().upper()
    except OSError:
        return "00:00:00:00:00:00"


def network_identity():
    route_name = default_route_interface()
    if route_name:
        route_ip = interface_ipv4(route_name)
        if route_ip:
            return {
                "name": route_name,
                "ip": route_ip,
                "mac": interface_mac(route_name),
            }
    fallback = None
    try:
        interfaces = socket.if_nameindex()
    except OSError:
        interfaces = []
    for _, name in interfaces:
        if name == "lo":
            continue
        ip = interface_ipv4(name)
        if not ip:
            continue
        current = {"name": name, "ip": ip, "mac": interface_mac(name)}
        if fallback is None:
            fallback = current
        if is_private_ipv4(ip):
            return current
    return fallback or {"name": "", "ip": "", "mac": "00:00:00:00:00:00"}


def read_text(path, fallback=""):
    try:
        with open(path, encoding="utf-8", errors="replace") as stream:
            return stream.read()
    except OSError:
        return fallback


def command_output(arguments, environment=None):
    try:
        result = subprocess.run(
            arguments,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=3,
            env=environment,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return ""
    return result.stdout if result.returncode == 0 else ""


def image_revision():
    match = re.search(r"Revision:\s*(\S+)", read_text("/icpc/version"))
    if match:
        return match.group(1)
    match = re.search(r"(?:^|\s)version=(\S+)", read_text("/proc/cmdline"))
    return match.group(1) if match else "devel"


def operating_system_name():
    for path in ("/etc/issue.net", "/etc/issue"):
        value = read_text(path).strip().split()
        if value:
            return value[0]
    release = read_text("/etc/os-release")
    values = {}
    for line in release.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value.strip().strip('"')
    return values.get("PRETTY_NAME") or values.get("NAME") or "unknown"


def configured_seat(config):
    try:
        legacy = json.loads(read_text(SEAT_CONFIG_PATH, "{}"))
    except (TypeError, json.JSONDecodeError):
        legacy = {}
    seat = legacy.get("seat") if isinstance(legacy, dict) else ""
    return str(seat or config.get("seat") or socket.gethostname()).strip()


def wifi_info(name):
    if not name or not os.path.isdir("/sys/class/net/{}/wireless".format(name)):
        return None, ""
    signal_value = None
    bssid = ""
    output = command_output(["iw", "dev", name, "link"])
    if re.search(r"\bConnected to\b", output, re.IGNORECASE):
        match = re.search(r"Connected to\s+([0-9a-f:]{17})", output, re.IGNORECASE)
        if match:
            bssid = match.group(1).upper()
        match = re.search(r"^\s*signal:\s*(-?[0-9.]+)", output, re.MULTILINE)
        if match:
            signal_value = float(match.group(1))
    if signal_value is None or not bssid:
        output = command_output(["iwconfig", name])
        if not bssid:
            match = re.search(r"Access Point:\s*([0-9a-f:]{17})", output, re.IGNORECASE)
            if match:
                bssid = match.group(1).upper()
        if signal_value is None:
            match = re.search(r"Signal level[=:]\s*(-?[0-9.]+)", output, re.IGNORECASE)
            if match:
                signal_value = float(match.group(1))
    return signal_value, bssid


def active_window_info():
    try:
        displays = sorted(
            name[1:] for name in os.listdir("/tmp/.X11-unix")
            if re.fullmatch(r"X[0-4]", name)
        )
    except OSError:
        displays = []
    environment = None
    for display in displays:
        candidate = dict(os.environ, DISPLAY=":" + display)
        if command_output(["xset", "-q"], candidate):
            environment = candidate
            break
    if environment is None:
        return "", "unknown", "unknown"
    root = command_output(["xprop", "-root", "_NET_ACTIVE_WINDOW"], environment)
    match = re.search(r"(?:#|=)\s*(0x[0-9a-f]+)", root, re.IGNORECASE)
    if not match or match.group(1) == "0x0":
        return "", "unknown", "unknown"
    details = command_output(
        ["xprop", "-notype", "-id", match.group(1), "WM_NAME", "_NET_WM_PID"],
        environment,
    )
    title_match = re.search(r'^WM_NAME\s*=\s*"(.*)"$', details, re.MULTILINE)
    pid_match = re.search(r"^_NET_WM_PID\s*=\s*(\d+)", details, re.MULTILINE)
    title = title_match.group(1) if title_match else ""
    if not pid_match:
        return title, "unknown", "unknown"
    pid = pid_match.group(1)
    try:
        executable = os.readlink("/proc/{}/exe".format(pid))
    except OSError:
        executable = "unknown"
    command_line = read_text("/proc/{}/cmdline".format(pid)).replace("\0", " ").strip()
    return title, executable, command_line or "unknown"


def memory_info():
    values = {}
    for line in read_text("/proc/meminfo").splitlines():
        if ":" not in line:
            continue
        key, raw = line.split(":", 1)
        match = re.search(r"\d+", raw)
        if match:
            values[key] = int(match.group(0))
    total = values.get("MemTotal", 0)
    free = values.get("MemFree", 0)
    return total, max(0, total - free)


def cpu_usage():
    global last_cpu_sample
    try:
        values = [int(value) for value in read_text("/proc/stat").splitlines()[0].split()[1:]]
    except (IndexError, ValueError):
        return 0
    total = sum(values)
    idle = sum(values[3:5])
    previous = last_cpu_sample
    last_cpu_sample = (total, idle)
    if previous is None or total <= previous[0]:
        return 0
    total_delta = total - previous[0]
    idle_delta = idle - previous[1]
    return max(0, min(100, (total_delta - idle_delta) / total_delta * 100))


def cpu_model():
    count = 0
    model = ""
    for line in read_text("/proc/cpuinfo").splitlines():
        if line.lower().startswith("processor") and ":" in line:
            count += 1
        if line.lower().startswith(("model name", "hardware", "processor")) and ":" in line:
            value = line.split(":", 1)[1].strip()
            if value and (line.lower().startswith(("model name", "hardware")) or not model):
                model = value
    if not model:
        model = "unknown"
    return "{}_x_{}".format(count or 1, model.replace(" ", "_"))


def machine_snapshot(config):
    identity = network_identity()
    total_memory, memory_used = memory_info()
    wifi_signal, wifi_bssid = wifi_info(identity["name"])
    window_name, window_exe, window_command = active_window_info()
    uname = os.uname()
    try:
        with open("/proc/uptime", encoding="ascii") as stream:
            uptime = int(float(stream.read().split()[0]))
    except (OSError, ValueError, IndexError):
        uptime = 0
    try:
        load = " ".join(str(value) for value in os.getloadavg())
    except OSError:
        load = ""
    return {
        "mac": identity["mac"],
        "hostname": configured_seat(config),
        "ip": identity["ip"],
        "version": image_revision(),
        "uptime": uptime,
        "os": operating_system_name(),
        "kernel": uname.release,
        "cpu": cpu_model(),
        "cpuUsed": cpu_usage(),
        "memory": total_memory,
        "memoryUsed": memory_used,
        "load": load,
        "wifiSignal": wifi_signal,
        "wifiBssid": wifi_bssid,
        "windowName": window_name,
        "windowExe": window_exe,
        "windowCommand": window_command,
    }


async def collect_snapshot(config):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, machine_snapshot, config)


def load_config():
    probe_url = os.environ.get("PROBEURL", "").strip()
    if not probe_url:
        raise RuntimeError("PROBEURL is required")
    if re.match(r"^wss?://", probe_url, re.IGNORECASE) is None:
        raise RuntimeError("PROBEURL must be a complete ws:// or wss:// URL")
    return {
        "probeUrl": probe_url,
        "reportToken": os.environ.get("REPORTTOKEN", ""),
    }


def load_state(path):
    try:
        with open(path, encoding="utf-8") as stream:
            state = json.load(stream)
    except FileNotFoundError:
        state = {"running": {}, "outbox": {}}
    state.setdefault("running", {})
    state.setdefault("outbox", {})
    for command_id, running in list(state["running"].items()):
        state["outbox"][command_id] = {
            "type": "result",
            "id": command_id,
            "exitCode": -2,
            "stdout": "",
            "stderr": "Probe restarted while the command was running; it was not repeated.",
        }
        del state["running"][command_id]
    return state


async def save_state(path, state):
    async with state_lock:
        directory = os.path.dirname(path) or "."
        os.makedirs(directory, mode=0o700, exist_ok=True)
        temporary = path + ".tmp"
        with open(temporary, "w", encoding="utf-8") as stream:
            json.dump(state, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        os.chmod(path, 0o600)


class OutputLimitExceeded(Exception):
    pass


async def read_limited(stream, buffer):
    while True:
        chunk = await stream.read(4096)
        if not chunk:
            return
        remaining = OUTPUT_LIMIT - len(buffer)
        if remaining > 0:
            buffer.extend(chunk[:remaining])
        if len(chunk) > remaining:
            raise OutputLimitExceeded("Command output exceeded 64 KiB")


async def stop_process(process):
    process_group = process.pid
    try:
        os.killpg(process_group, signal.SIGTERM)
    except ProcessLookupError:
        pass
    deadline = asyncio.get_running_loop().time() + PROCESS_STOP_GRACE
    while asyncio.get_running_loop().time() < deadline:
        try:
            os.killpg(process_group, 0)
        except ProcessLookupError:
            break
        await asyncio.sleep(0.05)
    try:
        os.killpg(process_group, signal.SIGKILL)
    except ProcessLookupError:
        pass
    if process.returncode is None:
        await process.wait()


async def run_command(command):
    process = await asyncio.create_subprocess_shell(
        command,
        executable="/bin/sh",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        start_new_session=True,
    )
    stdout = bytearray()
    stderr = bytearray()
    tasks = [
        asyncio.create_task(read_limited(process.stdout, stdout)),
        asyncio.create_task(read_limited(process.stderr, stderr)),
    ]
    error_message = ""
    try:
        await asyncio.wait_for(
            asyncio.gather(process.wait(), *tasks),
            timeout=COMMAND_TIMEOUT,
        )
    except asyncio.TimeoutError:
        error_message = "Command timed out after {} seconds".format(COMMAND_TIMEOUT)
        await stop_process(process)
    except OutputLimitExceeded as error:
        error_message = str(error)
        await stop_process(process)
    except asyncio.CancelledError:
        await stop_process(process)
        raise
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    if error_message:
        if stderr:
            stderr.extend(b"\n")
        stderr.extend(error_message.encode("utf-8"))
        return -1, stdout.decode("utf-8", "replace"), stderr.decode("utf-8", "replace")
    return (
        process.returncode if process.returncode is not None else -1,
        stdout.decode("utf-8", "replace"),
        stderr.decode("utf-8", "replace"),
    )


async def send_json(payload):
    socket_value = active_socket
    lock = active_send_lock
    if socket_value is None or lock is None:
        return False
    try:
        async with lock:
            if socket_value is not active_socket:
                return False
            await socket_value.send(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            )
        return True
    except Exception:
        return False


async def execute_command(message, state, state_path):
    command_id = message["id"]
    state["running"][command_id] = {
        "command": message["command"],
    }
    await save_state(state_path, state)
    try:
        exit_code, stdout, stderr = await run_command(message["command"])
    except Exception as error:
        exit_code, stdout, stderr = -1, "", str(error)
    result = {
        "type": "result",
        "id": command_id,
        "exitCode": exit_code,
        "stdout": stdout,
        "stderr": stderr,
    }
    state["running"].pop(command_id, None)
    state["outbox"][command_id] = result
    await save_state(state_path, state)
    await send_json(result)


def log_task_failure(task):
    command_tasks.discard(task)
    if task.cancelled():
        return
    error = task.exception()
    if error is not None:
        log("error", "Command failed", error)


async def report_loop(config, state):
    while True:
        await asyncio.sleep(REPORT_INTERVAL)
        try:
            snapshot = await collect_snapshot(config)
            await send_json({"type": "report", "probe": snapshot})
        except asyncio.CancelledError:
            raise
        except Exception as error:
            log("error", "Machine telemetry collection failed", error)
        for result in list(state["outbox"].values()):
            await send_json(result)


async def connect(config, state, state_path):
    global active_socket, active_send_lock
    endpoint = urllib.parse.urlsplit(config["probeUrl"])
    query = dict(urllib.parse.parse_qsl(endpoint.query, keep_blank_values=True))
    if config["reportToken"]:
        query["token"] = config["reportToken"]
    else:
        query.pop("token", None)
    endpoint = urllib.parse.urlunsplit(endpoint._replace(query=urllib.parse.urlencode(query)))
    report_task = None
    async with websockets.connect(
        endpoint,
        max_size=128 * 1024,
        ping_interval=20,
        ping_timeout=20,
        close_timeout=5,
    ) as websocket:
        active_socket = websocket
        active_send_lock = asyncio.Lock()
        await send_json({"type": "hello", "probe": await collect_snapshot(config)})
        report_task = asyncio.create_task(report_loop(config, state))
        try:
            async for raw in websocket:
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8", "replace")
                try:
                    message = json.loads(raw)
                except (TypeError, json.JSONDecodeError):
                    continue
                message_type = message.get("type")
                if message_type == "welcome":
                    log("info", "Connected to machine report server")
                    for result in list(state["outbox"].values()):
                        await send_json(result)
                    continue
                if message_type == "result-ack" and message.get("id"):
                    state["outbox"].pop(message["id"], None)
                    await save_state(state_path, state)
                    continue
                if (
                    message_type != "command"
                    or not message.get("id")
                    or not message.get("command")
                ):
                    continue
                command_id = message["id"]
                if command_id in state["outbox"]:
                    await send_json(state["outbox"][command_id])
                    continue
                if command_id in state["running"]:
                    if state["running"][command_id].get("command") != message["command"]:
                        log("error", "Command {} changed while running; refusing redispatch".format(command_id))
                    continue
                if state["running"]:
                    continue
                task = asyncio.create_task(execute_command(message, state, state_path))
                command_tasks.add(task)
                task.add_done_callback(log_task_failure)
        finally:
            if report_task is not None:
                report_task.cancel()
                await asyncio.gather(report_task, return_exceptions=True)
            if active_socket is websocket:
                active_socket = None
                active_send_lock = None


async def async_main(config, state_path):
    global state_lock
    state_lock = asyncio.Lock()
    state = load_state(state_path)
    await save_state(state_path, state)
    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()

    def stop():
        stopping.set()
        if active_socket is not None:
            asyncio.create_task(active_socket.close(code=1001, reason="Service stopping"))

    for current_signal in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(current_signal, stop)
        except NotImplementedError:
            signal.signal(current_signal, lambda *_args: loop.call_soon_threadsafe(stop))

    retry = 0
    while not stopping.is_set():
        connection_task = asyncio.create_task(connect(config, state, state_path))
        stop_task = asyncio.create_task(stopping.wait())
        try:
            done, _pending = await asyncio.wait(
                (connection_task, stop_task),
                return_when=asyncio.FIRST_COMPLETED,
            )
            if stop_task in done:
                connection_task.cancel()
                await asyncio.gather(connection_task, return_exceptions=True)
                break
            stop_task.cancel()
            await asyncio.gather(stop_task, return_exceptions=True)
            await connection_task
            retry = 0
        except Exception as error:
            if not stopping.is_set():
                log("error", "Probe connection failed", error)
        finally:
            if not stop_task.done():
                stop_task.cancel()
            if not connection_task.done():
                connection_task.cancel()
            await asyncio.gather(stop_task, connection_task, return_exceptions=True)
        if stopping.is_set():
            break
        retry += 1
        delay = min(30, 2 ** min(retry, 5))
        try:
            await asyncio.wait_for(stopping.wait(), timeout=delay)
        except asyncio.TimeoutError:
            pass
    pending_commands = list(command_tasks)
    for task in pending_commands:
        task.cancel()
    if pending_commands:
        await asyncio.gather(*pending_commands, return_exceptions=True)


def main():
    state_path = os.environ.get("MACHINE_TOOLS_STATE_PATH", DEFAULT_STATE_PATH)
    try:
        asyncio.run(async_main(load_config(), state_path))
    except KeyboardInterrupt:
        return
    except Exception as error:
        log("fatal", "Machine probe stopped", error)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
