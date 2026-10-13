// BAARALI(13/10/2026): CAD runs in a bounded Python process on the
// account's instance. Resource limits are not a sandbox for trusted Work code.
export const CAD_WORKER = String.raw`
import contextlib, io, json, pathlib, sys
folder = pathlib.Path(sys.argv[1])
try:
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (35, 40))
except (ImportError, ValueError, OSError):
    pass
try:
    import cadquery as cq
except ImportError:
    print(json.dumps({"ok": False, "code": "cadquery_unavailable", "message": "CadQuery is not installed on this instance."}))
    sys.exit(0)
if len(sys.argv) > 2 and sys.argv[2] == "health":
    print(json.dumps({"ok": True, "version": getattr(cq, "__version__", "unknown")}))
    sys.exit(0)
try:
    job = json.loads((folder / "job.json").read_text())
    scope = {"__name__": "__main__", "__file__": str(folder / "model.py"), "cq": cq, "parameters": job["parameters"]}
    class Quiet(io.TextIOBase):
        def write(self, s): return len(s)
    with contextlib.redirect_stdout(Quiet()), contextlib.redirect_stderr(Quiet()):
        exec(compile(job["source"], scope["__file__"], "exec"), scope)
        result = scope.get("result")
        if isinstance(result, cq.Assembly):
            assembly = result
            shape = result.toCompound()
        else:
            shape = result.val() if isinstance(result, cq.Workplane) else result
            if not isinstance(shape, cq.Shape):
                raise ValueError("Assign a CadQuery Workplane, Shape or Assembly to result.")
            assembly = cq.Assembly(shape, name="model", color=cq.Color(*job["color"]))
        if not shape.isValid():
            raise ValueError("The CAD shape is invalid; correct the script before exporting.")
        vertices, triangles = shape.tessellate(0.15, 0.15)
        if not triangles or len(triangles) > 20000:
            raise ValueError("The preview must have 1 to 20000 triangles. Simplify the model.")
        mesh = {"vertices": [[v.x, v.y, v.z] for v in vertices], "triangles": [list(t) for t in triangles]}
        (folder / "mesh.json").write_text(json.dumps(mesh, allow_nan=False))
        cq.exporters.export(shape, str(folder / "model.step"))
        shape.exportStl(str(folder / "model.stl"), tolerance=0.15, angularTolerance=0.15, parallel=False)
        export = getattr(assembly, "export", None) or assembly.save
        export(str(folder / "model.glb"))
        cq.exporters.export(shape, str(folder / "model.svg"), opt={"width": 960, "height": 960, "showAxes": False, "showHidden": False})
    print(json.dumps({"ok": True, "version": getattr(cq, "__version__", "unknown"), "triangles": len(triangles)}))
except Exception as error:
    print(json.dumps({"ok": False, "code": "cadquery_model_failed", "message": str(error)[:1200]}))
`;
