#include <BRepPrimAPI_MakeBox.hxx>
#include <STEPCAFControl_Writer.hxx>
#include <STEPControl_StepModelType.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>
#include <TopLoc_Location.hxx>
#include <XCAFApp_Application.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <gp_Trsf.hxx>
#include <gp_Vec.hxx>
#include <iostream>

int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "usage: generate-repeated-assembly-fixture <output.step>\n";
        return 2;
    }

    Handle(TDocStd_Document) document;
    XCAFApp_Application::GetApplication()->NewDocument("MDTV-XCAF", document);
    const Handle(XCAFDoc_ShapeTool) shapes = XCAFDoc_DocumentTool::ShapeTool(document->Main());

    const TDF_Label definition = shapes->AddShape(BRepPrimAPI_MakeBox(10, 10, 10).Shape(), false);
    TDataStd_Name::Set(definition, "RepeatedPartDefinition");
    const TDF_Label assembly = shapes->NewShape();
    TDataStd_Name::Set(assembly, "TwoInstanceAssembly");

    gp_Trsf firstTransform;
    firstTransform.SetTranslation(gp_Vec(0, 0, 0));
    const TDF_Label first =
        shapes->AddComponent(assembly, definition, TopLoc_Location(firstTransform));
    TDataStd_Name::Set(first, "RepeatedPart");

    gp_Trsf secondTransform;
    secondTransform.SetTranslation(gp_Vec(20, 0, 0));
    const TDF_Label second =
        shapes->AddComponent(assembly, definition, TopLoc_Location(secondTransform));
    TDataStd_Name::Set(second, "RepeatedPart");
    shapes->UpdateAssemblies();
    if (!shapes->IsAssembly(assembly) || XCAFDoc_ShapeTool::NbComponents(assembly) != 2) {
        std::cerr << "failed to create two assembly occurrences\n";
        XCAFApp_Application::GetApplication()->Close(document);
        return 1;
    }

    STEPCAFControl_Writer writer;
    if (!writer.Transfer(document, STEPControl_AsIs) || writer.Write(argv[1]) != IFSelect_RetDone) {
        std::cerr << "failed to write assembly STEP fixture\n";
        XCAFApp_Application::GetApplication()->Close(document);
        return 1;
    }
    XCAFApp_Application::GetApplication()->Close(document);
    return 0;
}
