---
id: cross_section_verification
field: web_thickness_mm
tolerance: 0.5
max_steps: 8
files:
  beam: c_channel_beam.step
---

# Cross-section: web thickness

This C-channel beam is 100mm long. We need to verify the web thickness.
Take a cross-section at mid-span and measure the distance between the
inner and outer walls of the vertical center web.

Return JSON: {"section_edges": number, "web_thickness_mm": number}
