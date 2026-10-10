#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ANSYS Mechanical .rst -> CAE Studio deformable contour .cae.json
Run with a Python environment that has ansys-dpf-core, pyvista, numpy and a compatible DPF service:
    python ansys_rst_export.py file.rst --out ansys_result.cae.json --max-frames 12 --length-unit mm --stress-unit MPa

THIS SCRIPT REQUIRES A REAL .rst FILE AND HAS NOT BEEN TESTED IN THE USER'S ANSYS INSTALLATION.
Exports linearized outer surface and nodal displacement/averaged nodal von Mises stress.
Supports structural DPF result files, not arbitrary .rth, CFD or electromagnetics.
"""
import argparse
import json
import os
import sys

import numpy as np
from ansys.dpf import core as dpf


def float_vec3(row):
    return [float(row[0]), float(row[1]), float(row[2])]


def field_by_id(field):
    values = np.asarray(field.data)
    if len(values.shape) == 1:
        return {int(i): float(v) for i, v in zip(field.scoping.ids, values)}
    return {int(i): [float(x) for x in v] for i, v in zip(field.scoping.ids, values)}


def main():
    p = argparse.ArgumentParser(description="Convert ANSYS .rst into CAE Studio mesh and result fields")
    p.add_argument("rst", help="Solved Mechanical structural result file (.rst)")
    p.add_argument("--out", default="ansys_result.cae.json")
    p.add_argument("--max-frames", type=int, default=20, help="Max time/frequency sets to export")
    p.add_argument("--length-unit", default="", help="Model length unit exactly as used by solver")
    p.add_argument("--stress-unit", default="", help="Stress unit exactly as used by solver")
    args = p.parse_args()
    if not os.path.isfile(args.rst):
        p.error("RST file not found: {}".format(args.rst))
    if args.max_frames < 1:
        p.error("max-frames must be positive")

    print("Reading results:", args.rst)
    model = dpf.Model(os.path.abspath(args.rst))
    mesh = model.metadata.meshed_region
    node_ids = np.asarray(mesh.nodes.scoping.ids, dtype=np.int64)
    nodal_coords = np.asarray(mesh.nodes.coordinates_field.data, dtype=np.float64)
    grid = mesh.grid  # PyVista unstructured grid, official DPF API.

    # PyVista preserves full-grid point IDs when extracting outer faces.
    surface = grid.extract_surface(pass_pointid=True, nonlinear_subdivision=0).triangulate()
    if "vtkOriginalPointIds" not in surface.point_data:
        raise RuntimeError("PyVista did not preserve original full-mesh point IDs")
    orig = np.asarray(surface.point_data["vtkOriginalPointIds"], dtype=np.int64)
    points = np.asarray(surface.points, dtype=np.float64)
    if len(node_ids) != len(grid.points):
        raise RuntimeError("DPF and VTK mesh have different point counts; verify mapping manually.")
    if not np.allclose(np.asarray(grid.points), nodal_coords, rtol=1e-8, atol=1e-9):
        # Do not guess original point-to-solver node ID alignment.
        raise RuntimeError("VTK point order differs from DPF node order. Export aborted to prevent false node fields.")

    node_labels = node_ids[orig]
    faces = np.asarray(surface.faces, dtype=np.int64).reshape(-1, 4)
    if not np.all(faces[:, 0] == 3):
        raise RuntimeError("Unexpected non-triangular face in surface mesh")
    triangles = faces[:, 1:4].astype(int).tolist()
    print("Outer surface: {} nodes, {} triangles".format(len(points), len(triangles)))

    displacement_fc = model.results.displacement.on_all_time_freqs.eval()
    n_frames = len(displacement_fc)
    if not n_frames:
        raise RuntimeError("No displacement field in RST")
    chosen = sorted(set(int(x) for x in np.linspace(0, n_frames - 1, min(n_frames, args.max_frames))))
    print("Available displacement sets: {}. Selected indices: {}".format(n_frames, chosen))

    # Request nodal stress, then von Mises invariant, to match exported display location.
    # DPF nodal averaging and midside availability are solver/version dependent.
    mises_fc = None
    try:
        stress_fc = model.results.stress.on_location(dpf.locations.nodal).on_all_time_freqs.eval()
        mises_fc = dpf.operators.invariant.von_mises_eqv_fc(stress_fc).eval()
        if len(mises_fc) != n_frames:
            raise RuntimeError("Mises result set count differs from displacement result")
    except Exception as exc:
        print("WARNING: nodal Mises stress unavailable: {}".format(exc), file=sys.stderr)
        print("Output will contain displacement, but no stress field.", file=sys.stderr)
        mises_fc = None

    times = []
    try:
        times = [float(v) for v in model.metadata.time_freq_support.time_frequencies.data]
    except Exception:
        pass

    frames = []
    for idx in chosen:
        displacement = field_by_id(displacement_fc[idx])
        missing = [int(nid) for nid in node_labels if int(nid) not in displacement]
        if missing:
            raise RuntimeError("Displacement missing at {} outer-surface nodes; first IDs: {}".format(len(missing), missing[:10]))
        vectors = [float_vec3(displacement[int(nid)]) for nid in node_labels]
        scalar = {}
        if mises_fc is not None:
            by_node = field_by_id(mises_fc[idx])
            values = [by_node.get(int(nid), None) for nid in node_labels]
            # Unavailable stress nodes are marked null, NOT silently set to zero.
            if any(v is not None for v in values):
                scalar["S, Mises"] = values
        frame = {
            "label": "Result set {}".format(idx + 1),
            "displacement": vectors,
            "scalars": scalar,
        }
        if idx < len(times):
            frame["time"] = times[idx]
        frames.append(frame)
        print("  exported set {}".format(idx + 1))

    result = {
        "format": "cae-field-v1",
        "source": "ANSYS Mechanical / DPF",
        "source_file": os.path.basename(args.rst),
        "geometry": "linearly interpolated outer surface; interior elements not included",
        "nodal_stress_note": "DPF nodal von Mises can reflect averaging/extrapolation; shell layers and discontinuities require separate review.",
        "units": {
            "U, Magnitude": args.length_unit,
            "S, Mises": args.stress_unit
        },
        "nodes": points.tolist(),
        "triangles": triangles,
        "frames": frames
    }
    with open(args.out, "w", encoding="utf-8") as fp:
        json.dump(result, fp, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print("Wrote:", os.path.abspath(args.out))
    print("Validate units, nodal stress averaging, and step mapping against ANSYS before publishing.")


if __name__ == "__main__":
    main()
