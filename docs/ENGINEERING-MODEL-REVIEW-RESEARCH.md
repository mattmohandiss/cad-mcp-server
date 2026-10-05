# Mechanical Engineering Model-Review Research

**Purpose:** Give a follow-on reviewer a sourced starting point for deciding how a CAD MCP server could better support engineering workflows. This is a research brief, not an engineering standard or a proposed tool contract.

**Research snapshot:** October 2026. Links and publication details were checked during preparation; standards and commercial books may require purchase or institutional access.

## Executive summary

Mechanical design reviews are question- and requirement-driven. Engineers combine geometry with design intent, product/manufacturing information (PMI), materials, loads, process capability, and verification evidence. Geometry can answer questions about the nominal modeled shape and spatial relationships, but usually cannot establish production fit, strength, safety, or manufacturability on its own.

For each engineering question, distinguish:

1. **Decision sought** — what the engineer needs to decide.
2. **Required evidence** — model geometry, PMI, materials, loads, process assumptions, requirements, or inspection data.
3. **Analysis** — the calculation, comparison, or reasoning that connects evidence to the decision.
4. **Limits** — missing inputs and conclusions that are therefore unsupported.

The design opportunity is not simply to return fewer numbers. It is to return the right evidence for a question, with units, entity identity, provenance, calculation method, and limitations made clear. CAD-kernel calculations should handle geometry and exact arithmetic; engineering judgment should remain bounded by available requirements and assumptions.

## What engineers do when reviewing a model

The following activities recur in mechanical design and product reviews. Their relative importance depends on the product, design stage, industry, and applicable standards.

### 1. Check the design against requirements

Determine whether the design addresses required functions, interfaces, operating conditions, and constraints. A review is not just a visual plausibility check; it looks for traceability between the requirement and the design or verification evidence.

Sources:

- [NASA Systems Engineering Handbook — 4.0 System Design Processes](https://www.nasa.gov/reference/4-0-system-design-processes/)
- [NASA Systems Engineering Handbook — 5.0 Product Realization](https://www.nasa.gov/reference/5-0-product-realization/)

### 2. Review assembly fit and interfaces

Check whether components intersect where they should not, intended contacts or clearances exist, and parts can be assembled and accessed. Typical questions include whether a fastener clears adjacent geometry, a component can be inserted, or space is available for a tool, seal, hose, or connector. Interference detection identifies geometric overlaps for evaluation; an overlap is not automatically a design defect.

Sources:

- [SOLIDWORKS — Interference Detection](https://help.solidworks.com/2025/english/SolidWorks/Sldworks/t_detecting_interferences.htm)
- Wilson, “Geometric reasoning about mechanical assembly” (1994), [paper page](https://www.sciencedirect.com/science/article/pii/0004370294900485)
- Wilson, “Geometric reasoning about assembly tools” (1998), [paper page](https://www.sciencedirect.com/science/article/pii/S0004370297000623)

### 3. Assess fit under tolerances, not only nominal geometry

A nominal gap or diameter does not establish a production fit. Engineers consider size and geometric tolerances, datum references, functional relationships, manufacturing variation, and how variation accumulates across an assembly. Depending on the requirement, they may use worst-case or statistical methods.

Sources:

- [ASME Y14.5 — Dimensioning and Tolerancing](https://www.asme.org/codes-standards/find-codes-standards/dimensioning-and-tolerancing)
- NASA, [Vehicle Integration / Tolerance Buildup Practices](https://extapps.ksc.nasa.gov/Reliability/Documents/Preferred_Practices/1219.pdf)
- NIST, [Tolerance Specification and Related Issues for Additively Manufactured Products](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=918041)

### 4. Check manufacturability and inspectability

Review feature accessibility, tooling and process constraints, inspection access, and whether specified geometry and tolerances are practical for the intended process. The relevant evidence depends on the process: molding, machining, casting, additive manufacturing, and fabrication have different constraints. Draft and thickness analysis are examples of process-specific checks, not universal release checks.

Sources:

- [SOLIDWORKS — Draft Analysis](https://help.solidworks.com/2025/english/SolidWorks/sldworks/c_Draft_Analysis_Overview.htm)
- [SOLIDWORKS — Thickness Analysis](https://help.solidworks.com/2025/english/SolidWorks/sldworks/c_thickness_analysis.htm)
- MIT OpenCourseWare, [2.008 Design and Manufacturing II](https://ocw.mit.edu/courses/2-008-design-and-manufacturing-ii-spring-2025/)
- U.S. Department of Energy, [Design for Manufacturing, Assembly, and Reliability module](https://www.energy.gov/sites/default/files/2021-07/Module_3D.pdf)

### 5. Verify structural or functional performance when required

For load-bearing designs, engineers may assess stress, deflection, fatigue, vibration, thermal response, or other requirement-specific behavior. Geometry alone is insufficient: analysis also needs appropriate materials, loads, supports/constraints, contact assumptions, and acceptance criteria.

Source:

- Budynas and Nisbett, [_Shigley’s Mechanical Engineering Design_](https://www.mheducation.com/highered/product/shigleys-mechanical-engineering-design-nisbett.html), covering materials, load/stress, deflection, failure, machine elements, GD&T, and finite-element analysis.

### 6. Review lifecycle and release readiness

Check that the model and associated product definition are complete, consistent, and suitable for the next stage—manufacturing, assembly, verification, or release. Findings should be tied to a requirement, risk, or follow-up action rather than presented as an unqualified judgment about shape.

For safety/reliability contexts, NASA describes FMECA as a design-development activity that identifies failure modes and effects and is updated as design and operational knowledge mature: [GSFC-HDBK-8004 — Guideline for Failure Modes and Effects Analysis and Risk Assessment](https://standards.nasa.gov/standard/GSFC/GSFC-HDBK-8004).

## Question-to-evidence map

This is a working synthesis of the sources above, not a universal checklist. A real analysis must follow the applicable design requirements, standards, and process context.

| Engineer’s question                                   | Typical evidence / inputs                                                                                                                       | Analysis or comparison                                                               | What geometry alone cannot establish                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| What is the nominal clearance between these features? | Identified entities, component occurrences and transforms, units, model geometry                                                                | Distance/clearance calculation with a defined metric (e.g. minimum surface distance) | Production clearance, tolerance margin, or fit acceptance                            |
| Will these parts fit in production?                   | Functional gap/fit requirement, size and GD&T tolerances, datums, tolerance path, manufacturing variation, chosen worst-case/statistical method | Tolerance stack or fit analysis; compare result against requirement                  | Fit probability or guaranteed fit without tolerances, distributions, and assumptions |
| Do these parts interfere in the nominal assembly?     | Correct assembly state, component identities, geometry, contact/overlap policy and geometric tolerance                                          | Pairwise interference or clearance calculation                                       | Whether overlap is intended, acceptable, or caused by a bad export/model             |
| Can this part be assembled, removed, or serviced?     | Geometry and poses, candidate motion directions, sequence, neighboring parts; tool/grasp/access constraints as applicable                       | Collision-free path/access and precedence analysis                                   | Feasibility if tools, fixtures, flexible parts, or process steps are omitted         |
| Will this part survive the load?                      | Geometry, material properties, loads, supports, contacts, environment, failure criterion and safety factor/acceptance criteria                  | Hand calculation or validated simulation (stress, deflection, fatigue, etc.)         | Strength, life, or safety based only on shape or volume                              |
| Can this geometry be manufactured?                    | Geometry plus intended material/process, equipment/process capability, feature access, quantity/cost constraints                                | Process-specific DFM rules and capability comparison                                 | Manufacturability or cost without process and supplier context                       |
| Can the part be inspected against its definition?     | PMI/GD&T, datums, tolerances, accessible features, inspection method and uncertainty                                                            | Inspection-planning and measurement-capability evaluation                            | Conformance from nominal CAD geometry                                                |
| Is this model complete enough to release?             | Requirements, product definition/PMI, revision/configuration, verification results, open risks/actions                                          | Traceability/completeness review                                                     | Release readiness from geometric validity alone                                      |

## Important distinctions for tool outputs

### Nominal model result vs. production claim

A CAD-kernel result such as a distance between ideal surfaces is a result about the represented model. It is not automatically a measurement of a manufactured part, an uncertainty statement, or a tolerance-qualified conclusion.

### Numeric precision vs. engineering accuracy

Floating-point output with many decimal places does not imply the underlying design or manufactured part is known to that accuracy. NIST’s measurement guidance discusses sources of uncertainty in CMM results, including instrument, operational, sampling, and measurement-specific effects:

- [NIST — Measurement Uncertainty Considerations for Coordinate Measuring Machines](https://www.nist.gov/publications/measurement-uncertainty-considerations-coordinate-measuring-machines)
- [NIST — Measurement Uncertainty](https://www.nist.gov/itl/sed/topic-areas/measurement-uncertainty)

### Geometry vs. complete product definition

Product and Manufacturing Information (PMI) can include GD&T, datum references, surface texture, material/process notes, and other requirements. NIST distinguishes machine-interpretable **semantic PMI** from primarily human-readable **graphical PMI** and documents the challenges of transferring PMI reliably between CAD and downstream systems:

- [NIST — MBE PMI Validation and Conformance Testing](https://www.nist.gov/ctl/smart-connected-systems-division/smart-connected-manufacturing-systems-group/mbe-pmi-validation)
- [NIST — Guide to PMI CAD Models and Verification Results](https://www.nist.gov/publications/guide-nist-pmi-cad-models-and-cad-system-pmi-modeling-capability-verification-testing)

An apparently valid STEP solid may not contain, preserve, or expose all the information needed to make a tolerance- or requirement-based judgment.

### Geometric observation vs. engineering disposition

Examples:

- An overlap is evidence of nominal geometric intersection under the chosen calculation; it does not by itself show whether the overlap is intentional or unacceptable.
- A small wall thickness is a geometric observation; whether it is inadequate depends on material, process, loads, environment, and requirements.
- A cylindrical face is not necessarily a hole, shaft, or mating interface without topology/context or design intent.

## Recommended references

### Books to buy or consult

1. **Bryan R. Fischer, _Mechanical Tolerance Stackup and Analysis_, 2nd ed.** — Practical step-by-step treatment of tolerance stackups and assembly effects. Most directly useful for translating “will it fit?” into a defined functional output, dimension loop, assumptions, and calculation. [Publisher/catalog search](https://www.routledge.com/search?kw=Mechanical%20Tolerance%20Stackup%20and%20Analysis%20Fischer)
2. **James D. Meadows, _Geometric Dimensioning and Tolerancing: Applications, Analysis, Gauging and Measurement_ (ASME, aligned to Y14.5-2018).** — GD&T interpretation, functional tolerancing, stack-up, gauging, and measurement. [ASME Digital Collection](https://asmedigitalcollection.asme.org/ebooks/book/252/Geometric-Dimensioning-and-Tolerancing)
3. **Georg Henzold, _Geometrical Dimensioning and Tolerancing for Design, Manufacturing and Inspection_, 3rd ed.** — Covers ISO and ASME approaches, tolerance chains, statistical tolerancing, manufacturing, and inspection. [Elsevier](https://shop.elsevier.com/books/geometrical-dimensioning-and-tolerancing-for-design-manufacturing-and-inspection/henzold/978-0-12-824061-8)
4. **Richard G. Budynas and J. Keith Nisbett, _Shigley’s Mechanical Engineering Design_.** — Broad foundation for loads, stress, deflection, fatigue, machine elements, and design decisions. [McGraw Hill](https://www.mheducation.com/highered/product/shigleys-mechanical-engineering-design-nisbett.html)

### Papers, reports, and course notes

- **NIST, _Design for Tolerance of Electro-Mechanical Assemblies: An Integrated Approach_.** Free report; discusses assembly models and a staged tolerance-design process, from early concepts to detailed analysis/synthesis. [PDF](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir6223.pdf)
- **Fritz Scholz, _Tolerance Stack Analysis Methods: A Critical Review_.** Free notes; formalizes an assembly criterion as a function of part dimensions, compares methods, and exposes assumptions. [PDF](https://faculty.washington.edu/fscholz/DATAFILES498B2008/TOLSTACK.pdf)
- **MIT OCW 2.008, _Design and Manufacturing II_.** Free lecture notes on manufacturing, assembly, and tolerances; the 2025 assembly lecture connects design variation with assembly stack-up and process decisions. [Course](https://ocw.mit.edu/courses/2-008-design-and-manufacturing-ii-spring-2025/) · [Assembly lecture](https://ocw.mit.edu/courses/2-008-design-and-manufacturing-ii-spring-2025/mit2_008_s25_lec09.pdf)
- **Wilson, “Geometric reasoning about mechanical assembly” (1994).** Research on assembly/disassembly ordering and geometric blocking. [Paper](https://www.sciencedirect.com/science/article/pii/0004370294900485)
- **“QueryCAD: Grounded Question Answering for CAD Models” (2024).** CAD QA system and benchmark; questions focus mainly on retrieving/counting/measuring model properties, rather than proving tolerance-qualified engineering decisions. [arXiv](https://arxiv.org/html/2409.08704v3)
- **NIST PMI Validation and Conformance Testing.** Public test cases and research on preserving semantic and graphical PMI across CAD and exchange formats. [Project](https://www.nist.gov/ctl/smart-connected-systems-division/smart-connected-manufacturing-systems-group/mbe-pmi-validation)

## Research gaps and questions for the follow-on reviewer

The sources provide useful workflows and domain methods, but do not prescribe one universal MCP schema. Please assess:

1. Which question families are realistic and valuable for a geometry-focused, read-only STEP MCP server?
2. For each family, what should the kernel calculate deterministically, what should the LLM infer, and what requires external evidence (PMI, requirements, material, loads, process, or inspection data)?
3. Which outputs should be summary-first, and what drill-down evidence must remain available (entity IDs, component occurrence, units, coordinate frame, method, source revision)?
4. How should outputs represent nominal values, tolerance bounds, statistical assumptions, and measurement uncertainty without conflating them?
5. What ambiguity/unsupported-input behavior is necessary so the agent asks for missing context instead of fabricating it?
6. What benchmark cases and expected evidence would test whether an agent followed the engineering workflow rather than merely retrieving numbers?

Potential initial benchmark families: nominal clearance/interference; tolerance-qualified fit (with PMI); repeated-instance identification; access/path feasibility; hole-pattern alignment; wall-thickness/draft screening tied to a specified process; and a strength question that must correctly identify missing load/material/boundary-condition inputs.

## Scope and caveats

- This brief summarizes public guidance and educational/research resources; it is not a substitute for applicable standards, qualified engineering review, or product-specific requirements.
- Some standards and books are commercial or access-controlled. Use the current edition and governing system (ASME or ISO) for real design work; their rules are not interchangeable by assumption.
- Several links are broad handbook or software-help pages. They illustrate workflow categories, not universal acceptance criteria.
- The reported “best starting set” is a practical recommendation for further research, not a claim of exhaustive literature review.
