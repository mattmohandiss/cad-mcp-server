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

      // Raw inertia matrix (3x3 row-major, about center of mass).
      let inertia: number[] | undefined;
      try {
        inertia = kernel.getInertia(shape);
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

      // Shape contents inventory.
      let contents: number[] | undefined;
      try {
        contents = kernel.shapeContents(shape);
      } catch {
        /* ignore */
      }

      // Single traversal: edges for watertight + degenerate analysis,
      // faces for tolerance statistics.
      const allEdges = kernel.getSubShapes(shape, 'edge');
      const allFaces = kernel.getSubShapes(shape, 'face');

      // Shell watertight analysis + free edge IDs.
      let freeEdgeCount = -1;
      let freeEdgeIds: string[] | undefined;
      try {
        kernel.graphBuild(shape);
        const freeEdges: string[] = [];
        for (let i = 0; i < allEdges.length; i++) {
          try {
            const faceIndices = kernel.graphEdgeFaces(i);
            if (faceIndices.length === 1) {
              freeEdges.push(`edge:${i}`);
            }
          } catch {
            // skip edges that can't be queried
          }
        }
        freeEdgeCount = freeEdges.length;
        if (freeEdgeCount > 0) freeEdgeIds = freeEdges;
      } catch {
        /* ignore */
      }

      // Degenerate edge detection.
      let degenerateEdgeIds: string[] | undefined;
      try {
        const degEdges: string[] = [];
        for (let i = 0; i < allEdges.length; i++) {
          const len = kernel.getLength(allEdges[i]);
          if (len < 1e-6) {
            degEdges.push(`edge:${i}`);
          }
        }
        if (degEdges.length > 0) degenerateEdgeIds = degEdges;
      } catch {
        /* ignore */
      }

      // Tolerance statistics.
      let toleranceStats: { min: number; max: number; avg: number } | undefined;
      try {
        if (allFaces.length > 0) {
          let min = Number.POSITIVE_INFINITY;
          let max = Number.NEGATIVE_INFINITY;
          let sum = 0;
          for (const face of allFaces) {
            const tol = kernel.faceTolerance(face);
            if (tol < min) min = tol;
            if (tol > max) max = tol;
            sum += tol;
          }
          toleranceStats = { min, max, avg: sum / allFaces.length };
        }
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
        inertia_matrix: inertia
          ? {
              ixx: inertia[0],
              ixy: inertia[1],
              ixz: inertia[2],
              iyx: inertia[3],
              iyy: inertia[4],
              iyz: inertia[5],
              izx: inertia[6],
              izy: inertia[7],
              izz: inertia[8],
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
                free_edge_ids: freeEdgeIds,
                degenerate_edge_ids: degenerateEdgeIds,
                tolerance_stats: toleranceStats,
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
          has_pmi: semantic.pmi?.hasPmi || false,
          has_gdt_keywords: semantic.pmi?.hasGdtKeywords || false,
          has_dimension_keywords: semantic.pmi?.hasDimensionKeywords || false,
          detected_keywords: semantic.pmi?.detectedKeywords || [],
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
          min_edge_length:
            brep.edgeStatistics && Number.isFinite(brep.edgeStatistics.minLength)
              ? brep.edgeStatistics.minLength
              : undefined,
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

export type {
  StepQueryUnits,
  StepQueryCoordinateSystem,
  StepQueryPagination,
  StepQueryGroup,
  StepQueryResponse,
} from '../types/query.js';
