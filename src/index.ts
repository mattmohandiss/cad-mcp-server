#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import pkg from '../package.json' with { type: 'json' };
import * as inspectStep from './tools/inspect.js';
import * as findFaces from './tools/find-faces.js';
import * as findEdges from './tools/find-edges.js';
import * as measureDistance from './tools/measure-distance.js';
import * as measureThickness from './tools/measure-thickness.js';
import * as measureDraft from './tools/measure-draft.js';
import * as measureGeometry from './tools/measure-geometry.js';
import * as diffStep from './tools/diff.js';
import { queryHelpResourceHandler, QUERY_HELP_URI } from './resources/query-help.js';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
} as const;

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  serveStdio(() => {
    const server = new McpServer({
      name: 'cad-mcp-server',
      version: pkg.version,
    });

    server.registerTool(
      'inspect_step',
      {
        description:
          'Use this FIRST for a compact model overview: dimensions, bounding box, body/face/edge counts, validity, watertight status. Use include[] for bodies, quality, pmi, inertia, or topology detail.',
        inputSchema: inspectStep.schema,
        annotations: READ_ONLY,
      },
      inspectStep.handler,
    );

    server.registerTool(
      'find_faces',
      {
        description:
          'Find faces by type, area, radius, normal, quality, or body. Returns IDs, surface types, areas, radii, diameters, axes, normals. Use returned IDs in measure_distance, measure_thickness, measure_draft, or measure_geometry.',
        inputSchema: findFaces.schema,
        annotations: READ_ONLY,
      },
      findFaces.handler,
    );

    server.registerTool(
      'find_edges',
      {
        description:
          'Find edges by curve type, length, radius, or dihedral angle. Returns IDs, curve types, lengths, radii, diameters. Use returned IDs in measure_distance or measure_geometry.',
        inputSchema: findEdges.schema,
        annotations: READ_ONLY,
      },
      findEdges.handler,
    );

    server.registerTool(
      'measure_distance',
      {
        description:
          'Measure distance between entity sets. Pass sources[] and targets[] for set-based measurement (e.g. clearance between holes and walls). Use summary="minimum" for the closest pair only.',
        inputSchema: measureDistance.schema,
        annotations: READ_ONLY,
      },
      measureDistance.handler,
    );

    server.registerTool(
      'measure_thickness',
      {
        description:
          'Measure wall thickness across faces via ray grid sampling. Returns min/max/avg thickness per face. Use direction_mode="normal" (default) or direction_mode="axis".',
        inputSchema: measureThickness.schema,
        annotations: READ_ONLY,
      },
      measureThickness.handler,
    );

    server.registerTool(
      'measure_draft',
      {
        description:
          'Measure draft angles of faces relative to a pull direction. Returns draft_angle_deg, normal, and undercut flag per face. Positive = good for ejection; negative = undercut.',
        inputSchema: measureDraft.schema,
        annotations: READ_ONLY,
      },
      measureDraft.handler,
    );

    server.registerTool(
      'measure_geometry',
      {
        description:
          'Ray tests, point analysis, cross-sections, and edge continuity. measurement_type selects the operation: ray, ray_grid, point_analysis, section, or continuity.',
        inputSchema: measureGeometry.schema,
        annotations: READ_ONLY,
      },
      measureGeometry.handler,
    );

    server.registerTool(
      'diff_step',
      {
        description:
          'Compare two STEP files. Returns deltas: volume, surface area, dimensions, face/edge/body counts. Comparison minus baseline.',
        inputSchema: diffStep.schema,
        annotations: READ_ONLY,
      },
      diffStep.handler,
    );

    server.registerResource(
      'query-help',
      QUERY_HELP_URI,
      {
        title: 'CAD MCP query help',
        description:
          'Schema reference for all 8 tools: filters, include presets, summaries, measurements, and examples. Fetched on demand by the LLM client.',
        mimeType: 'application/json',
        annotations: {
          audience: ['assistant'],
          priority: 0.9,
        },
      },
      async () => {
        const content = queryHelpResourceHandler();
        return {
          contents: [
            {
              uri: content.uri,
              mimeType: content.mimeType,
              text: content.text,
            },
          ],
        };
      },
    );

    return server;
  });

  console.error('CAD MCP Server started (8-tool surface)');
}
