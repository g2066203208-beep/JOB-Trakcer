# -*- coding: utf-8 -*-
"""
Abaqus ODB -> CAE Studio deformable field .cae.json.

Run inside an Abaqus Python environment (NOT ordinary CPython):
    abaqus python abaqus_odb_export.py --odb model.odb --out model.cae.json --step Step-1 --max-frames 12 --length-unit mm --stress-unit MPa

Alternative in Abaqus/CAE:
    abaqus cae noGUI=abaqus_odb_export.py -- --odb model.odb --out model.cae.json

Uses surface faces of a subset of common continuum, 2D and shell elements.
First-order corner-node visualization is used for higher-order elements.
Beam, cohesive, polyhedral, special elements and internal surfaces are not represented.
Not validated on the user's installed Abaqus version or actual ODB.
"""
from __future__ import print_function
import argparse
import json
import math
import os
import sys
from collections import defaultdict

from odbAccess import openOdb
from abaqusConstants import NODAL, ELEMENT_NODAL

# Corner-node face definitions, in Abaqus element connectivity order.
HEX = ((0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4),
       (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7))
TET = ((0, 2, 1), (0, 1, 3), (1, 2, 3), (2, 0, 3))
WEDGE = ((0, 1, 2), (3, 5, 4), (0, 1, 4, 3),
         (1, 2, 5, 4), (2, 0, 3, 5))


def faces_for_element(elem):
    typ = elem.type.upper()
    if typ.startswith('C3D8') or typ.startswith('C3D20'):
        return HEX
    if typ.startswith('C3D4') or typ.startswith('C3D10'):
        return TET
    if typ.startswith('C3D6') or typ.startswith('C3D15'):
        return WEDGE
    if typ.startswith(('S4', 'CPS4', 'CPE4', 'CAX4')):
        return ((0, 1, 2, 3),)
    if typ.startswith(('S3', 'CPS3', 'CPE3', 'CAX3')):
        return ((0, 1, 2),)
    return ()


def select_frame_indices(n, max_frames):
    if n <= max_frames:
        return list(range(n))
    return sorted(set(int(round(float(i)*(n-1)/float(max_frames-1)))
                      for i in range(max_frames)))


def get_args():
    argv = sys.argv[1:]
    if '--' in argv:
        argv = argv[argv.index('--')+1:]
    p = argparse.ArgumentParser(description='Export Abaqus ODB surface field to CAE Studio')
    p.add_argument('--odb', required=True)
    p.add_argument('--out', default='abaqus_result.cae.json')
    p.add_argument('--step', default='', help='ODB step name; defaults to last available step')
    p.add_argument('--max-frames', default=16, type=int)
    p.add_argument('--length-unit', default='', help='Verified length unit, e.g. mm')
    p.add_argument('--stress-unit', default='', help='Verified stress unit, e.g. MPa')
    args = p.parse_args(argv)
    if args.max_frames < 1:
        p.error('--max-frames must be positive')
    return args


def main():
    args = get_args()
    odb = openOdb(path=args.odb, readOnly=True)
    try:
        if not odb.steps:
            raise RuntimeError('ODB contains no analysis steps')
        stepname = args.step or list(odb.steps.keys())[-1]
        if stepname not in odb.steps:
            raise RuntimeError('Requested step not found: ' + stepname)
        step = odb.steps[stepname]
        if not step.frames:
            raise RuntimeError('No frames in ODB step: ' + stepname)

        # Build visible outer surface using element corner-node connectivity.
        face_count = defaultdict(int)
        face_representative = {}
        unsupported = set()
        node_coords = {}
        for inst in odb.rootAssembly.instances.values():
            for node in inst.nodes:
                node_coords[(inst.name, node.label)] = (list(node.coordinates[:3])+[0.0, 0.0, 0.0])[:3]
            for elem in inst.elements:
                faces = faces_for_element(elem)
                if not faces:
                    unsupported.add(elem.type)
                    continue
                conn = elem.connectivity
                for face in faces:
                    if max(face) >= len(conn):
                        continue
                    keys = tuple((inst.name, int(conn[i])) for i in face)
                    signature = tuple(sorted(keys))
                    face_count[signature] += 1
                    face_representative[signature] = keys
        if unsupported:
            print('WARNING: Unsupported element types not displayed: {}'.format(', '.join(sorted(unsupported))))
        visible_faces = [face_representative[k] for k, count in face_count.items() if count == 1]
        if not visible_faces:
            raise RuntimeError('No supported exterior surface faces. Try a supported 3D or shell mesh.')
        node_map = {}
        surface_nodes = []
        triangles = []
        for face in visible_faces:
            ids = []
            for key in face:
                if key not in node_map:
                    if key not in node_coords:
                        raise RuntimeError('Connectivity references unknown node: {}'.format(key))
                    node_map[key] = len(surface_nodes)
                    surface_nodes.append(key)
                ids.append(node_map[key])
            if len(ids) == 3:
                triangles.append(ids)
            elif len(ids) == 4:
                triangles.extend(((ids[0], ids[1], ids[2]), (ids[0], ids[2], ids[3])))

        if args.max_frames == 1:
            selected = [len(step.frames)-1]
        else:
            selected = select_frame_indices(len(step.frames), args.max_frames)
        frames = []
        for fi in selected:
            fr = step.frames[fi]
            if 'U' not in fr.fieldOutputs:
                raise RuntimeError('Missing nodal U field in frame {}'.format(fi))
            displacement = {}
            for value in fr.fieldOutputs['U'].getSubset(position=NODAL).values:
                if not hasattr(value, 'nodeLabel'):
                    continue
                key = (value.instance.name, value.nodeLabel)
                if key in node_map:
                    d = list(value.data)
                    displacement[key] = [float(d[0]), float(d[1]), float(d[2] if len(d)>2 else 0.0)]
            missing = [key for key in surface_nodes if key not in displacement]
            if missing:
                raise RuntimeError('Displacement missing for {} surface nodes in frame {}'.format(len(missing), fi))
            scalars = {}
            if 'S' in fr.fieldOutputs:
                stress_field = fr.fieldOutputs['S']
                stress_values = []
                source = ''
                try:
                    vals = stress_field.getSubset(position=NODAL).values
                    if vals:
                        stress_values = vals
                        source = 'NODAL'
                except Exception:
                    pass
                if not stress_values:
                    try:
                        stress_values = stress_field.getSubset(position=ELEMENT_NODAL).values
                        source = 'ELEMENT_NODAL'
                    except Exception as ex:
                        print('WARNING: Unable to obtain Mises at frame {}: {}'.format(fi, ex))
                # ELEMENT_NODAL contains multiple extrapolated values at a node.
                # The max is an explicit *nodal envelope*, not the Abaqus GUI averaged contour.
                by_node = {}
                for value in stress_values:
                    if not hasattr(value, 'nodeLabel'):
                        continue
                    key = (value.instance.name, value.nodeLabel)
                    if key not in node_map:
                        continue
                    try:
                        mises = float(value.mises)
                    except Exception:
                        continue
                    if not (math.isnan(mises) or math.isinf(mises)):
                        by_node[key] = max(by_node.get(key, mises), mises)
                if by_node:
                    name = 'S, Mises' if source == 'NODAL' else 'S, Mises (nodal max)'
                    scalars[name] = [by_node.get(key, None) for key in surface_nodes]
            frames.append({
                'label': '{} / Frame {}'.format(stepname, fi),
                'time': float(fr.frameValue),
                'displacement': [displacement[key] for key in surface_nodes],
                'scalars': scalars
            })
            print('  processed frame {} / {}'.format(fi+1, len(step.frames)))

        result = {
            'format': 'cae-field-v1',
            'source': 'Abaqus / ODB',
            'source_file': os.path.basename(args.odb),
            'geometry': 'linear corner-node exterior surfaces only',
            'nodal_stress_note': 'NODAL uses stored nodal results; ELEMENT_NODAL uses max extrapolated nodal envelope, NOT the official averaged contour. Validate before publishing.',
            'units': {
                'U, Magnitude': args.length_unit,
                'S, Mises': args.stress_unit,
                'S, Mises (nodal max)': args.stress_unit
            },
            'nodes': [node_coords[key] for key in surface_nodes],
            'triangles': triangles,
            'frames': frames
        }
        with open(args.out, 'w') as stream:
            json.dump(result, stream, ensure_ascii=True, separators=(',', ':'), allow_nan=False)
        print('Saved: {}'.format(os.path.abspath(args.out)))
        print('Check nodal stress envelope, element types, units and time values against Abaqus/Viewer.')
    finally:
        odb.close()


if __name__ == '__main__':
    main()
