#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Export real structural RST results to cae-field-v1 (no solver execution).

--length-unit/--stress-unit are OUTPUT units: coordinates and values are converted
from DPF field units, never merely relabelled. Omit to preserve the native units.
Validated with PyDPF 0.9.0 / DPF 8.2 / PyVista 0.44.2 on real local transient
solid and modal mixed-mesh RST files. This is not a Mechanical GUI equivalence claim.
Set DPF_SERVER_TYPE=LEGACYGRPC if the installed in-process DPF runtime is incompatible.
"""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

import numpy as np
from ansys.dpf import core as dpf

EXPORTER_VERSION = "1.1"
LENGTH = {"m": 1.0, "mm": 1e-3, "cm": 1e-2, "um": 1e-6, "in": 0.0254, "ft": 0.3048}
STRESS = {"Pa": 1.0, "kPa": 1e3, "MPa": 1e6, "GPa": 1e9, "psi": 6894.757293168, "ksi": 6894757.293168}


def conversion(source, target, table):
    source = str(source or "").strip()
    target = target or source
    if source not in table or target not in table:
        raise ValueError("Unverified unit conversion {!r} -> {!r}; supported: {}".format(source, target, ", ".join(table)))
    return table[source] / table[target], target


def field_by_id(field, components):
    ids = [int(i) for i in field.scoping.ids]
    values = np.asarray(field.data, dtype=np.float64)
    if str(field.location) != "Nodal" or len(set(ids)) != len(ids):
        raise ValueError("Expected a uniquely scoped nodal field")
    if values.size != len(ids) * components or int(field.component_count) != components:
        raise ValueError("Field includes multiple layers/entities or unexpected components; refusing to flatten it")
    if str(field.shell_layers).split(".")[-1].lower() not in ("nonelayer", "layerindependent"):
        raise ValueError("Unresolved shell-layer field; explicit shell-layer export is not supported")
    values = values.reshape(len(ids), components)
    if not np.isfinite(values).all():
        raise ValueError("Non-finite result values")
    return dict(zip(ids, values))


def one_field(fc, set_id):
    if "complex" in fc.labels:
        raise ValueError("Complex fields require an explicit phase convention; export is not supported")
    if len(fc) != 1:
        raise ValueError("Expected one field for set {}; got {} (split bodies/layers are not implicitly merged)".format(set_id, len(fc)))
    label = {key: int(value) for key, value in fc.get_label_space(0).items()}
    if label != {"time": set_id}:
        raise ValueError("Ambiguous result labels for set {}: {}".format(set_id, label))
    return fc[0], label


def time_records(support):
    # DPF scoping contains LOAD STEP IDs, not cumulative set IDs. A single modal
    # load step can contain ten frequencies under one time_frequencies scoping ID.
    field = support.time_frequencies
    records = []
    for step in field.scoping.ids:
        for substep, value in enumerate(np.asarray(field.get_entity_data_by_id(int(step))).reshape(-1), 1):
            records.append({"set_id": len(records) + 1, "load_step": int(step), "substep": substep, "value": float(value)})
    if len(records) != support.n_sets or not all(np.isfinite(r["value"]) for r in records):
        raise ValueError("Time/frequency support cannot be mapped unambiguously to cumulative result sets")
    return records


def file_hash(path):
    digest = hashlib.sha256()
    with open(path, "rb") as fp:
        for chunk in iter(lambda: fp.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("rst", help="Solved structural .rst; distributed files need a complete merged result")
    p.add_argument("--out", default="ansys_result.cae.json")
    p.add_argument("--max-frames", type=int, default=20)
    p.add_argument("--sets", type=int, nargs="+", help="Explicit cumulative result-set IDs (one-based)")
    p.add_argument("--length-unit", default="", choices=[""] + list(LENGTH), help="Output coordinate AND displacement unit; values are converted")
    p.add_argument("--stress-unit", default="", choices=[""] + list(STRESS), help="Output stress unit; values are converted")
    p.add_argument("--require-stress", action="store_true", help="Fail if an unambiguous nodal stress field cannot be exported")
    args = p.parse_args()
    if not os.path.isfile(args.rst):
        p.error("RST file not found")
    if not 1 <= args.max_frames <= 150:
        p.error("max-frames must be between 1 and 150")
    path = os.path.abspath(args.rst)
    if os.path.normcase(os.path.abspath(args.out)) == os.path.normcase(path):
        p.error("Output must not overwrite the source RST")
    partition = re.fullmatch(r"(.*?)(\d+)\.rst", os.path.basename(path), re.IGNORECASE)
    if partition:
        siblings = [n for n in os.listdir(os.path.dirname(path))
                    if re.fullmatch(re.escape(partition.group(1)) + r"\d+\.rst", n, re.IGNORECASE)]
        if len(siblings) > 1:
            p.error("Possible distributed RST partitions detected; export a merged result, not a single partition")
    source_stat = os.stat(path)
    print("Reading real results:", path, flush=True)
    model = dpf.Model(path)
    info = model.metadata.result_info
    analysis_type = str(info.analysis_type).lower()
    if info.has_cyclic:
        raise ValueError("Cyclic expansion is not implemented; refusing to export an implicit sector")
    if analysis_type not in ("static", "transient", "modal"):
        raise ValueError("Unsupported analysis type: {} (complex/harmonic fields need explicit phase handling)".format(analysis_type))
    domain = "frequency" if analysis_type == "modal" else "time"
    axis_unit = str(model.metadata.time_freq_support.time_frequencies.unit)
    if axis_unit != ("Hz" if domain == "frequency" else "s"):
        raise ValueError("Unexpected {} axis unit: {}".format(domain, axis_unit))
    records = time_records(model.metadata.time_freq_support)
    if args.sets:
        set_ids = sorted(set(args.sets))
        if min(set_ids) < 1 or max(set_ids) > len(records) or len(set_ids) > 150:
            p.error("sets must refer to 1..{} (at most 150 selections)".format(len(records)))
    else:
        set_ids = sorted(set(int(i) + 1 for i in np.linspace(0, len(records) - 1, min(len(records), args.max_frames))))

    mesh = model.metadata.meshed_region
    node_ids = np.asarray(mesh.nodes.scoping.ids, dtype=np.int64)
    coord_field = mesh.nodes.coordinates_field
    nodal_coords = np.asarray(coord_field.data, dtype=np.float64)
    length_factor, length_unit = conversion(coord_field.unit, args.length_unit, LENGTH)
    grid = mesh.grid
    if len(node_ids) != len(grid.points) or not np.allclose(np.asarray(grid.points), nodal_coords, rtol=1e-8, atol=1e-10):
        raise ValueError("DPF/VTK node ordering mismatch; no guessed mapping is allowed")
    surface = grid.extract_surface(pass_pointid=True, nonlinear_subdivision=0).triangulate()
    if "vtkOriginalPointIds" not in surface.point_data:
        raise ValueError("PyVista did not preserve full-mesh point IDs")
    orig = np.asarray(surface.point_data["vtkOriginalPointIds"], dtype=np.int64)
    points = np.asarray(surface.points, dtype=np.float64)
    if len(orig) != len(points) or np.any(orig < 0) or np.any(orig >= len(node_ids)):
        raise ValueError("Invalid original point mapping")
    if not np.allclose(points, nodal_coords[orig], rtol=1e-8, atol=1e-10):
        raise ValueError("Surface coordinates do not match mapped solver nodes")
    faces = np.asarray(surface.faces, dtype=np.int64)
    if faces.size == 0 or faces.size % 4 or not np.all(faces.reshape(-1, 4)[:, 0] == 3):
        raise ValueError("No valid triangular surface")
    triangles = faces.reshape(-1, 4)[:, 1:4]
    if triangles.min() < 0 or triangles.max() >= len(points) or not np.isfinite(points).all():
        raise ValueError("Invalid surface geometry")
    node_labels = node_ids[orig]
    if len(points) > 350000 or len(triangles) > 750000:
        raise ValueError("Surface exceeds browser limits; export a smaller region")

    warnings = []
    available = [r.name for r in info.available_results]
    if "displacement" not in available:
        raise ValueError("RST does not contain displacement")
    stress_available = "stress" in available
    if not stress_available:
        warnings.append("RST does not store stress; no stress values were created.")
    if stress_available and mesh.elements.has_shell_elements:
        stress_available = False
        warnings.append("Mesh contains shell/surface elements; stress omitted because shell layers/body averaging are not resolved by this exporter.")
    if args.require_stress and not stress_available:
        raise ValueError("Unambiguous stress unavailable: " + " ".join(warnings))
    if surface.n_lines or surface.n_verts:
        warnings.append("Line/point cells are not rendered as beam/point glyphs by the surface viewer.")
    if domain == "frequency":
        warnings.append("Modal displacement is an eigenvector with solver normalization, not physical response amplitude. Frames are separate modes, not a time history.")
    frames = []
    stress_unit = None
    for set_id in set_ids:
        record = records[set_id - 1]
        u_fc = model.results.displacement.on_time_scoping([set_id]).eval()
        u, label_space = one_field(u_fc, set_id)
        displacement = field_by_id(u, 3)
        missing = [int(nid) for nid in node_labels if int(nid) not in displacement]
        if missing:
            raise ValueError("Displacement missing at {} surface nodes: {}".format(len(missing), missing[:10]))
        u_factor, _ = conversion(u.unit, length_unit, LENGTH)
        vectors = np.asarray([displacement[int(nid)] for nid in node_labels]) * u_factor
        scalar = {}
        stats = {"U, Magnitude": {"min": float(np.linalg.norm(vectors, axis=1).min()), "max": float(np.linalg.norm(vectors, axis=1).max())}}
        source_units = {"coordinates": str(coord_field.unit), "displacement": str(u.unit)}
        if stress_available:
            # Invariant AFTER tensor nodal averaging; not averaged elemental Mises.
            s_fc = model.results.stress.on_location(dpf.locations.nodal).on_time_scoping([set_id]).eval()
            s, _ = one_field(s_fc, set_id)
            field_by_id(s, 6)
            mises_fc = dpf.operators.invariant.von_mises_eqv_fc(s_fc).eval()
            mises, _ = one_field(mises_fc, set_id)
            by_node = field_by_id(mises, 1)
            s_factor, frame_stress_unit = conversion(s.unit, args.stress_unit, STRESS)
            if stress_unit is not None and stress_unit != frame_stress_unit:
                raise ValueError("Stress units changed between frames")
            stress_unit = frame_stress_unit
            values = [float(by_node[int(nid)][0] * s_factor) if int(nid) in by_node else None for nid in node_labels]
            finite = [v for v in values if v is not None]
            if not finite:
                raise ValueError("Stress exists but no exported surface node has stress")
            scalar["S, Mises"] = values
            stats["S, Mises"] = {"min": min(finite), "max": max(finite), "missing_nodes": len(values) - len(finite)}
            source_units["stress"] = str(s.unit)
        frame = {"label": "{} {} | {} {:.9g} {}".format("Mode" if domain == "frequency" else "Set", set_id, domain, record["value"], axis_unit),
                 "result_set_id": set_id, "load_step": record["load_step"], "substep": record["substep"],
                 "label_space": label_space, domain: record["value"], "axis_unit": axis_unit,
                 "displacement": vectors.tolist(), "scalars": scalar, "statistics": stats, "source_units": source_units}
        if domain == "frequency":
            frame["mode"] = set_id
        frames.append(frame)
        print("Exported", frame["label"], stats, flush=True)

    units = {"coordinates": length_unit, "U, Magnitude": length_unit}
    if stress_unit:
        units["S, Mises"] = stress_unit
    result = {
        "format": "cae-field-v1", "source": "ANSYS Mechanical / DPF", "source_file": os.path.basename(path),
        "time": {"kind": "modal" if domain == "frequency" else "time", "unit": axis_unit},
        "geometry": "linearized outer surface; interior elements and beam/point glyphs not rendered",
        "coordinate_system": "global Cartesian",
        "nodal_stress_note": "von Mises of DPF averaged nodal stress tensor; NOT averaging elemental von Mises; shell layers unsupported",
        "analysis": {"type": analysis_type, "domain": domain, "axis_unit": axis_unit,
                     "animation_kind": "mode_sequence" if domain == "frequency" else "result_sequence",
                     "displacement_interpretation": "normalized eigenvector" if domain == "frequency" else "structural displacement",
                     "total_sets": len(records), "exported_set_ids": set_ids},
        "provenance": {"exporter": "ansys_rst_export.py", "exporter_version": EXPORTER_VERSION,
                       "exported_at_utc": datetime.now(timezone.utc).isoformat(), "source_sha256": file_hash(path),
                       "source_size_bytes": source_stat.st_size, "source_mtime_ns": source_stat.st_mtime_ns,
                       "pydpf_version": dpf.__version__, "dpf_server_version": str(model._server.version),
                       "solver_unit_system": str(info.unit_system), "available_results": available},
        "validation": {"status": "export_checks_passed_native_comparison_pending", "node_mapping_checked": True, "set_labels_checked": True, "units_converted": True,
                       "native_gui_comparison": "not_performed"},
        "warnings": warnings, "units": units, "node_labels": node_labels.tolist(),
        "nodes": (points * length_factor).tolist(), "triangles": triangles.tolist(), "frames": frames,
    }
    result["source_sha256"] = result["provenance"]["source_sha256"]
    if os.stat(path).st_mtime_ns != source_stat.st_mtime_ns or os.stat(path).st_size != source_stat.st_size:
        raise ValueError("Source RST changed during export; refusing mixed-state results")
    with open(args.out, "w", encoding="utf-8") as fp:
        json.dump(result, fp, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print("Wrote:", os.path.abspath(args.out), flush=True)
    for warning in warnings:
        print("WARNING:", warning, file=sys.stderr)


if __name__ == "__main__":
    main()
