import { readStepText } from '../occt-wasm/import.js';

export interface ParsedStepMetadata {
  schema?: string;
  applicationProtocol?: string;
  productNames: string[];
  authoringSystem?: string;
  pmiKeywords: string[];
  entityCounts: Record<string, number>;
}

const PMI_KEYWORDS = [
  'DRAUGHTING_CALLOUT',
  'GEOMETRIC_TOLERANCE',
  'DIMENSIONAL_LOCATION',
  'DIMENSIONAL_SIZE',
  'SHAPE_ASPECT',
  'DATUM',
  'ANNOTATION_OCCURRENCE',
  'PRESENTATION_VIEW',
];

export async function parseStepMetadata(filePath: string): Promise<ParsedStepMetadata> {
  const text = await readStepText(filePath);
  const header = getSection(text, 'HEADER') ?? text.slice(0, 12000);
  const schema = matchFirst(header, /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
  const authoringSystem = matchFirst(
    header,
    /FILE_NAME\s*\([^;]*?\((?:[^']*'[^']*')*[^)]*\)\s*,\s*'([^']*)'/is
  );
  const productNames = uniqueMatches(text, /PRODUCT\s*\(\s*'([^']*)'/gi).slice(0, 50);
  const pmiKeywords = PMI_KEYWORDS.filter((keyword) => text.toUpperCase().includes(keyword));

  return {
    schema,
    applicationProtocol: schema,
    productNames,
    authoringSystem: authoringSystem || undefined,
    pmiKeywords,
    entityCounts: countEntities(text),
  };
}

function getSection(text: string, sectionName: string): string | undefined {
  const regex = new RegExp(`${sectionName};([\\s\\S]*?)ENDSEC;`, 'i');
  return regex.exec(text)?.[1];
}

function matchFirst(text: string, regex: RegExp): string | undefined {
  const match = regex.exec(text);
  return match?.[1]?.trim() || undefined;
}

function uniqueMatches(text: string, regex: RegExp): string[] {
  const values = new Set<string>();
  for (const match of text.matchAll(regex)) {
    const value = match[1]?.trim();
    if (value) values.add(value);
  }
  return [...values];
}

function countEntities(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const entityRegex = /^#\d+\s*=\s*([A-Z0-9_]+)/gim;

  for (const match of text.matchAll(entityRegex)) {
    const entity = match[1];
    if (entity) counts[entity] = (counts[entity] ?? 0) + 1;
  }

  return counts;
}
