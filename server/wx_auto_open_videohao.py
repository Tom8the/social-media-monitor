import ctypes
from ctypes import wintypes
import json
import os
import subprocess
import sys
import time
import urllib.request


KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
INPUT_KEYBOARD = 1
INPUT_MOUSE = 0
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_ABSOLUTE = 0x8000
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
WM_MOUSEMOVE = 0x0200
WM_LBUTTONDOWN = 0x0201
WM_LBUTTONUP = 0x0202
MK_LBUTTON = 0x0001
SW_SHOW = 5
SW_RESTORE = 9

VK_CTRL = 0x11
VK_A = 0x41
VK_BACK = 0x08
VK_F = 0x46
VK_V = 0x56
VK_RETURN = 0x0D
CF_UNICODETEXT = 13
GMEM_MOVEABLE = 0x0002
GMEM_ZEROINIT = 0x0040

VIDEOHAO_LABEL = "\u89c6\u9891\u53f7"
SEARCH_LABEL = "\u641c\u7d22"
ACCOUNT_LABEL = "\u8d26\u53f7"
FOLLOW_LABEL = "\u5173\u6ce8"

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

user32.IsIconic.argtypes = [wintypes.HWND]
user32.IsIconic.restype = wintypes.BOOL
user32.OpenIcon.argtypes = [wintypes.HWND]
user32.OpenIcon.restype = wintypes.BOOL
user32.GetForegroundWindow.restype = wintypes.HWND
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user32.GetWindowThreadProcessId.restype = wintypes.DWORD
user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
user32.AttachThreadInput.restype = wintypes.BOOL
kernel32.GetCurrentThreadId.restype = wintypes.DWORD


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_ulonglong),
    ]


class KEY_INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("ki", KEYBDINPUT)]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_ulonglong),
    ]


class MOUSE_INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("mi", MOUSEINPUT)]


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long),
    ]


def send_key(vk, up=False):
    item = KEY_INPUT()
    item.type = INPUT_KEYBOARD
    item.ki.wVk = vk
    item.ki.wScan = 0
    item.ki.dwFlags = KEYEVENTF_KEYUP if up else 0
    item.ki.time = 0
    item.ki.dwExtraInfo = 0
    user32.SendInput(1, ctypes.byref(item), ctypes.sizeof(item))


def tap(vk, hold=0.08):
    send_key(vk, False)
    time.sleep(hold)
    send_key(vk, True)
    time.sleep(0.12)


def ctrl_tap(vk):
    send_key(VK_CTRL, False)
    time.sleep(0.05)
    send_key(vk, False)
    time.sleep(0.08)
    send_key(vk, True)
    time.sleep(0.05)
    send_key(VK_CTRL, True)
    time.sleep(0.25)


def type_unicode_text(text):
    for ch in str(text):
        code = ord(ch)
        item = KEY_INPUT()
        item.type = INPUT_KEYBOARD
        item.ki.wVk = 0
        item.ki.wScan = code
        item.ki.dwFlags = KEYEVENTF_UNICODE
        item.ki.time = 0
        item.ki.dwExtraInfo = 0
        user32.SendInput(1, ctypes.byref(item), ctypes.sizeof(item))
        time.sleep(0.02)

        item_up = KEY_INPUT()
        item_up.type = INPUT_KEYBOARD
        item_up.ki.wVk = 0
        item_up.ki.wScan = code
        item_up.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
        item_up.ki.time = 0
        item_up.ki.dwExtraInfo = 0
        user32.SendInput(1, ctypes.byref(item_up), ctypes.sizeof(item_up))
        time.sleep(0.05)


def click_point(x, y):
    screen_w = user32.GetSystemMetrics(0)
    screen_h = user32.GetSystemMetrics(1)
    abs_x = int(x * 65535 / max(1, screen_w - 1))
    abs_y = int(y * 65535 / max(1, screen_h - 1))
    for flags in (
        MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
        MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_ABSOLUTE,
        MOUSEEVENTF_LEFTUP | MOUSEEVENTF_ABSOLUTE,
    ):
        item = MOUSE_INPUT()
        item.type = INPUT_MOUSE
        item.mi.dx = abs_x
        item.mi.dy = abs_y
        item.mi.mouseData = 0
        item.mi.dwFlags = flags
        item.mi.time = 0
        item.mi.dwExtraInfo = 0
        user32.SendInput(1, ctypes.byref(item), ctypes.sizeof(item))
        time.sleep(0.06)


def get_rect(hwnd):
    rect = RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
        return None
    return (rect.left, rect.top, rect.right, rect.bottom)


def rect_size(rect):
    left, top, right, bottom = rect
    return right - left, bottom - top


def click_relative(hwnd, rx, ry):
    rect = get_rect(hwnd)
    if not rect:
        return False
    left, top, right, bottom = rect
    click_point(left + int((right - left) * rx), top + int((bottom - top) * ry))
    return True


def post_click(hwnd, x, y):
    lparam = (int(y) << 16) | (int(x) & 0xFFFF)
    user32.PostMessageW(hwnd, WM_MOUSEMOVE, 0, lparam)
    time.sleep(0.08)
    user32.PostMessageW(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, lparam)
    time.sleep(0.08)
    user32.PostMessageW(hwnd, WM_LBUTTONUP, 0, lparam)
    time.sleep(0.25)


def post_click_relative(hwnd, rx, ry):
    rect = get_rect(hwnd)
    if not rect:
        return False
    left, top, right, bottom = rect
    post_click(hwnd, int((right - left) * rx), int((bottom - top) * ry))
    return True


def debug_snapshot(hwnd, name):
    try:
        from PIL import ImageGrab
        rect = get_rect(hwnd)
        if not rect:
            return
        out_dir = os.path.join(os.path.dirname(__file__), "tmp")
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, f"wx_auto_{name}.png")
        ImageGrab.grab(bbox=rect).save(path)
        print(f"__AUTO_WECHAT_SNAPSHOT__:{path}")
    except Exception as exc:
        print(f"__AUTO_WECHAT_SNAPSHOT_FAILED__:{exc}")


def is_blue_placeholder_window(hwnd):
    try:
        from PIL import ImageGrab, ImageStat
        rect = get_rect(hwnd)
        if not rect:
            return False
        image = ImageGrab.grab(bbox=rect).resize((16, 16))
        stat = ImageStat.Stat(image)
        # Broken WeChat/WebView windows in this environment render as a nearly
        # uniform blue panel. They are visible HWNDs but not operable WeChat UI.
        mean = stat.mean
        stddev = stat.stddev
        return mean[2] > 80 and mean[0] < 25 and mean[1] < 110 and max(stddev) < 8
    except Exception:
        return False


def enum_top_windows():
    windows = []
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def callback(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        class_buf = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, class_buf, 256)
        title_len = user32.GetWindowTextLengthW(hwnd)
        title = ""
        if title_len > 0:
            title_buf = ctypes.create_unicode_buffer(title_len + 1)
            user32.GetWindowTextW(hwnd, title_buf, title_len + 1)
            title = title_buf.value or ""
        windows.append((hwnd, class_buf.value or "", title))
        return True

    user32.EnumWindows(callback_type(callback), 0)
    return windows


def get_process_path(hwnd):
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if not pid.value:
        return ""
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
    if not handle:
        return ""
    try:
        size = wintypes.DWORD(4096)
        buf = ctypes.create_unicode_buffer(size.value)
        if kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)):
            return buf.value or ""
    finally:
        kernel32.CloseHandle(handle)
    return ""


def find_wechat_executable_from_process():
    script = (
        "Get-CimInstance Win32_Process | "
        "Where-Object { $_.Name -in @('Weixin.exe','WeChat.exe') } | "
        "Select-Object -First 1 -ExpandProperty ExecutablePath"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True,
            text=True,
            timeout=8,
        )
        path = (result.stdout or "").strip().splitlines()[0].strip()
        if path and os.path.exists(path):
            return path
    except Exception:
        return ""
    return ""


def restore_wechat_from_running_process(timeout=8.0):
    exe_path = find_wechat_executable_from_process()
    if not exe_path:
        return None
    try:
        subprocess.Popen([exe_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as exc:
        print(f"__AUTO_WECHAT_RESTORE_PROCESS_FAILED__:{exc}")
        return None

    deadline = time.time() + timeout
    while time.time() < deadline:
        hwnd = find_main_wechat_hwnd() or find_wechat_hwnd()
        if hwnd:
            print(f"__AUTO_WECHAT_RESTORED_FROM_PROCESS__:{exe_path}")
            return hwnd
        time.sleep(0.4)
    return None


def restart_wechat_processes(timeout=15.0):
    exe_path = find_wechat_executable_from_process()
    if not exe_path:
        return None
    script = (
        "Get-Process WeChatAppEx,Weixin,WeChat -ErrorAction SilentlyContinue | "
        "Stop-Process -Force -ErrorAction SilentlyContinue"
    )
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True,
            text=True,
            timeout=10,
        )
        time.sleep(2.0)
        subprocess.Popen([exe_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"__AUTO_WECHAT_RESTARTED__:{exe_path}")
    except Exception as exc:
        print(f"__AUTO_WECHAT_RESTART_FAILED__:{exc}")
        return None

    deadline = time.time() + timeout
    while time.time() < deadline:
        hwnd = find_main_wechat_hwnd() or find_wechat_hwnd()
        if hwnd:
            activate_window(hwnd)
            return hwnd
        time.sleep(0.5)
    return None


def is_wechat_window(hwnd, class_name, title):
    rect = get_rect(hwnd)
    if not rect:
        return False
    width, height = rect_size(rect)

    path = get_process_path(hwnd).lower()
    base = os.path.basename(path)
    looks_like_process = base in ("weixin.exe", "wechat.exe", "wechatappex.exe")
    looks_like_title = title.startswith("\u5fae") or title.startswith("\u03a2") or title in ("\u5fae\u4fe1",)
    looks_like_class = (
        class_name == "WeChatMainWndForPC" or
        class_name.startswith("Qt") or
        class_name.startswith("Chrome_WidgetWin")
    )
    if "codex" in title.lower():
        return False
    if looks_like_process and class_name.startswith("Qt") and looks_like_title:
        return True
    if width < 180 or height < 120:
        return False
    return looks_like_class and (looks_like_process or looks_like_title)


def list_wechat_windows():
    rows = []
    for hwnd, class_name, title in enum_top_windows():
        if not is_wechat_window(hwnd, class_name, title):
            continue
        if is_blue_placeholder_window(hwnd):
            print(f"__AUTO_WECHAT_SKIP_BLUE_WINDOW__:{hwnd}")
            continue
        rect = get_rect(hwnd)
        width, height = rect_size(rect)
        rows.append({
            "hwnd": hwnd,
            "class_name": class_name,
            "title": title,
            "rect": rect,
            "area": width * height,
            "path": get_process_path(hwnd),
        })
    return rows


def close_blue_placeholder_windows():
    closed = 0
    for hwnd, class_name, title in enum_top_windows():
        rect = get_rect(hwnd)
        if not rect:
            continue
        path = get_process_path(hwnd).lower()
        base = os.path.basename(path)
        if base not in ("weixin.exe", "wechat.exe", "wechatappex.exe"):
            continue
        if not (class_name.startswith("Qt") or class_name.startswith("Chrome_WidgetWin")):
            continue
        if is_blue_placeholder_window(hwnd):
            user32.PostMessageW(hwnd, 0x0010, 0, 0)
            closed += 1
    if closed:
      print(f"__AUTO_WECHAT_CLOSED_BLUE_WINDOWS__:{closed}")
      time.sleep(1.0)
    return closed


def find_wechat_hwnd():
    windows = list_wechat_windows()
    if not windows:
        return None
    for item in windows:
        if item["class_name"] == "WeChatMainWndForPC":
            return item["hwnd"]
    for item in windows:
        if item["class_name"].startswith("Qt"):
            return item["hwnd"]
    return max(windows, key=lambda item: item["area"])["hwnd"]


def find_main_wechat_hwnd():
    windows = list_wechat_windows()
    if not windows:
        return None
    main_classes = ("WeChatMainWndForPC",)
    for item in windows:
        if item["class_name"] in main_classes:
            return item["hwnd"]
    qt_windows = [item for item in windows if item["class_name"].startswith("Qt")]
    if qt_windows:
        return max(qt_windows, key=lambda item: item["area"])["hwnd"]
    return None


def find_search_window():
    candidates = [
        item for item in list_wechat_windows()
        if item["class_name"].startswith("Chrome_WidgetWin") and item["area"] > 240000
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item["area"])["hwnd"]


def wait_for_search_window(timeout=8.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        hwnd = find_search_window()
        if hwnd:
            return hwnd
        time.sleep(0.35)
    return None


def get_control_children(control):
    try:
        return control.GetChildren()
    except Exception:
        return []


def walk_controls(control, max_controls=2500):
    queue = [control]
    visited = 0
    while queue and visited < max_controls:
        current = queue.pop(0)
        visited += 1
        yield current
        queue.extend(get_control_children(current))


def find_control(root, control_type=None, name=None, automation_id=None):
    for control in walk_controls(root):
        if control_type and control.ControlTypeName != control_type:
            continue
        if name is not None and control.Name != name:
            continue
        if automation_id is not None and control.AutomationId != automation_id:
            continue
        return control
    return None


def find_control_name_contains(root, text, control_type=None):
    for control in walk_controls(root):
        if control_type and control.ControlTypeName != control_type:
            continue
        if text in (control.Name or ""):
            return control
    return None


def find_named_visible_control(root, name, top_limit=260):
    candidates = []
    for control in walk_controls(root):
        if control.Name != name:
            continue
        rect = control.BoundingRectangle
        if rect.right <= rect.left or rect.bottom <= rect.top:
            continue
        if top_limit and rect.top > top_limit:
            continue
        candidates.append(control)
    if not candidates:
        return None
    return min(candidates, key=lambda item: (item.BoundingRectangle.top, item.BoundingRectangle.left))


def get_parent_names(control, limit=8):
    names = []
    current = control
    for _ in range(limit):
        try:
            current = current.GetParentControl()
        except Exception:
            break
        if not current:
            break
        if current.Name:
            names.append(current.Name)
    return names


def wait_control(root, control_type=None, name=None, automation_id=None, timeout=8.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        control = find_control(root, control_type, name, automation_id)
        if control:
            return control
        time.sleep(0.35)
    return None


def find_render_control(root):
    return find_control(root, control_type="DocumentControl")


def post_click_control(root, control):
    render = find_render_control(root)
    if not render or not render.NativeWindowHandle:
        raise RuntimeError("search render window is not available")
    control_rect = control.BoundingRectangle
    render_rect = render.BoundingRectangle
    x = int((control_rect.left + control_rect.right) / 2 - render_rect.left)
    y = int((control_rect.top + control_rect.bottom) / 2 - render_rect.top)
    post_click(render.NativeWindowHandle, x, y)


def post_click_render_relative(root, rx, ry):
    render = find_render_control(root)
    if not render or not render.NativeWindowHandle:
        raise RuntimeError("search render window is not available")
    rect = render.BoundingRectangle
    post_click(
        render.NativeWindowHandle,
        int((rect.right - rect.left) * rx),
        int((rect.bottom - rect.top) * ry),
    )


def click_top_account_category(root):
    account = find_named_visible_control(root, ACCOUNT_LABEL)
    if account:
        post_click_control(root, account)
        return "uia"
    return "not-found"


def set_search_input_text(root, search_input, keyword):
    value_pattern = search_input.GetValuePattern()
    value_pattern.SetValue(keyword)
    time.sleep(0.5)
    current = value_pattern.Value or ""
    if current == keyword and "?" not in current:
        return "uia"

    # Some WeChat WebView builds corrupt non-ASCII text written through UIA
    # SetValue. Clipboard paste keeps the original Unicode text.
    post_click_control(root, search_input)
    time.sleep(0.2)
    set_clipboard_text(keyword)
    ctrl_tap(VK_A)
    ctrl_tap(VK_V)
    time.sleep(0.8)
    current = value_pattern.Value or ""
    if current != keyword:
        raise RuntimeError("video account name was not written into the search input")
    return "clipboard"


def find_videohao_profile_result(root, keyword):
    render = find_render_control(root)
    render_rect = render.BoundingRectangle if render else None
    render_left = render_rect.left if render_rect else 0
    render_top = render_rect.top if render_rect else 0
    render_width = (render_rect.right - render_rect.left) if render_rect else 99999
    min_top = render_top + 120
    max_left = render_left + int(render_width * 0.76)

    row_candidates = []
    for control in walk_controls(root):
        if control.ControlTypeName != "ListItemControl":
            continue
        name = control.Name or ""
        if keyword not in name or VIDEOHAO_LABEL not in name:
            continue
        rect = control.BoundingRectangle
        if rect.right <= rect.left or rect.bottom <= rect.top:
            continue
        if rect.top < min_top:
            continue
        if rect.left > max_left:
            continue
        row_candidates.append((rect.top * 10 + rect.left, control))
    if row_candidates:
        return min(row_candidates, key=lambda item: item[0])[1]

    candidates = []
    for control in walk_controls(root):
        if control.ControlTypeName != "TextControl" or control.Name != keyword:
            continue
        rect = control.BoundingRectangle
        if rect.right <= rect.left or rect.bottom <= rect.top:
            continue
        if rect.top < min_top:
            continue

        parent_names = get_parent_names(control)
        joined = " ".join(parent_names)
        score = rect.top * 10 + rect.left
        if VIDEOHAO_LABEL in joined or ACCOUNT_LABEL in joined or "\u89c6\u9891\u53f7" in joined:
            score -= 5000
        if rect.left > max_left:
            score += 100000
        if rect.left < render_left + 90:
            score += 2000
        candidates.append((score, control))

    if not candidates:
        return None
    return min(candidates, key=lambda item: item[0])[1]


def find_account_result(root, keyword):
    profile_result = find_videohao_profile_result(root, keyword)
    if profile_result:
        return profile_result

    for control in walk_controls(root):
        if control.ControlTypeName != "TextControl" or control.Name != keyword:
            continue
        rect = control.BoundingRectangle
        if rect.right <= rect.left or rect.bottom <= rect.top:
            continue
        parent = control
        for _ in range(8):
            parent = parent.GetParentControl()
            if not parent:
                break
            if parent.ControlTypeName != "ListItemControl":
                continue
            parent_name = parent.Name or ""
            is_account_row = (
                parent_name.startswith(f"{ACCOUNT_LABEL},") or
                parent_name.startswith("\u5e10\u53f7,")
            )
            if keyword in parent_name and is_account_row:
                return control
    return None


def wait_account_result(root, keyword, timeout=10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        control = find_account_result(root, keyword)
        if control:
            return control
        time.sleep(0.5)
    return None


def wait_profile_open(root, keyword, timeout=15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if (
            find_control(root, control_type="ButtonControl", name=FOLLOW_LABEL) and
            find_control(root, control_type="TextControl", name=keyword)
        ):
            return True
        if (
            find_control(root, control_type="TextControl", name=keyword) and
            find_control_name_contains(root, "\u539f\u521b\u5185\u5bb9", control_type="TextControl")
        ):
            return True
        time.sleep(0.5)
    return False


def close_search_windows():
    closed = 0
    for item in list_wechat_windows():
        if not item["class_name"].startswith("Chrome_WidgetWin"):
            continue
        user32.PostMessageW(item["hwnd"], 0x0010, 0, 0)
        closed += 1
    if closed:
        print(f"__AUTO_WECHAT_CLOSED_SEARCH_WINDOWS__:{closed}")
        time.sleep(1.0)


def cleanup_wechat_webview_processes():
    script = (
        "$items = Get-CimInstance Win32_Process | "
        "Where-Object { $_.Name -eq 'WeChatAppEx.exe' -and "
        "($_.ExecutablePath -like '*Tencent*xwechat*' -or $_.CommandLine -like '*Tencent*xwechat*') }; "
        "$items | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; "
        "$items.Count"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True,
            text=True,
            timeout=8,
        )
        count = (result.stdout or "").strip()
        if count and count != "0":
            print(f"__AUTO_WECHAT_CLEANED_WEBVIEWS__:{count}")
            time.sleep(1.0)
    except Exception as exc:
        print(f"__AUTO_WECHAT_CLEAN_WEBVIEWS_FAILED__:{exc}")


def has_blue_placeholder_windows():
    for hwnd, class_name, title in enum_top_windows():
        rect = get_rect(hwnd)
        if not rect:
            continue
        path = get_process_path(hwnd).lower()
        base = os.path.basename(path)
        if base not in ("weixin.exe", "wechat.exe", "wechatappex.exe"):
            continue
        if not (class_name.startswith("Qt") or class_name.startswith("Chrome_WidgetWin")):
            continue
        if is_blue_placeholder_window(hwnd):
            print(f"__AUTO_WECHAT_BLUE_WINDOW__:{hwnd}")
            return True
    return False


def preflight_wechat_for_automation():
    hwnd = find_main_wechat_hwnd() or find_wechat_hwnd()
    if not hwnd:
        if has_blue_placeholder_windows():
            close_blue_placeholder_windows()
            hwnd = restore_wechat_from_running_process()
        if not hwnd:
            hwnd = restore_wechat_from_running_process()
        if not hwnd:
            if has_blue_placeholder_windows():
                close_blue_placeholder_windows()
                cleanup_wechat_webview_processes()
                hwnd = restore_wechat_from_running_process()
        if not hwnd:
            hwnd = restart_wechat_processes()
        if not hwnd:
            if has_blue_placeholder_windows():
                print("__AUTO_WECHAT_BLUE_WINDOW_STUCK__")
                return 23
            exe_path = find_wechat_executable_from_process()
            if exe_path:
                print(f"__AUTO_WECHAT_STATUS_PROCESS_ONLY__:{exe_path}")
                return 24
            print("__AUTO_WECHAT_NO_WINDOW__")
            return 21

    try:
        activate_window(hwnd)
    except Exception as exc:
        print(f"__AUTO_WECHAT_FOREGROUND_WARN__:{exc}")

    rect = get_rect(hwnd)
    if rect:
        width, height = rect_size(rect)
        if width < 500 and height < 650:
            print("__AUTO_WECHAT_LOGIN_REQUIRED__")
            return 22

    print(f"__AUTO_WECHAT_PREFLIGHT_OK__:{hwnd}")
    return 0


def set_clipboard_text(text):
    data = str(text)
    last_error = None
    for _ in range(10):
        try:
            if not user32.OpenClipboard(None):
                raise RuntimeError("OpenClipboard failed")
            try:
                user32.EmptyClipboard()
                size = (len(data) + 1) * ctypes.sizeof(ctypes.c_wchar)
                handle = kernel32.GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, size)
                if not handle:
                    raise RuntimeError("GlobalAlloc failed")
                locked = kernel32.GlobalLock(handle)
                if not locked:
                    raise RuntimeError("GlobalLock failed")
                try:
                    ctypes.memmove(locked, ctypes.create_unicode_buffer(data), size)
                finally:
                    kernel32.GlobalUnlock(handle)
                if not user32.SetClipboardData(CF_UNICODETEXT, handle):
                    raise RuntimeError("SetClipboardData failed")
                return
            finally:
                user32.CloseClipboard()
        except Exception as exc:
            last_error = exc
            time.sleep(0.15)

    escaped = data.replace("'", "''")
    script = (
        "Add-Type -AssemblyName System.Windows.Forms;"
        f"[System.Windows.Forms.Clipboard]::SetText('{escaped}')"
    )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        timeout=10,
    )
    if result.returncode != 0:
        raise RuntimeError(str(last_error or result.stderr or result.stdout))


def activate_window(hwnd):
    if not hwnd:
        return False
    if user32.IsIconic(hwnd):
        user32.OpenIcon(hwnd)
        time.sleep(0.35)
    user32.ShowWindow(hwnd, SW_RESTORE)
    time.sleep(0.2)

    foreground = user32.GetForegroundWindow()
    current_thread = kernel32.GetCurrentThreadId()
    target_thread = user32.GetWindowThreadProcessId(hwnd, None)
    foreground_thread = user32.GetWindowThreadProcessId(foreground, None) if foreground else 0

    attached_target = False
    attached_foreground = False
    try:
        if target_thread and target_thread != current_thread:
            attached_target = bool(user32.AttachThreadInput(current_thread, target_thread, True))
        if foreground_thread and foreground_thread != current_thread:
            attached_foreground = bool(user32.AttachThreadInput(current_thread, foreground_thread, True))

        # Force WeChat above other windows before sending coordinate clicks.
        # SetForegroundWindow alone is often denied on Windows.
        user32.SetWindowPos(hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040)
        time.sleep(0.15)
        user32.BringWindowToTop(hwnd)
        user32.SetActiveWindow(hwnd)
        user32.SetFocus(hwnd)
        user32.SetForegroundWindow(hwnd)
        time.sleep(0.15)
        user32.SetWindowPos(hwnd, -2, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040)
    finally:
        if attached_foreground:
            user32.AttachThreadInput(current_thread, foreground_thread, False)
        if attached_target:
            user32.AttachThreadInput(current_thread, target_thread, False)
    time.sleep(0.8)
    if user32.GetForegroundWindow() != hwnd:
        print(f"__AUTO_WECHAT_FOREGROUND_WARN__:{user32.GetForegroundWindow()}")
    return True


def ensure_wechat_window_ready(hwnd):
    if hwnd:
        activate_window(hwnd)
        rect = get_rect(hwnd)
        if rect and rect_size(rect)[0] > 80 and rect_size(rect)[1] > 80:
            return hwnd

    close_blue_placeholder_windows()
    restored = restore_wechat_from_running_process()
    if restored:
        activate_window(restored)
        return restored
    restarted = restart_wechat_processes()
    if restarted:
        activate_window(restarted)
        return restarted
    return hwnd


def resize_if_small(hwnd):
    rect = get_rect(hwnd)
    if not rect:
        return
    width, height = rect_size(rect)
    target_w = max(900, width)
    target_h = max(820, height)
    user32.SetWindowPos(hwnd, 0, 20, 60, target_w, target_h, 0x0004)
    time.sleep(0.4)


def paste_keyword(keyword):
    ctrl_tap(VK_A)
    tap(VK_BACK, 0.05)
    type_unicode_text(keyword)
    time.sleep(0.4)


def open_search_from_main(hwnd, keyword):
    rect = get_rect(hwnd)
    if rect:
        width, height = rect_size(rect)
        if width < 500 and height < 650:
            resize_if_small(hwnd)
            rect = get_rect(hwnd)
            width, height = rect_size(rect) if rect else (0, 0)
            if width < 500 and height < 650:
                debug_snapshot(hwnd, "login_required")
                print("__AUTO_WECHAT_LOGIN_REQUIRED__")
                raise RuntimeError("desktop WeChat is waiting for login")
    resize_if_small(hwnd)
    debug_snapshot(hwnd, "main_before_search")
    # Use a targeted window message so this does not steal the user's mouse.
    for ry in (0.43, 0.42, 0.44):
        post_click_relative(hwnd, 0.043, ry)
        search_hwnd = wait_for_search_window(3.0)
        if search_hwnd:
            return search_hwnd
    raise RuntimeError("search window did not open")


def operate_search_window(hwnd, keyword):
    debug_snapshot(hwnd, "search_home")
    try:
        import uiautomation as auto
    except ImportError as exc:
        raise RuntimeError("python package uiautomation is required") from exc

    root = auto.ControlFromHandle(hwnd)
    category = wait_control(root, control_type="ButtonControl", name=VIDEOHAO_LABEL)
    if not category:
        raise RuntimeError("video account category was not found")
    category.GetInvokePattern().Invoke()
    time.sleep(0.7)
    debug_snapshot(hwnd, "after_category_click")

    search_input = wait_control(root, control_type="EditControl", automation_id="weixin-search-input")
    if not search_input:
        raise RuntimeError("video account search input was not found")
    input_method = set_search_input_text(root, search_input, keyword)
    print(f"__AUTO_WECHAT_INPUT_METHOD__:{input_method}")
    debug_snapshot(hwnd, "after_keyword_input")

    search_button = wait_control(root, control_type="ButtonControl", name=SEARCH_LABEL)
    if not search_button:
        raise RuntimeError("search button was not found")
    search_button.GetInvokePattern().Invoke()
    time.sleep(5.0)
    debug_snapshot(hwnd, "after_search")

    result = wait_account_result(root, keyword)
    if not result:
        # The top category order changes between WeChat builds/search terms.
        # Avoid coordinate clicks: if UIA exposes "Account", use it; otherwise
        # stay on the current results page and click the top matching Videohao card.
        clicked_by = click_top_account_category(root)
        print(f"__AUTO_WECHAT_ACCOUNT_CATEGORY_CLICK__:{clicked_by}")
        if clicked_by != "not-found":
            time.sleep(1.2)
            debug_snapshot(hwnd, "account_category_click")

            videohao_filter = wait_control(root, control_type="ButtonControl", name=VIDEOHAO_LABEL, timeout=4.0)
            if videohao_filter:
                videohao_filter.GetInvokePattern().Invoke()
                time.sleep(2.0)
                debug_snapshot(hwnd, "videohao_account_results")
            result = wait_account_result(root, keyword)

    if not result:
        raise RuntimeError(f"matching video account was not found: {keyword}")
    post_click_control(root, result)
    if not wait_profile_open(root, keyword):
        raise RuntimeError(f"matching video account profile did not open: {keyword}")
    debug_snapshot(hwnd, "profile_open")
    print("__AUTO_WECHAT_PROFILE_OPENED__")
    return True


def fallback_keyboard_open(keyword):
    time.sleep(0.8)
    ctrl_tap(VK_F)
    time.sleep(1.8)
    paste_keyword(keyword)
    tap(VK_RETURN, 0.15)
    time.sleep(4.0)
    tap(VK_RETURN, 0.15)
    time.sleep(5.0)
    print("__AUTO_WECHAT_KEYBOARD_DONE__")


def open_videohao(keyword, max_attempts=2):
    close_search_windows()
    hwnd = find_main_wechat_hwnd()
    if not hwnd:
        hwnd = find_wechat_hwnd()
    if not hwnd:
        hwnd = restore_wechat_from_running_process()
    hwnd = ensure_wechat_window_ready(hwnd)
    if not hwnd:
        print("__AUTO_WECHAT_NO_WINDOW__")
        for item_hwnd, class_name, title in enum_top_windows()[:40]:
            print(f"WINDOW hwnd={item_hwnd} class={class_name} title={title} path={get_process_path(item_hwnd)}")
        return 21

    print(f"__AUTO_WECHAT_WINDOW__:{hwnd}")
    print("__AUTO_WECHAT_WINDOWS__:" + json.dumps([
        {
            "hwnd": item["hwnd"],
            "class": item["class_name"],
            "title": item["title"],
            "rect": item["rect"],
            "path": item["path"],
        }
        for item in list_wechat_windows()
    ], ensure_ascii=False))

    try:
        last_error = None
        for attempt in range(max(1, int(max_attempts or 1))):
            try:
                hwnd = ensure_wechat_window_ready(hwnd)
                search_hwnd = open_search_from_main(hwnd, keyword)
                activate_window(search_hwnd)
                operate_search_window(search_hwnd, keyword)
                last_error = None
                break
            except Exception as exc:
                last_error = exc
                print(f"__AUTO_WECHAT_ATTEMPT_FAILED__:{attempt + 1}:{exc}")
                close_search_windows()
                if attempt + 1 < max(1, int(max_attempts or 1)):
                    hwnd = restore_wechat_from_running_process() or find_main_wechat_hwnd() or find_wechat_hwnd()
                    time.sleep(0.8)
        if last_error:
            raise last_error
    except Exception as exc:
        print(f"__AUTO_WECHAT_OPEN_FAILED__:{exc}")
        return 22

    try:
        resp = urllib.request.urlopen(
            "http://127.0.0.1:3000/api/videohao-local-proxy/status",
            timeout=5,
        )
        data = json.loads(resp.read())
        active = (data.get("data") or {}).get("activeAccount") or {}
        print(f"__AUTO_WECHAT_OK__:{active.get('nickname') or ''}")
    except Exception as exc:
        print(f"__AUTO_WECHAT_OK_STATUS_UNREADABLE__:{exc}")
    return 0


def check_wechat_status():
    hwnd = find_main_wechat_hwnd() or find_wechat_hwnd()
    if not hwnd:
        if has_blue_placeholder_windows():
            print("__AUTO_WECHAT_BLUE_WINDOW_STUCK__")
            return 23
        exe_path = find_wechat_executable_from_process()
        if exe_path:
            print(f"__AUTO_WECHAT_STATUS_PROCESS_ONLY__:{exe_path}")
            return 0
        print("__AUTO_WECHAT_NO_WINDOW__")
        return 21

    rect = get_rect(hwnd)
    if rect:
        width, height = rect_size(rect)
        if user32.IsIconic(hwnd):
            print(f"__AUTO_WECHAT_STATUS_MINIMIZED__:{hwnd}")
            return 0
        if width < 500 and height < 650:
            print("__AUTO_WECHAT_LOGIN_REQUIRED__")
            return 22

    print(f"__AUTO_WECHAT_STATUS_OK__:{hwnd}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print("__AUTO_WECHAT_OPEN_FAILED__")
        sys.exit(2)
    arg = sys.argv[1].strip()
    if arg == "__close_search_windows__":
        close_search_windows()
        sys.exit(0)
    if arg == "__cleanup_webviews__":
        cleanup_wechat_webview_processes()
        sys.exit(0)
    if arg == "__check_status__":
        sys.exit(check_wechat_status())
    if arg == "__preflight__":
        sys.exit(preflight_wechat_for_automation())
    max_attempts = 2
    if len(sys.argv) >= 3:
        try:
            max_attempts = max(1, min(3, int(sys.argv[2])))
        except ValueError:
            max_attempts = 2
    sys.exit(open_videohao(arg, max_attempts))
