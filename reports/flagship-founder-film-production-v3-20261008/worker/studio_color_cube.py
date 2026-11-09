"""Validate the exact browser-sampled RGB cube; never accept a client file path."""
import math


def write_color_cube(cube, destination):
    size, data = cube.get("size"), cube.get("data")
    if type(size) is not int or not 2 <= size <= 33 or not isinstance(data, list) or len(data) != size**3*3:
        raise ValueError("Invalid studio color cube dimensions")
    if any(type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1 for value in data):
        raise ValueError("Studio color cube contains invalid RGB values")
    with open(destination, "x", encoding="ascii") as file:
        file.write(f"LUT_3D_SIZE {size}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n")
        for index in range(0, len(data), 3):
            file.write(" ".join(f"{value:.7f}" for value in data[index:index+3])+"\n")
    return str(destination)
