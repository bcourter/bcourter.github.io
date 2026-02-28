# Geodesic Distance from Mesh
# targets input takes indices, not points.
# Created by Claude Opus 4.6 with prompts from Blake Courter
# License: MIT

import numpy as np
import potpourri3d as pp3d
import Rhino.Geometry as rg
import Rhino
import System

def get_mesh(obj):
    if isinstance(obj, rg.Mesh):
        return obj
    if isinstance(obj, Rhino.DocObjects.ObjRef):
        return obj.Mesh()
    if isinstance(obj, System.Guid):
        robj = Rhino.RhinoDoc.ActiveDoc.Objects.FindId(obj)
        return robj.Geometry if robj else None
    return None

def mesh_to_numpy(mesh):
    tri = mesh.DuplicateMesh()
    tri.Faces.ConvertQuadsToTriangles()
    verts = np.array([[v.X, v.Y, v.Z] for v in tri.Vertices], dtype=np.float64)
    faces = np.array([[tri.Faces[i].A, tri.Faces[i].B, tri.Faces[i].C]
                      for i in range(tri.Faces.Count)], dtype=np.int32)
    return verts, faces

def flatten(x):
    if hasattr(x, '__iter__') and not isinstance(x, (str, int, float)):
        for item in x:
            yield from flatten(item)
    else:
        yield x

resolved = get_mesh(mesh)
if resolved is None:
    raise Exception("Could not resolve mesh geometry")

verts, faces = mesh_to_numpy(resolved)
solver = pp3d.MeshHeatMethodDistanceSolver(verts, faces)

target_set = list(flatten(targets))
distances = solver.compute_distance_multisource(target_set).tolist()
