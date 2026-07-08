---
id: clean_import_verification
field: is_valid
tolerance: 0
max_steps: 8
files:
  block: clean_block.step
---

# Import quality verification

We just imported this STEP file from a supplier. Before we use it for
toolpath generation, verify the import quality.

Is the model valid? Are there any degenerate edges or free edges?
Are any face tolerances above 0.1mm? Is this import clean and
reliable?

Return JSON: {"is_valid": boolean, "degenerate_edges": number, "free_edges": number, "max_tolerance_below_01": boolean}
