import { describe, expect, it } from 'vitest';
import {
  parseAggregateSpec,
  dispatchAggregate,
  aggregateToStatistics,
} from '../query/aggregate.js';

describe('aggregate dispatch', () => {
  it('parses well-formed aggregate specs', () => {
    expect(parseAggregateSpec('count')).toEqual({ op: 'count', field: undefined });
    expect(parseAggregateSpec('count:hit_distance')).toEqual({
      op: 'count',
      field: 'hit_distance',
    });
    expect(parseAggregateSpec('min:area')).toEqual({ op: 'min', field: 'area' });
    expect(parseAggregateSpec('max:radius')).toEqual({ op: 'max', field: 'radius' });
    expect(parseAggregateSpec('avg:hit_distance')).toEqual({ op: 'avg', field: 'hit_distance' });
    expect(parseAggregateSpec('stddev:length')).toEqual({ op: 'stddev', field: 'length' });
    expect(parseAggregateSpec('sum:volume')).toEqual({ op: 'sum', field: 'volume' });
  });

  it('rejects malformed specs', () => {
    expect(() => parseAggregateSpec('nope')).toThrow();
    expect(() => parseAggregateSpec('count::')).toThrow();
  });

  it('computes count', () => {
    const agg = dispatchAggregate([f('a', 1), f('b', 2), f('c', 3)], ['count']);
    const stats = aggregateToStatistics(agg);
    expect(stats.count).toBe(3);
    // Keys match the original spec strings
    expect(stats['count']).toBe(3);
  });

  it('computes min/max/avg on numeric fields', () => {
    const agg = dispatchAggregate(
      [f('a', 5), f('b', 10), f('c', 15)],
      ['min:area', 'max:area', 'avg:area'],
    );
    const stats = aggregateToStatistics(agg);
    expect(stats['min:area']).toBe(5);
    expect(stats['max:area']).toBe(15);
    expect(stats['avg:area']).toBe(10);
  });

  it('computes sum and stddev', () => {
    const agg = dispatchAggregate([f('a', 2), f('b', 4), f('c', 6)], ['sum:area', 'stddev:area']);
    const stats = aggregateToStatistics(agg);
    expect(stats['sum:area']).toBe(12);
    expect(stats['stddev:area']).toBeCloseTo(2, 0);
  });

  it('handles empty input gracefully', () => {
    const agg = dispatchAggregate([], ['count', 'min:area', 'max:area', 'avg:area']);
    const stats = aggregateToStatistics(agg);
    expect(stats.count).toBe(0);
  });
});

function f(id: string, area: number): Record<string, unknown> {
  return { id, area, surface_type: 'plane' };
}
