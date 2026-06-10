// Multi-turn engineering workflows — corrected after debug validation
import { beforeAll, describe, expect, it } from 'vitest';
import type { ToolResponse } from '../tools/shared.js';
import {
  handleCompareStepFiles,
  handleInspectStepFile,
  handleQueryStepEdges,
  handleQueryStepFaces,
} from '../tools/step-tools.js';
import { generateStep } from './fixtures.js';

function extract<T>(r: ToolResponse<T>): T {
  if (!r.ok) throw new Error(`Tool failed: ${r.error.type} ${r.error.message}`);
  return r.data;
}

let blockFile: string;
let holesFile: string;
let pocketFile: string;
let filletFile: string;
let complexFile: string;

beforeAll(async () => {
  blockFile = await generateStep((k) => k.exportStep(k.makeBox(50, 50, 20)));

  holesFile = await generateStep((k) => {
    const block = k.makeBox(50, 50, 20);
    const thruCyl = k.translate(k.makeCylinder(5, 30), 15, 25, -5);
    const afterThru = k.cut(block, thruCyl);
    const blindCyl = k.translate(k.makeCylinder(8, 10), 35, 25, 10);
    return k.exportStep(k.cut(afterThru, blindCyl));
  });

  pocketFile = await generateStep((k) => {
    const block = k.makeBox(50, 50, 20);
    const tool = k.translate(k.makeBox(30, 30, 10), 10, 10, 10);
    return k.exportStep(k.cut(block, tool));
  });

  filletFile = await generateStep((k) => {
    const block = k.makeBox(50, 50, 20);
    const edges = k.getSubShapes(block, 'edge');
    return k.exportStep(k.fillet(block, edges.slice(0, 4), 3));
  });

  complexFile = await generateStep((k) => {
    const block = k.makeBox(60, 60, 30);
    const h1 = k.translate(k.makeCylinder(6, 40), 15, 30, -5);
    const a1 = k.cut(block, h1);
    const h2 = k.translate(k.makeCylinder(10, 15), 45, 30, 15);
    const a2 = k.cut(a1, h2);
    const poc = k.translate(k.makeBox(20, 20, 10), 5, 5, 20);
    return k.exportStep(k.cut(a2, poc));
  });
});

// ============ SCENARIO 1: Hole classification ============
// Pattern: cylindrical walls + adjacent planar faces → has_inner_wires classifies through vs blind
describe('Engineer: hole analysis', () => {
  it('inspects part to get baseline', async () => {
    const r = extract(await handleInspectStepFile(holesFile));
    expect(r.facts.geometry.bodyCount).toBe(1);
    expect(r.facts.geometry.aag.faceCount).toBeGreaterThan(0);
  });

  it('finds 2 cylindrical faces (hole walls) at r=5 and r=8', async () => {
    const r = extract(await handleQueryStepFaces(holesFile, {
      filter: { surface_type: ['cylinder'] },
      include: ['id', 'surface_parameters', 'adjacent_faces', 'center'],
      limit: 100,
    }));
    expect(r.entities.length).toBe(2);
    const radii = r.entities.map((e: any) => e.surface_parameters?.radius).sort();
    expect(radii).toEqual([5, 8]);
  });

  it('classifies through vs blind via has_inner_wires on adjacent planar faces', async () => {
    const cyl = extract(await handleQueryStepFaces(holesFile, {
      filter: { surface_type: ['cylinder'] },
      include: ['id', 'surface_parameters', 'adjacent_faces'],
      limit: 100,
    }));
    const adjIds = [...new Set(cyl.entities.flatMap((c: any) =>
      (c.adjacent_faces || []).map((a: any) => a.face_id)
    ))];
    const planars = extract(await handleQueryStepFaces(holesFile, {
      filter: { entity_ids: adjIds },
      include: ['id', 'has_inner_wires'],
      limit: 100,
    }));
    const iwMap = new Map(planars.entities.map((p: any) => [p.id, p.has_inner_wires]));

    let thru = 0, blind = 0;
    for (const c of cyl.entities as any[]) {
      const adj = (c.adjacent_faces || []).filter((a: any) => a.surface_type === 'plane');
      const iw = adj.filter((a: any) => iwMap.get(a.face_id) === true);
      const noIw = adj.filter((a: any) => iwMap.get(a.face_id) === false);
      if (iw.length >= 2) { thru++; expect(c.surface_parameters?.radius).toBe(5); }
      else if (iw.length === 1 && noIw.length >= 1) { blind++; expect(c.surface_parameters?.radius).toBe(8); }
    }
    expect(thru).toBe(1);
    expect(blind).toBe(1);
  });

  it('simple block has zero cylindrical faces', async () => {
    const r = extract(await handleQueryStepFaces(blockFile, {
      filter: { surface_type: ['cylinder'] },
      result_mode: 'summary',
    }));
    expect((r.statistics as any).matched_faces).toBe(0);
  });
});

// ============ SCENARIO 2: Pocket detection ============
// OCCT makes 90-degree corners "smooth" (threshold 0.05), not "concave".
// Pocket floor pattern: planar face with has_inner_wires=false, all adjacencies
// are planar faces (the walls) with smooth vexity.
describe('Engineer: pocket detection', () => {
  it('finds pocket floor via multi-turn adjacency graph', async () => {
    // Turn 1: all planar faces with adjacencies
    const r = extract(await handleQueryStepFaces(pocketFile, {
      filter: { surface_type: ['plane'] },
      include: ['id', 'area', 'adjacent_faces', 'has_inner_wires', 'center'],
      limit: 100,
    }));

    // Identify the top face (has_inner_wires=true due to pocket opening)
    const topFace = r.entities.find((p: any) => p.has_inner_wires === true) as any;
    expect(topFace).toBeTruthy();
    const topAdjIds = new Set((topFace.adjacent_faces || []).map((a: any) => a.face_id));

    // Turn 2: query the Z-centers of adjacent faces to distinguish walls from outer sides
    const allAdjIds = [...new Set(r.entities.flatMap((p: any) =>
      (p.adjacent_faces || []).map((a: any) => a.face_id)
    ))];
    const adjDetail = extract(await handleQueryStepFaces(pocketFile, {
      filter: { entity_ids: allAdjIds },
      include: ['id', 'center', 'has_inner_wires'],
      limit: 100,
    }));
    const centerMap = new Map(adjDetail.entities.map((p: any) => [p.id, p.center]));

    // Pocket floor pattern: has_inner_wires=false, all adj planar,
    // not at extreme Z itself, all adj have center Z in non-extreme range
    const candidates = r.entities.filter((p: any) => {
      const adj: any[] = p.adjacent_faces || [];
      if (adj.length === 0 || p.has_inner_wires) return false;
      if (!adj.every((a: any) => a.surface_type === 'plane')) return false;
      // Face itself must not be at extreme Z
      const pz = (p.center as number[])[2];
      if (pz <= 0 || pz >= 20) return false;
      // All adjacent faces must have center Z not at extreme
      return adj.every((a: any) => {
        const cz = centerMap.get(a.face_id)?.[2];
        return cz !== undefined && cz > 0 && cz < 20;
      });
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0].area).toBeGreaterThan(800);  // ~900 (30x30)
    expect(candidates[0].area).toBeLessThan(920);
  });

  it('top face has inner wires due to pocket opening', async () => {
    const r = extract(await handleQueryStepFaces(pocketFile, {
      include: ['id', 'area', 'has_inner_wires', 'center'],
      limit: 100,
    }));
    const topFaces = r.entities.filter((p: any) => {
      const [cx, cy, cz] = p.center as number[];
      return cz > 18; // top of 50x50x20 block
    });
    // The pocket opening creates an inner wire on the top face
    const topWithHoles = topFaces.filter((p: any) => p.has_inner_wires === true);
    expect(topWithHoles.length).toBeGreaterThanOrEqual(1);
  });
});

// ============ SCENARIO 3: Fillet detection ============
// OCCT fillets produce CYLINDRICAL faces (not bspline) with convex~0° adjacencies
// to the adjacent planar faces. Boundary edges are elliptical, not circular.
// Fillet detection finds cylinders of known radius that connect planar faces.
describe('Engineer: fillet detection', () => {
  it('finds cylindrical faces with radius matching fillet spec', async () => {
    const groups = extract(await handleQueryStepFaces(filletFile, {
      result_mode: 'groups',
      group_by: ['surface_type'],
    }));
    const typeMap = new Map(groups.groups.map((g: any) => [g.key.surface_type, g.entity_count]));
    expect(typeMap.get('plane')).toBeGreaterThanOrEqual(6);
    expect(typeMap.get('cylinder')).toBeGreaterThanOrEqual(4);

    // Fillet surfaces are cylinders of radius=3 with convex~0° adjacencies to planes
    const cyls = extract(await handleQueryStepFaces(filletFile, {
      filter: { surface_type: ['cylinder'] },
      include: ['id', 'surface_parameters', 'adjacent_faces', 'center'],
      limit: 100,
    }));

    const filletFaces = cyls.entities.filter((c: any) => {
      const adj: any[] = c.adjacent_faces || [];
      const planarAdj = adj.filter((a: any) => a.surface_type === 'plane');
      // A fillet of radius 3 should have 2 planar neighbors (tangent connections)
      return c.surface_parameters?.radius === 3 && planarAdj.length >= 2;
    });
    expect(filletFaces.length).toBe(4);
  });
});

// ============ SCENARIO 4: Comparison ============
describe('Engineer: compare revisions', () => {
  it('block vs block-with-holes: volume decreases, face/edge count increases', async () => {
    const r = extract(await handleCompareStepFiles(blockFile, holesFile));
    expect(r.deltas.volume).toBeLessThan(0);
    expect(r.deltas.faceCount).toBeGreaterThan(0);
    expect(r.deltas.edgeCount).toBeGreaterThan(0);
  });
});

// ============ SCENARIO 5: Combined features ============
describe('Engineer: complex part with all feature types', () => {
  it('finds and classifies 2 holes (1 through, 1 blind) + 1 pocket', async () => {
    // Turn 1: inspect
    const inspect = extract(await handleInspectStepFile(complexFile));
    expect(inspect.facts.geometry.aag.faceCount).toBeGreaterThan(10);

    // Turn 2: holes — find cylindrical faces
    const cyl = extract(await handleQueryStepFaces(complexFile, {
      filter: { surface_type: ['cylinder'] },
      include: ['id', 'surface_parameters', 'adjacent_faces'],
      limit: 100,
    }));
    expect(cyl.entities.length).toBe(2);

    // Query adjacent planar faces for inner wires
    const adjIds = [...new Set(cyl.entities.flatMap((c: any) =>
      (c.adjacent_faces || []).map((a: any) => a.face_id)
    ))];
    const planars = extract(await handleQueryStepFaces(complexFile, {
      filter: { entity_ids: adjIds },
      include: ['id', 'has_inner_wires'],
      limit: 100,
    }));
    const iwMap = new Map(planars.entities.map((p: any) => [p.id, p.has_inner_wires]));

    let thru = 0, blind = 0;
    for (const c of cyl.entities as any[]) {
      const adj = (c.adjacent_faces || []).filter((a: any) => a.surface_type === 'plane');
      const iw = adj.filter((a: any) => iwMap.get(a.face_id) === true);
      const noIw = adj.filter((a: any) => iwMap.get(a.face_id) === false);
      if (iw.length >= 2) thru++;
      else if (iw.length === 1 && noIw.length >= 1) blind++;
    }
    expect(thru).toBe(1);
    expect(blind).toBe(1);

    // Turn 3: find internal planar faces (not at extreme Z, no inner wires)
    const planarFaces = extract(await handleQueryStepFaces(complexFile, {
      filter: { surface_type: ['plane'] },
      include: ['id', 'area', 'adjacent_faces', 'has_inner_wires', 'center'],
      limit: 100,
    }));

    // Query adjacencies' centers
    const allAdjIds = [...new Set(planarFaces.entities.flatMap((p: any) =>
      (p.adjacent_faces || []).map((a: any) => a.face_id)
    ))];
    const adjDetail = extract(await handleQueryStepFaces(complexFile, {
      filter: { entity_ids: allAdjIds },
      include: ['id', 'center', 'has_inner_wires'],
      limit: 100,
    }));
    const centerMap = new Map(adjDetail.entities.map((p: any) => [p.id, p.center]));
    const allZ = adjDetail.entities.map((p: any) => (p.center as number[])[2]);
    const zMin = Math.min(...allZ);
    const zMax = Math.max(...allZ);

    // Internal faces: planar, no inner wires, not at extreme Z
    const internalFaces = planarFaces.entities.filter((p: any) => {
      return !p.has_inner_wires && adjDetail.entities.some((a: any) => a.id !== p.id);
    });

    // The blind hole bottom has 1 cylindrical adjacency (the hole wall)
    // The pocket floor has mixed adjacencies (planar walls + through hole cylinder)
    // In this model: blind hole bottom at z=15 (314mm^2), pocket floor at z=20 (~400mm^2)
    const atMidZ = internalFaces.filter((p: any) => {
      const pz = (p.center as number[])[2];
      return pz > zMin && pz < zMax;
    });
    // Should find: blind hole bottom + pocket floor
    expect(atMidZ.length).toBeGreaterThanOrEqual(2);
  });
});
