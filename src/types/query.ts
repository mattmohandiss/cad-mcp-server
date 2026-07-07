export interface StepQueryUnits {
  length: 'mm';
  area: 'mm^2';
  volume: 'mm^3';
  angle: 'deg';
}

export interface StepQueryCoordinateSystem {
  origin: 'STEP model origin';
  axes: 'model coordinates';
  handedness: 'right';
}

export interface StepQueryPagination {
  limit: number;
  offset: number;
  returned: number;
  total_matched: number;
  has_more: boolean;
}

export interface StepQueryGroup {
  id: string;
  key: Record<string, unknown>;
  entity_count: number;
  sample_entity_ids: string[];
  sample_entity_limit: number;
  sample_is_complete: boolean;
  summary: Record<string, unknown>;
}

export interface StepQueryResponse<TEntity extends Record<string, unknown>> {
  file_path: string;
  units: StepQueryUnits;
  coordinate_system: StepQueryCoordinateSystem;
  query: Record<string, unknown>;
  statistics: Record<string, unknown>;
  pagination: StepQueryPagination;
  entities: TEntity[];
  groups: StepQueryGroup[];
  warnings: unknown[];
  limitations: unknown[];
}
