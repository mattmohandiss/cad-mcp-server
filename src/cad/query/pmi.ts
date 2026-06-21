import type { QueryStepPmiInput } from '../../tools/step-tools.js';
import type {
  PmiToleranceEntity,
  PmiDimensionEntity,
  PmiDatumEntity,
  PmiAnnotationEntity,
} from '../../providers/lightweight-step/pmi-parser.js';
import { withStepModel } from '../model-store.js';
import {
  normalizePagination,
  createPagination,
  createQueryResponse,
  DEFAULT_QUERY_LIMITS,
  type ComputedGroup,
} from './shared.js';

type PmiEntity = PmiToleranceEntity | PmiDimensionEntity | PmiDatumEntity | PmiAnnotationEntity;

export async function queryStepPmi(filePath: string, input: QueryStepPmiInput) {
  return withStepModel(filePath, async (model) => {
    const full = await model.getPmiEntities();
    let filtered = [...full.pmi_entities];

    // Apply filters.
    if (input.filter?.pmi_types && input.filter.pmi_types.length > 0) {
      const typeSet = new Set(input.filter.pmi_types);
      filtered = filtered.filter((e) => typeSet.has(e.type));
    }

    if (input.filter?.tolerance_types && input.filter.tolerance_types.length > 0) {
      const tolSet = new Set<string>(input.filter.tolerance_types);
      filtered = filtered.filter(
        (e) =>
          e.type === 'geometric_tolerance' &&
          'tolerance_type' in e &&
          tolSet.has((e as PmiToleranceEntity).tolerance_type)
      );
    }

    if (input.filter?.value_min !== undefined) {
      filtered = filtered.filter(
        (e) => 'value' in e && e.value !== null && e.value >= input.filter!.value_min!
      );
    }

    if (input.filter?.value_max !== undefined) {
      filtered = filtered.filter(
        (e) => 'value' in e && e.value !== null && e.value <= input.filter!.value_max!
      );
    }

    // Sorting.
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

    // Grouping.
    const resultMode = input.result_mode ?? 'entities';
    let groups: ComputedGroup[] = [];

    if (resultMode === 'groups') {
      const groupBy = input.group_by ?? ['type'];
      const buckets = new Map<string, { key: Record<string, unknown>; members: PmiEntity[] }>();

      for (const entity of filtered) {
        const key: Record<string, unknown> = {};
        for (const dim of groupBy) {
          switch (dim) {
            case 'type':
              key.type = entity.type;
              break;
            case 'tolerance_type':
              if (entity.type === 'geometric_tolerance') {
                key.tolerance_type = (entity as PmiToleranceEntity).tolerance_type;
              } else {
                key.tolerance_type = null;
              }
              break;
            case 'dimension_type':
              if (entity.type === 'dimension') {
                key.dimension_type = (entity as PmiDimensionEntity).dimension_type;
              } else {
                key.dimension_type = null;
              }
              break;
            case 'material_condition':
              if (entity.type === 'geometric_tolerance') {
                key.material_condition = (entity as PmiToleranceEntity).material_condition;
              } else {
                key.material_condition = null;
              }
              break;
          }
        }
        const mapKey = JSON.stringify(groupBy.map((d) => key[d]));
        let bucket = buckets.get(mapKey);
        if (!bucket) {
          bucket = { key, members: [] };
          buckets.set(mapKey, bucket);
        }
        bucket.members.push(entity);
      }

      const sampleLimit = DEFAULT_QUERY_LIMITS.sample_entity_limit;
      let groupIdx = 0;
      groups = [...buckets.values()].map((bucket) => {
        const ids = bucket.members.map((m) => m.step_id);
        const sampled = ids.slice(0, sampleLimit);
        const isComplete = ids.length <= sampleLimit;
        return {
          id: `group:${groupIdx++}`,
          key: bucket.key,
          entity_count: bucket.members.length,
          entity_ids: ids,
          sample_entity_ids: sampled,
          sample_entity_limit: sampleLimit,
          sample_is_complete: isComplete,
          summary: {} as Record<string, unknown>,
        };
      });

      groups.sort((a, b) => b.entity_count - a.entity_count);
    }

    // Pagination.
    const { limit, offset } = normalizePagination(input.limit, input.offset);
    const paginated = resultMode === 'entities' ? filtered.slice(offset, offset + limit) : [];

    const pagination = createPagination(limit, offset, paginated.length, filtered.length);

    // Statistics.
    const byType: Record<string, number> = {};
    for (const e of full.pmi_entities) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
    }

    return createQueryResponse(
      filePath,
      {
        filter: input.filter ?? {},
        group_by: input.group_by ?? null,
        sort: input.sort ?? null,
        result_mode: resultMode,
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
      full.pmi_entities.length === 0
        ? [
            'No PMI entities found. STEP file may be AP203 (no PMI) or may not contain GD&T annotations.',
          ]
        : [],
      []
    );
  });
}
