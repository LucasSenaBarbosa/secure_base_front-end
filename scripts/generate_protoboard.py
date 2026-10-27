"""Protoboard MB-102 do kit KS5009, com ESP32, módulos e jumpers nomeados.

Malhas Wire_<id> e Mod_<id> são o contrato com src/three/Breadboard.tsx.
Unidades: centímetros. Y para cima, placa centrada na origem, face superior em y=0.
"""
import math
from pathlib import Path

import numpy as np
import trimesh

PITCH = 0.254
ZE = 0.17

BODY = [236, 237, 234, 255]
BODY_DARK = [206, 208, 204, 255]
HOLE = [36, 40, 46, 255]
RED = [198, 42, 48, 255]
BLUE = [32, 92, 196, 255]
BLACK = [22, 24, 28, 255]
GOLD = [214, 170, 62, 255]
PCB = [27, 46, 40, 255]
ESP = [18, 26, 34, 255]
SILVER = [176, 182, 188, 255]
WHITE = [236, 238, 236, 255]
YELLOW = [240, 196, 48, 255]
ORANGE = [232, 122, 42, 255]
V3 = [255, 156, 122, 255]

S = trimesh.Scene()


def z_term(row, side):
    return side * (ZE + row * PITCH)


def xcol(col):
    return (col - 31) * PITCH


Z_BLUE = z_term(4, 1) + 0.38
Z_RED = Z_BLUE + PITCH + 0.12


def add(mesh, name):
    S.add_geometry(mesh, node_name=name, geom_name=name)


def paint(mesh, color):
    mesh.visual.face_colors = color
    return mesh


def box(size, at, color):
    m = trimesh.creation.box(extents=size)
    m.apply_translation(at)
    return paint(m, color)


def cyl(r, h, at, color, axis="y", sections=8):
    m = trimesh.creation.cylinder(radius=r, height=h, sections=sections)
    if axis == "y":
        m.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, [1, 0, 0]))
    elif axis == "x":
        m.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, [0, 1, 0]))
    m.apply_translation(at)
    return paint(m, color)


def concat(parts):
    return trimesh.util.concatenate(parts)


def curve(a, b, lift, bulge=0.0, n=14):
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    mid = (a + b) / 2.0
    dist = float(np.linalg.norm(b - a))
    mid[1] += lift if lift is not None else min(2.5, 0.4 + dist * 0.2)
    mid[2] += bulge
    ts = np.linspace(0.0, 1.0, n)
    omt = 1.0 - ts
    return (omt ** 2)[:, None] * a + (2 * omt * ts)[:, None] * mid + (ts ** 2)[:, None] * b


def tube(points, radius, color):
    base = trimesh.creation.cylinder(radius=radius, height=1.0, sections=7)
    parts = []
    for a, b in zip(points[:-1], points[1:]):
        v = b - a
        h = float(np.linalg.norm(v))
        if h < 1e-4:
            continue
        m = base.copy()
        m.apply_scale([1.0, 1.0, h])
        m.apply_transform(trimesh.geometry.align_vectors([0, 0, 1], v / h))
        m.apply_translation((a + b) / 2.0)
        parts.append(m)
    if not parts:
        return None
    return paint(concat(parts), color)


WIRE_PARTS: dict[str, list] = {}
WIRE_COLOR: dict[str, list] = {}


def jumper(wire_id, color, start, end, lift=None, bulge=0.0):
    pts = curve(start, end, lift, bulge)
    mesh = tube(pts, 0.045, color)
    if mesh is None:
        return
    WIRE_COLOR[wire_id] = color
    WIRE_PARTS.setdefault(wire_id, []).append(mesh)


def esp_pin(i, side):
    return np.array([(i - 7) * PITCH, 0.22, z_term(0, side)])


def mod_pin(col, side, y=0.4):
    return np.array([xcol(col), y, z_term(4, side)])


def rail(x, which, side, y=0.12):
    z = Z_RED if which == "red" else Z_BLUE
    return np.array([x, y, side * z])


def build_board():
    span = xcol(62) - xcol(0)
    length = span + 0.9
    width = (Z_RED + 0.55) * 2
    add(box((length, 0.86, width), (0, -0.43, 0), BODY), "BB_Body")
    add(box((length * 0.94, 0.1, 0.2), (0, -0.04, 0), BODY_DARK), "BB_Trench")
    add(box((length * 0.9, 0.025, 0.09), (0, 0.012, Z_RED + 0.16), RED), "BB_StripeRedTop")
    add(box((length * 0.9, 0.025, 0.09), (0, 0.012, -Z_RED - 0.16), RED), "BB_StripeRedBottom")
    add(box((length * 0.9, 0.025, 0.09), (0, 0.012, Z_BLUE - 0.18), BLUE), "BB_StripeBlueTop")
    add(box((length * 0.9, 0.025, 0.09), (0, 0.012, -Z_BLUE + 0.18), BLUE), "BB_StripeBlueBottom")

    hole = trimesh.creation.cylinder(radius=0.055, height=0.04, sections=6)
    hole.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, [1, 0, 0]))
    holes = []
    for col in range(63):
        x = xcol(col)
        for side in (1, -1):
            for row in range(5):
                m = hole.copy()
                m.apply_translation((x, 0.02, z_term(row, side)))
                holes.append(m)
            for z in (side * Z_RED, side * Z_BLUE):
                m = hole.copy()
                m.apply_translation((x, 0.02, z))
                holes.append(m)
    add(paint(concat(holes), HOLE), "BB_Holes")


def build_esp32():
    parts = [
        box((4.55, 0.18, 2.15), (0, 0.14, 0), ESP),
        box((0.72, 0.22, 0.62), (2.45, 0.18, 0), SILVER),
        box((1.55, 0.1, 1.15), (0.15, 0.26, 0.05), [12, 14, 16, 255]),
        box((0.7, 0.04, 0.7), (0.15, 0.32, 0.05), SILVER),
    ]
    for i in range(15):
        x = (i - 7) * PITCH
        for side in (1, -1):
            parts.append(cyl(0.042, 0.32, (x, 0.02, z_term(0, side)), GOLD))
    add(concat(parts), "Mod_esp32")


def dress(kind, cx, zc, side):
    y = 0.28
    parts = []
    if kind == "led":
        parts.append(cyl(0.16, 0.16, (cx, y, zc), YELLOW, sections=12))
        parts.append(cyl(0.09, 0.08, (cx, y + 0.1, zc), [255, 236, 170, 255], sections=10))
    elif kind == "rgb":
        for dx in (-0.28, -0.09, 0.09, 0.28):
            parts.append(box((0.12, 0.06, 0.12), (cx + dx, y, zc), WHITE))
    elif kind in ("btnL", "btnR"):
        parts.append(cyl(0.2, 0.12, (cx, y, zc), YELLOW if kind == "btnL" else [64, 158, 214, 255], sections=14))
    elif kind == "pir":
        parts.append(cyl(0.22, 0.16, (cx, y, zc), WHITE, sections=14))
        parts.append(cyl(0.1, 0.08, (cx, y + 0.1, zc), [186, 196, 204, 255], sections=12))
    elif kind == "buzzer":
        parts.append(cyl(0.22, 0.1, (cx, y, zc), BLACK, sections=14))
        parts.append(cyl(0.08, 0.04, (cx, y + 0.06, zc), [70, 74, 78, 255], sections=10))
    elif kind == "dht":
        parts.append(box((0.42, 0.18, 0.28), (cx, y, zc), BLUE))
    elif kind == "steam":
        parts.append(box((0.55, 0.04, 0.36), (cx, y, zc), GOLD))
    elif kind == "gas":
        parts.append(cyl(0.2, 0.22, (cx, y, zc), SILVER, sections=12))
        parts.append(cyl(0.1, 0.08, (cx, y + 0.12, zc), [120, 90, 70, 255], sections=10))
    elif kind == "lcd":
        parts.append(box((1.15, 0.08, 0.48), (cx, y, zc), [24, 58, 150, 255]))
        parts.append(box((1.05, 0.03, 0.36), (cx, y + 0.05, zc), [170, 196, 255, 255]))
    elif kind == "rfid":
        for i, r in enumerate((0.28, 0.2, 0.12)):
            parts.append(cyl(r, 0.03, (cx, y + i * 0.02, zc), GOLD, sections=14))
    elif kind in ("door", "window"):
        parts.append(box((0.7, 0.28, 0.38), (cx, y, zc), BLACK))
        parts.append(box((0.34, 0.05, 0.1), (cx + 0.28 * side, y + 0.12, zc), WHITE))
    elif kind == "fan":
        parts.append(cyl(0.16, 0.12, (cx, y, zc), GOLD, sections=12))
        for ang in (0, 2.2, 4.2):
            blade = trimesh.creation.box(extents=(0.1, 0.03, 0.36))
            blade.apply_transform(trimesh.transformations.rotation_matrix(ang, [0, 1, 0]))
            blade.apply_translation((cx, y + 0.1, zc))
            parts.append(paint(blade, WHITE))
    return parts


def add_module(mid, kind, side, cols, supply, signals):
    """supply: 'v5' ou 'v3'. signals: (wire_id, index no cols, lado do header ESP, índice do pino, cor)."""
    cx = float(np.mean([xcol(c) for c in cols]))
    zc = side * z_term(2, 1)
    width = (cols[-1] - cols[0]) * PITCH + 0.7
    parts = [box((width, 0.1, 1.2), (cx, 0.16, zc), PCB)]
    for index, col in enumerate(cols):
        parts.append(cyl(0.04, 0.34, (xcol(col), 0.08, z_term(4, side)), GOLD))
        cap = BLACK if index == 0 else (RED if index == 1 else GOLD)
        parts.append(cyl(0.055, 0.05, (xcol(col), 0.28, z_term(4, side)), cap, sections=8))
    for wire_id, index, _esp_side, _esp_i, color in signals:
        col = cols[index]
        parts.append(cyl(0.06, 0.045, (xcol(col), 0.32, z_term(4, side)), color, sections=8))
    parts.extend(dress(kind, cx, zc + side * 0.12, side))
    add(concat(parts), f"Mod_{mid}")

    gnd = mod_pin(cols[0], side)
    vcc = mod_pin(cols[1], side)
    jumper("gnd", BLACK, gnd, rail(gnd[0], "blue", side), lift=0.45, bulge=0.0)
    if supply == "v5":
        jumper("v5", RED, vcc, rail(vcc[0], "red", side), lift=0.55, bulge=0.08 * side)
    else:
        jumper("v3", V3, vcc, esp_pin(0, 1), lift=1.15, bulge=0.25)
    for wire_id, index, esp_side, esp_i, color in signals:
        start = mod_pin(cols[index], side, y=0.46)
        end = esp_pin(esp_i, esp_side)
        end = end + np.array([0, 0.06, 0.05 * side])
        jumper(wire_id, color, start, end, bulge=0.15 * side)


def build_modules():
    # Cor de cada sinal — a mesma lista vive em src/sim/wiring.ts
    C = {
        "led": [245, 208, 48, 255],
        "rgb": [176, 132, 252, 255],
        "btnL": [96, 165, 250, 255],
        "btnR": [56, 189, 248, 255],
        "dht": [34, 211, 238, 255],
        "steam": [125, 211, 252, 255],
        "gas": [244, 63, 94, 255],
        "sda": [74, 222, 128, 255],
        "scl": [167, 139, 250, 255],
        "pir": [251, 113, 133, 255],
        "buzzer": [163, 230, 53, 255],
        "door": [251, 146, 60, 255],
        "window": [45, 212, 191, 255],
        "fanA": [244, 114, 182, 255],
        "fanB": [129, 140, 248, 255],
    }
    # lado +1 = faixa de cima. Pinos do módulo: 0 GND, 1 VCC, depois sinais.
    specs = [
        ("led", "led", 1, [2, 3, 4], "v5", [("led", 2, 1, 2, C["led"])]),
        ("rgb", "rgb", 1, [7, 8, 9], "v5", [("rgb", 2, 1, 3, C["rgb"])]),
        ("btnL", "btnL", 1, [12, 13, 14], "v5", [("btnL", 2, 1, 4, C["btnL"])]),
        ("btnR", "btnR", 1, [17, 18, 19], "v5", [("btnR", 2, 1, 5, C["btnR"])]),
        ("dht", "dht", 1, [42, 43, 44], "v3", [("dht", 2, 1, 8, C["dht"])]),
        ("steam", "steam", 1, [47, 48, 49], "v5", [("steam", 2, 1, 9, C["steam"])]),
        ("gas", "gas", 1, [52, 53, 54, 55], "v5", [("gas", 2, 1, 10, C["gas"])]),
        ("lcd", "lcd", 1, [58, 59, 60, 61], "v5", [("sda", 2, 1, 11, C["sda"]), ("scl", 3, 1, 12, C["scl"])]),
        ("pir", "pir", -1, [2, 3, 4], "v5", [("pir", 2, -1, 1, C["pir"])]),
        ("buzzer", "buzzer", -1, [8, 9, 10], "v5", [("buzzer", 2, -1, 2, C["buzzer"])]),
        ("door", "door", -1, [14, 15, 16], "v5", [("door", 2, -1, 3, C["door"])]),
        ("window", "window", -1, [42, 43, 44], "v5", [("window", 2, -1, 10, C["window"])]),
        ("fan", "fan", -1, [48, 49, 50, 51], "v5", [("fanA", 2, -1, 11, C["fanA"]), ("fanB", 3, -1, 12, C["fanB"])]),
        ("rfid", "rfid", -1, [56, 57, 58, 59], "v5", [("sda", 2, 1, 11, C["sda"]), ("scl", 3, 1, 12, C["scl"])]),
    ]
    for spec in specs:
        add_module(*spec)


def build_power():
    # 5 V do ESP32 (pino 13, header de cima) e da bateria para os dois trilhos vermelhos.
    jumper("v5", RED, esp_pin(13, 1), rail(xcol(48), "red", -1), lift=1.3, bulge=-0.2)
    jumper("v5", RED, rail(xcol(8), "red", 1), rail(xcol(8), "red", -1), lift=1.6, bulge=0.0)
    # GND comum: header, os dois trilhos azuis.
    jumper("gnd", BLACK, esp_pin(1, 1), rail(xcol(20), "blue", 1), lift=0.7)
    jumper("gnd", BLACK, esp_pin(0, -1), rail(xcol(20), "blue", -1), lift=0.7)
    jumper("gnd", BLACK, rail(xcol(54), "blue", 1), rail(xcol(54), "blue", -1), lift=1.35)
    # 3V3 fica disponível no pino 0 — o DHT já puxa esse fio em add_module.
    # Bateria 6×AA ao lado da placa, no 5 V e no GND.
    bx, bz = -9.15, 0.0
    holder = [
        box((2.3, 0.7, 1.35), (bx, 0.35, bz), BLACK),
    ]
    for i, dx in enumerate((-0.75, -0.25, 0.25, 0.75)):
        holder.append(cyl(0.16, 0.85, (bx + dx, 0.55, bz - 0.22), [196, 162, 54, 255], axis="z", sections=10))
        holder.append(cyl(0.16, 0.85, (bx + dx, 0.55, bz + 0.22), [196, 162, 54, 255], axis="z", sections=10))
    add(concat(holder), "Mod_battery")
    plus = np.array([bx + 1.05, 0.55, bz])
    minus = np.array([bx + 1.05, 0.4, bz + 0.35])
    jumper("v5", RED, plus, rail(xcol(0), "red", -1), lift=0.9)
    jumper("gnd", BLACK, minus, rail(xcol(0), "blue", -1), lift=0.7)


def main():
    build_board()
    build_esp32()
    build_modules()
    build_power()
    for wire_id, parts in WIRE_PARTS.items():
        add(concat(parts), f"Wire_{wire_id}")
    out = Path(__file__).resolve().parents[1] / "public" / "models" / "protoboard.glb"
    S.export(out)
    print(out, round(out.stat().st_size / 1024), "KB", len(S.geometry), "meshes")
    print("Z_RED", round(Z_RED, 3), "Z_BLUE", round(Z_BLUE, 3), "row", round(z_term(4, 1), 3))


if __name__ == "__main__":
    main()
