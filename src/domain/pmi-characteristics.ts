/**
 * Comparing a declared dimensional callout with the model it is declared on.
 *
 * This is the one place a requirement can be checked without asking anybody: the
 * callout comes from the file, the value comes from the same faces in the same
 * revision, and the comparison is arithmetic. It is also the place where the honest
 * answer is most often "not checked", and the reason matters more than the fact: a
 * reader that compares a measurement against a nominal it never read reports a
 * violation that does not exist, and a confident one is worse than none.
 *
 * So every callout produces exactly one row, and a row that was not evaluated says why.
 * The states are the decision object's vocabulary, so a row can be read out as a basis
 * item without translation.
 */

/** What a characteristic came out as, in the vocabulary the decision object uses. */
export type CharacteristicState =
  'satisfied' | 'violated' | 'unresolved' | 'conflicting' | 'not-applicable';

/** Why a callout stands where it does, when the state alone does not say. */
export type CharacteristicReason =
  | 'value-unresolved'
  | 'basic-dimension'
  | 'no-tolerance'
  | 'unsupported-surface'
  | 'needs-frame'
  | 'faces-disagree'
  | 'duplicate-disagrees';

/** One callout, checked or not, with the reason it stands where it does. */
export interface Characteristic {
  /** The callout as it reads, e.g. `diameter 35 +0 / -0.2`. */
  requirement: string;
  state: CharacteristicState;
  /** The faces the callout controls, in this revision. */
  entity_ids: string[];
  nominal?: number;
  measured?: number;
  deviation?: number;
  /** Present when the state is not a plain verdict. */
  reason?: CharacteristicReason;
  /** One line a reviewer needs, when the state alone is not enough. */
  note?: string;
}

/** One dimensional callout, as the PMI reader shapes it. */
export interface DimensionCallout {
  readonly kind: string;
  readonly nominal: number;
  readonly value_resolved: boolean;
  readonly tolerance_form: string;
  /** Signed offset above the nominal. */
  readonly upper_deviation?: number;
  /** Signed offset below the nominal, so a plus-minus callout is negative here. */
  readonly lower_deviation?: number;
  readonly lower_bound?: number;
  readonly upper_bound?: number;
  readonly entity_ids?: readonly string[];
  readonly secondary_entity_ids?: readonly string[];
}

/** The properties of one face that a dimensional callout can be checked against. */
export interface FaceProperty {
  readonly surface_type?: string;
  readonly diameter?: number;
}

/** A declared range a measured value has to fall inside. */
interface Limits {
  readonly lower: number;
  readonly upper: number;
}

/**
 * How close two numbers have to be to count as the same, or as inside a limit.
 *
 * Shared by the diameter comparison and the limit test: a face that measures 35.0000000000002
 * against a nominal of 35, with an upper limit of 35, is at the limit, not past it, and
 * floating-point noise must not make that a violation.
 */
const EPSILON = 1e-6;

/**
 * One row per callout, whether or not it could be checked.
 *
 * Callouts are grouped by kind and face set first, because a file can carry the same
 * callout more than once — once with its value and once without — and the valued one is
 * the callout. Two *valued* copies that disagree are a contradiction in the file, which
 * is reported as such rather than resolved by picking one here.
 * @param dimensions - dimensional callouts, in file order.
 * @param faces - face properties by entity ID, for the faces the callouts name.
 * @param toleranceFaceKeys - face-set keys of the geometric tolerances, so a location
 * dimension that defines one of those frames is recognised as basic.
 * @returns one characteristic per callout.
 */
export function evaluateDimensions(
  dimensions: readonly DimensionCallout[],
  faces: ReadonlyMap<string, FaceProperty>,
  toleranceFaceKeys: ReadonlySet<string>,
): Characteristic[] {
  const groups = new Map<string, DimensionCallout[]>();
  for (const callout of dimensions) {
    const key = `${callout.kind}|${faceSetKey(callout.entity_ids ?? [])}`;
    const group = groups.get(key) ?? [];
    group.push(callout);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => evaluateGroup(group, faces, toleranceFaceKeys));
}

/**
 * The face-set key used to recognise a basic dimension.
 * @param entityIds - the faces a callout or tolerance controls.
 * @returns an order-independent key.
 */
export function faceSetKey(entityIds: readonly string[]): string {
  return [...entityIds].sort().join(',');
}

/**
 * Evaluate one group of callouts that name the same faces in the same way.
 * @param group - at least one callout.
 * @param faces - face properties by ID.
 * @param toleranceFaceKeys - face-set keys of the geometric tolerances.
 * @returns the characteristic.
 */
function evaluateGroup(
  group: readonly DimensionCallout[],
  faces: ReadonlyMap<string, FaceProperty>,
  toleranceFaceKeys: ReadonlySet<string>,
): Characteristic {
  const valued = group.filter((callout) => callout.value_resolved);
  const [firstValued] = valued;
  if (firstValued !== undefined && valued.some((callout) => !sameNominal(callout, firstValued))) {
    return {
      requirement: `${firstValued.kind} stated twice with different values`,
      state: 'conflicting',
      entity_ids: [...(firstValued.entity_ids ?? [])],
      reason: 'duplicate-disagrees',
      note: 'The file carries two valued callouts for the same faces that do not agree.',
    };
  }
  // A group with no valued member still produces a row, so the callout is accounted for
  // instead of quietly disappearing.
  const callout = firstValued ?? group[0];
  if (callout === undefined) throw new Error('a callout group cannot be empty');
  return evaluate(callout, faces, toleranceFaceKeys);
}

/**
 * Whether two callouts state the same nominal.
 * @param a - one callout.
 * @param b - the other.
 * @returns whether they agree.
 */
function sameNominal(a: DimensionCallout, b: DimensionCallout): boolean {
  return Math.abs(a.nominal - b.nominal) <= EPSILON;
}

/**
 * Evaluate one callout.
 * @param callout - the callout.
 * @param faces - face properties by ID.
 * @param toleranceFaceKeys - face-set keys of the geometric tolerances.
 * @returns the characteristic.
 */
function evaluate(
  callout: DimensionCallout,
  faces: ReadonlyMap<string, FaceProperty>,
  toleranceFaceKeys: ReadonlySet<string>,
): Characteristic {
  const entityIds = [...(callout.entity_ids ?? [])];
  const requirement = describeCallout(callout);
  // A dimension between two features names the second one separately, and a tolerance
  // frame that controls both names them together — so the basic-dimension test has to
  // compare the whole face set, not the first list.
  const controlledFaces = [...entityIds, ...(callout.secondary_entity_ids ?? [])];

  // A location dimension that defines a tolerance frame is not a requirement of its own:
  // the frame is the requirement, and checking the dimension would invent a limit.
  if (
    callout.tolerance_form === 'none' &&
    controlledFaces.length > 0 &&
    toleranceFaceKeys.has(faceSetKey(controlledFaces))
  ) {
    return {
      requirement,
      state: 'not-applicable',
      entity_ids: entityIds,
      reason: 'basic-dimension',
      note: 'A basic dimension defining a tolerance frame: it states no limit of its own.',
    };
  }
  if (!callout.value_resolved) {
    return {
      requirement,
      state: 'unresolved',
      entity_ids: entityIds,
      reason: 'value-unresolved',
      note: 'The magnitude could not be read, so the reported 0 is absence and not a value.',
    };
  }
  const limits = limitsOf(callout);
  if (limits === undefined) {
    return {
      requirement,
      state: 'unresolved',
      entity_ids: entityIds,
      nominal: callout.nominal,
      reason: 'no-tolerance',
      note: 'No tolerance is declared, so there is no limit to compare against.',
    };
  }
  const measured = measure(callout, entityIds, faces);
  if (measured === undefined) {
    return {
      requirement,
      state: 'unresolved',
      entity_ids: entityIds,
      nominal: callout.nominal,
      reason: callout.kind === 'diameter' ? 'unsupported-surface' : 'needs-frame',
      note:
        callout.kind === 'diameter'
          ? 'The annotated faces are not cylindrical, so there is no diameter to read.'
          : `A ${callout.kind} callout needs the frame it is stated in, which this reader cannot derive.`,
    };
  }
  if (measured === 'mixed') {
    return {
      requirement,
      state: 'conflicting',
      entity_ids: entityIds,
      nominal: callout.nominal,
      reason: 'faces-disagree',
      note: 'The annotated faces report different diameters, so they are not one feature.',
    };
  }

  const within = measured >= limits.lower - EPSILON && measured <= limits.upper + EPSILON;
  return {
    requirement,
    state: within ? 'satisfied' : 'violated',
    entity_ids: entityIds,
    nominal: callout.nominal,
    measured,
    deviation: measured - callout.nominal,
    note: `Measured ${format(measured)} against ${format(limits.lower)} … ${format(limits.upper)}.`,
  };
}

/**
 * The limit a measured value has to fall inside.
 * @param callout - the callout.
 * @returns the limits, or undefined when none are declared.
 */
function limitsOf(callout: DimensionCallout): Limits | undefined {
  if (callout.lower_bound !== undefined && callout.upper_bound !== undefined) {
    return { lower: callout.lower_bound, upper: callout.upper_bound };
  }
  if (callout.upper_deviation !== undefined || callout.lower_deviation !== undefined) {
    // Deviations are signed offsets from the nominal, so they add rather than replace.
    return {
      lower: callout.nominal + (callout.lower_deviation ?? 0),
      upper: callout.nominal + (callout.upper_deviation ?? 0),
    };
  }
  return undefined;
}

/**
 * The measured value for a callout.
 *
 * Only a diameter is evaluated today. A diameter callout names the cylindrical faces of
 * one feature and each of them reports its own diameter, so the comparison is a read
 * rather than a derivation. Everything else needs the frame the callout is stated in —
 * the angle between two faces is either the angle or its supplement depending on that
 * frame, and a location dimension's direction is part of it — so those are reported
 * unresolved instead of guessed at.
 * @param callout - the callout.
 * @param entityIds - the faces it controls.
 * @param faces - face properties by ID.
 * @returns the diameter, `mixed` when the faces disagree, or undefined when unreadable.
 */
function measure(
  callout: DimensionCallout,
  entityIds: readonly string[],
  faces: ReadonlyMap<string, FaceProperty>,
): number | 'mixed' | undefined {
  if (callout.kind !== 'diameter') return undefined;
  const diameters: number[] = [];
  for (const id of entityIds) {
    const face = faces.get(id);
    if (face?.surface_type !== 'cylinder' || face.diameter === undefined) return undefined;
    diameters.push(face.diameter);
  }
  const [first] = diameters;
  if (first === undefined) return undefined;
  if (diameters.some((diameter) => Math.abs(diameter - first) > EPSILON)) return 'mixed';
  return first;
}

/**
 * A callout as it reads, e.g. `diameter 35 +0 / -0.2`.
 * @param callout - the callout.
 * @returns the requirement text.
 */
function describeCallout(callout: DimensionCallout): string {
  const nominal = format(callout.nominal);
  if (callout.lower_bound !== undefined && callout.upper_bound !== undefined) {
    return `${callout.kind} ${nominal} (${format(callout.lower_bound)} … ${format(callout.upper_bound)})`;
  }
  if (callout.upper_deviation !== undefined || callout.lower_deviation !== undefined) {
    const upper = callout.upper_deviation ?? 0;
    const lower = callout.lower_deviation ?? 0;
    return `${callout.kind} ${nominal} +${format(upper)} / ${format(lower)}`;
  }
  return `${callout.kind} ${nominal}`;
}

/**
 * A number without trailing zeroes, so a requirement reads like a drawing.
 * @param value - the number.
 * @returns its shortest decimal form.
 */
function format(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}
