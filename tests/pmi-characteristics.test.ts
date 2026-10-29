import { describe, expect, it } from 'vitest';
import {
  evaluateDimensions,
  faceSetKey,
  type Characteristic,
  type DimensionCallout,
  type FaceProperty,
} from '../src/domain/pmi-characteristics.js';

/**
 * The rules here exist because each one was a way to report a violation that does not
 * exist. A diameter is the only callout this reader can evaluate, so every other test is
 * about refusing to answer rather than guessing.
 */

/** A cylindrical face reporting one diameter. */
function cylinder(diameter: number): FaceProperty {
  return { surface_type: 'cylinder', diameter };
}

/** A callout with the tolerance form most drawings use. */
function callout(overrides: Partial<DimensionCallout> = {}): DimensionCallout {
  return {
    kind: 'diameter',
    nominal: 35,
    value_resolved: true,
    tolerance_form: 'plus-minus',
    upper_deviation: 0,
    lower_deviation: -0.2,
    entity_ids: ['face:90'],
    ...overrides,
  };
}

/** The single row the evaluator produces, with the invariant that there is one. */
function only(rows: Characteristic[]): Characteristic {
  expect(rows).toHaveLength(1);
  const [row] = rows;
  if (row === undefined) throw new Error('expected a row');
  return row;
}

describe('evaluating a diameter callout', () => {
  it('satisfies a dimension inside its limits, and reports the measurement', () => {
    const row = only(
      evaluateDimensions([callout()], new Map([['face:90', cylinder(34.96)]]), new Set()),
    );
    expect(row.state).toBe('satisfied');
    expect(row.measured).toBe(34.96);
    expect(row.deviation).toBeCloseTo(-0.04, 9);
    expect(row.requirement).toBe('diameter 35 +0 / -0.2');
    expect(row.note).toContain('34.96');
  });

  it('violates a dimension past its limit', () => {
    const row = only(
      evaluateDimensions([callout()], new Map([['face:90', cylinder(34.7)]]), new Set()),
    );
    expect(row.state).toBe('violated');
    expect(row.deviation).toBeCloseTo(-0.3, 9);
  });

  it('treats a value at the limit as inside it, because float noise is not a defect', () => {
    // The NIST file really reports 35.0000000000002 against an upper limit of 35.
    const row = only(
      evaluateDimensions(
        [callout({ upper_deviation: 0.2, lower_deviation: -0.2 })],
        new Map([['face:90', cylinder(35.0000000000002)]]),
        new Set(),
      ),
    );
    expect(row.state).toBe('satisfied');
  });

  it('reads a range callout from its bounds instead of its deviations', () => {
    const row = only(
      evaluateDimensions(
        [
          callout({
            tolerance_form: 'range',
            upper_deviation: undefined,
            lower_deviation: undefined,
            lower_bound: 34.8,
            upper_bound: 35.2,
          }),
        ],
        new Map([['face:90', cylinder(35.1)]]),
        new Set(),
      ),
    );
    expect(row.state).toBe('satisfied');
    expect(row.requirement).toBe('diameter 35 (34.8 … 35.2)');
  });

  it('evaluates a callout that names two coaxial faces of the same bore', () => {
    const row = only(
      evaluateDimensions(
        [callout({ entity_ids: ['face:90', 'face:89'] })],
        new Map([
          ['face:90', cylinder(34.99)],
          ['face:89', cylinder(34.99)],
        ]),
        new Set(),
      ),
    );
    expect(row.state).toBe('satisfied');
  });

  it('refuses a callout whose faces report different diameters', () => {
    const row = only(
      evaluateDimensions(
        [callout({ entity_ids: ['face:90', 'face:89'] })],
        new Map([
          ['face:90', cylinder(35)],
          ['face:89', cylinder(20)],
        ]),
        new Set(),
      ),
    );
    expect(row.state).toBe('conflicting');
    expect(row.reason).toBe('faces-disagree');
  });
});

describe('refusing to answer', () => {
  it('never compares against a nominal the reader could not read', () => {
    const row = only(
      evaluateDimensions(
        [callout({ nominal: 0, value_resolved: false })],
        new Map([['face:90', cylinder(34.7)]]),
        new Set(),
      ),
    );
    expect(row.state).toBe('unresolved');
    expect(row.reason).toBe('value-unresolved');
    expect(row).not.toHaveProperty('measured');
    expect(row.requirement).toContain('diameter 0');
  });

  it('marks a basic dimension not-applicable instead of checking it', () => {
    // A location dimension whose faces are the ones a position tolerance controls: the
    // frame is the requirement, and the dimension states no limit.
    const basic = callout({
      kind: 'linear distance',
      nominal: 0,
      value_resolved: false,
      tolerance_form: 'none',
      upper_deviation: undefined,
      lower_deviation: undefined,
      entity_ids: ['face:41'],
    });
    const row = only(evaluateDimensions([basic], new Map(), new Set([faceSetKey(['face:41'])])));
    expect(row.state).toBe('not-applicable');
    expect(row.reason).toBe('basic-dimension');
  });

  it('recognises a basic dimension stated between two features', () => {
    // The real file names one face as the dimension and the other as its secondary, while
    // the tolerance frame that consumes it names both together.
    const basic = callout({
      kind: 'linear distance',
      nominal: 0,
      value_resolved: false,
      tolerance_form: 'none',
      upper_deviation: undefined,
      lower_deviation: undefined,
      entity_ids: ['face:41'],
      secondary_entity_ids: ['face:37'],
    });
    const row = only(
      evaluateDimensions([basic], new Map(), new Set([faceSetKey(['face:41', 'face:37'])])),
    );
    expect(row.state).toBe('not-applicable');
    expect(row.reason).toBe('basic-dimension');
  });

  it('does not call a callout basic when it names no faces at all', () => {
    // An empty face set must not match an empty tolerance key and hide a real gap.
    const faceless = callout({
      tolerance_form: 'none',
      upper_deviation: undefined,
      lower_deviation: undefined,
      entity_ids: [],
    });
    const row = only(evaluateDimensions([faceless], new Map(), new Set([faceSetKey([])])));
    expect(row.state).toBe('unresolved');
    expect(row.reason).toBe('no-tolerance');
  });

  it('says a valued callout with no tolerance has nothing to compare against', () => {
    const row = only(
      evaluateDimensions(
        [
          callout({
            tolerance_form: 'none',
            upper_deviation: undefined,
            lower_deviation: undefined,
          }),
        ],
        new Map([['face:90', cylinder(35)]]),
        new Set(),
      ),
    );
    expect(row.state).toBe('unresolved');
    expect(row.reason).toBe('no-tolerance');
  });

  it('says a callout on a non-cylindrical face has no diameter to read', () => {
    const row = only(
      evaluateDimensions([callout()], new Map([['face:90', { surface_type: 'plane' }]]), new Set()),
    );
    expect(row.state).toBe('unresolved');
    expect(row.reason).toBe('unsupported-surface');
  });

  it('says an angle needs the frame it is stated in', () => {
    const angle = callout({
      kind: 'angle',
      nominal: 60,
      upper_deviation: 0.5,
      lower_deviation: -0.5,
      entity_ids: ['face:17', 'face:18'],
    });
    const row = only(
      evaluateDimensions(
        [angle],
        new Map([
          ['face:17', { surface_type: 'plane' }],
          ['face:18', { surface_type: 'plane' }],
        ]),
        new Set(),
      ),
    );
    expect(row.state).toBe('unresolved');
    expect(row.reason).toBe('needs-frame');
  });
});

describe('duplicate callouts', () => {
  it('keeps the valued copy and drops the unvalued one', () => {
    // The NIST file carries each diameter twice on the same faces, once with the value
    // and once with a nominal of 0. Either row would be a lie about the other.
    const rows = evaluateDimensions(
      [callout(), callout({ nominal: 0, value_resolved: false })],
      new Map([['face:90', cylinder(34.99)]]),
      new Set(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe('satisfied');
  });

  it('reports two valued copies that disagree instead of picking one', () => {
    const rows = evaluateDimensions(
      [callout(), callout({ nominal: 34.5 })],
      new Map([['face:90', cylinder(34.99)]]),
      new Set(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe('conflicting');
    expect(rows[0]?.reason).toBe('duplicate-disagrees');
  });

  it('keeps callouts on different faces apart', () => {
    const rows = evaluateDimensions(
      [callout(), callout({ entity_ids: ['face:91'] })],
      new Map([
        ['face:90', cylinder(34.99)],
        ['face:91', cylinder(34.99)],
      ]),
      new Set(),
    );
    expect(rows).toHaveLength(2);
  });
});
