//! Declarative method configuration for the facade code generator.
//!
//! Each entry in [`TARGET_METHODS`] describes one `OcctKernel` method that
//! can be auto-generated from a template. Methods with complex multi-step
//! logic are marked [`MethodKind::Skip`] and remain hand-written.

use anyhow::{bail, Result};

use super::types::{FacadeParam, MethodKind, MethodSpec, ReturnType};

/// All facade methods that the code generator knows about.
///
/// Methods marked [`MethodKind::Skip`] are listed for completeness but
/// will not produce generated code.
static TARGET_METHODS: &[MethodSpec] = &[
    // ── Transforms ────────────────────────────────────────────────
    MethodSpec {
        name: "translate",
        kind: MethodKind::SetupShape,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("dx"),
            FacadeParam::Double("dy"),
            FacadeParam::Double("dz"),
        ],
        occt_class: "BRepBuilderAPI_Transform",
        ctor_args: "get(id), trsf, true",
        setup_code: "gp_Trsf trsf;\ntrsf.SetTranslation(gp_Vec(dx, dy, dz));",
        includes: &["gp_Trsf.hxx", "gp_Vec.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "rotate",
        kind: MethodKind::SetupShape,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("px"),
            FacadeParam::Double("py"),
            FacadeParam::Double("pz"),
            FacadeParam::Double("dx"),
            FacadeParam::Double("dy"),
            FacadeParam::Double("dz"),
            FacadeParam::Double("angleRad"),
        ],
        occt_class: "BRepBuilderAPI_Transform",
        ctor_args: "get(id), trsf, true",
        setup_code: "gp_Trsf trsf;\ntrsf.SetRotation(gp_Ax1(gp_Pnt(px, py, pz), gp_Dir(dx, dy, dz)), angleRad);",
        includes: &["gp_Trsf.hxx", "gp_Ax1.hxx", "gp_Pnt.hxx", "gp_Dir.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "scale",
        kind: MethodKind::SetupShape,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("px"),
            FacadeParam::Double("py"),
            FacadeParam::Double("pz"),
            FacadeParam::Double("factor"),
        ],
        occt_class: "BRepBuilderAPI_Transform",
        ctor_args: "get(id), trsf, true",
        setup_code: "gp_Trsf trsf;\ntrsf.SetScale(gp_Pnt(px, py, pz), factor);",
        includes: &["gp_Trsf.hxx", "gp_Pnt.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "mirror",
        kind: MethodKind::SetupShape,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("px"),
            FacadeParam::Double("py"),
            FacadeParam::Double("pz"),
            FacadeParam::Double("nx"),
            FacadeParam::Double("ny"),
            FacadeParam::Double("nz"),
        ],
        occt_class: "BRepBuilderAPI_Transform",
        ctor_args: "get(id), trsf, true",
        setup_code: "gp_Trsf trsf;\ntrsf.SetMirror(gp_Ax2(gp_Pnt(px, py, pz), gp_Dir(nx, ny, nz)));",
        includes: &["gp_Trsf.hxx", "gp_Ax2.hxx", "gp_Pnt.hxx", "gp_Dir.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "copy",
        kind: MethodKind::SetupShape,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "BRepBuilderAPI_Copy",
        ctor_args: "get(id)",
        setup_code: "",
        includes: &[],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "linearPattern",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("dx"), FacadeParam::Double("dy"), FacadeParam::Double("dz"),
            FacadeParam::Double("spacing"),
            FacadeParam::Int("count"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Compound compound;
TopoDS_Builder builder;
builder.MakeCompound(compound);
const auto& original = get(id);
builder.Add(compound, original);
gp_Vec step(dx, dy, dz);
step.Normalize();
step.Multiply(spacing);
for (int i = 1; i < count; i++) {
    gp_Trsf trsf;
    gp_Vec offset = step.Multiplied(static_cast<double>(i));
    trsf.SetTranslation(offset);
    BRepBuilderAPI_Transform xform(original, trsf, true);
    builder.Add(compound, xform.Shape());
}
return store(compound);",
        includes: &["TopoDS_Compound.hxx", "TopoDS_Builder.hxx", "gp_Vec.hxx", "gp_Trsf.hxx", "BRepBuilderAPI_Transform.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "circularPattern",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("cx"), FacadeParam::Double("cy"), FacadeParam::Double("cz"),
            FacadeParam::Double("ax"), FacadeParam::Double("ay"), FacadeParam::Double("az"),
            FacadeParam::Double("angle"),
            FacadeParam::Int("count"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Compound compound;
TopoDS_Builder builder;
builder.MakeCompound(compound);
const auto& original = get(id);
builder.Add(compound, original);
gp_Ax1 axis(gp_Pnt(cx, cy, cz), gp_Dir(ax, ay, az));
double stepAngle = angle / static_cast<double>(count);
for (int i = 1; i < count; i++) {
    gp_Trsf trsf;
    trsf.SetRotation(axis, stepAngle * static_cast<double>(i));
    BRepBuilderAPI_Transform xform(original, trsf, true);
    builder.Add(compound, xform.Shape());
}
return store(compound);",
        includes: &["TopoDS_Compound.hxx", "TopoDS_Builder.hxx", "gp_Ax1.hxx", "gp_Pnt.hxx", "gp_Dir.hxx", "gp_Trsf.hxx", "BRepBuilderAPI_Transform.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "transform",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::VectorDouble("matrix")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (matrix.size() != 12) {
    throw std::runtime_error(\"transform: matrix must have 12 elements (3x4)\");
}
gp_Trsf trsf;
trsf.SetValues(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5], matrix[6],
               matrix[7], matrix[8], matrix[9], matrix[10], matrix[11]);
BRepBuilderAPI_Transform maker(get(id), trsf, true);
return store(maker.Shape());",
        includes: &["gp_Trsf.hxx", "BRepBuilderAPI_Transform.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "generalTransform",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::VectorDouble("matrix")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (matrix.size() != 12) {
    throw std::runtime_error(\"generalTransform: matrix must have 12 elements (3x4)\");
}
gp_GTrsf gt;
gt.SetValue(1, 1, matrix[0]); gt.SetValue(1, 2, matrix[1]); gt.SetValue(1, 3, matrix[2]); gt.SetValue(1, 4, matrix[3]);
gt.SetValue(2, 1, matrix[4]); gt.SetValue(2, 2, matrix[5]); gt.SetValue(2, 3, matrix[6]); gt.SetValue(2, 4, matrix[7]);
gt.SetValue(3, 1, matrix[8]); gt.SetValue(3, 2, matrix[9]); gt.SetValue(3, 3, matrix[10]); gt.SetValue(3, 4, matrix[11]);
BRepBuilderAPI_GTransform maker(get(id), gt, true);
if (!maker.IsDone()) {
    throw std::runtime_error(\"generalTransform: transform failed\");
}
return store(maker.Shape());",
        includes: &["gp_GTrsf.hxx", "BRepBuilderAPI_GTransform.hxx"],
        category: "transforms",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "translateBatch",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorShapeIds("ids"), FacadeParam::VectorDouble("offsets")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (offsets.size() != ids.size() * 3) {
    throw std::runtime_error(\"translateBatch: offsets must have 3 * ids.size() elements\");
}
std::vector<uint32_t> results;
results.reserve(ids.size());
for (size_t i = 0; i < ids.size(); i++) {
    gp_Trsf trsf;
    trsf.SetTranslation(gp_Vec(offsets[i * 3], offsets[i * 3 + 1], offsets[i * 3 + 2]));
    BRepBuilderAPI_Transform maker(get(ids[i]), trsf, true);
    results.push_back(store(maker.Shape()));
}
return results;",
        includes: &["gp_Trsf.hxx", "gp_Vec.hxx", "BRepBuilderAPI_Transform.hxx"],
        category: "transforms",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "composeTransform",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorDouble("m1"), FacadeParam::VectorDouble("m2")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (m1.size() != 12 || m2.size() != 12) {
    throw std::runtime_error(\"composeTransform: each matrix must have 12 elements\");
}
gp_Trsf t1, t2;
t1.SetValues(m1[0], m1[1], m1[2], m1[3], m1[4], m1[5], m1[6], m1[7], m1[8], m1[9], m1[10], m1[11]);
t2.SetValues(m2[0], m2[1], m2[2], m2[3], m2[4], m2[5], m2[6], m2[7], m2[8], m2[9], m2[10], m2[11]);
gp_Trsf result = t1.Multiplied(t2);
return {result.Value(1, 1), result.Value(1, 2), result.Value(1, 3), result.Value(1, 4),
        result.Value(2, 1), result.Value(2, 2), result.Value(2, 3), result.Value(2, 4),
        result.Value(3, 1), result.Value(3, 2), result.Value(3, 3), result.Value(3, 4)};",
        includes: &["gp_Trsf.hxx"],
        category: "transforms",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "transformBatch",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorShapeIds("ids"), FacadeParam::VectorDouble("matrices")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (matrices.size() != ids.size() * 12) {
    throw std::runtime_error(\"transformBatch: matrices must have 12 * ids.size() elements\");
}
std::vector<uint32_t> results;
results.reserve(ids.size());
for (size_t i = 0; i < ids.size(); i++) {
    size_t o = i * 12;
    gp_Trsf trsf;
    trsf.SetValues(matrices[o], matrices[o+1], matrices[o+2], matrices[o+3],
                   matrices[o+4], matrices[o+5], matrices[o+6], matrices[o+7],
                   matrices[o+8], matrices[o+9], matrices[o+10], matrices[o+11]);
    BRepBuilderAPI_Transform maker(get(ids[i]), trsf, true);
    if (!maker.IsDone()) throw std::runtime_error(\"transformBatch: failed on shape \" + std::to_string(i));
    results.push_back(store(maker.Shape()));
}
return results;",
        includes: &["gp_Trsf.hxx", "BRepBuilderAPI_Transform.hxx"],
        category: "transforms",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "rotateBatch",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorShapeIds("ids"), FacadeParam::VectorDouble("params")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (params.size() != ids.size() * 7) {
    throw std::runtime_error(\"rotateBatch: params must have 7 * ids.size() elements (px,py,pz,dx,dy,dz,angle)\");
}
std::vector<uint32_t> results;
results.reserve(ids.size());
for (size_t i = 0; i < ids.size(); i++) {
    size_t o = i * 7;
    gp_Trsf trsf;
    trsf.SetRotation(gp_Ax1(gp_Pnt(params[o], params[o+1], params[o+2]),
                             gp_Dir(params[o+3], params[o+4], params[o+5])), params[o+6]);
    BRepBuilderAPI_Transform maker(get(ids[i]), trsf, true);
    results.push_back(store(maker.Shape()));
}
return results;",
        includes: &["gp_Trsf.hxx", "gp_Ax1.hxx", "gp_Pnt.hxx", "gp_Dir.hxx", "BRepBuilderAPI_Transform.hxx"],
        category: "transforms",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "scaleBatch",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorShapeIds("ids"), FacadeParam::VectorDouble("params")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (params.size() != ids.size() * 4) {
    throw std::runtime_error(\"scaleBatch: params must have 4 * ids.size() elements (px,py,pz,factor)\");
}
std::vector<uint32_t> results;
results.reserve(ids.size());
for (size_t i = 0; i < ids.size(); i++) {
    size_t o = i * 4;
    gp_Trsf trsf;
    trsf.SetScale(gp_Pnt(params[o], params[o+1], params[o+2]), params[o+3]);
    BRepBuilderAPI_Transform maker(get(ids[i]), trsf, true);
    results.push_back(store(maker.Shape()));
}
return results;",
        includes: &["gp_Trsf.hxx", "gp_Pnt.hxx", "BRepBuilderAPI_Transform.hxx"],
        category: "transforms",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "mirrorBatch",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorShapeIds("ids"), FacadeParam::VectorDouble("params")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (params.size() != ids.size() * 6) {
    throw std::runtime_error(\"mirrorBatch: params must have 6 * ids.size() elements (px,py,pz,nx,ny,nz)\");
}
std::vector<uint32_t> results;
results.reserve(ids.size());
for (size_t i = 0; i < ids.size(); i++) {
    size_t o = i * 6;
    gp_Trsf trsf;
    trsf.SetMirror(gp_Ax2(gp_Pnt(params[o], params[o+1], params[o+2]),
                           gp_Dir(params[o+3], params[o+4], params[o+5])));
    BRepBuilderAPI_Transform maker(get(ids[i]), trsf, true);
    results.push_back(store(maker.Shape()));
}
return results;",
        includes: &["gp_Trsf.hxx", "gp_Ax2.hxx", "gp_Pnt.hxx", "gp_Dir.hxx", "BRepBuilderAPI_Transform.hxx"],
        category: "transforms",
        return_type: ReturnType::VectorUint32,
    },
    // ── Construction ────────────────────────────────────────────
    MethodSpec {
        name: "makeVertex",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("x"),
            FacadeParam::Double("y"),
            FacadeParam::Double("z"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_MakeVertex maker(gp_Pnt(x, y, z));
return store(maker.Shape());",
        includes: &["BRepBuilderAPI_MakeVertex.hxx", "gp_Pnt.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeEdge",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("v1"), FacadeParam::ShapeId("v2")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_MakeEdge maker(TopoDS::Vertex(get(v1)), TopoDS::Vertex(get(v2)));
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeEdge: construction failed\");
}
return store(maker.Shape());",
        includes: &["BRepBuilderAPI_MakeEdge.hxx", "TopoDS.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeWire",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorShapeIds("edgeIds")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_MakeWire maker;
for (uint32_t eid : edgeIds) {
    maker.Add(TopoDS::Edge(get(eid)));
    // If Add fails partway, try continuing — the wire may still be usable
}
if (maker.IsDone()) {
    return store(maker.Shape());
}
// Fallback: try with increased tolerance via ShapeFix_Wire
// Build a wire from edges directly and let ShapeFix close gaps
BRep_Builder builder;
TopoDS_Wire rawWire;
builder.MakeWire(rawWire);
for (uint32_t eid : edgeIds) {
    builder.Add(rawWire, TopoDS::Edge(get(eid)));
}
ShapeFix_Wire fixer(rawWire, TopoDS_Face(), 1e-3);
fixer.FixConnected();
fixer.FixReorder();
if (fixer.Wire().IsNull()) {
    throw std::runtime_error(\"makeWire: construction failed (even with ShapeFix)\");
}
return store(fixer.Wire());",
        includes: &[
            "BRepBuilderAPI_MakeWire.hxx", "TopoDS.hxx", "BRep_Builder.hxx",
            "TopoDS_Wire.hxx", "ShapeFix_Wire.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeFace",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("wireId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_MakeFace maker(TopoDS::Wire(get(wireId)));
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeFace: construction failed\");
}
return store(maker.Shape());",
        includes: &["BRepBuilderAPI_MakeFace.hxx", "TopoDS.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeFaceOnSurface",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("faceId"), FacadeParam::ShapeId("wireId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
// Extract surface from existing face, build new face with wire on that surface
Handle(Geom_Surface) surface = BRep_Tool::Surface(TopoDS::Face(get(faceId)));
BRepBuilderAPI_MakeFace maker(surface, TopoDS::Wire(get(wireId)), true);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeFaceOnSurface: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeFace.hxx", "BRep_Tool.hxx", "Geom_Surface.hxx", "TopoDS.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeSolid",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("shellId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(shellId);
// If already a solid, return as-is
if (shape.ShapeType() == TopAbs_SOLID) {
    return store(shape);
}
// If a compound, try to find a shell inside
if (shape.ShapeType() == TopAbs_COMPOUND) {
    for (TopExp_Explorer ex(shape, TopAbs_SHELL); ex.More(); ex.Next()) {
        BRepBuilderAPI_MakeSolid maker(TopoDS::Shell(ex.Current()));
        if (maker.IsDone()) {
            return store(maker.Shape());
        }
    }
    throw std::runtime_error(\"makeSolid: compound has no valid shell\");
}
BRepBuilderAPI_MakeSolid maker(TopoDS::Shell(shape));
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeSolid: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeSolid.hxx", "TopExp_Explorer.hxx", "TopoDS.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "sew",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorShapeIds("shapeIds"),
            FacadeParam::Double("tolerance"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_Sewing sewer(tolerance);
for (uint32_t sid : shapeIds) {
    sewer.Add(get(sid));
}
sewer.Perform();
return store(sewer.SewedShape());",
        includes: &["BRepBuilderAPI_Sewing.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeCompound",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorShapeIds("shapeIds")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Compound compound;
TopoDS_Builder builder;
builder.MakeCompound(compound);
for (uint32_t sid : shapeIds) {
    builder.Add(compound, get(sid));
}
return store(compound);",
        includes: &["TopoDS_Compound.hxx", "TopoDS_Builder.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeLineEdge",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("x1"), FacadeParam::Double("y1"), FacadeParam::Double("z1"),
            FacadeParam::Double("x2"), FacadeParam::Double("y2"), FacadeParam::Double("z2"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_MakeEdge maker(gp_Pnt(x1, y1, z1), gp_Pnt(x2, y2, z2));
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeLineEdge: construction failed\");
}
return store(maker.Shape());",
        includes: &["BRepBuilderAPI_MakeEdge.hxx", "gp_Pnt.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeCircleEdge",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("cx"), FacadeParam::Double("cy"), FacadeParam::Double("cz"),
            FacadeParam::Double("nx"), FacadeParam::Double("ny"), FacadeParam::Double("nz"),
            FacadeParam::Double("radius"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Ax2 axis(gp_Pnt(cx, cy, cz), gp_Dir(nx, ny, nz));
gp_Circ circle(axis, radius);
BRepBuilderAPI_MakeEdge maker(circle);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeCircleEdge: construction failed\");
}
return store(maker.Shape());",
        includes: &["BRepBuilderAPI_MakeEdge.hxx", "gp_Ax2.hxx", "gp_Pnt.hxx", "gp_Dir.hxx", "gp_Circ.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeCircleArc",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("cx"), FacadeParam::Double("cy"), FacadeParam::Double("cz"),
            FacadeParam::Double("nx"), FacadeParam::Double("ny"), FacadeParam::Double("nz"),
            FacadeParam::Double("radius"),
            FacadeParam::Double("startAngle"), FacadeParam::Double("endAngle"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Ax2 axis(gp_Pnt(cx, cy, cz), gp_Dir(nx, ny, nz));
gp_Circ circle(axis, radius);
Handle(Geom_TrimmedCurve) arc =
    new Geom_TrimmedCurve(new Geom_Circle(circle), startAngle, endAngle);
BRepBuilderAPI_MakeEdge maker(arc);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeCircleArc: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx", "gp_Ax2.hxx", "gp_Pnt.hxx", "gp_Dir.hxx",
            "gp_Circ.hxx", "Geom_TrimmedCurve.hxx", "Geom_Circle.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeArcEdge",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("x1"), FacadeParam::Double("y1"), FacadeParam::Double("z1"),
            FacadeParam::Double("x2"), FacadeParam::Double("y2"), FacadeParam::Double("z2"),
            FacadeParam::Double("x3"), FacadeParam::Double("y3"), FacadeParam::Double("z3"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
GC_MakeArcOfCircle arc(gp_Pnt(x1, y1, z1), gp_Pnt(x2, y2, z2), gp_Pnt(x3, y3, z3));
if (!arc.IsDone()) {
    throw std::runtime_error(\"makeArcEdge: construction failed\");
}
BRepBuilderAPI_MakeEdge maker(arc.Value());
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeArcEdge: edge construction failed\");
}
return store(maker.Shape());",
        includes: &["GC_MakeArcOfCircle.hxx", "BRepBuilderAPI_MakeEdge.hxx", "gp_Pnt.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeEllipseEdge",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("cx"), FacadeParam::Double("cy"), FacadeParam::Double("cz"),
            FacadeParam::Double("nx"), FacadeParam::Double("ny"), FacadeParam::Double("nz"),
            FacadeParam::Double("majorRadius"), FacadeParam::Double("minorRadius"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Ax2 axis(gp_Pnt(cx, cy, cz), gp_Dir(nx, ny, nz));
gp_Elips ellipse(axis, majorRadius, minorRadius);
BRepBuilderAPI_MakeEdge maker(ellipse);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeEllipseEdge: construction failed\");
}
return store(maker.Shape());",
        includes: &["BRepBuilderAPI_MakeEdge.hxx", "gp_Ax2.hxx", "gp_Pnt.hxx", "gp_Dir.hxx", "gp_Elips.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeBezierEdge",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorDouble("flatPoints")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
int nPts = static_cast<int>(flatPoints.size()) / 3;
if (nPts < 2) {
    throw std::runtime_error(\"makeBezierEdge: need at least 2 points\");
}
NCollection_Array1<gp_Pnt> poles(1, nPts);
for (int i = 0; i < nPts; i++) {
    poles.SetValue(i + 1,
                   gp_Pnt(flatPoints[i * 3], flatPoints[i * 3 + 1], flatPoints[i * 3 + 2]));
}
Handle(Geom_BezierCurve) curve = new Geom_BezierCurve(poles);
BRepBuilderAPI_MakeEdge maker(curve);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeBezierEdge: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx", "NCollection_Array1.hxx",
            "gp_Pnt.hxx", "Geom_BezierCurve.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeBSplineEdge",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorDouble("poles"),
            FacadeParam::VectorDouble("weights"),
            FacadeParam::VectorDouble("knots"),
            FacadeParam::VectorInt("multiplicities"),
            FacadeParam::Int("degree"),
            FacadeParam::Bool("periodic"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
int nPoles = static_cast<int>(poles.size()) / 3;
if (nPoles < 2) {
    throw std::runtime_error(\"makeBSplineEdge: need at least 2 poles\");
}
int nKnots = static_cast<int>(knots.size());
if (nKnots < 2 || static_cast<int>(multiplicities.size()) != nKnots) {
    throw std::runtime_error(\"makeBSplineEdge: knots and multiplicities must be the same non-trivial length\");
}
if (!weights.empty() && static_cast<int>(weights.size()) != nPoles) {
    throw std::runtime_error(\"makeBSplineEdge: weights length must match pole count\");
}
NCollection_Array1<gp_Pnt> polesArr(1, nPoles);
for (int i = 0; i < nPoles; i++) {
    polesArr.SetValue(i + 1, gp_Pnt(poles[i * 3], poles[i * 3 + 1], poles[i * 3 + 2]));
}
NCollection_Array1<double> knotsArr(1, nKnots);
NCollection_Array1<int> multsArr(1, nKnots);
for (int i = 0; i < nKnots; i++) {
    knotsArr.SetValue(i + 1, knots[i]);
    multsArr.SetValue(i + 1, multiplicities[i]);
}
bool rational = false;
for (double w : weights) {
    if (std::abs(w - 1.0) > Precision::Confusion()) {
        rational = true;
        break;
    }
}
Handle(Geom_BSplineCurve) curve;
if (rational) {
    NCollection_Array1<double> weightsArr(1, nPoles);
    for (int i = 0; i < nPoles; i++) {
        weightsArr.SetValue(i + 1, weights[i]);
    }
    curve = new Geom_BSplineCurve(polesArr, weightsArr, knotsArr, multsArr, degree, periodic);
} else {
    curve = new Geom_BSplineCurve(polesArr, knotsArr, multsArr, degree, periodic);
}
BRepBuilderAPI_MakeEdge maker(curve);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeBSplineEdge: edge construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx", "Geom_BSplineCurve.hxx",
            "NCollection_Array1.hxx", "Precision.hxx", "cmath", "gp_Pnt.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeEllipseArc",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("cx"), FacadeParam::Double("cy"), FacadeParam::Double("cz"),
            FacadeParam::Double("nx"), FacadeParam::Double("ny"), FacadeParam::Double("nz"),
            FacadeParam::Double("majorRadius"), FacadeParam::Double("minorRadius"),
            FacadeParam::Double("startAngle"), FacadeParam::Double("endAngle"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Ax2 axis(gp_Pnt(cx, cy, cz), gp_Dir(nx, ny, nz));
gp_Elips ellipse(axis, majorRadius, minorRadius);
Handle(Geom_TrimmedCurve) arc =
    new Geom_TrimmedCurve(new Geom_Ellipse(ellipse), startAngle, endAngle);
BRepBuilderAPI_MakeEdge maker(arc);
if (!maker.IsDone()) {
    throw std::runtime_error(\"makeEllipseArc: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx", "gp_Ax2.hxx", "gp_Pnt.hxx", "gp_Dir.hxx",
            "gp_Elips.hxx", "Geom_TrimmedCurve.hxx", "Geom_Ellipse.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeHelixWire",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("px"), FacadeParam::Double("py"), FacadeParam::Double("pz"),
            FacadeParam::Double("dx"), FacadeParam::Double("dy"), FacadeParam::Double("dz"),
            FacadeParam::Double("pitch"), FacadeParam::Double("height"), FacadeParam::Double("radius"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Ax3 ax3(gp_Pnt(px, py, pz), gp_Dir(dx, dy, dz));
Handle(Geom_CylindricalSurface) cylinder = new Geom_CylindricalSurface(ax3, radius);

// A helix on a cylindrical surface is a 2D line: u = t, v = pitch/(2*pi) * t
double slope = pitch / (2.0 * M_PI);
double nTurns = height / pitch;
// gp_Dir2d normalizes (1, slope) to unit length, so advancing the edge
// parameter by t moves only t / sqrt(1 + slope^2) along u (the angle). Scale
// the parameter range by that length so the edge actually sweeps nTurns full
// turns and the full height instead of falling short.
double dirLen = std::sqrt(1.0 + slope * slope);
double uMax = nTurns * 2.0 * M_PI * dirLen;

Handle(Geom2d_Line) line2d = new Geom2d_Line(gp_Pnt2d(0, 0), gp_Dir2d(1, slope));

BRepBuilderAPI_MakeEdge edgeMaker(line2d, cylinder, 0.0, uMax);
if (!edgeMaker.IsDone()) {
    throw std::runtime_error(\"makeHelixWire: edge construction failed\");
}
BRepBuilderAPI_MakeWire wireMaker(edgeMaker.Edge());
if (!wireMaker.IsDone()) {
    throw std::runtime_error(\"makeHelixWire: wire construction failed\");
}
return store(wireMaker.Shape());",
        includes: &[
            "gp_Ax3.hxx", "gp_Pnt.hxx", "gp_Dir.hxx",
            "Geom_CylindricalSurface.hxx", "Geom2d_Line.hxx",
            "gp_Pnt2d.hxx", "gp_Dir2d.hxx",
            "BRepBuilderAPI_MakeEdge.hxx", "BRepBuilderAPI_MakeWire.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "addHolesInFace",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::VectorShapeIds("holeWireIds"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Face face = TopoDS::Face(get(faceId));
BRepBuilderAPI_MakeFace maker(face);
for (uint32_t wid : holeWireIds) {
    maker.Add(TopoDS::Wire(get(wid)));
}
if (!maker.IsDone()) {
    throw std::runtime_error(\"addHolesInFace: construction failed\");
}
// Add holes as-is, then let ShapeFix_Face classify the outer boundary by
// area and orient each inner wire opposite to it. The old unconditional
// hole.Reverse() produced a mis-oriented (invalid) face whenever a hole did
// not arrive same-wound as the outer -- exactly the case for font glyph
// counters (8, O, A) -- leaving the extruded solid invalid so a fuse/cut
// (e.g. embossed text) failed.
ShapeFix_Face fixer(TopoDS::Face(maker.Shape()));
fixer.FixOrientation();
fixer.Perform();
return store(fixer.Face());",
        includes: &["BRepBuilderAPI_MakeFace.hxx", "TopoDS.hxx", "TopoDS_Wire.hxx", "ShapeFix_Face.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "removeHolesFromFace",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::VectorInt("holeIndices"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Face face = TopoDS::Face(get(faceId));
// Collect inner wires (all wires except the outer wire)
TopoDS_Wire outer = ShapeAnalysis::OuterWire(face);
std::vector<TopoDS_Wire> innerWires;
for (TopExp_Explorer ex(face, TopAbs_WIRE); ex.More(); ex.Next()) {
    TopoDS_Wire w = TopoDS::Wire(ex.Current());
    if (!w.IsSame(outer)) {
        innerWires.push_back(w);
    }
}
// Build set of indices to remove
std::set<int> removeSet(holeIndices.begin(), holeIndices.end());
// Rebuild face: start from outer wire on the same surface
Handle(Geom_Surface) geomSurf = BRep_Tool::Surface(face);
BRepBuilderAPI_MakeFace maker(geomSurf, outer, true);
for (int i = 0; i < static_cast<int>(innerWires.size()); i++) {
    if (removeSet.find(i) == removeSet.end()) {
        maker.Add(innerWires[i]);
    }
}
if (!maker.IsDone()) {
    throw std::runtime_error(\"removeHolesFromFace: construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeFace.hxx", "BRep_Tool.hxx", "Geom_Surface.hxx",
            "ShapeAnalysis.hxx", "TopExp_Explorer.hxx", "TopoDS.hxx", "TopoDS_Wire.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "solidFromShell",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("shellId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "return makeSolid(shellId);",
        includes: &[],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "buildSolidFromFaces",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorShapeIds("faceIds"),
            FacadeParam::Double("tolerance"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "return sewAndSolidify(faceIds, tolerance);",
        includes: &[],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "sewAndSolidify",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorShapeIds("faceIds"),
            FacadeParam::Double("tolerance"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepBuilderAPI_Sewing sewer(tolerance);
for (uint32_t fid : faceIds) {
    sewer.Add(get(fid));
}
sewer.Perform();
TopoDS_Shape sewn = sewer.SewedShape();
// Try to make a solid from the sewn shell
if (sewn.ShapeType() == TopAbs_SHELL) {
    BRepBuilderAPI_MakeSolid maker(TopoDS::Shell(sewn));
    if (maker.IsDone()) {
        return store(maker.Shape());
    }
}
return store(sewn);",
        includes: &["BRepBuilderAPI_Sewing.hxx", "BRepBuilderAPI_MakeSolid.hxx", "TopoDS.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "buildTriFace",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("ax"), FacadeParam::Double("ay"), FacadeParam::Double("az"),
            FacadeParam::Double("bx"), FacadeParam::Double("by"), FacadeParam::Double("bz"),
            FacadeParam::Double("cx2"), FacadeParam::Double("cy2"), FacadeParam::Double("cz2"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Pnt pa(ax, ay, az), pb(bx, by, bz), pc(cx2, cy2, cz2);
BRepBuilderAPI_MakeWire wireMaker;
wireMaker.Add(BRepBuilderAPI_MakeEdge(pa, pb).Edge());
wireMaker.Add(BRepBuilderAPI_MakeEdge(pb, pc).Edge());
wireMaker.Add(BRepBuilderAPI_MakeEdge(pc, pa).Edge());
if (!wireMaker.IsDone()) {
    throw std::runtime_error(\"buildTriFace: wire construction failed\");
}
BRepBuilderAPI_MakeFace faceMaker(wireMaker.Wire());
if (!faceMaker.IsDone()) {
    throw std::runtime_error(\"buildTriFace: face construction failed\");
}
return store(faceMaker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx", "BRepBuilderAPI_MakeFace.hxx",
            "BRepBuilderAPI_MakeWire.hxx", "gp_Pnt.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "makeTangentArc",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::Double("x1"), FacadeParam::Double("y1"), FacadeParam::Double("z1"),
            FacadeParam::Double("tx"), FacadeParam::Double("ty"), FacadeParam::Double("tz"),
            FacadeParam::Double("x2"), FacadeParam::Double("y2"), FacadeParam::Double("z2"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Pnt startPt(x1, y1, z1);
gp_Vec tangent(tx, ty, tz);
gp_Pnt endPt(x2, y2, z2);

GC_MakeArcOfCircle arcMaker(startPt, tangent, endPt);
if (!arcMaker.IsDone()) {
    throw std::runtime_error(\"makeTangentArc: arc construction failed\");
}

BRepBuilderAPI_MakeEdge edgeMaker(arcMaker.Value());
if (!edgeMaker.IsDone()) {
    throw std::runtime_error(\"makeTangentArc: edge construction failed\");
}
return store(edgeMaker.Shape());",
        includes: &["GC_MakeArcOfCircle.hxx", "BRepBuilderAPI_MakeEdge.hxx", "gp_Pnt.hxx", "gp_Vec.hxx"],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "bsplineSurface",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorDouble("flatPoints"),
            FacadeParam::Int("rows"),
            FacadeParam::Int("cols"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
if (rows < 2 || cols < 2) {
    throw std::runtime_error(\"bsplineSurface: need at least 2x2 grid\");
}
int nPts = static_cast<int>(flatPoints.size()) / 3;
if (nPts != rows * cols) {
    throw std::runtime_error(\"bsplineSurface: point count mismatch\");
}

// Build a 2D array of gp_Pnt (1-based indexing)
NCollection_Array2<gp_Pnt> points(1, rows, 1, cols);
for (int r = 0; r < rows; r++) {
    for (int c = 0; c < cols; c++) {
        int idx = (r * cols + c) * 3;
        points.SetValue(r + 1, c + 1,
                        gp_Pnt(flatPoints[idx], flatPoints[idx + 1], flatPoints[idx + 2]));
    }
}

GeomAPI_PointsToBSplineSurface approx(points, 3, 8, GeomAbs_C2, 1e-3);
if (!approx.IsDone()) {
    throw std::runtime_error(\"bsplineSurface: approximation failed\");
}

BRepBuilderAPI_MakeFace faceMaker(approx.Surface(), 1e-3);
if (!faceMaker.IsDone()) {
    throw std::runtime_error(\"bsplineSurface: face construction failed\");
}
return store(faceMaker.Shape());",
        includes: &[
            "NCollection_Array2.hxx", "gp_Pnt.hxx",
            "GeomAPI_PointsToBSplineSurface.hxx", "GeomAbs_Shape.hxx",
            "Geom_BSplineSurface.hxx", "BRepBuilderAPI_MakeFace.hxx",
        ],
        category: "construction",
        return_type: ReturnType::ShapeId,
    },
    // ── Topology ────────────────────────────────────────────────
    MethodSpec {
        name: "getShapeType",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
switch (get(id).ShapeType()) {
case TopAbs_VERTEX: return \"vertex\";
case TopAbs_EDGE: return \"edge\";
case TopAbs_WIRE: return \"wire\";
case TopAbs_FACE: return \"face\";
case TopAbs_SHELL: return \"shell\";
case TopAbs_SOLID: return \"solid\";
case TopAbs_COMPSOLID: return \"compsolid\";
case TopAbs_COMPOUND: return \"compound\";
default: return \"shape\";
}",
        includes: &["TopAbs_ShapeEnum.hxx"],
        category: "topology",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "getSubShapes",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::String("shapeType")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
auto parseType = [](const std::string& t) -> TopAbs_ShapeEnum {
    if (t == \"vertex\") return TopAbs_VERTEX;
    if (t == \"edge\") return TopAbs_EDGE;
    if (t == \"wire\") return TopAbs_WIRE;
    if (t == \"face\") return TopAbs_FACE;
    if (t == \"shell\") return TopAbs_SHELL;
    if (t == \"solid\") return TopAbs_SOLID;
    if (t == \"compsolid\") return TopAbs_COMPSOLID;
    if (t == \"compound\") return TopAbs_COMPOUND;
    throw std::runtime_error(\"Unknown shape type: \" + t);
};
TopAbs_ShapeEnum toExplore = parseType(shapeType);
std::vector<uint32_t> result;
NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> map;
TopExp::MapShapes(get(id), toExplore, map);
for (int i = 1; i <= map.Extent(); i++) {
    result.push_back(store(map.FindKey(i)));
}
return result;",
        includes: &[
            "TopAbs_ShapeEnum.hxx", "TopExp.hxx",
            "NCollection_IndexedMap.hxx", "TopTools_ShapeMapHasher.hxx",
        ],
        category: "topology",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "distanceBetween",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepExtrema_DistShapeShape dist(get(a), get(b));
if (!dist.IsDone()) {
    throw std::runtime_error(\"distanceBetween: computation failed\");
}
return dist.Value();",
        includes: &["BRepExtrema_DistShapeShape.hxx"],
        category: "topology",
        return_type: ReturnType::Double,
    },
    MethodSpec {
        name: "isSame",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        occt_class: "",
        ctor_args: "",
        setup_code: "return get(a).IsSame(get(b));",
        includes: &[],
        category: "topology",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "isEqual",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("a"), FacadeParam::ShapeId("b")],
        occt_class: "",
        ctor_args: "",
        setup_code: "return get(a).IsEqual(get(b));",
        includes: &[],
        category: "topology",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "isNull",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "return get(id).IsNull();",
        includes: &[],
        category: "topology",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "hashCode",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Int("upperBound")],
        occt_class: "",
        ctor_args: "",
        setup_code: "return static_cast<int>(TopTools_ShapeMapHasher{}(get(id)) % static_cast<size_t>(upperBound));",
        includes: &["TopTools_ShapeMapHasher.hxx"],
        category: "topology",
        return_type: ReturnType::Int,
    },
    MethodSpec {
        name: "shapeOrientation",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
switch (get(id).Orientation()) {
case TopAbs_FORWARD:
    return \"forward\";
case TopAbs_REVERSED:
    return \"reversed\";
case TopAbs_INTERNAL:
    return \"internal\";
case TopAbs_EXTERNAL:
    return \"external\";
default:
    return \"unknown\";
}",
        includes: &["TopAbs_Orientation.hxx"],
        category: "topology",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "iterShapes",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
std::vector<uint32_t> result;
for (TopoDS_Iterator it(get(id)); it.More(); it.Next()) {
    result.push_back(store(it.Value()));
}
return result;",
        includes: &["TopoDS_Iterator.hxx"],
        category: "topology",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "edgeToFaceMap",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Int("hashUpperBound")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
std::vector<int> result;
auto hashShape = [&](const TopoDS_Shape& s) -> int {
    return static_cast<int>(TopTools_ShapeMapHasher{}(s) %
                            static_cast<size_t>(hashUpperBound));
};
for (TopExp_Explorer exE(shape, TopAbs_EDGE); exE.More(); exE.Next()) {
    int edgeHash = hashShape(exE.Current());
    std::vector<int> faceHashes;
    for (TopExp_Explorer exF(shape, TopAbs_FACE); exF.More(); exF.Next()) {
        for (TopExp_Explorer exFE(exF.Current(), TopAbs_EDGE); exFE.More(); exFE.Next()) {
            if (exFE.Current().IsSame(exE.Current())) {
                faceHashes.push_back(hashShape(exF.Current()));
                break;
            }
        }
    }
    if (!faceHashes.empty()) {
        result.push_back(edgeHash);
        result.push_back(static_cast<int>(faceHashes.size()));
        result.insert(result.end(), faceHashes.begin(), faceHashes.end());
    }
}
return result;",
        includes: &["TopExp_Explorer.hxx", "TopTools_ShapeMapHasher.hxx"],
        category: "topology",
        return_type: ReturnType::VectorInt,
    },
    MethodSpec {
        name: "downcast",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::String("targetType")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
auto parseType = [](const std::string& t) -> TopAbs_ShapeEnum {
    if (t == \"vertex\") return TopAbs_VERTEX;
    if (t == \"edge\") return TopAbs_EDGE;
    if (t == \"wire\") return TopAbs_WIRE;
    if (t == \"face\") return TopAbs_FACE;
    if (t == \"shell\") return TopAbs_SHELL;
    if (t == \"solid\") return TopAbs_SOLID;
    if (t == \"compsolid\") return TopAbs_COMPSOLID;
    if (t == \"compound\") return TopAbs_COMPOUND;
    throw std::runtime_error(\"Unknown shape type: \" + t);
};
TopAbs_ShapeEnum target = parseType(targetType);
if (shape.ShapeType() != target) {
    throw std::runtime_error(\"downcast: shape type mismatch\");
}
return store(shape);",
        includes: &["TopAbs_ShapeEnum.hxx", "TopoDS.hxx"],
        category: "topology",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "adjacentFaces",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("shapeId"), FacadeParam::ShapeId("faceId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(shapeId);
const auto& targetFace = get(faceId);
std::vector<uint32_t> result;

// Find faces that share an edge with targetFace
for (TopExp_Explorer exF(shape, TopAbs_FACE); exF.More(); exF.Next()) {
    if (exF.Current().IsSame(targetFace))
        continue;
    bool adjacent = false;
    for (TopExp_Explorer exE1(targetFace, TopAbs_EDGE); exE1.More() && !adjacent;
         exE1.Next()) {
        for (TopExp_Explorer exE2(exF.Current(), TopAbs_EDGE); exE2.More(); exE2.Next()) {
            if (exE1.Current().IsSame(exE2.Current())) {
                adjacent = true;
                break;
            }
        }
    }
    if (adjacent) {
        result.push_back(store(exF.Current()));
    }
}
return result;",
        includes: &["TopExp_Explorer.hxx"],
        category: "topology",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "sharedEdges",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("faceA"), FacadeParam::ShapeId("faceB")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& fa = get(faceA);
const auto& fb = get(faceB);
std::vector<uint32_t> result;
for (TopExp_Explorer exA(fa, TopAbs_EDGE); exA.More(); exA.Next()) {
    for (TopExp_Explorer exB(fb, TopAbs_EDGE); exB.More(); exB.Next()) {
        if (exA.Current().IsSame(exB.Current())) {
            result.push_back(store(exA.Current()));
            break;
        }
    }
}
return result;",
        includes: &["TopExp_Explorer.hxx"],
        category: "topology",
        return_type: ReturnType::VectorUint32,
    },
    // ── Query ──────────────────────────────────────────────────────
    MethodSpec {
        name: "getBoundingBox",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Bool("useTriangulation")],
        occt_class: "",
        ctor_args: "",
        // AddOptimal gives surface-precise bounds independent of tessellation
        // state (Add falls back to BSpline pole hulls without triangulation,
        // overshooting curved geometry by ~0.27*r). useShapeTolerance=false
        // matches brepjs's call surface.
        setup_code: "\
const auto& shape = get(id);
Bnd_Box box;
BRepBndLib::AddOptimal(shape, box, useTriangulation, false);
if (box.IsVoid()) {
    throw std::runtime_error(\"getBoundingBox: shape has no geometry\");
}
BBoxData result{};
box.Get(result.xmin, result.ymin, result.zmin, result.xmax, result.ymax, result.zmax);
return result;",
        includes: &["BRepBndLib.hxx", "Bnd_Box.hxx"],
        category: "query",
        return_type: ReturnType::BBoxData,
    },
    MethodSpec {
        name: "getVolume",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
GProp_GProps props;
BRepGProp::VolumeProperties(shape, props);
return props.Mass();",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx"],
        category: "query",
        return_type: ReturnType::Double,
    },
    MethodSpec {
        name: "getSurfaceArea",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
GProp_GProps props;
BRepGProp::SurfaceProperties(shape, props);
return props.Mass();",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx"],
        category: "query",
        return_type: ReturnType::Double,
    },
    MethodSpec {
        name: "getLength",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
GProp_GProps props;
BRepGProp::LinearProperties(shape, props);
return props.Mass();",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx"],
        category: "query",
        return_type: ReturnType::Double,
    },
    MethodSpec {
        name: "getCenterOfMass",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
GProp_GProps props;
BRepGProp::VolumeProperties(shape, props);
gp_Pnt com = props.CentreOfMass();
return {com.X(), com.Y(), com.Z()};",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx", "gp_Pnt.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "getInertia",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        // Row-major 3x3 matrix of inertia about the center of mass (gp_Mat is
        // 1-indexed). Symmetric: result[1]==[3], [2]==[6], [5]==[7].
        setup_code: "\
const auto& shape = get(id);
GProp_GProps props;
BRepGProp::VolumeProperties(shape, props);
gp_Mat m = props.MatrixOfInertia();
return {m(1, 1), m(1, 2), m(1, 3),
        m(2, 1), m(2, 2), m(2, 3),
        m(3, 1), m(3, 2), m(3, 3)};",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx", "gp_Mat.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "containsPoint",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("x"),
            FacadeParam::Double("y"),
            FacadeParam::Double("z"),
            FacadeParam::Double("tolerance"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
BRepClass3d_SolidClassifier classifier(shape);
classifier.Perform(gp_Pnt(x, y, z), tolerance);
TopAbs_State state = classifier.State();
return state == TopAbs_IN || state == TopAbs_ON;",
        includes: &[
            "BRepClass3d_SolidClassifier.hxx",
            "gp_Pnt.hxx",
            "TopAbs_State.hxx",
        ],
        category: "query",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "getSurfaceCenterOfMass",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("faceId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& face = get(faceId);
GProp_GProps props;
BRepGProp::SurfaceProperties(face, props);
gp_Pnt com = props.CentreOfMass();
return {com.X(), com.Y(), com.Z()};",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx", "gp_Pnt.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "vertexPosition",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("vertexId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
gp_Pnt p = BRep_Tool::Pnt(TopoDS::Vertex(get(vertexId)));
return {p.X(), p.Y(), p.Z()};",
        includes: &["BRep_Tool.hxx", "TopoDS.hxx", "gp_Pnt.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "surfaceType",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("faceId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
switch (surf.GetType()) {
case GeomAbs_Plane:
    return \"plane\";
case GeomAbs_Cylinder:
    return \"cylinder\";
case GeomAbs_Cone:
    return \"cone\";
case GeomAbs_Sphere:
    return \"sphere\";
case GeomAbs_Torus:
    return \"torus\";
case GeomAbs_BezierSurface:
    return \"bezier\";
case GeomAbs_BSplineSurface:
    return \"bspline\";
case GeomAbs_SurfaceOfRevolution:
    return \"revolution\";
case GeomAbs_SurfaceOfExtrusion:
    return \"extrusion\";
case GeomAbs_OffsetSurface:
    return \"offset\";
default:
    return \"other\";
}",
        includes: &["BRepAdaptor_Surface.hxx", "GeomAbs_SurfaceType.hxx", "TopoDS.hxx"],
        category: "query",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "surfaceNormal",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"), FacadeParam::Double("u"), FacadeParam::Double("v"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Face face = TopoDS::Face(get(faceId));
BRepAdaptor_Surface surf(face);
gp_Pnt pt;
gp_Vec d1u, d1v;
surf.D1(u, v, pt, d1u, d1v);
gp_Vec normal = d1u.Crossed(d1v);
if (normal.Magnitude() > 1e-10) {
    normal.Normalize();
}
// Flip normal for reversed faces (matches OCCT convention)
if (face.Orientation() == TopAbs_REVERSED) {
    normal.Reverse();
}
return {normal.X(), normal.Y(), normal.Z()};",
        includes: &["BRepAdaptor_Surface.hxx", "TopoDS.hxx", "gp_Pnt.hxx", "gp_Vec.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "pointOnSurface",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"), FacadeParam::Double("u"), FacadeParam::Double("v"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
gp_Pnt pt = surf.Value(u, v);
return {pt.X(), pt.Y(), pt.Z()};",
        includes: &["BRepAdaptor_Surface.hxx", "TopoDS.hxx", "gp_Pnt.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "outerWire",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("faceId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Wire wire = ShapeAnalysis::OuterWire(TopoDS::Face(get(faceId)));
if (wire.IsNull()) {
    throw std::runtime_error(\"outerWire: face has no outer wire\");
}
return store(wire);",
        includes: &["ShapeAnalysis.hxx", "TopoDS.hxx", "TopoDS_Wire.hxx"],
        category: "query",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "getLinearCenterOfMass",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
GProp_GProps props;
BRepGProp::LinearProperties(shape, props);
gp_Pnt com = props.CentreOfMass();
return {com.X(), com.Y(), com.Z()};",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx", "gp_Pnt.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "surfaceCurvature",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"), FacadeParam::Double("u"), FacadeParam::Double("v"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
BRepLProp_SLProps props(surf, u, v, 2, 1e-6);
if (!props.IsCurvatureDefined()) {
    throw std::runtime_error(\"surfaceCurvature: curvature not defined at point\");
}
double mean = props.MeanCurvature();
double gaussian = props.GaussianCurvature();
double maxK = props.MaxCurvature();
double minK = props.MinCurvature();
return {mean, gaussian, maxK, minK};",
        includes: &["BRepAdaptor_Surface.hxx", "BRepLProp_SLProps.hxx", "TopoDS.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "uvBounds",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("faceId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
return {surf.FirstUParameter(), surf.LastUParameter(), surf.FirstVParameter(),
        surf.LastVParameter()};",
        includes: &["BRepAdaptor_Surface.hxx", "TopoDS.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "getFaceCylinderData",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("faceId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Surface surf(TopoDS::Face(get(faceId)));
if (surf.GetType() != GeomAbs_Cylinder) {
    return {};
}
gp_Cylinder cyl = surf.Cylinder();
gp_Ax1 axis = cyl.Axis();
gp_Pnt location = axis.Location();
gp_Dir direction = axis.Direction();
return {cyl.Radius(), cyl.Direct() ? 1.0 : 0.0,
        location.X(), location.Y(), location.Z(),
        direction.X(), direction.Y(), direction.Z()};",
        includes: &["BRepAdaptor_Surface.hxx", "GeomAbs_SurfaceType.hxx", "TopoDS.hxx", "gp_Cylinder.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "uvFromPoint",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::Double("x"), FacadeParam::Double("y"), FacadeParam::Double("z"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Face face = TopoDS::Face(get(faceId));
Handle(Geom_Surface) geomSurf = BRep_Tool::Surface(face);
ShapeAnalysis_Surface sas(geomSurf);
gp_Pnt2d uv = sas.ValueOfUV(gp_Pnt(x, y, z), 1e-6);
return {uv.X(), uv.Y()};",
        includes: &[
            "BRep_Tool.hxx", "Geom_Surface.hxx", "ShapeAnalysis_Surface.hxx",
            "TopoDS.hxx", "gp_Pnt.hxx", "gp_Pnt2d.hxx",
        ],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "projectPointOnFace",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"),
            FacadeParam::Double("x"), FacadeParam::Double("y"), FacadeParam::Double("z"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Face face = TopoDS::Face(get(faceId));
Handle(Geom_Surface) geomSurf = BRep_Tool::Surface(face);
GeomAPI_ProjectPointOnSurf proj(gp_Pnt(x, y, z), geomSurf);
if (proj.NbPoints() == 0) {
    throw std::runtime_error(\"projectPointOnFace: no projection found\");
}
gp_Pnt nearest = proj.NearestPoint();
double u, v;
proj.LowerDistanceParameters(u, v);
return {nearest.X(), nearest.Y(), nearest.Z(), u, v, proj.LowerDistance()};",
        includes: &[
            "BRep_Tool.hxx", "GeomAPI_ProjectPointOnSurf.hxx", "Geom_Surface.hxx",
            "TopoDS.hxx", "gp_Pnt.hxx",
        ],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "classifyPointOnFace",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("faceId"), FacadeParam::Double("u"), FacadeParam::Double("v"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Face face = TopoDS::Face(get(faceId));
BRepClass_FaceClassifier classifier(face, gp_Pnt2d(u, v), 1e-6);
switch (classifier.State()) {
case TopAbs_IN:
    return \"in\";
case TopAbs_OUT:
    return \"out\";
case TopAbs_ON:
    return \"on\";
default:
    return \"unknown\";
}",
        includes: &["BRepClass_FaceClassifier.hxx", "TopoDS.hxx", "gp_Pnt2d.hxx", "TopAbs_State.hxx"],
        category: "query",
        return_type: ReturnType::String,
    },
    // ── Curve ──────────────────────────────────────────────────────
    MethodSpec {
        name: "curveType",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
GeomAbs_CurveType ctype;
if (shape.ShapeType() == TopAbs_WIRE) {
    BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
    ctype = comp.GetType();
} else {
    BRepAdaptor_Curve curve(TopoDS::Edge(shape));
    ctype = curve.GetType();
}
switch (ctype) {
case GeomAbs_Line:
    return \"line\";
case GeomAbs_Circle:
    return \"circle\";
case GeomAbs_Ellipse:
    return \"ellipse\";
case GeomAbs_Hyperbola:
    return \"hyperbola\";
case GeomAbs_Parabola:
    return \"parabola\";
case GeomAbs_BezierCurve:
    return \"bezier\";
case GeomAbs_BSplineCurve:
    return \"bspline\";
case GeomAbs_OffsetCurve:
    return \"offset\";
default:
    return \"other\";
}",
        includes: &[
            "BRepAdaptor_CompCurve.hxx", "BRepAdaptor_Curve.hxx",
            "GeomAbs_CurveType.hxx", "TopoDS.hxx",
        ],
        category: "curve",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "curvePointAtParam",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Double("param")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
gp_Pnt pt;
if (shape.ShapeType() == TopAbs_WIRE) {
    BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
    pt = comp.Value(param);
} else {
    BRepAdaptor_Curve curve(TopoDS::Edge(shape));
    pt = curve.Value(param);
}
return {pt.X(), pt.Y(), pt.Z()};",
        includes: &[
            "BRepAdaptor_CompCurve.hxx", "BRepAdaptor_Curve.hxx",
            "TopoDS.hxx", "gp_Pnt.hxx",
        ],
        category: "curve",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "curveTangent",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Double("param")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
gp_Pnt pt;
gp_Vec tangent;
if (shape.ShapeType() == TopAbs_WIRE) {
    BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
    comp.D1(param, pt, tangent);
} else {
    BRepAdaptor_Curve curve(TopoDS::Edge(shape));
    curve.D1(param, pt, tangent);
}
if (tangent.Magnitude() > 1e-10) {
    tangent.Normalize();
}
return {tangent.X(), tangent.Y(), tangent.Z()};",
        includes: &[
            "BRepAdaptor_CompCurve.hxx", "BRepAdaptor_Curve.hxx",
            "TopoDS.hxx", "gp_Pnt.hxx", "gp_Vec.hxx",
        ],
        category: "curve",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "curveParameters",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
if (shape.ShapeType() == TopAbs_WIRE) {
    BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
    return {comp.FirstParameter(), comp.LastParameter()};
}
BRepAdaptor_Curve curve(TopoDS::Edge(shape));
return {curve.FirstParameter(), curve.LastParameter()};",
        includes: &["BRepAdaptor_CompCurve.hxx", "BRepAdaptor_Curve.hxx", "TopoDS.hxx"],
        category: "curve",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "curveIsClosed",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
if (shape.ShapeType() == TopAbs_WIRE) {
    return BRep_Tool::IsClosed(shape);
}
BRepAdaptor_Curve curve(TopoDS::Edge(shape));
return curve.IsClosed();",
        includes: &["BRepAdaptor_Curve.hxx", "BRep_Tool.hxx", "TopoDS.hxx"],
        category: "curve",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "curveLength",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
if (shape.ShapeType() == TopAbs_WIRE) {
    BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
    return GCPnts_AbscissaPoint::Length(comp);
}
BRepAdaptor_Curve curve(TopoDS::Edge(shape));
return GCPnts_AbscissaPoint::Length(curve);",
        includes: &[
            "BRepAdaptor_CompCurve.hxx", "BRepAdaptor_Curve.hxx",
            "GCPnts_AbscissaPoint.hxx", "TopoDS.hxx",
        ],
        category: "curve",
        return_type: ReturnType::Double,
    },
    MethodSpec {
        name: "interpolatePoints",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorDouble("flatPoints"), FacadeParam::Bool("periodic")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
int nPts = static_cast<int>(flatPoints.size()) / 3;
if (nPts < 2) {
    throw std::runtime_error(\"interpolatePoints: need at least 2 points\");
}

Handle(NCollection_HArray1<gp_Pnt>) pts = new NCollection_HArray1<gp_Pnt>(1, nPts);
for (int i = 0; i < nPts; i++) {
    pts->SetValue(i + 1,
                  gp_Pnt(flatPoints[i * 3], flatPoints[i * 3 + 1], flatPoints[i * 3 + 2]));
}

GeomAPI_Interpolate interp(pts, periodic, 1e-6);
interp.Perform();
if (!interp.IsDone()) {
    throw std::runtime_error(\"interpolatePoints: interpolation failed\");
}

BRepBuilderAPI_MakeEdge edgeMaker(interp.Curve());
if (!edgeMaker.IsDone()) {
    throw std::runtime_error(\"interpolatePoints: edge construction failed\");
}
return store(edgeMaker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx", "GeomAPI_Interpolate.hxx",
            "NCollection_HArray1.hxx", "gp_Pnt.hxx",
        ],
        category: "curve",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "interpolatePointsWithTangents",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorDouble("flatPoints"),
            FacadeParam::Double("startTanX"),
            FacadeParam::Double("startTanY"),
            FacadeParam::Double("startTanZ"),
            FacadeParam::Double("endTanX"),
            FacadeParam::Double("endTanY"),
            FacadeParam::Double("endTanZ"),
        ],
        occt_class: "",
        ctor_args: "",
        // Cubic interpolation through the points with clamped end tangents.
        setup_code: "\
int nPts = static_cast<int>(flatPoints.size()) / 3;
if (nPts < 2) {
    throw std::runtime_error(\"interpolatePointsWithTangents: need at least 2 points\");
}
Handle(NCollection_HArray1<gp_Pnt>) pts = new NCollection_HArray1<gp_Pnt>(1, nPts);
for (int i = 0; i < nPts; i++) {
    pts->SetValue(i + 1,
                  gp_Pnt(flatPoints[i * 3], flatPoints[i * 3 + 1], flatPoints[i * 3 + 2]));
}
GeomAPI_Interpolate interp(pts, false, 1e-6);
gp_Vec startTan(startTanX, startTanY, startTanZ);
gp_Vec endTan(endTanX, endTanY, endTanZ);
interp.Load(startTan, endTan, Standard_True);
interp.Perform();
if (!interp.IsDone()) {
    throw std::runtime_error(\"interpolatePointsWithTangents: interpolation failed\");
}
BRepBuilderAPI_MakeEdge edgeMaker(interp.Curve());
if (!edgeMaker.IsDone()) {
    throw std::runtime_error(\"interpolatePointsWithTangents: edge construction failed\");
}
return store(edgeMaker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx", "GeomAPI_Interpolate.hxx",
            "NCollection_HArray1.hxx", "gp_Pnt.hxx", "gp_Vec.hxx",
        ],
        category: "curve",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "projectPointOnEdge",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("edgeId"),
            FacadeParam::Double("x"),
            FacadeParam::Double("y"),
            FacadeParam::Double("z"),
        ],
        occt_class: "",
        ctor_args: "",
        // Returns [cpX, cpY, cpZ, tangentX, tangentY, tangentZ, parameter].
        setup_code: "\
TopoDS_Edge edge = TopoDS::Edge(get(edgeId));
double first, last;
Handle(Geom_Curve) curve = BRep_Tool::Curve(edge, first, last);
if (curve.IsNull()) {
    throw std::runtime_error(\"projectPointOnEdge: edge has no 3D curve\");
}
GeomAPI_ProjectPointOnCurve proj(gp_Pnt(x, y, z), curve, first, last);
if (proj.NbPoints() < 1) {
    throw std::runtime_error(\"projectPointOnEdge: no projection found\");
}
double param = proj.LowerDistanceParameter();
gp_Pnt cp;
gp_Vec tan;
curve->D1(param, cp, tan);
return {cp.X(), cp.Y(), cp.Z(), tan.X(), tan.Y(), tan.Z(), param};",
        includes: &[
            "BRep_Tool.hxx", "GeomAPI_ProjectPointOnCurve.hxx", "Geom_Curve.hxx",
            "TopoDS.hxx", "gp_Pnt.hxx", "gp_Vec.hxx",
        ],
        category: "curve",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "curveIsPeriodic",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
if (shape.ShapeType() == TopAbs_WIRE) {
    BRepAdaptor_CompCurve comp(TopoDS::Wire(shape));
    return comp.IsPeriodic();
}
BRepAdaptor_Curve curve(TopoDS::Edge(shape));
return curve.IsPeriodic();",
        includes: &["BRepAdaptor_CompCurve.hxx", "BRepAdaptor_Curve.hxx", "TopoDS.hxx"],
        category: "curve",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "approximatePoints",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorDouble("flatPoints"), FacadeParam::Double("tolerance")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
int nPts = static_cast<int>(flatPoints.size()) / 3;
if (nPts < 2) {
    throw std::runtime_error(\"approximatePoints: need at least 2 points\");
}

NCollection_Array1<gp_Pnt> pts(1, nPts);
for (int i = 0; i < nPts; i++) {
    pts.SetValue(i + 1,
                 gp_Pnt(flatPoints[i * 3], flatPoints[i * 3 + 1], flatPoints[i * 3 + 2]));
}

GeomAPI_PointsToBSpline approx(pts, 3, 8, GeomAbs_C2, tolerance);
if (!approx.IsDone()) {
    throw std::runtime_error(\"approximatePoints: approximation failed\");
}

BRepBuilderAPI_MakeEdge edgeMaker(approx.Curve());
if (!edgeMaker.IsDone()) {
    throw std::runtime_error(\"approximatePoints: edge construction failed\");
}
return store(edgeMaker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx", "GeomAPI_PointsToBSpline.hxx",
            "GeomAbs_Shape.hxx", "NCollection_Array1.hxx", "gp_Pnt.hxx",
        ],
        category: "curve",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "liftCurve2dToPlane",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorDouble("flatPoints2d"),
            FacadeParam::Double("planeOx"), FacadeParam::Double("planeOy"), FacadeParam::Double("planeOz"),
            FacadeParam::Double("planeZx"), FacadeParam::Double("planeZy"), FacadeParam::Double("planeZz"),
            FacadeParam::Double("planeXx"), FacadeParam::Double("planeXy"), FacadeParam::Double("planeXz"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
int nPts = static_cast<int>(flatPoints2d.size()) / 2;
if (nPts < 2) {
    throw std::runtime_error(\"liftCurve2dToPlane: need at least 2 points\");
}

// Build the plane from origin + Z-axis + X-axis
gp_Pnt origin(planeOx, planeOy, planeOz);
gp_Dir zDir(planeZx, planeZy, planeZz);
gp_Dir xDir(planeXx, planeXy, planeXz);
gp_Ax3 ax3(origin, zDir, xDir);
gp_Pln plane(ax3);

// Create 2D points array
Handle(NCollection_HArray1<gp_Pnt2d>) pts2d = new NCollection_HArray1<gp_Pnt2d>(1, nPts);
for (int i = 0; i < nPts; i++) {
    pts2d->SetValue(i + 1, gp_Pnt2d(flatPoints2d[i * 2], flatPoints2d[i * 2 + 1]));
}

// Interpolate through the 2D points
Geom2dAPI_Interpolate interp(pts2d, false, 1e-6);
interp.Perform();
if (!interp.IsDone()) {
    throw std::runtime_error(\"liftCurve2dToPlane: 2D interpolation failed\");
}

// Build 3D edge from 2D curve on plane
Handle(Geom_Surface) surface = new Geom_Plane(plane);
BRepBuilderAPI_MakeEdge edgeMaker(interp.Curve(), surface);
if (!edgeMaker.IsDone()) {
    throw std::runtime_error(\"liftCurve2dToPlane: edge construction failed\");
}
return store(edgeMaker.Shape());",
        includes: &[
            "BRepBuilderAPI_MakeEdge.hxx", "Geom2dAPI_Interpolate.hxx",
            "Geom2d_BSplineCurve.hxx", "Geom_Plane.hxx", "NCollection_HArray1.hxx",
            "gp_Ax3.hxx", "gp_Dir.hxx", "gp_Pln.hxx", "gp_Pnt.hxx", "gp_Pnt2d.hxx",
        ],
        category: "curve",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "getNurbsCurveData",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("edgeId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Curve adaptor(TopoDS::Edge(get(edgeId)));
Handle(Geom_BSplineCurve) bspline;
if (adaptor.GetType() == GeomAbs_BSplineCurve) {
    bspline = adaptor.BSpline();
} else if (adaptor.GetType() == GeomAbs_BezierCurve) {
    bspline = GeomConvert::CurveToBSplineCurve(adaptor.Bezier());
} else {
    throw std::runtime_error(\"getNurbsCurveData: edge is not a BSpline or Bezier curve\");
}
NurbsCurveData result{};
result.degree = bspline->Degree();
result.rational = bspline->IsRational();
result.periodic = bspline->IsPeriodic();

// Knots and multiplicities
int nKnots = bspline->NbKnots();
result.knots.resize(nKnots);
result.multiplicities.resize(nKnots);
for (int i = 1; i <= nKnots; i++) {
    result.knots[i - 1] = bspline->Knot(i);
    result.multiplicities[i - 1] = bspline->Multiplicity(i);
}

// Poles (control points)
int nPoles = bspline->NbPoles();
result.poles.resize(nPoles * 3);
for (int i = 1; i <= nPoles; i++) {
    gp_Pnt p = bspline->Pole(i);
    result.poles[(i - 1) * 3] = p.X();
    result.poles[(i - 1) * 3 + 1] = p.Y();
    result.poles[(i - 1) * 3 + 2] = p.Z();
}

// Weights (only if rational)
if (bspline->IsRational()) {
    result.weights.resize(nPoles);
    for (int i = 1; i <= nPoles; i++) {
        result.weights[i - 1] = bspline->Weight(i);
    }
}

return result;",
        includes: &[
            "BRepAdaptor_Curve.hxx", "GeomAbs_CurveType.hxx",
            "Geom_BSplineCurve.hxx", "Geom_BezierCurve.hxx", "GeomConvert.hxx",
            "TopoDS.hxx", "gp_Pnt.hxx",
        ],
        category: "curve",
        return_type: ReturnType::NurbsCurveData,
    },
    MethodSpec {
        name: "curveDegreeElevate",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("edgeId"), FacadeParam::Int("elevateBy")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Curve adaptor(TopoDS::Edge(get(edgeId)));
Handle(Geom_BSplineCurve) bspline;
if (adaptor.GetType() == GeomAbs_BSplineCurve) {
    bspline = Handle(Geom_BSplineCurve)::DownCast(adaptor.BSpline()->Copy());
} else if (adaptor.GetType() == GeomAbs_BezierCurve) {
    bspline = GeomConvert::CurveToBSplineCurve(adaptor.Bezier());
} else {
    throw std::runtime_error(\"curveDegreeElevate: edge is not a BSpline or Bezier curve\");
}
bspline->IncreaseDegree(bspline->Degree() + elevateBy);
BRepBuilderAPI_MakeEdge maker(bspline);
if (!maker.IsDone()) {
    throw std::runtime_error(\"curveDegreeElevate: edge construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepAdaptor_Curve.hxx", "BRepBuilderAPI_MakeEdge.hxx",
            "GeomAbs_CurveType.hxx", "Geom_BSplineCurve.hxx",
            "Geom_BezierCurve.hxx", "GeomConvert.hxx", "TopoDS.hxx",
        ],
        category: "curve",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "curveKnotInsert",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("edgeId"),
            FacadeParam::Double("knot"),
            FacadeParam::Int("times"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Curve adaptor(TopoDS::Edge(get(edgeId)));
Handle(Geom_BSplineCurve) bspline;
if (adaptor.GetType() == GeomAbs_BSplineCurve) {
    bspline = Handle(Geom_BSplineCurve)::DownCast(adaptor.BSpline()->Copy());
} else if (adaptor.GetType() == GeomAbs_BezierCurve) {
    bspline = GeomConvert::CurveToBSplineCurve(adaptor.Bezier());
} else {
    throw std::runtime_error(\"curveKnotInsert: edge is not a BSpline or Bezier curve\");
}
bspline->InsertKnot(knot, times, Precision::Confusion());
BRepBuilderAPI_MakeEdge maker(bspline);
if (!maker.IsDone()) {
    throw std::runtime_error(\"curveKnotInsert: edge construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepAdaptor_Curve.hxx", "BRepBuilderAPI_MakeEdge.hxx",
            "GeomAbs_CurveType.hxx", "Geom_BSplineCurve.hxx",
            "Geom_BezierCurve.hxx", "GeomConvert.hxx", "Precision.hxx", "TopoDS.hxx",
        ],
        category: "curve",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "curveKnotRemove",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("edgeId"),
            FacadeParam::Double("knot"),
            FacadeParam::Double("tolerance"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Curve adaptor(TopoDS::Edge(get(edgeId)));
Handle(Geom_BSplineCurve) bspline;
if (adaptor.GetType() == GeomAbs_BSplineCurve) {
    bspline = Handle(Geom_BSplineCurve)::DownCast(adaptor.BSpline()->Copy());
} else if (adaptor.GetType() == GeomAbs_BezierCurve) {
    bspline = GeomConvert::CurveToBSplineCurve(adaptor.Bezier());
} else {
    throw std::runtime_error(\"curveKnotRemove: edge is not a BSpline or Bezier curve\");
}
int index = 0;
for (int i = 1; i <= bspline->NbKnots(); i++) {
    if (std::abs(bspline->Knot(i) - knot) <= tolerance) {
        index = i;
        break;
    }
}
if (index == 0) {
    throw std::runtime_error(\"curveKnotRemove: knot value not found\");
}
int mult = bspline->Multiplicity(index);
if (!bspline->RemoveKnot(index, mult - 1, tolerance)) {
    throw std::runtime_error(\"curveKnotRemove: knot cannot be removed within tolerance\");
}
BRepBuilderAPI_MakeEdge maker(bspline);
if (!maker.IsDone()) {
    throw std::runtime_error(\"curveKnotRemove: edge construction failed\");
}
return store(maker.Shape());",
        includes: &[
            "BRepAdaptor_Curve.hxx", "BRepBuilderAPI_MakeEdge.hxx", "cmath",
            "GeomAbs_CurveType.hxx", "Geom_BSplineCurve.hxx",
            "Geom_BezierCurve.hxx", "GeomConvert.hxx", "TopoDS.hxx",
        ],
        category: "curve",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "curveSplit",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("edgeId"), FacadeParam::Double("param")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepAdaptor_Curve adaptor(TopoDS::Edge(get(edgeId)));
Handle(Geom_BSplineCurve) base;
if (adaptor.GetType() == GeomAbs_BSplineCurve) {
    base = adaptor.BSpline();
} else if (adaptor.GetType() == GeomAbs_BezierCurve) {
    base = GeomConvert::CurveToBSplineCurve(adaptor.Bezier());
} else {
    throw std::runtime_error(\"curveSplit: edge is not a BSpline or Bezier curve\");
}
double first = base->FirstParameter();
double last = base->LastParameter();
if (param <= first || param >= last) {
    throw std::runtime_error(\"curveSplit: parameter out of range\");
}
Handle(Geom_BSplineCurve) left = Handle(Geom_BSplineCurve)::DownCast(base->Copy());
Handle(Geom_BSplineCurve) right = Handle(Geom_BSplineCurve)::DownCast(base->Copy());
left->Segment(first, param);
right->Segment(param, last);
BRepBuilderAPI_MakeEdge leftMaker(left);
BRepBuilderAPI_MakeEdge rightMaker(right);
if (!leftMaker.IsDone() || !rightMaker.IsDone()) {
    throw std::runtime_error(\"curveSplit: edge construction failed\");
}
std::vector<uint32_t> result;
result.push_back(store(leftMaker.Shape()));
result.push_back(store(rightMaker.Shape()));
return result;",
        includes: &[
            "BRepAdaptor_Curve.hxx", "BRepBuilderAPI_MakeEdge.hxx",
            "GeomAbs_CurveType.hxx", "Geom_BSplineCurve.hxx",
            "Geom_BezierCurve.hxx", "GeomConvert.hxx", "TopoDS.hxx",
        ],
        category: "curve",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "hasTriangulation",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
for (TopExp_Explorer ex(get(id), TopAbs_FACE); ex.More(); ex.Next()) {
    TopLoc_Location loc;
    auto tri = BRep_Tool::Triangulation(TopoDS::Face(ex.Current()), loc);
    if (!tri.IsNull())
        return true;
}
return false;",
        includes: &[
            "BRep_Tool.hxx", "Poly_Triangulation.hxx",
            "TopExp_Explorer.hxx", "TopoDS.hxx",
        ],
        category: "query",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "queryBatch",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::VectorShapeIds("ids")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
std::vector<double> result;
result.reserve(ids.size() * 14);
for (size_t i = 0; i < ids.size(); i++) {
    const auto& shape = get(ids[i]);
    { GProp_GProps props; BRepGProp::VolumeProperties(shape, props); result.push_back(props.Mass()); }
    { GProp_GProps props; BRepGProp::SurfaceProperties(shape, props); result.push_back(props.Mass()); }
    { Bnd_Box box; BRepBndLib::Add(shape, box);
      if (box.IsVoid()) { for (int j = 0; j < 6; j++) result.push_back(0.0); }
      else { double xmin,ymin,zmin,xmax,ymax,zmax; box.Get(xmin,ymin,zmin,xmax,ymax,zmax);
             result.push_back(xmin); result.push_back(ymin); result.push_back(zmin);
             result.push_back(xmax); result.push_back(ymax); result.push_back(zmax); } }
    { GProp_GProps props; BRepGProp::VolumeProperties(shape, props);
      gp_Pnt com = props.CentreOfMass();
      result.push_back(com.X()); result.push_back(com.Y()); result.push_back(com.Z()); }
    result.push_back(static_cast<double>(shape.ShapeType()));
    { BRepCheck_Analyzer checker(shape); result.push_back(checker.IsValid() ? 1.0 : 0.0); }
    result.push_back(0.0);
}
return result;",
        includes: &["GProp_GProps.hxx", "BRepGProp.hxx", "Bnd_Box.hxx", "BRepBndLib.hxx", "BRepCheck_Analyzer.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "getPrincipalProperties",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
GProp_GProps props;
BRepGProp::VolumeProperties(shape, props);
GProp_PrincipalProps p = props.PrincipalProperties();
double ix, iy, iz;
p.Moments(ix, iy, iz);
const gp_Vec& ax1 = p.FirstAxisOfInertia();
const gp_Vec& ax2 = p.SecondAxisOfInertia();
const gp_Vec& ax3 = p.ThirdAxisOfInertia();
return {ix, iy, iz,
        ax1.X(), ax1.Y(), ax1.Z(),
        ax2.X(), ax2.Y(), ax2.Z(),
        ax3.X(), ax3.Y(), ax3.Z()};",
        includes: &["BRepGProp.hxx", "GProp_GProps.hxx", "GProp_PrincipalProps.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "getOrientedBoundingBox",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
Bnd_OBB obb;
BRepBndLib::AddOBB(shape, obb);
gp_Pnt c = obb.Center();
gp_Dir xd = obb.XDirection();
gp_Dir yd = obb.YDirection();
gp_Dir zd = obb.ZDirection();
return {c.X(), c.Y(), c.Z(),
        obb.XHSize(), obb.YHSize(), obb.ZHSize(),
        xd.X(), xd.Y(), xd.Z(),
        yd.X(), yd.Y(), yd.Z(),
        zd.X(), zd.Y(), zd.Z()};",
        includes: &["Bnd_OBB.hxx", "BRepBndLib.hxx", "gp_Dir.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "hasFreeEdges",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
          setup_code: "\
const auto& shape = get(id);
auto checkShell = [](const TopoDS_Shell& shell) -> bool {
  ShapeAnalysis_Shell sa;
  sa.CheckOrientedShells(shell, true);
  return sa.HasFreeEdges();
};
if (shape.ShapeType() == TopAbs_SHELL) return checkShell(TopoDS::Shell(shape));
if (shape.ShapeType() == TopAbs_SOLID) {
  TopoDS_Shell sh;
  for (TopExp_Explorer ex(shape, TopAbs_SHELL); ex.More(); ex.Next()) {
    sh = TopoDS::Shell(ex.Current()); break;
  }
  return checkShell(sh);
}
if (shape.ShapeType() == TopAbs_COMPSOLID || shape.ShapeType() == TopAbs_COMPOUND) {
  for (TopExp_Explorer ex(shape, TopAbs_SOLID); ex.More(); ex.Next()) {
    TopoDS_Shell sh;
    for (TopExp_Explorer ex2(ex.Current(), TopAbs_SHELL); ex2.More(); ex2.Next()) {
      sh = TopoDS::Shell(ex2.Current()); break;
    }
    if (checkShell(sh)) return true;
  }
  for (TopExp_Explorer ex(shape, TopAbs_SHELL); ex.More(); ex.Next())
    if (checkShell(TopoDS::Shell(ex.Current()))) return true;
}
return false;",
        includes: &["ShapeAnalysis_Shell.hxx", "TopoDS.hxx", "TopAbs_ShapeEnum.hxx", "TopExp_Explorer.hxx"],
        category: "query",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "freeEdgeCount",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
          setup_code: "\
const auto& shape = get(id);
auto countFreeEdges = [](const TopoDS_Shell& shell) -> int {
  ShapeAnalysis_Shell sa;
  sa.CheckOrientedShells(shell, true);
  if (!sa.HasFreeEdges()) return 0;
  TopoDS_Compound freeEdges = sa.FreeEdges();
  int c = 0;
  for (TopExp_Explorer ex(freeEdges, TopAbs_EDGE); ex.More(); ex.Next()) c++;
  return c;
};
auto firstShell = [](const TopoDS_Shape& sh) -> TopoDS_Shell {
  for (TopExp_Explorer ex(sh, TopAbs_SHELL); ex.More(); ex.Next())
    return TopoDS::Shell(ex.Current());
  return TopoDS_Shell();
};
int total = 0;
if (shape.ShapeType() == TopAbs_SHELL) total += countFreeEdges(TopoDS::Shell(shape));
if (shape.ShapeType() == TopAbs_SOLID) total += countFreeEdges(firstShell(shape));
for (TopExp_Explorer ex(shape, TopAbs_SOLID); ex.More(); ex.Next())
  total += countFreeEdges(firstShell(ex.Current()));
for (TopExp_Explorer ex(shape, TopAbs_SHELL); ex.More(); ex.Next())
  total += countFreeEdges(TopoDS::Shell(ex.Current()));
return total;",
        includes: &["ShapeAnalysis_Shell.hxx", "TopoDS.hxx", "TopAbs_ShapeEnum.hxx", "TopExp_Explorer.hxx"],
        category: "query",
        return_type: ReturnType::Int,
    },
    MethodSpec {
        name: "rayIntersect",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "",
        includes: &[],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "shapeContents",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);
ShapeAnalysis_ShapeContents c;
c.Perform(shape);
return {static_cast<double>(c.NbFaces()),
        static_cast<double>(c.NbEdges()),
        static_cast<double>(c.NbFreeFaces()),
        static_cast<double>(c.NbFreeWires()),
        static_cast<double>(c.NbFreeEdges()),
        static_cast<double>(c.NbC0Surfaces()),
        static_cast<double>(c.NbBSplibeSurf()),
        static_cast<double>(c.NbOffsetSurf())};",
        includes: &["ShapeAnalysis_ShapeContents.hxx"],
        category: "query",
        return_type: ReturnType::VectorDouble,
    },
    // ── BRepGraph topology queries ─────────────────────────────────
    MethodSpec {
        name: "graphBuild",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "", ctor_args: "", setup_code: "", includes: &[],
        category: "query",
        return_type: ReturnType::Void,
    },
    MethodSpec {
        name: "graphBodyMap",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "", ctor_args: "", setup_code: "", includes: &[],
        category: "query",
        return_type: ReturnType::VectorInt,
    },
    MethodSpec {
        name: "graphFaceAdjacency",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "", ctor_args: "", setup_code: "", includes: &[],
        category: "query",
        return_type: ReturnType::VectorInt,
    },
    MethodSpec {
        name: "graphEdgeFaces",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "", ctor_args: "", setup_code: "", includes: &[],
        category: "query",
        return_type: ReturnType::VectorInt,
    },
    MethodSpec {
        name: "graphWireTopology",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "", ctor_args: "", setup_code: "", includes: &[],
        category: "query",
        return_type: ReturnType::VectorInt,
    },
    MethodSpec {
        name: "graphEdgeVertices",
        kind: MethodKind::Skip,
        params: &[],
        occt_class: "", ctor_args: "", setup_code: "", includes: &[],
        category: "query",
        return_type: ReturnType::VectorInt,
    },
    // ── Healing ──────────────────────────────────────────────────
    MethodSpec {
        name: "fixShape",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeFix_Shape fixer(get(id));
fixer.Perform();
return store(fixer.Shape());",
        includes: &["ShapeFix_Shape.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "unifySameDomain",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeUpgrade_UnifySameDomain upgrader(get(id), true, true, false);
upgrader.Build();
return store(upgrader.Shape());",
        includes: &["ShapeUpgrade_UnifySameDomain.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "isValid",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
BRepCheck_Analyzer checker(get(id));
return checker.IsValid();",
        includes: &["BRepCheck_Analyzer.hxx"],
        category: "healing",
        return_type: ReturnType::Bool,
    },
    MethodSpec {
        name: "healSolid",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Double("tolerance")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
Handle(ShapeFix_Solid) fixer = new ShapeFix_Solid(TopoDS::Solid(get(id)));
fixer->SetPrecision(tolerance);
fixer->Perform();
return store(fixer->Shape());",
        includes: &["ShapeFix_Solid.hxx", "TopoDS.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "healFace",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Double("tolerance")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeFix_Face fixer(TopoDS::Face(get(id)));
fixer.SetPrecision(tolerance);
fixer.Perform();
return store(fixer.Face());",
        includes: &["ShapeFix_Face.hxx", "TopoDS.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "healWire",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id"), FacadeParam::Double("tolerance")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeFix_Wire fixer;
fixer.Load(TopoDS::Wire(get(id)));
fixer.SetPrecision(tolerance);
fixer.Perform();
return store(fixer.Wire());",
        includes: &["ShapeFix_Wire.hxx", "TopoDS.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "fixFaceOrientations",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeFix_Shape fixer(get(id));
fixer.Perform();
return store(fixer.Shape());",
        includes: &["ShapeFix_Shape.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "buildCurves3d",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("wireId")],
        occt_class: "",
        ctor_args: "",
        setup_code: "BRepLib::BuildCurves3d(get(wireId));",
        includes: &["BRepLib.hxx"],
        category: "healing",
        return_type: ReturnType::Void,
    },
    MethodSpec {
        name: "fixWireOnFace",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("wireId"),
            FacadeParam::ShapeId("faceId"),
            FacadeParam::Double("tolerance"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeFix_Wire fixer(TopoDS::Wire(get(wireId)), TopoDS::Face(get(faceId)), tolerance);
fixer.FixEdgeCurves();
return store(fixer.Wire());",
        includes: &["ShapeFix_Wire.hxx", "TopoDS.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "removeDegenerateEdges",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
ShapeFix_Shape fixer(get(id));
fixer.Perform();
return store(fixer.Shape());",
        includes: &["ShapeFix_Shape.hxx"],
        category: "healing",
        return_type: ReturnType::ShapeId,
    },
    // ── IO ──────────────────────────────────────────────────────────
    MethodSpec {
        name: "importStep",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::String("data")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
STEPControl_Reader reader;

// Write data to Emscripten's virtual filesystem
// STEPControl_Reader needs a file path — write to virtual FS
{
    FILE* f = fopen(\"/tmp/import.step\", \"w\");
    if (!f) {
        throw std::runtime_error(\"importStep: cannot create temp file\");
    }
    fwrite(data.c_str(), 1, data.size(), f);
    fclose(f);
}

IFSelect_ReturnStatus status = reader.ReadFile(\"/tmp/import.step\");
if (status != IFSelect_RetDone) {
    throw std::runtime_error(\"importStep: failed to read STEP data\");
}

reader.TransferRoots();
if (reader.NbShapes() == 0) {
    throw std::runtime_error(\"importStep: no shapes found in STEP data\");
}

return store(reader.OneShape());",
        includes: &["IFSelect_ReturnStatus.hxx", "STEPControl_Reader.hxx"],
        category: "io",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "exportStep",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);

STEPControl_Writer writer;
IFSelect_ReturnStatus status = writer.Transfer(shape, STEPControl_AsIs);
if (status != IFSelect_RetDone) {
    throw std::runtime_error(\"exportStep: transfer failed\");
}

// Write to temp file then read back
const char* tmpPath = \"/tmp/export.step\";
status = writer.Write(tmpPath);
if (status != IFSelect_RetDone) {
    throw std::runtime_error(\"exportStep: write failed\");
}

// Read file content
FILE* f = fopen(tmpPath, \"r\");
if (!f) {
    throw std::runtime_error(\"exportStep: cannot read temp file\");
}
fseek(f, 0, SEEK_END);
long size = ftell(f);
fseek(f, 0, SEEK_SET);
std::string result(size, '\\0');
fread(&result[0], 1, size, f);
fclose(f);

return result;",
        includes: &[
            "IFSelect_ReturnStatus.hxx", "STEPControl_Writer.hxx",
            "STEPControl_StepModelType.hxx",
        ],
        category: "io",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "exportStl",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"), FacadeParam::Double("linearDeflection"),
            FacadeParam::Bool("ascii"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);

// Mesh the shape first
BRepMesh_IncrementalMesh mesher(shape, linearDeflection, false, 0.5, false);

StlAPI_Writer writer;
writer.ASCIIMode() = ascii;

const char* tmpPath = \"/tmp/export.stl\";
if (!writer.Write(shape, tmpPath)) {
    throw std::runtime_error(\"exportStl: write failed\");
}

FILE* f = fopen(tmpPath, \"rb\");
if (!f) {
    throw std::runtime_error(\"exportStl: cannot read temp file\");
}
fseek(f, 0, SEEK_END);
long size = ftell(f);
fseek(f, 0, SEEK_SET);
std::string result(size, '\\0');
fread(&result[0], 1, size, f);
fclose(f);

return result;",
        includes: &["BRepMesh_IncrementalMesh.hxx", "StlAPI_Writer.hxx"],
        category: "io",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "importStl",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::String("data")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
// If data is non-empty, write it to the virtual FS.
// If empty, assume the caller already wrote to /tmp/import.stl via FS API.
if (!data.empty()) {
    FILE* f = fopen(\"/tmp/import.stl\", \"wb\");
    if (!f) {
        throw std::runtime_error(\"importStl: cannot create temp file\");
    }
    fwrite(data.c_str(), 1, data.size(), f);
    fclose(f);
}

TopoDS_Shape shape;
StlAPI_Reader reader;
if (!reader.Read(shape, \"/tmp/import.stl\")) {
    throw std::runtime_error(\"importStl: failed to read STL data\");
}

if (shape.IsNull()) {
    throw std::runtime_error(\"importStl: no shape produced from STL data\");
}

return store(shape);",
        includes: &["StlAPI_Reader.hxx"],
        category: "io",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "toBREP",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
std::ostringstream oss(std::ios::binary);
oss << std::setprecision(17);
BRepTools::Write(get(id), oss);
return oss.str();",
        includes: &["BRepTools.hxx"],
        category: "io",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "fromBREP",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::String("data")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
std::istringstream iss(data, std::ios::binary);
TopoDS_Shape shape;
BRep_Builder builder;
Message_ProgressRange progress;
BRepTools::Read(shape, iss, builder, progress);
if (shape.IsNull()) {
    throw std::runtime_error(\"fromBREP: failed to read shape\");
}
return store(shape);",
        includes: &["BRepTools.hxx", "BRep_Builder.hxx", "Message_ProgressRange.hxx"],
        category: "io",
        return_type: ReturnType::ShapeId,
    },
    MethodSpec {
        name: "exportBrepBinary",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        // Binary BREP is true binary (unlike the ASCII text format), so it goes
        // through the virtual FS — JS reads the bytes via Module.FS.readFile().
        setup_code: "\
std::string path = \"/tmp/export.brep.bin\";
BinTools::Write(get(id), path.c_str());
return path;",
        includes: &["BinTools.hxx"],
        category: "io",
        return_type: ReturnType::String,
    },
    MethodSpec {
        name: "importBrepBinary",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::String("path")],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
TopoDS_Shape shape;
BinTools::Read(shape, path.c_str());
if (shape.IsNull()) {
    throw std::runtime_error(\"importBrepBinary: failed to read shape\");
}
return store(shape);",
        includes: &["BinTools.hxx"],
        category: "io",
        return_type: ReturnType::ShapeId,
    },
    // ── Tessellate ──────────────────────────────────────────────────
    MethodSpec {
        name: "tessellate",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("linearDeflection"),
            FacadeParam::Double("angularDeflection"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "return buildMeshData(get(id), linearDeflection, angularDeflection, false);",
        includes: &[],
        category: "tessellate",
        return_type: ReturnType::MeshData,
    },
    MethodSpec {
        name: "tessellateRelative",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("linearDeflection"),
            FacadeParam::Double("angularDeflection"),
        ],
        occt_class: "",
        ctor_args: "",
        // Scale-independent meshing: linearDeflection is interpreted relative to
        // each edge's length (OCCT isRelative).
        setup_code: "return buildMeshData(get(id), linearDeflection, angularDeflection, true);",
        includes: &[],
        category: "tessellate",
        return_type: ReturnType::MeshData,
    },
    MethodSpec {
        name: "meshShape",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("linearDeflection"),
            FacadeParam::Double("angularDeflection"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "return tessellate(id, linearDeflection, angularDeflection);",
        includes: &[],
        category: "tessellate",
        return_type: ReturnType::MeshData,
    },
    MethodSpec {
        name: "meshBatch",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::VectorShapeIds("ids"),
            FacadeParam::Double("linearDeflection"),
            FacadeParam::Double("angularDeflection"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
// Cache entry: triangulation handle + metadata from first pass
struct FaceCache {
    Handle(Poly_Triangulation) tri;
    gp_Trsf trsf;
    TopoDS_Face face;
    size_t shapeIdx;
};

struct ShapeMesh {
    int posStart, posCount, idxStart, idxCount;
};
std::vector<ShapeMesh> shapeMeshes;
shapeMeshes.reserve(ids.size());
std::vector<FaceCache> faceCache;

int totalNodes = 0;
int totalTris = 0;

// First pass: mesh all shapes, cache face data, count totals
for (size_t si = 0; si < ids.size(); si++) {
    const auto& shape = get(ids[si]);
    BRepMesh_IncrementalMesh mesher(shape, linearDeflection, false, angularDeflection,
                                    false);

    int shapeNodes = 0;
    int shapeTris = 0;
    for (TopExp_Explorer ex(shape, TopAbs_FACE); ex.More(); ex.Next()) {
        const auto& face = TopoDS::Face(ex.Current());
        TopLoc_Location loc;
        auto tri = BRep_Tool::Triangulation(face, loc);
        if (tri.IsNull())
            continue;
        shapeNodes += tri->NbNodes();
        shapeTris += tri->NbTriangles();
        faceCache.push_back({tri, loc.Transformation(), face, si});
    }
    shapeMeshes.push_back({totalNodes * 3, shapeNodes * 3, totalTris * 3, shapeTris * 3});
    totalNodes += shapeNodes;
    totalTris += shapeTris;
}

// Allocate
MeshBatchData result;
result.positionCount = totalNodes * 3;
result.normalCount = totalNodes * 3;
result.indexCount = totalTris * 3;
result.shapeCount = static_cast<int>(ids.size());

result.positions = static_cast<float*>(std::malloc(result.positionCount * sizeof(float)));
result.normals = static_cast<float*>(std::malloc(result.normalCount * sizeof(float)));
result.indices = static_cast<uint32_t*>(std::malloc(result.indexCount * sizeof(uint32_t)));
result.shapeOffsets =
    static_cast<int32_t*>(std::malloc(result.shapeCount * 4 * sizeof(int32_t)));

if ((!result.positions && result.positionCount > 0) ||
    (!result.normals && result.normalCount > 0) ||
    (!result.indices && result.indexCount > 0) ||
    (!result.shapeOffsets && result.shapeCount > 0)) {
    throw std::runtime_error(\"meshBatch: memory allocation failed\");
}

// Second pass: extract geometry from cached face data
int vertexOffset = 0;
int triOffset = 0;

for (const auto& fc : faceCache) {
    const auto& tri = fc.tri;
    const auto& trsf = fc.trsf;
    bool identityTrsf = (trsf.Form() == gp_Identity);
    int nbNodes = tri->NbNodes();
    int nbTri = tri->NbTriangles();

    if (identityTrsf) {
        for (int i = 1; i <= nbNodes; i++) {
            const gp_Pnt& p = tri->Node(i);
            int base = (vertexOffset + i - 1) * 3;
            result.positions[base + 0] = static_cast<float>(p.X());
            result.positions[base + 1] = static_cast<float>(p.Y());
            result.positions[base + 2] = static_cast<float>(p.Z());
        }
    } else {
        for (int i = 1; i <= nbNodes; i++) {
            gp_Pnt p = tri->Node(i).Transformed(trsf);
            int base = (vertexOffset + i - 1) * 3;
            result.positions[base + 0] = static_cast<float>(p.X());
            result.positions[base + 1] = static_cast<float>(p.Y());
            result.positions[base + 2] = static_cast<float>(p.Z());
        }
    }

    if (!tri->HasNormals()) {
        BRepLib_ToolTriangulatedShape::ComputeNormals(fc.face, tri);
    }
    bool hasNormals = tri->HasNormals();
    for (int i = 1; i <= nbNodes; i++) {
        gp_Dir d(0, 0, 1);
        if (hasNormals) {
            NCollection_Vec3<float> nv;
            tri->Normal(i, nv);
            if (nv.x() != 0.0f || nv.y() != 0.0f || nv.z() != 0.0f) {
                d = gp_Dir(nv.x(), nv.y(), nv.z());
            }
        }
        if (!identityTrsf) {
            d = d.Transformed(trsf);
        }
        int base = (vertexOffset + i - 1) * 3;
        result.normals[base + 0] = static_cast<float>(d.X());
        result.normals[base + 1] = static_cast<float>(d.Y());
        result.normals[base + 2] = static_cast<float>(d.Z());
    }

    bool isReversed = (fc.face.Orientation() != TopAbs_FORWARD);
    for (int t = 1; t <= nbTri; t++) {
        const auto& triangle = tri->Triangle(t);
        int n1 = triangle.Value(1);
        int n2 = triangle.Value(2);
        int n3 = triangle.Value(3);
        if (isReversed)
            std::swap(n1, n2);
        result.indices[triOffset + 0] = static_cast<uint32_t>(n1 - 1 + vertexOffset);
        result.indices[triOffset + 1] = static_cast<uint32_t>(n2 - 1 + vertexOffset);
        result.indices[triOffset + 2] = static_cast<uint32_t>(n3 - 1 + vertexOffset);
        triOffset += 3;
    }

    vertexOffset += nbNodes;
}

// Write per-shape offsets
for (size_t si = 0; si < ids.size(); si++) {
    int oi = static_cast<int>(si) * 4;
    result.shapeOffsets[oi + 0] = shapeMeshes[si].posStart;
    result.shapeOffsets[oi + 1] = shapeMeshes[si].posCount;
    result.shapeOffsets[oi + 2] = shapeMeshes[si].idxStart;
    result.shapeOffsets[oi + 3] = shapeMeshes[si].idxCount;
}

return result;",
        includes: &[
            "BRepLib_ToolTriangulatedShape.hxx", "BRepMesh_IncrementalMesh.hxx",
            "BRep_Tool.hxx", "NCollection_Vec3.hxx", "Poly_Triangulation.hxx",
            "TopAbs_Orientation.hxx", "TopExp_Explorer.hxx", "TopLoc_Location.hxx",
            "TopoDS.hxx", "TopoDS_Face.hxx",
            "gp_Dir.hxx", "gp_Pnt.hxx",
        ],
        category: "tessellate",
        return_type: ReturnType::MeshBatchData,
    },
    MethodSpec {
        name: "wireframe",
        kind: MethodKind::CustomBody,
        params: &[
            FacadeParam::ShapeId("id"),
            FacadeParam::Double("deflection"),
        ],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
const auto& shape = get(id);

struct EdgeSample {
    std::vector<gp_Pnt> pts;
    int hash;
};
std::vector<EdgeSample> edgeSamples;
int totalPoints = 0;

// Use IndexedMap to avoid duplicate edges (shared between faces)
NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> edgeMap;
TopExp::MapShapes(shape, TopAbs_EDGE, edgeMap);
for (int ei = 1; ei <= edgeMap.Extent(); ei++) {
    BRepAdaptor_Curve curve(TopoDS::Edge(edgeMap.FindKey(ei)));
    GCPnts_TangentialDeflection sampler(curve, deflection, 0.5);
    EdgeSample es;
    for (int i = 1; i <= sampler.NbPoints(); i++) {
        es.pts.push_back(sampler.Value(i));
    }
    es.hash = static_cast<int>(TopTools_ShapeMapHasher{}(edgeMap.FindKey(ei)) % 2147483647);
    totalPoints += static_cast<int>(es.pts.size());
    edgeSamples.push_back(std::move(es));
}

EdgeData result;
result.pointCount = totalPoints * 3;
result.points = static_cast<float*>(std::malloc(result.pointCount * sizeof(float)));
int numEdges = static_cast<int>(edgeSamples.size());
result.edgeGroupCount = numEdges * 3;
result.edgeGroups =
    static_cast<int32_t*>(std::malloc(result.edgeGroupCount * sizeof(int32_t)));
if (!result.points && result.pointCount > 0) {
    throw std::runtime_error(\"wireframe: allocation failed\");
}

int offset = 0;
int edgeIdx = 0;
for (const auto& es : edgeSamples) {
    int edgeStart = offset;
    for (const auto& p : es.pts) {
        result.points[offset + 0] = static_cast<float>(p.X());
        result.points[offset + 1] = static_cast<float>(p.Y());
        result.points[offset + 2] = static_cast<float>(p.Z());
        offset += 3;
    }
    if (result.edgeGroups) {
        result.edgeGroups[edgeIdx * 3] = edgeStart;
        result.edgeGroups[edgeIdx * 3 + 1] = offset - edgeStart;
        result.edgeGroups[edgeIdx * 3 + 2] = es.hash;
    }
    edgeIdx++;
}

return result;",
        includes: &[
            "BRepAdaptor_Curve.hxx", "GCPnts_TangentialDeflection.hxx",
            "NCollection_IndexedMap.hxx", "TopExp.hxx",
            "TopTools_ShapeMapHasher.hxx", "TopoDS.hxx",
            "gp_Pnt.hxx",
        ],
        category: "tessellate",
        return_type: ReturnType::EdgeData,
    },
    // ── Kernel (arena management) ──────────────────────────────────
    MethodSpec {
        name: "release",
        kind: MethodKind::CustomBody,
        params: &[FacadeParam::ShapeId("id")],
        occt_class: "",
        ctor_args: "",
        setup_code: "arena_.erase(id);",
        includes: &[],
        category: "kernel",
        return_type: ReturnType::Void,
    },
    MethodSpec {
        name: "releaseAll",
        kind: MethodKind::CustomBody,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "\
arena_.clear();
nextId_ = 1;",
        includes: &[],
        category: "kernel",
        return_type: ReturnType::Void,
    },
    MethodSpec {
        name: "getShapeCount",
        kind: MethodKind::CustomBody,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "return static_cast<uint32_t>(arena_.size());",
        includes: &[],
        category: "kernel",
        return_type: ReturnType::Uint32,
    },
    MethodSpec {
        name: "makeNullShape",
        kind: MethodKind::CustomBody,
        params: &[],
        occt_class: "",
        ctor_args: "",
        setup_code: "return store(TopoDS_Shape());",
        includes: &[],
        category: "kernel",
        return_type: ReturnType::ShapeId,
    },

    // --- Bulk array marshalling (Embind-only heap transfer) ---
    // These let the JS wrapper move large arrays across the WASM boundary in a
    // single HEAP copy instead of N per-element push_back() crossings, which
    // measured as ~50% of the cost of point-array methods like interpolatePoints.
    // Emitted to the Embind target only (filtered out of WASI/crate in run.rs):
    // the crate marshals via wasmtime linear memory and has no use for them.
    // These never enter OCCT, so they use CustomBodyRaw (no Standard_Failure
    // catch — that would be dead code). allocBytes throws on malloc failure so
    // the JS side never silently writes a typed-array view at offset 0.
    MethodSpec {
        name: "allocBytes",
        kind: MethodKind::CustomBodyRaw,
        params: &[FacadeParam::Int("byteCount")],
        occt_class: "",
        ctor_args: "",
        setup_code: "void* p = std::malloc(static_cast<size_t>(byteCount));\nif (!p) {\n    throw std::runtime_error(\"allocBytes: malloc failed (out of WASM linear memory)\");\n}\nreturn static_cast<int>(reinterpret_cast<uintptr_t>(p));",
        includes: &["cstdlib", "stdexcept"],
        category: "marshal",
        return_type: ReturnType::Int,
    },
    MethodSpec {
        name: "freeBytes",
        kind: MethodKind::CustomBodyRaw,
        params: &[FacadeParam::Int("ptr")],
        occt_class: "",
        ctor_args: "",
        setup_code: "std::free(reinterpret_cast<void*>(static_cast<uintptr_t>(static_cast<uint32_t>(ptr))));",
        includes: &["cstdlib"],
        category: "marshal",
        return_type: ReturnType::Void,
    },
    MethodSpec {
        name: "vectorF64FromHeap",
        kind: MethodKind::CustomBodyRaw,
        params: &[FacadeParam::Int("ptr"), FacadeParam::Int("count")],
        occt_class: "",
        ctor_args: "",
        setup_code: "const double* p =\n    reinterpret_cast<const double*>(static_cast<uintptr_t>(static_cast<uint32_t>(ptr)));\nreturn std::vector<double>(p, p + count);",
        includes: &[],
        category: "marshal",
        return_type: ReturnType::VectorDouble,
    },
    MethodSpec {
        name: "vectorU32FromHeap",
        kind: MethodKind::CustomBodyRaw,
        params: &[FacadeParam::Int("ptr"), FacadeParam::Int("count")],
        occt_class: "",
        ctor_args: "",
        setup_code: "const uint32_t* p =\n    reinterpret_cast<const uint32_t*>(static_cast<uintptr_t>(static_cast<uint32_t>(ptr)));\nreturn std::vector<uint32_t>(p, p + count);",
        includes: &[],
        category: "marshal",
        return_type: ReturnType::VectorUint32,
    },
    MethodSpec {
        name: "vectorI32FromHeap",
        kind: MethodKind::CustomBodyRaw,
        params: &[FacadeParam::Int("ptr"), FacadeParam::Int("count")],
        occt_class: "",
        ctor_args: "",
        setup_code: "const int* p =\n    reinterpret_cast<const int*>(static_cast<uintptr_t>(static_cast<uint32_t>(ptr)));\nreturn std::vector<int>(p, p + count);",
        includes: &[],
        category: "marshal",
        return_type: ReturnType::VectorInt,
    },
];

/// Returns the complete list of facade method specifications.
///
/// The returned slice includes both generable methods and skipped methods.
/// Filter on [`MethodKind::Skip`] to get only the methods that should
/// produce generated code.
pub fn target_methods() -> &'static [MethodSpec] {
    TARGET_METHODS
}

/// Validate the method specs before emission, returning a descriptive error
/// instead of panicking. Run as a fail-fast pass at the start of codegen so a
/// malformed hand-edited spec is rejected up front rather than producing broken
/// C++/Rust that only fails much later at the em++/cargo build.
pub fn validate(methods: &[MethodSpec]) -> Result<()> {
    let mut seen = std::collections::HashSet::new();
    for m in methods {
        if !seen.insert(m.name) {
            bail!("duplicate method name: '{}'", m.name);
        }
        if m.category != m.category.to_ascii_lowercase() {
            bail!(
                "method '{}' has non-lowercase category '{}'",
                m.name,
                m.category
            );
        }
        match m.kind {
            MethodKind::Skip => {
                if !m.params.is_empty() {
                    bail!("skipped method '{}' should have empty params", m.name);
                }
            }
            MethodKind::CustomBody => {
                if m.setup_code.is_empty() {
                    bail!("CustomBody method '{}' has empty setup_code", m.name);
                }
            }
            MethodKind::CustomBodyRaw => {}
            MethodKind::SetupShape => {
                if m.occt_class.is_empty() {
                    bail!("generable method '{}' is missing occt_class", m.name);
                }
            }
        }
        // Parameter names must be unique and non-empty within a method.
        let mut param_names = std::collections::HashSet::new();
        for p in m.params {
            let name = p.name();
            if name.is_empty() {
                bail!("method '{}' has an empty parameter name", m.name);
            }
            if !param_names.insert(name) {
                bail!(
                    "method '{}' has duplicate parameter name '{}'",
                    m.name,
                    name
                );
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const fn sample(name: &'static str) -> MethodSpec {
        MethodSpec {
            name,
            kind: MethodKind::CustomBody,
            params: &[],
            return_type: ReturnType::ShapeId,
            occt_class: "",
            ctor_args: "",
            setup_code: "return 0;",
            includes: &[],
            category: "test",
        }
    }

    #[test]
    fn validate_accepts_bundled_specs() {
        assert!(
            validate(target_methods()).is_ok(),
            "bundled specs failed validation: {:?}",
            validate(target_methods()).err()
        );
    }

    #[test]
    fn validate_rejects_duplicate_method_names() {
        assert!(validate(&[sample("dup"), sample("dup")]).is_err());
    }

    #[test]
    fn validate_rejects_non_lowercase_category() {
        let mut spec = sample("x");
        spec.category = "Primitives";
        assert!(validate(&[spec]).is_err());
    }

    #[test]
    fn validate_rejects_empty_custom_body() {
        let mut spec = sample("x");
        spec.setup_code = "";
        assert!(validate(&[spec]).is_err());
    }

    #[test]
    fn validate_rejects_missing_occt_class() {
        let mut spec = sample("x");
        spec.kind = MethodKind::SetupShape;
        assert!(validate(&[spec]).is_err());
    }

    #[test]
    fn validate_rejects_duplicate_param_names() {
        let mut spec = sample("x");
        spec.params = &[FacadeParam::Double("a"), FacadeParam::ShapeId("a")];
        assert!(validate(&[spec]).is_err());
    }
}
