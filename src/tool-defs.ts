export const PUBLIC_TOOL_NAMES = [
  'inspect_step',
  'find_faces',
  'find_edges',
  'measure_distance',
  'measure_thickness',
  'measure_draft',
  'measure_geometry',
  'diff_step',
] as const;

export const SURFACE_TYPES = [
  'plane',
  'cylinder',
  'cone',
  'sphere',
  'torus',
  'bspline',
  'other',
] as const;

export const CURVE_TYPES = ['line', 'circle', 'ellipse', 'bspline', 'other'] as const;

export const RETURN_TYPES = ['entities', 'summary', 'groups'] as const;

export const MEASURE_OPS = [
  'ray_test',
  'ray_test_grid',
  'ray_test_segment',
  'distance',
  'distance_extrema',
  'draft_angle',
  'closest_point_on_face',
  'classify_point',
  'contains_point',
  'surface_curvature',
  'edge_projection',
  'section_by_plane',
  'continuity',
] as const;

export const FACE_WHERE_FIELDS = [
  'surface_type',
  'area_min',
  'area_max',
  'radius_min',
  'radius_max',
  'body_ids',
  'validity_status',
  'tolerance_max',
  'normal',
] as const;

export const FACE_SELECT_FIELDS = [
  'id',
  'surface_type',
  'area',
  'bbox',
  'bbox_center',
  'body_id',
  'adjacent_faces',
  'normal',
  'surface_parameters',
  'radius',
  'diameter',
  'axis',
  'extent_along_axis',
  'closest_face_distance',
  'has_inner_wires',
  'outer_edges',
  'inner_wires',
  'uv_bounds',
  'is_valid',
  'tolerance',
] as const;

export const FACE_DEFAULT_SELECT_FIELDS = [
  'id',
  'surface_type',
  'area',
  'bbox',
  'bbox_center',
  'body_id',
  'adjacent_faces',
] as const satisfies readonly (typeof FACE_SELECT_FIELDS)[number][];

export const FACE_GROUP_BY_FIELDS = [
  'axis',
  'normal_direction',
  'surface_type',
  'area_range',
  'radius_range',
  'body_id',
] as const;

export const FACE_ORDER_FIELDS = [
  'area',
  'radius',
  'diameter',
  'surface_type',
  'center_x',
  'center_y',
  'center_z',
] as const;

export const EDGE_WHERE_FIELDS = [
  'curve_type',
  'length_min',
  'length_max',
  'radius_min',
  'radius_max',
  'dihedral_min_deg',
  'body_ids',
] as const;

export const EDGE_SELECT_FIELDS = [
  'id',
  'curve_type',
  'length',
  'bbox',
  'bbox_center',
  'body_id',
  'radius',
  'diameter',
  'start_point',
  'end_point',
  'start_vertex',
  'end_vertex',
  'convexity',
  'dihedral_angle_deg',
  'continuity',
  'is_closed',
  'is_periodic',
  'adjacent_faces',
] as const;

export const EDGE_DEFAULT_SELECT_FIELDS = [
  'id',
  'curve_type',
  'length',
  'bbox',
  'bbox_center',
  'body_id',
] as const satisfies readonly (typeof EDGE_SELECT_FIELDS)[number][];

export const EDGE_GROUP_BY_FIELDS = [
  'curve_type',
  'length_range',
  'radius_range',
  'body_id',
] as const;

export const EDGE_ORDER_FIELDS = [
  'length',
  'radius',
  'diameter',
  'curve_type',
  'center_x',
  'center_y',
  'center_z',
] as const;
