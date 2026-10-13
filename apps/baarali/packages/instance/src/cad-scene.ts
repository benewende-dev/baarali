// BAARALI(13/10/2026): a declarative scene lets both devices edit real CAD
// without assembling Python from user-entered names or expressions.
export interface CadPart {
  id: string; name: string; kind: 'box' | 'cylinder' | 'sphere'; operation: 'add' | 'cut';
  width: number; depth: number; height: number; radius: number; fillet: number;
  x: number; y: number; z: number; rx: number; ry: number; rz: number;
}
export interface CadScene { version: 1; parts: CadPart[] }
export function defaultCadPart(id = 'part-1'): CadPart {
  return { id, name: '', kind: 'box', operation: 'add', width: 40, depth: 30, height: 20, radius: 10, fillet: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
}
export function validCadScene(value: unknown): value is CadScene {
  const scene = value as CadScene | null;
  const bounded = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  if (!scene || scene.version !== 1 || !Array.isArray(scene.parts) || !scene.parts.length || scene.parts.length > 16) return false;
  const ids = new Set<string>();
  return scene.parts.every((p, index) => {
    if (!p || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(p.id) || ids.has(p.id) || typeof p.name !== 'string' || p.name.length > 80) return false;
    ids.add(p.id);
    return ['box','cylinder','sphere'].includes(p.kind) && ['add','cut'].includes(p.operation) && (index > 0 || p.operation === 'add')
      && ['width','depth','height','radius'].every(k => bounded(p[k as keyof CadPart], .1, 1000))
      && ['x','y','z'].every(k => bounded(p[k as keyof CadPart], -2000, 2000))
      && ['rx','ry','rz'].every(k => bounded(p[k as keyof CadPart], -360, 360))
      && bounded(p.fillet, 0, p.kind === 'box' ? Math.min(p.width,p.depth,p.height)/2-.001 : p.kind === 'cylinder' ? Math.min(p.radius,p.height/2)-.001 : 0);
  });
}
export const CAD_SCENE_SOURCE = `
result = None
for part in parameters['scene']['parts']:
    if part['kind'] == 'box':
        solid = cq.Workplane('XY').box(part['width'], part['depth'], part['height'])
    elif part['kind'] == 'cylinder':
        solid = cq.Workplane('XY').cylinder(part['height'], part['radius'])
    else:
        solid = cq.Workplane('XY').sphere(part['radius'])
    if part['fillet'] > 0:
        solid = solid.edges().fillet(part['fillet'])
    for axis, key in [((1,0,0),'rx'), ((0,1,0),'ry'), ((0,0,1),'rz')]:
        solid = solid.rotate((0,0,0), axis, part[key])
    solid = solid.translate((part['x'],part['y'],part['z']))
    result = solid if result is None else result.cut(solid) if part['operation'] == 'cut' else result.union(solid)
`;
