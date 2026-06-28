import { readStepText } from '../kernel/import.js';
import { CAD_RESPONSE_SCHEMA_VERSION } from '../schema-version.js';

/* ------------------------------------------------------------------ */
/*  STEP entity parser (lightweight, PMI-focused)                     */
/* ------------------------------------------------------------------ */

interface RawStepEntity {
  id: number;
  type: string;
  raw: string;
}

function parseStepEntities(text: string): Map<number, RawStepEntity> {
  const entities = new Map<number, RawStepEntity>();
  const re = /#(\d+)\s*=\s*([A-Z][A-Z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const id = parseInt(match[1], 10);
    const type = match[2];
    const start = match.index + match[0].length;
    const end = findMatchingParen(text, start);
    if (end === -1) continue;
    entities.set(id, { id, type, raw: text.slice(start, end) });
  }
  return entities;
}

function findMatchingParen(text: string, start: number): number {
  let depth = 1;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === "'") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/*  STEP parameter parser                                              */
/* ------------------------------------------------------------------ */

type StepParam =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'ref'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'enum'; value: string }
  | { kind: 'list'; value: StepParam[] }
  | { kind: 'unset' }
  | { kind: 'raw'; value: string };

function parseParams(raw: string): StepParam[] {
  const params: StepParam[] = [];
  let i = 0;
  while (i < raw.length) {
    i = skipWhitespace(raw, i);
    if (i >= raw.length) break;
    const ch = raw[i];
    if (ch === "'") {
      const { value, end } = parseString(raw, i);
      params.push({ kind: 'string', value });
      i = end + 1;
    } else if (ch === '#') {
      const end = readInt(raw, i + 1);
      params.push({ kind: 'ref', value: parseInt(raw.slice(i + 1, end), 10) });
      i = end;
    } else if (ch === '.' && i + 1 < raw.length) {
      const dot2 = raw.indexOf('.', i + 1);
      if (dot2 === -1) {
        params.push({ kind: 'raw', value: raw.slice(i) });
        break;
      }
      const inner = raw.slice(i + 1, dot2);
      if (inner === 'T' || inner === 'F') {
        params.push({ kind: 'bool', value: inner === 'T' });
      } else {
        params.push({ kind: 'enum', value: inner });
      }
      i = dot2 + 1;
    } else if (ch === '(') {
      const end = findMatchingParen(raw, i + 1);
      const inner = raw.slice(i + 1, end);
      params.push({ kind: 'list', value: parseParams(inner) });
      i = end + 1;
    } else if (ch === '$') {
      params.push({ kind: 'unset' });
      i++;
    } else if (isDigit(ch) || ch === '-' || ch === '+') {
      const end = readNumber(raw, i);
      const numStr = raw.slice(i, end).trim();
      params.push({ kind: 'number', value: parseFloat(numStr) });
      i = end;
    } else if (ch === ',') {
      i++;
    } else {
      // Skip unrecognized characters.
      i++;
    }
  }
  return params;
}

function skipWhitespace(text: string, start: number): number {
  let i = start;
  while (
    i < text.length &&
    (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')
  )
    i++;
  return i;
}

function parseString(text: string, start: number): { value: string; end: number } {
  let result = '';
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === "'") {
      if (i + 1 < text.length && text[i + 1] === "'") {
        result += "'";
        i += 2;
      } else {
        return { value: result, end: i };
      }
    } else {
      result += text[i];
      i++;
    }
  }
  return { value: result, end: i };
}

function readInt(text: string, start: number): number {
  let i = start;
  while (i < text.length && isDigit(text[i])) i++;
  return i;
}

function readNumber(text: string, start: number): number {
  let i = start;
  if (text[i] === '-' || text[i] === '+') i++;
  while (i < text.length && isDigit(text[i])) i++;
  if (text[i] === '.') {
    i++;
    while (i < text.length && isDigit(text[i])) i++;
  }
  if ((text[i] === 'e' || text[i] === 'E') && i + 1 < text.length) {
    i++;
    if (text[i] === '-' || text[i] === '+') i++;
    while (i < text.length && isDigit(text[i])) i++;
  }
  return i;
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/* ------------------------------------------------------------------ */
/*  PMI entity categorization and extraction                          */
/* ------------------------------------------------------------------ */

const GEOMETRIC_TOLERANCE_TYPES = new Set([
  'POSITION_TOLERANCE',
  'FLATNESS_TOLERANCE',
  'STRAIGHTNESS_TOLERANCE',
  'CIRCULARITY_TOLERANCE',
  'CYLINDRICITY_TOLERANCE',
  'PROFILE_TOLERANCE',
  'PARALLELISM_TOLERANCE',
  'PERPENDICULARITY_TOLERANCE',
  'ANGULARITY_TOLERANCE',
  'CONCENTRICITY_TOLERANCE',
  'RUNOUT_TOLERANCE',
  'SYMMETRY_TOLERANCE',
  'COAXIALITY_TOLERANCE',
  'CIRCULAR_RUNOUT_TOLERANCE',
  'TOTAL_RUNOUT_TOLERANCE',
  'SURFACE_PROFILE_TOLERANCE',
  'LINE_PROFILE_TOLERANCE',
]);

const DIMENSION_TYPES = new Set([
  'DIMENSIONAL_SIZE',
  'DIMENSIONAL_LOCATION',
  'DIAMETER_SIZE',
  'RADIUS_SIZE',
  'LENGTH_SIZE',
  'ANGULAR_SIZE',
]);

const DATUM_TYPES = new Set(['DATUM', 'DATUM_FEATURE', 'DATUM_REFERENCE', 'DATUM_SYSTEM']);

const ANNOTATION_TYPES = new Set(['ANNOTATION_OCCURRENCE', 'DRAUGHTING_CALLOUT', 'SURFACE_FINISH']);

export interface PmiToleranceEntity {
  step_id: string;
  type: 'geometric_tolerance';
  tolerance_type: string;
  value: number | null;
  material_condition: string | null;
  referenced_step_ids: string[];
}

export interface PmiDimensionEntity {
  step_id: string;
  type: 'dimension';
  dimension_type: string;
  value: number | null;
  tolerance: { upper: number | null; lower: number | null } | null;
  referenced_step_ids: string[];
}

export interface PmiDatumEntity {
  step_id: string;
  type: 'datum';
  datum_label: string | null;
  datum_type: string;
  referenced_step_ids: string[];
}

export interface PmiAnnotationEntity {
  step_id: string;
  type: 'annotation';
  annotation_type: string;
  text: string | null;
  referenced_step_ids: string[];
}

export type PmiExtractedEntity =
  PmiToleranceEntity | PmiDimensionEntity | PmiDatumEntity | PmiAnnotationEntity;

function categorizePmiEntity(
  entity: RawStepEntity,
  params: StepParam[],
  entityMap: Map<number, RawStepEntity>,
): PmiExtractedEntity | null {
  const upperType = entity.type.toUpperCase();

  if (GEOMETRIC_TOLERANCE_TYPES.has(upperType)) {
    return extractGeometricTolerance(entity, params, upperType, entityMap);
  }

  if (DIMENSION_TYPES.has(upperType)) {
    return extractDimension(entity, params, upperType, entityMap);
  }

  if (DATUM_TYPES.has(upperType)) {
    return extractDatum(entity, params, upperType);
  }

  if (ANNOTATION_TYPES.has(upperType)) {
    return extractAnnotation(entity, params, upperType);
  }

  // TOLERANCE_VALUE and PLUS_MINUS_TOLERANCE are referenced by dimensions,
  // extracted as part of dimension processing, not as standalone entities.
  return null;
}

function extractGeometricTolerance(
  entity: RawStepEntity,
  params: StepParam[],
  upperType: string,
  entityMap: Map<number, RawStepEntity>,
): PmiToleranceEntity {
  const toleranceType = toleranceTypeName(upperType);
  const value =
    findNumberParam(params, 1) ??
    findAnyNumberParam(params) ??
    findValueFromToleranceRef(params, entityMap);
  const refs: number[] = [];
  const matCond = findEnumParam(
    params,
    upperType === 'POSITION_TOLERANCE' || params.length >= 4 ? 3 : 2,
  );

  for (const p of params) {
    if (p.kind === 'ref') refs.push(p.value);
    if (p.kind === 'list') {
      for (const item of p.value) {
        if (item.kind === 'ref') refs.push(item.value);
      }
    }
  }

  return {
    step_id: `#${entity.id}`,
    type: 'geometric_tolerance',
    tolerance_type: toleranceType,
    value,
    material_condition: matCond,
    referenced_step_ids: refs.map((r) => `#${r}`),
  };
}

function findAnyNumberParam(params: StepParam[]): number | null {
  for (const p of params) {
    if (p.kind === 'number') return p.value;
    if (p.kind === 'list') {
      for (const item of p.value) {
        if (item.kind === 'number') return item.value;
      }
    }
  }
  return null;
}

function findValueFromToleranceRef(
  params: StepParam[],
  entityMap: Map<number, RawStepEntity>,
): number | null {
  for (const p of params) {
    if (p.kind !== 'ref') continue;
    const target = entityMap.get(p.value);
    if (!target) continue;
    if (!/^TOLERANCE_VALUE$|^PLUS_MINUS_TOLERANCE$/i.test(target.type)) continue;
    try {
      const targetParams = parseParams(target.raw);
      const num = findAnyNumberParam(targetParams);
      if (num !== null) return num;
    } catch {
      continue;
    }
  }
  return null;
}

const TOLERANCE_TYPE_NAMES: Record<string, string> = {
  POSITION_TOLERANCE: 'position',
  FLATNESS_TOLERANCE: 'flatness',
  STRAIGHTNESS_TOLERANCE: 'straightness',
  CIRCULARITY_TOLERANCE: 'circularity',
  CYLINDRICITY_TOLERANCE: 'cylindricity',
  PROFILE_TOLERANCE: 'profile',
  PARALLELISM_TOLERANCE: 'parallelism',
  PERPENDICULARITY_TOLERANCE: 'perpendicularity',
  ANGULARITY_TOLERANCE: 'angularity',
  CONCENTRICITY_TOLERANCE: 'concentricity',
  RUNOUT_TOLERANCE: 'runout',
  SYMMETRY_TOLERANCE: 'symmetry',
  COAXIALITY_TOLERANCE: 'coaxiality',
  CIRCULAR_RUNOUT_TOLERANCE: 'circular_runout',
  TOTAL_RUNOUT_TOLERANCE: 'total_runout',
  SURFACE_PROFILE_TOLERANCE: 'surface_profile',
  LINE_PROFILE_TOLERANCE: 'line_profile',
};

function toleranceTypeName(upperType: string): string {
  return TOLERANCE_TYPE_NAMES[upperType] ?? upperType.toLowerCase().replace(/_tolerance$/, '');
}

function extractDimension(
  entity: RawStepEntity,
  params: StepParam[],
  upperType: string,
  entityMap: Map<number, RawStepEntity>,
): PmiDimensionEntity {
  const dimType = dimensionTypeName(upperType, params);
  const value =
    findNumberParam(params, 1) ??
    findNumberParam(params, 0) ??
    findValueFromToleranceRef(params, entityMap);
  const refs: number[] = [];
  for (const p of params) {
    if (p.kind === 'ref') refs.push(p.value);
  }

  return {
    step_id: `#${entity.id}`,
    type: 'dimension',
    dimension_type: dimType,
    value,
    tolerance: null,
    referenced_step_ids: refs.map((r) => `#${r}`),
  };
}

function dimensionTypeName(upperType: string, params: StepParam[]): string {
  if (upperType === 'DIAMETER_SIZE') return 'diameter';
  if (upperType === 'RADIUS_SIZE') return 'radius';
  if (upperType === 'LENGTH_SIZE') return 'length';
  if (upperType === 'ANGULAR_SIZE') return 'angular';
  if (upperType === 'DIMENSIONAL_LOCATION') return 'location';
  // DIMENSIONAL_SIZE — check first param for qualifier.
  const first = findStringParam(params, 0);
  if (first === 'diameter' || first === 'radius' || first === 'length' || first === 'angular') {
    return first ?? 'size';
  }
  return 'size';
}

function extractDatum(
  entity: RawStepEntity,
  params: StepParam[],
  upperType: string,
): PmiDatumEntity {
  const label = findStringParam(params, 0);

  // Collect integer/label-like params as references.
  const refs: number[] = [];
  for (const p of params) {
    if (p.kind === 'ref') refs.push(p.value);
  }

  return {
    step_id: `#${entity.id}`,
    type: 'datum',
    datum_label: label ?? entity.type.replace(/^DATUM_?/, ''),
    datum_type: upperType.toLowerCase(),
    referenced_step_ids: refs.map((r) => `#${r}`),
  };
}

function extractAnnotation(
  entity: RawStepEntity,
  params: StepParam[],
  upperType: string,
): PmiAnnotationEntity {
  const text = findStringParam(params, 0) ?? findStringParam(params, 1);
  const refs: number[] = [];
  for (const p of params) {
    if (p.kind === 'ref') refs.push(p.value);
  }

  return {
    step_id: `#${entity.id}`,
    type: 'annotation',
    annotation_type: upperType.toLowerCase(),
    text,
    referenced_step_ids: refs.map((r) => `#${r}`),
  };
}

function findStringParam(params: StepParam[], index: number): string | null {
  let idx = 0;
  for (const p of params) {
    if (p.kind === 'string' && idx === index) return p.value;
    if (p.kind === 'string') idx++;
  }
  return null;
}

function findNumberParam(params: StepParam[], index: number): number | null {
  let idx = 0;
  for (const p of params) {
    if (p.kind === 'number' && idx === index) return p.value;
    if (p.kind === 'number') idx++;
  }
  return null;
}

function findEnumParam(params: StepParam[], index: number): string | null {
  let idx = 0;
  for (const p of params) {
    if (p.kind === 'enum' && idx === index) return p.value;
    if (p.kind === 'enum') idx++;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Query-level data structures                                        */
/* ------------------------------------------------------------------ */

export interface PmiQueryResult {
  schema_version: typeof CAD_RESPONSE_SCHEMA_VERSION;
  file_path: string;
  pmi_entities: PmiExtractedEntity[];
  statistics: {
    total: number;
    by_type: Record<string, number>;
    has_pmi: boolean;
  };
}

export async function extractPmiEntities(filePath: string): Promise<PmiQueryResult> {
  const text = await readStepText(filePath);
  const rawEntities = parseStepEntities(text);
  const pmiEntities: PmiExtractedEntity[] = [];

  for (const entity of rawEntities.values()) {
    try {
      const params = parseParams(entity.raw);
      const pmi = categorizePmiEntity(entity, params, rawEntities);
      if (pmi) pmiEntities.push(pmi);
    } catch {
      // Skip unparseable entities.
    }
  }

  const byType: Record<string, number> = {};
  for (const e of pmiEntities) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }

  return {
    schema_version: CAD_RESPONSE_SCHEMA_VERSION,
    file_path: filePath,
    pmi_entities: pmiEntities,
    statistics: {
      total: pmiEntities.length,
      by_type: byType,
      has_pmi: pmiEntities.length > 0,
    },
  };
}
