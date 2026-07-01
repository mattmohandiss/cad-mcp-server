import { withStepModel } from '../model-store.js';
import { CAD_RESPONSE_SCHEMA_VERSION } from '../schema-version.js';
import { wrapTool } from './shared.js';

/* ------------------------------------------------------------------ */
/*  Inspect handler                                                    */
/* ------------------------------------------------------------------ */

export async function handleInspectStepFile(filePath: string) {
  return wrapTool(async () => {
    return withStepModel(filePath, async (model) => {
      const [brep, semantic] = await Promise.all([model.getBRepModel(), model.getSemanticModel()]);
      const { kernel, shape } = await model.getShapeContext('inspect_step_file');

      // Principal properties (may fail for wireframe/non-manifold shapes).
      let principal: number[] | undefined;
      try {
        principal = kernel.getPrincipalProperties(shape);
      } catch {
        /* ignore */
      }

      // Oriented bounding box (may fail same as above).
      let obb: number[] | undefined;
      try {
        obb = kernel.getOrientedBoundingBox(shape);
      } catch {
        /* ignore */
      }

      // Shell watertight analysis.
      let freeEdgeCount = -1;
      try {
        freeEdgeCount = kernel.freeEdgeCount(shape);
      } catch {
        /* ignore */
      }

      // Shape contents inventory.
      let contents: number[] | undefined;
      try {
        contents = kernel.shapeContents(shape);
      } catch {
        /* ignore */
      }

      return {
        schema_version: CAD_RESPONSE_SCHEMA_VERSION,
        file_path: filePath,
        identity: {
          product_names: semantic.productNames,
          authoring_system: semantic.authoringSystem,
          organization_name: semantic.organizationName,
        },
        size: {
          bounding_box: brep.boundingBox,
          dimensions: brep.dimensions,
          volume: brep.volume,
          surface_area: brep.surfaceArea,
          units: brep.units,
        },
        principal_axes: principal
          ? {
              moments: [principal[0], principal[1], principal[2]],
              axis_1: [principal[3], principal[4], principal[5]],
              axis_2: [principal[6], principal[7], principal[8]],
              axis_3: [principal[9], principal[10], principal[11]],
            }
          : undefined,
        bounding_box_obb: obb
          ? {
              center: [obb[0], obb[1], obb[2]],
              half_extents: [obb[3], obb[4], obb[5]],
              axis_1: [obb[6], obb[7], obb[8]],
              axis_2: [obb[9], obb[10], obb[11]],
              axis_3: [obb[12], obb[13], obb[14]],
            }
          : undefined,
        structure: {
          body_count: brep.bodyCount,
          is_assembly: semantic.hasAssembly,
          product_count: semantic.productCount,
          schema: semantic.schema,
          application_protocol: semantic.applicationProtocol,
        },
        health: {
          is_valid: brep.health.isValid,
          warning_count: brep.health.warnings.length,
          high_warning_count: brep.health.warnings.filter((w) => w.severity === 'high').length,
          complexity: {
            body_count: brep.bodyCount,
            face_count: brep.faceCount,
            edge_count: brep.edgeStatistics?.count,
          },
        },
        quality:
          freeEdgeCount >= 0
            ? {
                free_edge_count: freeEdgeCount,
                is_watertight: freeEdgeCount === 0,
                shape_contents: contents
                  ? {
                      faces: contents[0],
                      edges: contents[1],
                      free_faces: contents[2],
                      free_wires: contents[3],
                      free_edges: contents[4],
                      c0_surfaces: contents[5],
                      bspline_surfaces: contents[6],
                      offset_surfaces: contents[7],
                    }
                  : undefined,
              }
            : undefined,
        pmi: {
          has_pmi: semantic.pmi?.hasGdt || semantic.pmi?.hasDimensions || false,
          has_gdt: semantic.pmi?.hasGdt || false,
          has_dimensions: semantic.pmi?.hasDimensions || false,
          semantic_status: semantic.pmi?.semanticStatus || 'not_detected',
          tolerance_entity_count: semantic.toleranceEntityCount,
        },
        topology_summary: {
          faces: { total: brep.faceCount },
          edges: brep.edgeStatistics
            ? {
                total: brep.edgeStatistics.count,
                by_curve_type: brep.edgeStatistics.byCurveType,
                by_length_bucket: brep.edgeStatistics.byLengthRange,
                length_range: {
                  min: brep.edgeStatistics.minLength,
                  max: brep.edgeStatistics.maxLength,
                },
              }
            : undefined,
        },
        geometry_extremes: {
          edges_length_lt_1_mm: brep.edgeStatistics ? brep.edgeStatistics.byLengthRange.tiny : 0,
          min_edge_length: brep.edgeStatistics?.minLength || 0,
        },
        bodies: brep.bodies.map((b) => ({
          id: b.id,
          volume: b.volume,
          surface_area: b.surfaceArea,
          dimensions: b.dimensions,
          center_of_mass: b.centerOfMass,
        })),
        warnings: brep.health.warnings,
        limitations: [
          ...semantic.limitations,
          {
            source: 'inspect_step_file',
            message:
              'Face area extremes, surface-type counts, and adjacency graph are deferred. Use query_step with specific fields for those details.',
          },
        ],
      };
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Response types (consumed by query engine and shared services)      */
/* ------------------------------------------------------------------ */

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
  schema_version: typeof CAD_RESPONSE_SCHEMA_VERSION;
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
