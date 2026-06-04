# 11 — Open Questions

## Product questions

1. Who is the initial buyer?
   - individual engineer
   - engineering manager
   - CAD admin
   - manufacturing lead
   - AI/IT team

2. What is the first industry?
   - consumer products
   - medical devices
   - aerospace/defense
   - robotics
   - industrial equipment
   - contract manufacturing

3. What is the first CAD ecosystem?
   - SOLIDWORKS
   - Fusion
   - Inventor
   - NX
   - Creo
   - STEP-only

4. What is the first manufacturing process?
   - CNC milling
   - sheet metal
   - additive manufacturing
   - injection molding

Recommended answers for MVP:

- buyer: engineering manager / CAD admin
- CAD: STEP-first, SOLIDWORKS later
- process: CNC milling
- distribution: Microsoft Copilot agent + web console

## Technical questions

1. Which CAD kernel/library should be used first?
   - OpenCascade/pythonOCC
   - FreeCAD headless
   - commercial translator

2. How accurate do wall-thickness checks need to be for MVP?

3. How should screenshots be generated headlessly?

4. How should geometry locations map to viewer highlights?

5. Should reports include raw coordinates/face IDs?

6. Do we need assembly support in MVP?

7. Should uploaded CAD files be stored, or deleted after analysis?

8. How do we handle units/material uncertainty?

9. How do we prevent LLMs from overstating findings?

10. Which output matters most: Copilot response, HTML report, PDF report, or 3D viewer?

## Microsoft questions

1. Is the initial integration Microsoft 365 Copilot declarative agent or Copilot Studio agent?

2. Does the customer allow partner MCP servers?

3. Will the MCP gateway run in your cloud, their Azure tenant, or both?

4. Will company docs be synced into Graph or queried live through MCP?

5. How will the tool be approved by tenant admins?

6. Do interactive MCP Apps/widgets work well enough for the 3D viewer, or should the viewer open externally?

## Local companion questions

1. Is local install acceptable for pilot users?

2. Can IT deploy via Intune?

3. Is a signed MSIX/MSI required?

4. Which CAD apps are installed?

5. Can the app use CAD APIs, or only exported files?

6. Can the companion send screenshots to Copilot?

7. Can it send report JSON only?

8. Can it upload raw CAD to a tenant-hosted service?

## Data questions

1. What company standards exist?
2. Are supplier capability sheets structured?
3. Are approved part catalogs accessible?
4. Is PDM/PLM API access available?
5. Are drawings mostly PDFs?
6. Is there historical ECO/design-review data?

## Risk questions

1. What happens if the tool misses a manufacturability issue?
2. What disclaimers are needed?
3. Should the report be supplier-facing by default?
4. Who signs off on findings?
5. Can users override findings?
6. How are false positives handled?

## Recommended next validation interviews

Interview 5 mechanical engineers and ask:

1. What are the last three design-review comments you received?
2. What CAD tasks do you Google most often?
3. What supplier/manufacturing issues cause the most rework?
4. Would you upload STEP files to a company-approved Copilot agent?
5. Would you install a local companion if IT approved it?
6. What would make you trust an AI-generated DFM report?
7. What report format would you actually send?
8. What CAD system/version do you use daily?
9. Where are your company design standards stored?
10. What would make this worth paying for?
