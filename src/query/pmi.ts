import type {
  PmiToleranceEntity,
  PmiDimensionEntity,
  PmiDatumEntity,
  PmiAnnotationEntity,
} from '../pmi/parser.js';
import { withStepModel } from '../model-store.js';
import {
  normalizePagination,
  createPagination,
  createQueryResponse,
  groupEntities,
  DEFAULT_QUERY_LIMITS,
  type ComputedGroup,
} from './shared.js';

type PmiEntity = PmiToleranceEntity | PmiDimensionEntity | PmiDatumEntity | PmiAnnotationEntity;

export interface QueryPmiInput {
  pmi_types?: string[];
  tolerance_subtypes?: string[];
  value_min?: number;
  value_max?: number;
  group_by?: string[];
  sort?: { by: string; direction?: 'asc' | 'desc' };
  return_type?: 'summary' | 'entities' | 'groups';
  limit?: number;
  offset?: number;
}

export async function queryStepPmi(filePath: string, input: QueryPmiInput) {
  return withStepModel(filePath, async (model) => {
    const full = await model.getPmiEntities();
    let filtered = [...full.pmi_entities];

    if (input.pmi_types && input.pmi_types.length > 0) {
      const typeSet = new Set(input.pmi_types);
      filtered = filtered.filter((e) => typeSet.has(e.type));
    }

    if (input.tolerance_subtypes && input.tolerance_subtypes.length > 0) {
      const tolSet = new Set<string>(input.tolerance_subtypes);
      filtered = filtered.filter(
        (e) =>
          e.type === 'geometric_tolerance' &&
          'tolerance_type' in e &&
          tolSet.has((e as PmiToleranceEntity).tolerance_type),
      );
    }

    if (input.value_min !== undefined) {
      filtered = filtered.filter(
        (e) => 'value' in e && e.value !== null && e.value >= input.value_min!,
      );
    }

    if (input.value_max !== undefined) {
      filtered = filtered.filter(
        (e) => 'value' in e && e.value !== null && e.value <= input.value_max!,
      );
    }

    if (input.sort) {
      const dir = input.sort.direction === 'desc' ? -1 : 1;
      filtered.sort((a, b) => {
        let cmp = 0;
        switch (input.sort!.by) {
          case 'type':
            cmp = a.type.localeCompare(b.type);
            break;
          case 'value':
            cmp =
              ('value' in a ? ((a as PmiToleranceEntity).value ?? 0) : 0) -
              ('value' in b ? ((b as PmiToleranceEntity).value ?? 0) : 0);
            break;
          case 'tolerance_type': {
            const aTol =
              a.type === 'geometric_tolerance' ? (a as PmiToleranceEntity).tolerance_type : '';
            const bTol =
              b.type === 'geometric_tolerance' ? (b as PmiToleranceEntity).tolerance_type : '';
            cmp = aTol.localeCompare(bTol);
            break;
          }
        }
        return cmp * dir;
      });
    }

    const resultMode = input.return_type ?? 'entities';
    let groups: ComputedGroup[] = [];

    if (resultMode === 'groups') {
      const groupBy = input.group_by ?? ['type'];
      const withId = filtered.map((e) => ({ ...e, id: e.step_id })) as Array<PmiEntity & { id: string }>;
      groups = groupEntities<PmiEntity & { id: string }>(
        withId,
        groupBy,
        (entity, dimension) => {
          switch (dimension) {
            case 'type':
              return entity.type;
            case 'tolerance_type':
              return entity.type === 'geometric_tolerance'
                ? (entity as PmiToleranceEntity).tolerance_type
                : null;
            case 'dimension_type':
              return entity.type === 'dimension'
                ? (entity as PmiDimensionEntity).dimension_type
                : null;
            case 'material_condition':
              return entity.type === 'geometric_tolerance'
                ? (entity as PmiToleranceEntity).material_condition
                : null;
            default:
              return null;
          }
        },
        DEFAULT_QUERY_LIMITS.sample_entity_limit,
      );
    }

    const { limit, offset } = normalizePagination(input.limit, input.offset);
    const paginated = resultMode === 'entities' ? filtered.slice(offset, offset + limit) : [];

    const pagination = createPagination(limit, offset, paginated.length, filtered.length);

    const byType: Record<string, number> = {};
    for (const e of filtered) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
    }

    return createQueryResponse(
      filePath,
      {
        ...input,
        return_type: resultMode,
        limit,
        offset,
      },
      pagination,
      paginated as never,
      {
        total_pmi: full.pmi_entities.length,
        matched_pmi: filtered.length,
        ...byType,
      },
      groups,
      await buildNoPmiWarnings(model, full.pmi_entities.length),
      [],
    );
  });
}

async function buildNoPmiWarnings(
  model: { getSemanticModel(): Promise<{ schema?: string }> },
  pmiCount: number,
): Promise<string[]> {
  if (pmiCount > 0) return [];
  const schema = (await model.getSemanticModel()).schema;
  if (schema && /AP2(03|14)/i.test(schema)) {
    return [
      `No PMI entities found. The STEP file uses schema ${schema}, which does not include GD&T annotations.`,
    ];
  }
  return [
    'No PMI entities found. The STEP file may not include GD&T, datum, or dimension annotations.',
  ];
}
