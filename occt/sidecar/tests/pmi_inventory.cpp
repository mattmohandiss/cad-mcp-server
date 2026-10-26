// Diagnostic: print the PMI / GD&T inventory that OCCT reads from a STEP file.
//
// This mirrors what the server's `open` path already does, because
// STEPCAFControl_Reader::SetGDTMode(true) transfers dimensions, geometric
// tolerances and datums into the XCAF document. Until a tool reads them back the
// work is invisible, so this prints what is actually there.
//
// Three things the output is used to decide (see docs/records/ in the workspace):
//
//   * Coverage. Run it across the NIST MBE PMI test cases (FTC/CTC, AP242) and
//     compare against their published annotation inventory. Dimensions and datums
//     are expected everywhere; geometric tolerance *values* are not, because the
//     reader resolves the magnitude through only two encodings and returns
//     silently (leaving 0.0) for anything else.
//   * Absence. A geometry-only file must print zero of everything, so "no PMI"
//     is distinguishable from "PMI ignored".
//   * Binding. `refDimensions` shows whether an annotation can be traced back to
//     a shape, which is what a measurement and a tolerance need in order to refer
//     to the same feature.
//
// Types are the modern ones on purpose. OCCT 8.0.1 does not install the
// deprecated alias headers (`TDF_LabelSequence.hxx`,
// `XCAFDimTolObjects_*Sequence.hxx`, `*DataMapOfToleranceDatum.hxx`): the XML
// collectors dropped them and the real signatures are spelled
// `NCollection_Sequence<occ::handle<...>>`, as in XCAFDimTolObjects_Tool.hxx.
//
// Not production code and not wired into any tool: build it on demand with
//   cmake --build <build> --target pmi-inventory
//
// NIST test-case files may be used without restriction, but this program does not
// embed any: pass a path.

#include <cstdio>

#include <IFSelect_ReturnStatus.hxx>
#include <NCollection_DataMap.hxx>
#include <NCollection_Sequence.hxx>
#include <Standard_Handle.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <TCollection_HAsciiString.hxx>
#include <TDocStd_Document.hxx>
#include <TDF_Label.hxx>
#include <TopoDS_Shape.hxx>
#include <XCAFDimTolObjects_DatumObject.hxx>
#include <XCAFDimTolObjects_DimensionObject.hxx>
#include <XCAFDimTolObjects_GeomToleranceObject.hxx>
#include <XCAFDimTolObjects_Tool.hxx>
#include <XCAFDoc_DimTolTool.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>

namespace {

using DimensionSequence = NCollection_Sequence<occ::handle<XCAFDimTolObjects_DimensionObject>>;
using ToleranceSequence =
    NCollection_Sequence<occ::handle<XCAFDimTolObjects_GeomToleranceObject>>;
using DatumSequence = NCollection_Sequence<occ::handle<XCAFDimTolObjects_DatumObject>>;
using ToleranceDatumMap = NCollection_DataMap<occ::handle<XCAFDimTolObjects_GeomToleranceObject>,
                                              occ::handle<XCAFDimTolObjects_DatumObject>>;

const char* text(const occ::handle<TCollection_HAsciiString>& value) {
  return value.IsNull() ? "" : value->ToCString();
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::printf("usage: pmi-inventory <file.stp>\n");
    return 2;
  }

  occ::handle<TDocStd_Document> document = new TDocStd_Document("BinXCAF");
  STEPCAFControl_Reader reader;
  reader.SetGDTMode(true);
  reader.SetNameMode(true);

  const IFSelect_ReturnStatus status = reader.ReadFile(argv[1]);
  std::printf("file: %s\nread status: %d\n", argv[1], static_cast<int>(status));
  if (status != IFSelect_RetDone) {
    return 1;
  }
  // Mirror the server's open path: it reads in the file's own unit, so
  // measurements come out in that unit and the caller is told which.
  if (argc > 2) {
    const double unit = std::stod(argv[2]);
    reader.ChangeReader().SetSystemLengthUnit(unit);
    std::printf("system length unit: %.4f\n", unit);
  }
  reader.Transfer(document);

  occ::handle<XCAFDoc_DimTolTool> dimTol =
      XCAFDoc_DocumentTool::DimTolTool(document->Main());
  NCollection_Sequence<TDF_Label> dimensionLabels;
  NCollection_Sequence<TDF_Label> toleranceLabels;
  NCollection_Sequence<TDF_Label> datumLabels;
  dimTol->GetDimensionLabels(dimensionLabels);
  dimTol->GetGeomToleranceLabels(toleranceLabels);
  dimTol->GetDatumLabels(datumLabels);
  std::printf("labels: dimensions=%d tolerances=%d datums=%d\n",
              dimensionLabels.Length(), toleranceLabels.Length(),
              datumLabels.Length());

  XCAFDimTolObjects_Tool tool(document);
  DimensionSequence dimensions;
  ToleranceSequence tolerances;
  DatumSequence datums;
  ToleranceDatumMap datumMap;
  tool.GetDimensions(dimensions);
  tool.GetGeomTolerances(tolerances, datums, datumMap);
  std::printf("objects: dimensions=%d tolerances=%d datums=%d (%d datum links)\n",
              dimensions.Length(), tolerances.Length(), datums.Length(),
              datumMap.Extent());

  for (int index = 1; index <= dimensions.Length(); ++index) {
    const occ::handle<XCAFDimTolObjects_DimensionObject>& dimension =
        dimensions.Value(index);
    std::printf("DIM type=%d nominal=%.4f", static_cast<int>(dimension->GetType()),
                dimension->GetValue());
    if (dimension->IsDimWithPlusMinusTolerance()) {
      std::printf(" +%.4f/-%.4f", dimension->GetUpperTolValue(),
                  dimension->GetLowerTolValue());
    }
    if (dimension->IsDimWithRange()) {
      std::printf(" range=[%.4f..%.4f]", dimension->GetLowerBound(),
                  dimension->GetUpperBound());
    }
    if (dimension->HasQualifier()) {
      std::printf(" qualifier=%d", static_cast<int>(dimension->GetQualifier()));
    }
    std::printf(" name='%s'\n", text(dimension->GetSemanticName()));
  }

  for (int index = 1; index <= tolerances.Length(); ++index) {
    const occ::handle<XCAFDimTolObjects_GeomToleranceObject>& tolerance =
        tolerances.Value(index);
    std::printf("TOL type=%d value=%.4f valueType=%d materialReq=%d",
                static_cast<int>(tolerance->GetType()), tolerance->GetValue(),
                static_cast<int>(tolerance->GetTypeOfValue()),
                static_cast<int>(tolerance->GetMaterialRequirementModifier()));
    if (tolerance->GetValueOfZoneModifier() != 0.0) {
      std::printf(" zoneModifier=%.4f", tolerance->GetValueOfZoneModifier());
    }
    std::printf("\n");
  }

  for (int index = 1; index <= datums.Length(); ++index) {
    const occ::handle<XCAFDimTolObjects_DatumObject>& datum = datums.Value(index);
    std::printf("DATUM name='%s' position=%d isTarget=%d\n", text(datum->GetName()),
                datum->GetPosition(), static_cast<int>(datum->IsDatumTarget()));
  }

  occ::handle<XCAFDoc_ShapeTool> shapes =
      XCAFDoc_DocumentTool::ShapeTool(document->Main());
  NCollection_Sequence<TDF_Label> freeShapes;
  shapes->GetFreeShapes(freeShapes);
  std::printf("free shapes: %d\n", freeShapes.Length());
  for (int index = 1; index <= freeShapes.Length(); ++index) {
    const TopoDS_Shape shape = shapes->GetShape(freeShapes.Value(index));
    DimensionSequence shapeDimensions;
    if (tool.GetRefDimensions(shape, shapeDimensions)) {
      std::printf("shape[%d] refDimensions=%d\n", index, shapeDimensions.Length());
    }
  }
  return 0;
}
