# 01 — Product Brief

## Working name

**Engineering Context Layer for Microsoft Copilot**

Other possible names:

- CAD Context MCP
- Design Review MCP
- Engineering Twin Server
- DFM Copilot Tools
- Mechanical Design Context Server

## Problem

Mechanical engineers increasingly have access to enterprise AI chatbots, but those chatbots are usually weak for real engineering work because they cannot:

- understand CAD geometry
- inspect the active model
- reason over drawings, BOMs, tolerances, and assemblies
- run deterministic manufacturability checks
- cite company-specific design standards
- produce evidence-backed handoff reports
- tailor CAD tutorials to the installed software/version

Generic chatbots can say what a design review should include, but they cannot actually perform the review.

## Product thesis

The right product is not a standalone chatbot. It is a **tool layer** that gives existing AI agents reliable engineering capabilities.

The AI should call deterministic tools for geometry, DFM, standards lookup, and report generation. The LLM should mainly orchestrate, explain, summarize, and format.

## Target users

Primary users:

- mechanical design engineers
- manufacturing engineers
- tooling engineers
- supplier quality engineers
- engineering managers
- CAD admins / PLM admins

Initial buyer/champion:

- engineering manager frustrated by design-review bottlenecks
- CAD/PLM admin looking to standardize engineering workflows
- manufacturing lead trying to reduce supplier back-and-forth
- innovation/AI lead at an engineering company

## Initial wedge

Start with:

> "Add this Microsoft Copilot-compatible engineering agent. It can answer CAD workflow questions, search company design standards, analyze STEP/PDF files, detect manufacturability risks, and generate supplier handoff reports."

Do **not** require local install for the MVP.

## Killer use cases

### 1. CAD tutorial help

User asks:

> "How do I add a threaded hole in SOLIDWORKS 2024?"

The system answers with:

- version-specific steps
- correct CAD terminology
- company standard notes
- when to use cosmetic threads vs modeled threads
- drawing callout advice

### 2. Manufacturability review

User asks:

> "Review this STEP file for CNC manufacturability."

The system returns:

- ranked issue list
- visual evidence
- measurements
- process-specific risks
- suggested fixes
- report export

### 3. Company design-standard lookup

User asks:

> "Can I use this fastener?"

The system checks:

- company standards
- approved part catalogs
- supplier constraints
- historical design-review notes

### 4. Engineering handoff report

User asks:

> "Create a supplier handoff report for this part."

The system generates:

- part summary
- assumptions
- manufacturing risks
- drawing/BOM checklist
- questions for supplier
- screenshots/annotations

### 5. Future: live CAD context

User asks:

> "What is wrong with the part I have open?"

The optional local companion:

- detects the active CAD session
- exports a local twin snapshot
- runs analysis
- returns context to Copilot

## Non-goals for MVP

Do not start with:

- native CAD editing
- full generative CAD
- FEA/CFD simulation
- full PLM integration
- all CAD formats
- all manufacturing processes
- direct live CAD session access

## MVP scope

MVP should support:

- Microsoft Copilot-compatible remote MCP server
- CAD tutorials using curated docs and company standards
- STEP file upload/selection
- PDF drawing upload/selection
- basic CNC manufacturability review
- basic drawing checklist
- Markdown/HTML report generation
- structured JSON findings
- citations to company docs
- audit logs

## Long-term differentiation

The long-term product becomes powerful when it combines:

1. CAD geometry
2. manufacturing rules
3. company standards
4. supplier constraints
5. revision history
6. optional live CAD context
7. safe digital twin proposals
8. Microsoft Copilot distribution
