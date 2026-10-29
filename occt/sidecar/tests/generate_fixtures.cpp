// Generates every synthetic STEP fixture, so no STEP file needs to be committed and no fixture
// can become an orphan: the shape a test asserts about is the shape this file builds.
//
//   generate-fixtures <fixtures-directory>
//
// The fixtures and the property each test relies on:
//
//   curved-sector.step    one solid, five faces: the cylindrical arc, two planar radial faces
//                         through the origin, and two caps. A 90-degree sector of a 20 mm
//                         diameter, symmetric about +X and 6 mm thick, so the bounding box is
//                         10 wide and 20*sin(45) tall with the arc's own extreme point interior
//                         rather than a vertex.
//   open-shell.step       no solid material: a 40 x 30 x 20 box with its top face removed, so
//                         volume is unavailable while every face is still addressable.
//   repeated-instances.step  an XCAF assembly: one 10 mm cube instanced twice, the second
//                         translated +20 along X, components named `RepeatedPart`, so the reader
//                         sees two occurrences of the same part definition.
//   repeated-instances-inch.step, -metre.step  the same assembly with the declared length unit
//                         changed and the coordinates left alone, which is what those tests are
//                         about: the same numbers, a different unit.
//
// The unit variants are text edits, not conversions. OCCT writes one geometry in millimetres,
// and the inch and metre files rewrite the two length-unit entities — the root assembly's and
// the component's own. Writing them with `write.step.unit` instead would scale the coordinates
// and destroy the property the fixtures exist to test.
//
// The foreign files are deliberately not generated: `nist_ctc_01_*` carry semantic, graphical,
// and tessellated AP242 from a real exporter, and a file this generator wrote would test the
// reader against our own writer. See `README.md` beside them.

#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRep_Builder.hxx>
#include <GC_MakeArcOfCircle.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <STEPCAFControl_Writer.hxx>
#include <STEPControl_StepModelType.hxx>
#include <STEPControl_Writer.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Shell.hxx>
#include <XCAFApp_Application.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <regex>
#include <sstream>
#include <string>

namespace {

constexpr double PI = 3.14159265358979323846;

/** The sector's radius: a 20 mm diameter part. */
constexpr double SECTOR_RADIUS = 10.0;
/** The sector's sweep: a quarter disc, symmetric about +X. */
constexpr double SECTOR_SWEEP = PI / 2.0;
/** The sector's thickness. Nothing asserts it; it keeps the part a solid. */
constexpr double SECTOR_THICKNESS = 6.0;

constexpr double SHELL_X = 40.0;
constexpr double SHELL_Y = 30.0;
constexpr double SHELL_Z = 20.0;

constexpr double CUBE_EDGE = 10.0;
constexpr double SECOND_INSTANCE_OFFSET = 20.0;

const char* MM_UNIT = "SI_UNIT(.MILLI.,.METRE.)";

/**
 * Write one shape as STEP, in the writer's default unit (millimetres).
 * @param shape - the shape to write, solid or shell.
 * @param path - the file to write.
 * @returns True when the file was written.
 */
bool writeShape(const TopoDS_Shape& shape, const std::filesystem::path& path) {
    STEPControl_Writer writer;
    if (writer.Transfer(shape, STEPControl_AsIs) != IFSelect_RetDone) {
        std::cerr << "failed to transfer " << path << "\n";
        return false;
    }
    if (writer.Write(path.c_str()) != IFSelect_RetDone) {
        std::cerr << "failed to write " << path << "\n";
        return false;
    }
    return true;
}

/**
 * A quarter disc, extruded: one solid with five faces, one of them curved.
 * @returns the sector solid.
 */
TopoDS_Shape curvedSector() {
    const double half = SECTOR_SWEEP / 2.0;
    const gp_Pnt first(SECTOR_RADIUS * std::cos(-half), SECTOR_RADIUS * std::sin(-half), 0.0);
    const gp_Pnt middle(SECTOR_RADIUS, 0.0, 0.0);
    const gp_Pnt last(SECTOR_RADIUS * std::cos(half), SECTOR_RADIUS * std::sin(half), 0.0);
    const gp_Pnt apex(0.0, 0.0, 0.0);

    const Handle(Geom_TrimmedCurve) arc = GC_MakeArcOfCircle(first, middle, last).Value();
    BRepBuilderAPI_MakeWire wire;
    wire.Add(BRepBuilderAPI_MakeEdge(arc).Edge());
    wire.Add(BRepBuilderAPI_MakeEdge(last, apex).Edge());
    wire.Add(BRepBuilderAPI_MakeEdge(apex, first).Edge());
    const TopoDS_Face section = BRepBuilderAPI_MakeFace(wire.Wire()).Face();
    return BRepPrimAPI_MakePrism(section, gp_Vec(0.0, 0.0, SECTOR_THICKNESS)).Shape();
}

/**
 * A box without its top face: no solid, so volume is unavailable, and five faces remain
 * addressable.
 * @returns the open shell.
 */
TopoDS_Shape openShell() {
    const TopoDS_Shape box = BRepPrimAPI_MakeBox(SHELL_X, SHELL_Y, SHELL_Z).Shape();
    BRep_Builder builder;
    TopoDS_Shell shell;
    builder.MakeShell(shell);
    for (TopExp_Explorer explorer(box, TopAbs_FACE); explorer.More(); explorer.Next()) {
        const TopoDS_Face face = TopoDS::Face(explorer.Current());
        const BRepAdaptor_Surface surface(face);
        const bool isTop =
            surface.GetType() == GeomAbs_Plane && std::abs(surface.Plane().Location().Z() - SHELL_Z) < 1e-9;
        if (isTop) continue;
        builder.Add(shell, face);
    }
    return shell;
}

/**
 * Write the two-instance assembly, whose occurrences are what the identity tests address.
 * @param path - the file to write.
 * @returns True when the file was written.
 */
bool writeAssembly(const std::filesystem::path& path) {
    Handle(TDocStd_Document) document;
    XCAFApp_Application::GetApplication()->NewDocument("MDTV-XCAF", document);
    const Handle(XCAFDoc_ShapeTool) shapes = XCAFDoc_DocumentTool::ShapeTool(document->Main());

    const TDF_Label definition =
        shapes->AddShape(BRepPrimAPI_MakeBox(CUBE_EDGE, CUBE_EDGE, CUBE_EDGE).Shape(), false);
    TDataStd_Name::Set(definition, "RepeatedPartDefinition");
    const TDF_Label assembly = shapes->NewShape();
    TDataStd_Name::Set(assembly, "TwoInstanceAssembly");

    for (int index = 0; index < 2; ++index) {
        gp_Trsf transform;
        transform.SetTranslation(gp_Vec(index * SECOND_INSTANCE_OFFSET, 0.0, 0.0));
        const TDF_Label component =
            shapes->AddComponent(assembly, definition, TopLoc_Location(transform));
        TDataStd_Name::Set(component, "RepeatedPart");
    }
    shapes->UpdateAssemblies();
    if (!shapes->IsAssembly(assembly) || XCAFDoc_ShapeTool::NbComponents(assembly) != 2) {
        std::cerr << "failed to create two assembly occurrences\n";
        XCAFApp_Application::GetApplication()->Close(document);
        return false;
    }

    STEPCAFControl_Writer writer;
    const bool written =
        writer.Transfer(document, STEPControl_AsIs) && writer.Write(path.c_str()) == IFSelect_RetDone;
    XCAFApp_Application::GetApplication()->Close(document);
    if (!written) std::cerr << "failed to write assembly STEP fixture " << path << "\n";
    return written;
}

/** Replace every occurrence of `from` with `to`. */
void replaceAll(std::string& text, const std::string& from, const std::string& to) {
    for (std::size_t at = text.find(from); at != std::string::npos; at = text.find(from, at + to.size())) {
        text.replace(at, from.size(), to);
    }
}

/** The highest `#id` in a STEP file, so a rewrite can append fresh entities. */
long highestEntityId(const std::string& text) {
    long highest = 0;
    for (std::size_t at = text.find('#'); at != std::string::npos; at = text.find('#', at + 1)) {
        long value = 0;
        std::size_t digit = at + 1;
        while (digit < text.size() && std::isdigit(static_cast<unsigned char>(text[digit])) != 0) {
            value = value * 10 + (text[digit] - '0');
            ++digit;
        }
        highest = std::max(highest, value);
    }
    return highest;
}

/**
 * Declare a different length unit without touching the coordinates.
 *
 * The rewrite is textual because OCCT's own `write.step.unit` converts the coordinates, which
 * would destroy the property these fixtures exist for: the same numbers under another unit.
 * Entities are appended to the end of the data section, numbered above the file's own highest
 * id, so the rewrite stays valid however large the assembly grows.
 * @param text - the STEP file's text.
 * @param unit - `INCH`, or `METRE`.
 * @returns the text with both length-unit entities rewritten.
 */
std::string declareLengthUnit(std::string text, const std::string& unit) {
    const std::string lengthUnit = std::string("LENGTH_UNIT() NAMED_UNIT(*) ") + MM_UNIT;
    if (unit != "INCH") {
        replaceAll(text, lengthUnit, "LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT($,.METRE.)");
        return text;
    }

    const long highest = highestEntityId(text);
    const long conversion = highest + 1;
    const long exponents = highest + 2;
    const long millimetres = highest + 3;
    replaceAll(text, lengthUnit,
               "CONVERSION_BASED_UNIT('INCH',#" + std::to_string(conversion) +
                   ") LENGTH_UNIT() NAMED_UNIT(#" + std::to_string(exponents) + ")");
    const std::string appended =
        "#" + std::to_string(conversion) + " = MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#" +
        std::to_string(millimetres) + ");\n" + "#" + std::to_string(exponents) +
        " = DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);\n" + "#" + std::to_string(millimetres) +
        " = ( LENGTH_UNIT() NAMED_UNIT(*) " + MM_UNIT + " );\n";

    // The data section ends at the last ENDSEC before the file terminator; appending after it
    // would put entities outside the section, which no reader would see.
    const std::string dataEnd = "\nENDSEC;\nEND-ISO-10303-21;";
    const std::size_t at = text.find(dataEnd);
    if (at == std::string::npos) {
        std::cerr << "could not find the data section's end to append the inch unit\n";
        return text;
    }
    return text.insert(at + 1, appended);
}

/**
 * Rewrite one written file's declared unit and save it under another name.
 * @param source - the millimetre file just written.
 * @param target - the file to write.
 * @param unit - `INCH` or `METRE`.
 * @returns True when the file was written.
 */
bool writeUnitVariant(const std::filesystem::path& source, const std::filesystem::path& target,
                      const std::string& unit) {
    std::ifstream input(source);
    std::ostringstream buffer;
    buffer << input.rdbuf();
    std::ofstream output(target);
    output << declareLengthUnit(buffer.str(), unit);
    return output.good();
}

}  // namespace

int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "usage: generate-fixtures <fixtures-directory>\n";
        return 2;
    }
    const std::filesystem::path directory = argv[1];
    std::filesystem::create_directories(directory);

    if (!writeShape(curvedSector(), directory / "curved-sector.step")) return 1;
    if (!writeShape(openShell(), directory / "open-shell.step")) return 1;

    const std::filesystem::path assembly = directory / "repeated-instances.step";
    if (!writeAssembly(assembly)) return 1;
    if (!writeUnitVariant(assembly, directory / "repeated-instances-inch.step", "INCH")) return 1;
    if (!writeUnitVariant(assembly, directory / "repeated-instances-metre.step", "METRE")) return 1;

    std::cout << "wrote curved-sector, open-shell, repeated-instances{, -inch, -metre} to "
              << directory << "\n";
    return 0;
}
