//! C++ code emitter for the facade code generator.
//!
//! Emits `kernel.cpp` (method implementations) and `bindings.cpp` (Embind
//! reference) from a slice of [`MethodSpec`] descriptors.

use std::collections::BTreeSet;
use std::fmt::Write as _;

use super::types::{FacadeParam, MethodKind, MethodSpec, ReturnType};

/// Format a [`FacadeParam`] as a C++ formal parameter declaration.
fn param_to_cpp(param: &FacadeParam) -> String {
    match param {
        FacadeParam::ShapeId(name) => format!("uint32_t {name}"),
        FacadeParam::Double(name) => format!("double {name}"),
        FacadeParam::VectorShapeIds(name) => format!("std::vector<uint32_t> {name}"),
        FacadeParam::Bool(name) => format!("bool {name}"),
        FacadeParam::Int(name) => format!("int {name}"),
        FacadeParam::String(name) => format!("const std::string& {name}"),
        FacadeParam::VectorDouble(name) => format!("std::vector<double> {name}"),
        FacadeParam::VectorInt(name) => format!("std::vector<int> {name}"),
    }
}

/// Build the C++ parameter list string for a method signature.
fn param_list(params: &[FacadeParam]) -> String {
    params
        .iter()
        .map(param_to_cpp)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Emit a `SetupShape` method body.
///
/// Emits `setup_code` verbatim, then constructs the OCCT class with `ctor_args`,
/// and stores the result. No `Build()`/`IsDone()` check.
fn emit_setup_shape(buf: &mut String, spec: &MethodSpec) {
    let name = spec.name;
    let cls = spec.occt_class;
    let args = spec.ctor_args;

    let _ = writeln!(
        buf,
        "uint32_t OcctKernel::{name}({params}) {{",
        params = param_list(spec.params)
    );
    let _ = writeln!(buf, "    try {{");

    // Emit setup code lines with proper indentation.
    if !spec.setup_code.is_empty() {
        for line in spec.setup_code.lines() {
            let _ = writeln!(buf, "        {line}");
        }
    }

    let _ = writeln!(buf, "        {cls} maker({args});");
    let _ = writeln!(buf, "        return store(maker.Shape());");
    let _ = writeln!(buf, "    }} catch (const Standard_Failure& e) {{");
    let _ = writeln!(
        buf,
        "        throw std::runtime_error(std::string(\"{name}: \") + e.what());"
    );
    let _ = writeln!(buf, "    }}");
    let _ = writeln!(buf, "}}");
}

/// Map a `ReturnType` to its C++ type spelling.
const fn cpp_return_type(ret: ReturnType) -> &'static str {
    match ret {
        ReturnType::ShapeId | ReturnType::Uint32 => "uint32_t",
        ReturnType::Bool => "bool",
        ReturnType::Void => "void",
        ReturnType::VectorUint32 => "std::vector<uint32_t>",
        ReturnType::VectorDouble => "std::vector<double>",
        ReturnType::Double => "double",
        ReturnType::String => "std::string",
        ReturnType::Int => "int",
        ReturnType::VectorInt => "std::vector<int>",
        ReturnType::BBoxData => "BBoxData",
        ReturnType::NurbsCurveData => "NurbsCurveData",
        ReturnType::MeshData => "MeshData",
        ReturnType::MeshBatchData => "MeshBatchData",
        ReturnType::EdgeData => "EdgeData",
    }
}

/// Emit a `CustomBody` method — the `setup_code` field contains the complete body.
fn emit_custom_body(buf: &mut String, spec: &MethodSpec) {
    let name = spec.name;
    let ret_type = cpp_return_type(spec.return_type);

    let _ = writeln!(
        buf,
        "{ret_type} OcctKernel::{name}({params}) {{",
        params = param_list(spec.params)
    );
    let _ = writeln!(buf, "    try {{");

    for line in spec.setup_code.lines() {
        let _ = writeln!(buf, "        {line}");
    }

    let _ = writeln!(buf, "    }} catch (const Standard_Failure& e) {{");
    let _ = writeln!(
        buf,
        "        throw std::runtime_error(std::string(\"{name}: \") + e.what());"
    );
    let _ = writeln!(buf, "    }}");
    let _ = writeln!(buf, "}}");
}

/// Emit a `CustomBodyRaw` method — `setup_code` is the full body, emitted with
/// no `Standard_Failure` try/catch wrapper (for methods that never enter OCCT).
fn emit_custom_body_raw(buf: &mut String, spec: &MethodSpec) {
    let ret_type = cpp_return_type(spec.return_type);

    let _ = writeln!(
        buf,
        "{ret_type} OcctKernel::{name}({params}) {{",
        name = spec.name,
        params = param_list(spec.params)
    );

    for line in spec.setup_code.lines() {
        let _ = writeln!(buf, "    {line}");
    }

    let _ = writeln!(buf, "}}");
}

/// Derive the OCCT include header for a class name (e.g. `BRepPrimAPI_MakeBox`
/// becomes `<BRepPrimAPI_MakeBox.hxx>`).
fn class_to_include(cls: &str) -> String {
    format!("{cls}.hxx")
}

/// Collect all unique `#include` paths needed by the given methods.
fn collect_includes(methods: &[&MethodSpec]) -> BTreeSet<String> {
    let mut includes = BTreeSet::new();

    // Always-needed headers.
    includes.insert("Standard_Failure.hxx".to_owned());

    for spec in methods {
        if matches!(spec.kind, MethodKind::Skip) {
            continue;
        }
        if !spec.occt_class.is_empty() {
            includes.insert(class_to_include(spec.occt_class));
        }
        for inc in spec.includes {
            includes.insert((*inc).to_owned());
        }
    }
    includes
}

/// Group methods by category, preserving insertion order within each group.
fn group_by_category<'a>(methods: &[&'a MethodSpec]) -> Vec<(&'a str, Vec<&'a MethodSpec>)> {
    let mut groups: Vec<(&str, Vec<&MethodSpec>)> = Vec::new();
    for spec in methods {
        if matches!(spec.kind, MethodKind::Skip) {
            continue;
        }
        if let Some(group) = groups.iter_mut().find(|(cat, _)| *cat == spec.category) {
            group.1.push(spec);
        } else {
            groups.push((spec.category, vec![spec]));
        }
    }
    groups
}

/// Emit static helper functions that generated methods depend on.
fn emit_helper_functions(_buf: &mut String, _methods: &[&MethodSpec]) {
    // No helpers currently needed after stripping evolution/projection/XCAF.
}

/// Generate the contents of `facade/generated/kernel.cpp`.
#[allow(clippy::too_many_lines)]
pub fn emit_kernel(methods: &[&MethodSpec]) -> String {
    let mut buf = String::with_capacity(4096);

    // Header.
    let _ = writeln!(
        buf,
        "// AUTO-GENERATED by cargo xtask codegen -- DO NOT EDIT"
    );
    let _ = writeln!(buf);
    let _ = writeln!(buf, "#include \"occt_kernel.h\"");
    let _ = writeln!(buf);

    // OCCT includes.
    let includes = collect_includes(methods);
    for inc in &includes {
        let _ = writeln!(buf, "#include <{inc}>");
    }
    let _ = writeln!(buf);

    // Standard C++ includes.
    let _ = writeln!(buf, "#include <algorithm>");
    let _ = writeln!(buf, "#include <cmath>");
    let _ = writeln!(buf, "#include <cstdio>");
    let _ = writeln!(buf, "#include <cstdlib>");
    let _ = writeln!(buf, "#include <fstream>");
    let _ = writeln!(buf, "#include <iomanip>");
    let _ = writeln!(buf, "#include <set>");
    let _ = writeln!(buf, "#include <sstream>");
    let _ = writeln!(buf, "#include <stdexcept>");
    let _ = writeln!(buf, "#include <string>");
    let _ = writeln!(buf, "#include <vector>");
    let _ = writeln!(buf);

    // Emit helper functions needed by generated methods.
    emit_helper_functions(&mut buf, methods);

    // Methods grouped by category.
    let groups = group_by_category(methods);
    for (i, (category, specs)) in groups.iter().enumerate() {
        let _ = writeln!(buf, "// === {category} ===");
        let _ = writeln!(buf);

        for spec in specs {
            match spec.kind {
                MethodKind::SetupShape => emit_setup_shape(&mut buf, spec),
                MethodKind::CustomBody => emit_custom_body(&mut buf, spec),
                MethodKind::CustomBodyRaw => emit_custom_body_raw(&mut buf, spec),
                MethodKind::Skip => {}
            }
            let _ = writeln!(buf);
        }

        // Blank line between category groups, but not after the last one.
        if i + 1 < groups.len() {
            // Already have a trailing newline from the last method.
        }
    }

    // Trim trailing whitespace.
    buf.trim_end().to_owned() + "\n"
}

/// Generate the contents of `facade/generated/bindings.cpp` as a reference
/// file.
///
/// This is **not** compiled or linked. It shows the `.function()` lines that
/// belong in the hand-written `facade/src/bindings.cpp` inside the
/// `class_<OcctKernel>("OcctKernel")` block.
/// Close an Embind chain: replace the trailing `)\n` with `);\n`.
fn close_embind_chain(buf: &mut String) {
    if buf.ends_with(")\n") {
        buf.truncate(buf.len() - 2);
        buf.push_str(");\n");
    }
}

/// Generate the contents of `facade/generated/bindings.cpp`.
///
/// This is a real, compilable file that registers all Embind bindings.
#[allow(clippy::too_many_lines)]
pub fn emit_bindings(methods: &[&MethodSpec]) -> String {
    let mut buf = String::with_capacity(4096);

    let _ = writeln!(
        buf,
        "// AUTO-GENERATED by cargo xtask codegen -- DO NOT EDIT"
    );
    let _ = writeln!(buf);
    let _ = writeln!(buf, "#include \"occt_kernel.h\"");
    let _ = writeln!(buf, "#include <cstdint>");
    let _ = writeln!(buf, "#include <emscripten/bind.h>");
    let _ = writeln!(buf);
    let _ = writeln!(buf, "using namespace emscripten;");
    let _ = writeln!(buf);
    let _ = writeln!(buf, "EMSCRIPTEN_BINDINGS(occt_wasm) {{");

    // Vector types. Each is given a dataPtr() returning the address of its
    // contiguous storage, so JS can read large results through one typed-array
    // view over the heap instead of N per-element get() boundary crossings.
    let _ = writeln!(buf, "    // Vector types");
    for (cpp_ty, js_name) in [
        ("uint32_t", "VectorUint32"),
        ("double", "VectorDouble"),
        ("int", "VectorInt"),
    ] {
        let _ = writeln!(buf, "    register_vector<{cpp_ty}>(\"{js_name}\")");
        let _ = writeln!(
            buf,
            "        .function(\"dataPtr\", +[](const std::vector<{cpp_ty}>& v) {{"
        );
        // unsigned int (not int): a heap address above 2 GB would become a
        // negative JS number, and slice(negativeStart) silently wraps instead
        // of throwing. Bit-identical on wasm32, but unambiguous.
        let _ = writeln!(
            buf,
            "            return static_cast<unsigned int>(reinterpret_cast<uintptr_t>(v.data()));"
        );
        let _ = writeln!(buf, "        }});");
    }
    let _ = writeln!(buf);

    // Struct registrations (static boilerplate)
    let _ = writeln!(buf, "    // MeshData");
    let _ = writeln!(buf, "    class_<MeshData>(\"MeshData\")");
    let _ = writeln!(
        buf,
        "        .function(\"getPositionsPtr\", &MeshData::getPositionsPtr)"
    );
    let _ = writeln!(
        buf,
        "        .function(\"getNormalsPtr\", &MeshData::getNormalsPtr)"
    );
    let _ = writeln!(
        buf,
        "        .function(\"getUvsPtr\", &MeshData::getUvsPtr)"
    );
    let _ = writeln!(
        buf,
        "        .function(\"getIndicesPtr\", &MeshData::getIndicesPtr)"
    );
    let _ = writeln!(
        buf,
        "        .property(\"positionCount\", &MeshData::positionCount)"
    );
    let _ = writeln!(buf, "        .property(\"uvCount\", &MeshData::uvCount)");
    let _ = writeln!(
        buf,
        "        .property(\"normalCount\", &MeshData::normalCount)"
    );
    let _ = writeln!(
        buf,
        "        .property(\"indexCount\", &MeshData::indexCount)"
    );
    let _ = writeln!(
        buf,
        "        .function(\"getFaceGroupsPtr\", &MeshData::getFaceGroupsPtr)"
    );
    let _ = writeln!(
        buf,
        "        .property(\"faceGroupCount\", &MeshData::faceGroupCount);"
    );
    let _ = writeln!(buf);

    let _ = writeln!(buf, "    // MeshBatchData");
    let _ = writeln!(buf, "    class_<MeshBatchData>(\"MeshBatchData\")");
    for field in &[
        "getPositionsPtr",
        "getNormalsPtr",
        "getIndicesPtr",
        "getShapeOffsetsPtr",
    ] {
        let _ = writeln!(
            buf,
            "        .function(\"{field}\", &MeshBatchData::{field})"
        );
    }
    for prop in &["positionCount", "normalCount", "indexCount", "shapeCount"] {
        let _ = writeln!(buf, "        .property(\"{prop}\", &MeshBatchData::{prop})");
    }
    // Last one gets semicolon
    close_embind_chain(&mut buf);
    let _ = writeln!(buf);

    let _ = writeln!(buf, "    // BBoxData");
    let _ = writeln!(buf, "    value_object<BBoxData>(\"BBoxData\")");
    for f in &["xmin", "ymin", "zmin", "xmax", "ymax", "zmax"] {
        let _ = writeln!(buf, "        .field(\"{f}\", &BBoxData::{f})");
    }
    close_embind_chain(&mut buf);
    let _ = writeln!(buf);

    let _ = writeln!(buf, "    // EdgeData");
    let _ = writeln!(buf, "    class_<EdgeData>(\"EdgeData\")");
    let _ = writeln!(
        buf,
        "        .function(\"getPointsPtr\", &EdgeData::getPointsPtr)"
    );
    let _ = writeln!(
        buf,
        "        .function(\"getEdgeGroupsPtr\", &EdgeData::getEdgeGroupsPtr)"
    );
    let _ = writeln!(
        buf,
        "        .property(\"pointCount\", &EdgeData::pointCount)"
    );
    let _ = writeln!(
        buf,
        "        .property(\"edgeGroupCount\", &EdgeData::edgeGroupCount);"
    );
    let _ = writeln!(buf);

    let _ = writeln!(buf, "    // NurbsCurveData");
    let _ = writeln!(buf, "    class_<NurbsCurveData>(\"NurbsCurveData\")");
    for prop in &[
        "degree",
        "rational",
        "periodic",
        "knots",
        "multiplicities",
        "poles",
        "weights",
    ] {
        let _ = writeln!(
            buf,
            "        .property(\"{prop}\", &NurbsCurveData::{prop})"
        );
    }
    close_embind_chain(&mut buf);
    let _ = writeln!(buf);

    // OcctKernel method bindings — auto-generated from specs
    let _ = writeln!(buf, "    // OcctKernel");
    let _ = writeln!(buf, "    class_<OcctKernel>(\"OcctKernel\")");
    let _ = writeln!(buf, "        .constructor<>()");

    let groups = group_by_category(methods);
    for (category, specs) in &groups {
        let _ = writeln!(buf);
        let _ = writeln!(buf, "        // {category}");
        for spec in specs {
            let name = spec.name;
            let _ = writeln!(buf, "        .function(\"{name}\", &OcctKernel::{name})");
        }
    }

    close_embind_chain(&mut buf);

    let _ = writeln!(buf, "}}");

    buf.trim_end().to_owned() + "\n"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{FacadeParam, MethodKind, MethodSpec, ReturnType};

    #[test]
    fn skip_methods_are_excluded() {
        static KEPT: MethodSpec = MethodSpec {
            name: "doSomething",
            kind: MethodKind::CustomBody,
            params: &[],
            return_type: ReturnType::Void,
            occt_class: "",
            ctor_args: "",
            setup_code: "return;",
            includes: &[],
            category: "test",
        };
        static SKIPPED: MethodSpec = MethodSpec {
            name: "makeEllipsoid",
            kind: MethodKind::Skip,
            params: &[],
            return_type: ReturnType::ShapeId,
            occt_class: "",
            ctor_args: "",
            setup_code: "",
            includes: &[],
            category: "test",
        };
        let methods: Vec<&MethodSpec> = vec![&SKIPPED, &KEPT];
        let kernel = emit_kernel(&methods);
        let bindings = emit_bindings(&methods);

        assert!(!kernel.contains("makeEllipsoid"));
        assert!(!bindings.contains("makeEllipsoid"));
        assert!(kernel.contains("doSomething"));
        assert!(bindings.contains("doSomething"));
    }

    #[test]
    fn custom_body_bool_return() {
        static IS_VALID: MethodSpec = MethodSpec {
            name: "isValid",
            kind: MethodKind::CustomBody,
            params: &[FacadeParam::ShapeId("id")],
            return_type: ReturnType::Bool,
            occt_class: "",
            ctor_args: "",
            setup_code: "BRepCheck_Analyzer checker(get(id));\nreturn checker.IsValid();",
            includes: &["BRepCheck_Analyzer.hxx"],
            category: "healing",
        };
        let output = emit_kernel(&[&IS_VALID]);
        assert!(output.contains("bool OcctKernel::isValid(uint32_t id)"));
        assert!(output.contains("BRepCheck_Analyzer checker(get(id))"));
    }

    #[test]
    fn custom_body_void_return() {
        static BUILD_CURVES: MethodSpec = MethodSpec {
            name: "buildCurves3d",
            kind: MethodKind::CustomBody,
            params: &[FacadeParam::ShapeId("wireId")],
            return_type: ReturnType::Void,
            occt_class: "",
            ctor_args: "",
            setup_code: "BRepLib::BuildCurves3d(get(wireId));",
            includes: &["BRepLib.hxx"],
            category: "healing",
        };
        let output = emit_kernel(&[&BUILD_CURVES]);
        assert!(output.contains("void OcctKernel::buildCurves3d(uint32_t wireId)"));
        assert!(output.contains("BRepLib::BuildCurves3d(get(wireId))"));
    }
}
