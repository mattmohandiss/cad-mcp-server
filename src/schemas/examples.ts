/**
 * input_examples for the 5-tool surface.
 *
 * Per MCP tool-design guidance:
 *   - Use realistic data
 *   - Show variety: minimal to complex
 *   - Keep sparse: only include fields relevant to the query
 *   - Show the chain: inspect → query → measure pattern
 */

import type { ToolName } from './tool-schemas.js';

type Example = Record<string, unknown>;

const queryFacesExamples: Example[] = [
  /* 1. Find all cylinders */
  {
    file_path: 'model.step',
    surface_type: 'cylinder',
    select: ['id', 'radius', 'diameter', 'axis', 'area'],
    order_by: { by: 'radius', direction: 'asc' },
  },

  /* 2. Find cylinders, group by axis direction */
  {
    file_path: 'model.step',
    surface_type: 'cylinder',
    group_by: ['axis'],
    select: ['id', 'radius', 'diameter', 'axis'],
    return_type: 'groups',
  },

  /* 3. Count all planes and their total area */
  {
    file_path: 'model.step',
    surface_type: 'plane',
    group_by: ['surface_type'],
    aggregate: ['count', 'sum:area'],
    return_type: 'groups',
  },

  /* 4. Find holes within a diameter range (radius 2.5-10mm) */
  {
    file_path: 'model.step',
    surface_type: 'cylinder',
    radius_min: 2.5,
    radius_max: 10,
    select: ['id', 'radius', 'diameter', 'axis', 'extent_along_axis'],
    order_by: { by: 'radius', direction: 'asc' },
  },

  /* 5. Find large faces (potential mounting surfaces) */
  {
    file_path: 'model.step',
    area_min: 100,
    select: ['id', 'surface_type', 'area', 'normal', 'bbox'],
    order_by: { by: 'area', direction: 'desc' },
    limit: 10,
  },
];

const queryEdgesExamples: Example[] = [
  /* 1. Find circular edges (fillets, holes) within a radius range */
  {
    file_path: 'model.step',
    curve_type: 'circle',
    radius_min: 1,
    radius_max: 10,
    select: ['id', 'radius', 'diameter', 'length', 'bbox'],
    order_by: { by: 'radius', direction: 'asc' },
  },

  /* 2. Find all straight edges, grouped by length range */
  {
    file_path: 'model.step',
    curve_type: 'line',
    group_by: ['length_range'],
    aggregate: ['count', 'min:length', 'max:length'],
    return_type: 'groups',
  },

  /* 3. Find smallest fillet (circular edge with smallest radius) */
  {
    file_path: 'model.step',
    curve_type: 'circle',
    select: ['id', 'radius', 'diameter', 'bbox_center'],
    order_by: { by: 'radius', direction: 'asc' },
    limit: 1,
  },

  /* 4. Find long straight edges (potential outer boundaries) */
  {
    file_path: 'model.step',
    curve_type: 'line',
    length_min: 50,
    select: ['id', 'length', 'start_point', 'end_point'],
    order_by: { by: 'length', direction: 'desc' },
  },
];

const measureStepExamples: Example[] = [
  /* 1. Batch ray-test all cylindrical faces for wall thickness */
  {
    file_path: 'model.step',
    entity_ids: ['face:6', 'face:7', 'face:8'],
    op: 'ray_test_grid',
    direction: 'along_axis_both',
    spacing_mm: 2.0,
  },

  /* 2. Ray-test a specific face to check if a hole is blind */
  {
    file_path: 'model.step',
    entity_ids: ['face:7'],
    op: 'ray_test_segment',
    direction: [0, 0, 1],
    origin: 'extent_center',
    tmax: 50,
  },

  /* 3. Check distance from holes to an edge (clearance check) */
  {
    file_path: 'model.step',
    entity_ids: ['face:6', 'face:7'],
    op: 'distance',
    to: 'edge:0',
  },

  /* 4. Classify a point relative to a face (inside/outside test) */
  {
    file_path: 'model.step',
    entity_ids: ['face:3'],
    op: 'closest_point_on_face',
    point: [10, 5, 0],
  },
];

const inspectStepExamples: Example[] = [{ file_path: 'model.step' }];

const diffStepExamples: Example[] = [
  {
    baseline_file_path: 'model_v1.step',
    comparison_file_path: 'model_v2.step',
  },
];

export const toolExamples: Record<ToolName, Example[]> = {
  inspect_step: inspectStepExamples,
  query_faces: queryFacesExamples,
  query_edges: queryEdgesExamples,
  measure_step: measureStepExamples,
  diff_step: diffStepExamples,
};
