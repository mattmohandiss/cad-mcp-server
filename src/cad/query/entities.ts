import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import type { PublicGetStepEntitiesInput } from '../../tools/step-tools.js';
import { withStepModel } from '../model-store.js';
import { createPagination, createQueryResponse } from './shared.js';

const FACE_DEFAULT_FIELDS = ['id', 'surface_type', 'area', 'bbox_center'] as const;
const EDGE_DEFAULT_FIELDS = ['id', 'curve_type', 'length', 'bbox_center'] as const;

const FALLBACK_FIELDS = new Set(['adjacent_faces', 'closest_face_distance', 'body_id']);

export function canDirectGetEntities(input: PublicGetStepEntitiesInput): boolean {
  return !(input.fields ?? []).some((field) => FALLBACK_FIELDS.has(field));
}

export async function getStepEntitiesDirect(filePath: string, input: PublicGetStepEntitiesInput) {
  return withStepModel(filePath, async (model) => {
    const { kernel, shape } = await model.getShapeContext('get_step_entities');
    const fields = input.fields ?? defaultFields(input.entity_type);
    const entities =
      input.entity_type === 'face'
        ? projectFaces(kernel, shape, input.entity_ids, fields)
        : projectEdges(kernel, shape, input.entity_ids, fields);

    return createQueryResponse(
      filePath,
      {
        entity_type: input.entity_type,
        entity_ids: input.entity_ids,
        fields,
      },
      createPagination(input.entity_ids.length, 0, entities.length, input.entity_ids.length),
      entities,
      {
        matched_entities: entities.length,
      },
      [],
      [],
      []
    );
  });
}

function defaultFields(entityType: PublicGetStepEntitiesInput['entity_type']): string[] {
  return entityType === 'face' ? [...FACE_DEFAULT_FIELDS] : [...EDGE_DEFAULT_FIELDS];
}

function projectFaces(
  kernel: OcctKernel,
  shape: ShapeHandle,
  ids: string[],
  fields: string[]
): Array<Record<string, unknown>> {
  const faces = kernel.getSubShapes(shape, 'face');
  return ids.map((id) => {
    const index = entityIndex(id);
    if (!Number.isInteger(index) || index < 0 || index >= faces.length) {
      throw invalidEntityId(id, faces.length);
    }
    const face = faces[index];
    const result: Record<string, unknown> = {};

    for (const field of fields) {
      switch (field) {
        case 'id':
          result.id = id;
          break;
        case 'surface_type':
          result.surface_type = kernel.surfaceType(face);
          break;
        case 'area':
          result.area = kernel.getSurfaceArea(face);
          break;
        case 'bbox':
          result.bbox = bboxToTuple(kernel, face);
          break;
        case 'bbox_center':
          result.bbox_center = bboxCenter(kernel, face);
          break;
        case 'normal': {
          try {
            const center = bboxCenter(kernel, face);
            const uv = kernel.uvFromPoint(face, { x: center[0], y: center[1], z: center[2] });
            const normal = kernel.surfaceNormal(face, uv.u, uv.v);
            result.normal = [normal.x, normal.y, normal.z];
          } catch {
            // Match full extraction behavior: omit optional fields that fail.
          }
          break;
        }
        case 'surface_parameters': {
          try {
            const surfaceType = kernel.surfaceType(face);
            if (surfaceType === 'cylinder') {
              const cylData = kernel.getFaceCylinderData(face);
              result.surface_parameters = cylData?.radius ? { radius: cylData.radius } : {};
            } else {
              result.surface_parameters = {};
            }
          } catch {
            result.surface_parameters = {};
          }
          break;
        }
        case 'has_inner_wires':
          try {
            result.has_inner_wires = kernel.getSubShapes(face, 'wire').length > 1;
          } catch {
            result.has_inner_wires = false;
          }
          break;
      }
    }

    return result;
  });
}

function projectEdges(
  kernel: OcctKernel,
  shape: ShapeHandle,
  ids: string[],
  fields: string[]
): Array<Record<string, unknown>> {
  const edges = kernel.getSubShapes(shape, 'edge');
  return ids.map((id) => {
    const index = entityIndex(id);
    if (!Number.isInteger(index) || index < 0 || index >= edges.length) {
      throw invalidEntityId(id, edges.length);
    }
    const edge = edges[index];
    const result: Record<string, unknown> = {};

    for (const field of fields) {
      switch (field) {
        case 'id':
          result.id = id;
          break;
        case 'curve_type':
          result.curve_type = kernel.curveType(edge);
          break;
        case 'length':
          result.length = kernel.getLength(edge);
          break;
        case 'bbox':
          result.bbox = bboxToTuple(kernel, edge);
          break;
        case 'bbox_center':
          result.bbox_center = bboxCenter(kernel, edge);
          break;
        case 'radius': {
          const radius = edgeRadius(kernel, edge);
          if (radius !== undefined) result.radius = radius;
          break;
        }
        case 'start_point':
        case 'end_point': {
          try {
            const params = kernel.curveParameters(edge);
            const point = kernel.curvePointAtParam(
              edge,
              field === 'start_point' ? params.first : params.last
            );
            result[field] = [point.x, point.y, point.z];
          } catch {
            // Match full extraction behavior: omit optional fields that fail.
          }
          break;
        }
      }
    }

    return result;
  });
}

function entityIndex(id: string): number {
  return Number.parseInt(id.split(':')[1] ?? '', 10);
}

function invalidEntityId(id: string, count: number) {
  return {
    type: 'invalid_input',
    message: `Entity ID ${id} is out of range. This model has ${count} matching entities.`,
  };
}

function edgeRadius(kernel: OcctKernel, edge: ShapeHandle): number | undefined {
  if (kernel.curveType(edge) !== 'circle') return undefined;
  const length = kernel.getLength(edge);
  try {
    const params = kernel.curveParameters(edge);
    const span = Math.abs(params.last - params.first);
    if (span > 1e-9) return length / span;
  } catch {
    // Fall back to bounding-box diameter below.
  }

  const bbox = bboxToTuple(kernel, edge);
  const diameter = Math.max(
    bbox.max[0] - bbox.min[0],
    bbox.max[1] - bbox.min[1],
    bbox.max[2] - bbox.min[2]
  );
  return diameter > 0 ? diameter / 2 : undefined;
}

function bboxToTuple(
  kernel: OcctKernel,
  shape: ShapeHandle
): { min: [number, number, number]; max: [number, number, number] } {
  const bbox = kernel.getBoundingBox(shape, false);
  return {
    min: [bbox.xmin, bbox.ymin, bbox.zmin],
    max: [bbox.xmax, bbox.ymax, bbox.zmax],
  };
}

function bboxCenter(kernel: OcctKernel, shape: ShapeHandle): [number, number, number] {
  const bbox = bboxToTuple(kernel, shape);
  return [
    (bbox.min[0] + bbox.max[0]) / 2,
    (bbox.min[1] + bbox.max[1]) / 2,
    (bbox.min[2] + bbox.max[2]) / 2,
  ];
}
