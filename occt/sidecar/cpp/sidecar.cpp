#include <json.hpp>
#include <Standard_Version.hxx>
#include <Standard_Failure.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <TDocStd_Document.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <TDF_Label.hxx>
#include <TDF_Tool.hxx>
#include <TDataStd_Name.hxx>
#include <TCollection_AsciiString.hxx>
#include <NCollection_Sequence.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepAlgoAPI_Section.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRepLProp_SLProps.hxx>
#include <GeomAPI_ProjectPointOnCurve.hxx>
#include <GeomAPI_ProjectPointOnSurf.hxx>
#include <Geom_Curve.hxx>
#include <IntCurvesFace_ShapeIntersector.hxx>
#include <Precision.hxx>
#include <GeomAbs_Shape.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <BRepTools.hxx>
#include <OSD_ThreadPool.hxx>
#include <BRep_Builder.hxx>
#include <TopoDS_Compound.hxx>
#include <Poly_Triangulation.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <NCollection_IndexedMap.hxx>
#include <TopTools_ShapeMapHasher.hxx>
#include <chrono>
#include <cmath>
#include <iostream>
#include <fstream>
#include <sys/resource.h>
#include <map>
#include <algorithm>
#include <cctype>
#include <set>
#include <stdexcept>
#include <string>
#include <array>
#include <cstdint>
#include <limits>
#include <vector>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <GeomAbs_CurveType.hxx>
#include <cstring>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>
#include <gp_Dir.hxx>
#include <set>
#if defined(__COSMOPOLITAN__)
#include <malloc.h>
#include <cstdlib>
#endif

using json = nlohmann::json;
using Clock = std::chrono::steady_clock;
struct ComponentOccurrence { std::string scope; TopoDS_Shape shape; };
struct Model {
  TopoDS_Shape shape;
  occ::handle<TDocStd_Document> doc;
  std::vector<ComponentOccurrence> occurrences;
};
std::map<int, Model> models;
int nextModel = 1;
#if defined(__COSMOPOLITAN__)
json allocatorSettings={{"mmapThresholdMB",nullptr},{"trimThresholdMB",nullptr}};
json configureAllocator(const json& args) {
  // Experimental, process-wide settings. They change allocation policy only.
  // Validate all values before applying any setting.
  for(const char* key:{"mmapThresholdMB","trimThresholdMB"}) {
    if(!args.contains(key))continue;
    if(!args.at(key).is_number_integer()) throw std::runtime_error("Allocator threshold must be an integer");
    int mb=args.at(key).get<int>();
    if((mb<1||mb>256) && !(std::string(key)=="trimThresholdMB" && mb==-1))
      throw std::runtime_error("Allocator threshold must be 1..256 MiB, or trim -1 to disable automatic trimming");
  }
  for(const auto& entry: {std::pair<const char*,int>{"mmapThresholdMB",M_MMAP_THRESHOLD},
                         std::pair<const char*,int>{"trimThresholdMB",M_TRIM_THRESHOLD}}) {
    if(!args.contains(entry.first)) continue;
    int mb=args.at(entry.first).get<int>();
    int bytes=mb==-1?-1:mb*1024*1024;
    if(!mallopt(entry.second,bytes)) throw std::runtime_error("mallopt rejected setting");
    allocatorSettings[entry.first]=mb;
  }
  return allocatorSettings;
}
#endif
double milliseconds(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}
Model& model(const json& args) {
  const int id = args.at("modelId").get<int>();
  auto it = models.find(id);
  if (it == models.end()) throw std::runtime_error("Unknown modelId");
  return it->second;
}
double volume(const TopoDS_Shape& shape) {
  GProp_GProps props;
  BRepGProp::VolumeProperties(shape, props);
  return props.Mass();
}
double surfaceArea(const TopoDS_Shape& shape) {
  GProp_GProps props;
  BRepGProp::SurfaceProperties(shape, props);
  return props.Mass();
}
int count(const TopoDS_Shape& shape, TopAbs_ShapeEnum type) {
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> map;
  TopExp::MapShapes(shape, type, map);
  return map.Extent();
}

TopoDS_Shape resolveEntity(const Model& m, const std::string& id) {
  const auto scopeStart = id.rfind("component:", 0) == 0 ? id.find('/') : std::string::npos;
  TopoDS_Shape ownerShape = m.shape;
  std::string localId = id;
  if (scopeStart != std::string::npos) {
    const std::string scope = id.substr(10, scopeStart - 10);
    localId = id.substr(scopeStart + 1);
    auto occurrence = std::find_if(m.occurrences.begin(), m.occurrences.end(),
      [&](const ComponentOccurrence& item) { return item.scope == scope; });
    if (occurrence == m.occurrences.end()) throw std::runtime_error("Unknown assembly component: " + scope);
    ownerShape = occurrence->shape;
  }
  const auto separator = localId.find(':');
  if (separator == std::string::npos) throw std::runtime_error("Invalid entity id: " + id);
  const std::string kind = localId.substr(0, separator);
  std::size_t consumed = 0;
  const int index = std::stoi(localId.substr(separator + 1), &consumed);
  if (consumed != localId.size() - separator - 1 || index < 0) throw std::runtime_error("Invalid entity id: " + id);
  TopAbs_ShapeEnum shapeKind;
  if (kind == "face") shapeKind = TopAbs_FACE;
  else if (kind == "edge") shapeKind = TopAbs_EDGE;
  else if (kind == "vertex") shapeKind = TopAbs_VERTEX;
  else if (kind == "body") shapeKind = TopAbs_SOLID;
  else throw std::runtime_error("Unsupported entity id kind: " + kind);
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> shapes;
  TopExp::MapShapes(ownerShape, shapeKind, shapes);
  if (index >= shapes.Extent()) throw std::runtime_error("Entity id out of range: " + id);
  return shapes.FindKey(index + 1);
}

std::string safeComponentName(const TDF_Label& label) {
  Handle(TDataStd_Name) name;
  std::string value;
  if (label.FindAttribute(TDataStd_Name::GetID(), name) && !name.IsNull()) {
    value = TCollection_AsciiString(name->Get(), '?').ToCString();
  }
  if (value.empty()) {
    TCollection_AsciiString entry;
    TDF_Tool::Entry(label, entry);
    value = entry.ToCString();
  }
  for (char& ch : value) {
    const unsigned char c = static_cast<unsigned char>(ch);
    if (!(std::isalnum(c) || ch == '_' || ch == '-' || ch == '.')) ch = '_';
  }
  return value;
}

void collectOccurrences(Model& m, const Handle(XCAFDoc_ShapeTool)& tool,
                        const TDF_Label& parent, std::map<std::string, int>& counters,
                        int depth = 0) {
  if (depth > 128) throw std::runtime_error("Assembly nesting exceeds 128 levels");
  TDF_Label referred = parent;
  tool->GetReferredShape(parent, referred);
  if (tool->IsAssembly(referred)) {
    NCollection_Sequence<TDF_Label> children;
    tool->GetComponents(referred, children, false);
    for (int i = 1; i <= children.Length(); ++i)
      collectOccurrences(m, tool, children.Value(i), counters, depth + 1);
    return;
  }
  const TopoDS_Shape shape = tool->GetShape(parent);
  if (shape.IsNull()) return;
  const std::string name = safeComponentName(parent);
  const int instance = counters[name]++;
  m.occurrences.push_back({name + "#" + std::to_string(instance), shape});
}
json inspect(const Model& m) {
  Bnd_Box box;
  BRepBndLib::AddOptimal(m.shape, box, false, false);
  double xmin, ymin, zmin, xmax, ymax, zmax;
  box.Get(xmin, ymin, zmin, xmax, ymax, zmax);
  json result = {{"solids", count(m.shape, TopAbs_SOLID)}, {"faces", count(m.shape, TopAbs_FACE)},
    {"edges", count(m.shape, TopAbs_EDGE)}, {"vertices", count(m.shape, TopAbs_VERTEX)},
    {"volume", volume(m.shape)}, {"surfaceArea", surfaceArea(m.shape)}, {"valid", BRepCheck_Analyzer(m.shape).IsValid()},
    {"bounds", {{"min", {xmin,ymin,zmin}}, {"max", {xmax,ymax,zmax}}}}};
  if (!m.doc.IsNull()) {
    auto tool = XCAFDoc_DocumentTool::ShapeTool(m.doc->Main());
    NCollection_Sequence<TDF_Label> roots;
    tool->GetFreeShapes(roots);
    int assemblies = 0, occurrences = 0;
    for (int i=1; i<=roots.Length(); ++i) {
      if (tool->IsAssembly(roots.Value(i))) ++assemblies;
      NCollection_Sequence<TDF_Label> components;
      tool->GetComponents(roots.Value(i), components, true);
      occurrences += components.Length();
    }
    NCollection_Sequence<TDF_Label> labels;
    tool->GetShapes(labels);
    int simpleDefinitions=0, assemblyDefinitions=0;
    for(int i=1;i<=labels.Length();++i) {
      if(tool->IsAssembly(labels.Value(i))) ++assemblyDefinitions;
      else if(tool->IsSimpleShape(labels.Value(i))) ++simpleDefinitions;
    }
    json componentOccurrences = json::array();
    for (const auto& occurrence : m.occurrences) componentOccurrences.push_back(occurrence.scope);
    result["xcaf"] = {{"roots",roots.Length()}, {"rootAssemblies",assemblies}, {"components",occurrences},
      {"occurrenceIds",componentOccurrences},
      {"simpleDefinitions",simpleDefinitions}, {"assemblyDefinitions",assemblyDefinitions}};
  }
  return result;
}

json measureEntityDistances(const Model& m, const json& args) {
  const auto sources = args.at("sources").get<std::vector<std::string>>();
  const auto targets = args.at("targets").get<std::vector<std::string>>();
  if (sources.empty() || targets.empty() || sources.size() * targets.size() > 100000)
    throw std::runtime_error("Distance query requires non-empty entity sets with at most 100000 pairs");
  const bool minimumOnly = args.value("summary", std::string("all")) == "minimum";
  json pairs = json::array();
  json minimum = nullptr;
  double minimumDistance = std::numeric_limits<double>::infinity();
  std::size_t pairCount = 0;
  for (const auto& sourceId : sources) {
    const TopoDS_Shape source = resolveEntity(m, sourceId);
    for (const auto& targetId : targets) {
      const TopoDS_Shape target = resolveEntity(m, targetId);
      BRepExtrema_DistShapeShape distance(source, target);
      if (!distance.IsDone()) throw std::runtime_error("Distance failed for " + sourceId + " and " + targetId);
      const double value = distance.Value();
      ++pairCount;
      json pair = {{"source_entity_id", sourceId}, {"target_entity_id", targetId}, {"distance", value}};
      if (!minimumOnly) pairs.push_back(pair);
      if (value < minimumDistance) { minimumDistance = value; minimum = pair; }
    }
  }
  return {{"pair_count", pairCount}, {"pairs", pairs}, {"minimum", minimum}};
}

gp_Dir normalizedDirection(const json& value, const char* field) {
  if (!value.is_array() || value.size() != 3) throw std::runtime_error(std::string(field) + " must be a 3-vector");
  const double x=value[0].get<double>(), y=value[1].get<double>(), z=value[2].get<double>();
  const double magnitude=std::sqrt(x*x+y*y+z*z);
  if (!std::isfinite(magnitude) || magnitude < 1e-12) throw std::runtime_error(std::string(field) + " must be finite and non-zero");
  return gp_Dir(x/magnitude,y/magnitude,z/magnitude);
}

json rayHits(const TopoDS_Shape& shape, const gp_Pnt& origin, const gp_Dir& direction, double maxDistance) {
  IntCurvesFace_ShapeIntersector intersector;
  intersector.Load(shape, Precision::Confusion());
  intersector.Perform(gp_Lin(origin,direction),0.0,maxDistance);
  NCollection_IndexedMap<TopoDS_Shape,TopTools_ShapeMapHasher> faces;
  TopExp::MapShapes(shape,TopAbs_FACE,faces);
  std::vector<std::pair<double,json>> ordered;
  for(int i=1;i<=intersector.NbPnt();++i) {
    const double distance=intersector.WParameter(i);
    if(distance <= Precision::Confusion()) continue;
    const int faceIndex=faces.FindIndex(intersector.Face(i))-1;
    if(faceIndex<0) continue;
    const gp_Pnt point=intersector.Pnt(i);
    ordered.emplace_back(distance,json{{"face_id","face:"+std::to_string(faceIndex)},
      {"distance",distance},{"point",{point.X(),point.Y(),point.Z()}}});
  }
  std::sort(ordered.begin(),ordered.end(),[](const auto& a,const auto& b){return a.first<b.first;});
  json hits=json::array();
  for(const auto& hit:ordered) hits.push_back(hit.second);
  return hits;
}

gp_Dir faceNormal(const TopoDS_Face& face, double u, double v, gp_Pnt* point = nullptr) {
  BRepAdaptor_Surface surface(face,true);
  gp_Pnt p; gp_Vec du,dv;
  surface.D1(u,v,p,du,dv);
  gp_Vec normal=du.Crossed(dv);
  if(normal.Magnitude()<=Precision::Confusion()) throw std::runtime_error("Cannot evaluate face normal");
  if(face.Orientation()==TopAbs_REVERSED) normal.Reverse();
  if(point) *point=p;
  return gp_Dir(normal);
}

std::string curveTypeName(GeomAbs_CurveType type);
json shapeBounds(const TopoDS_Shape& shape);

json sectionFacts(const TopoDS_Shape& shape, const gp_Pnt& origin, const gp_Dir& normal) {
  BRepAlgoAPI_Section section(shape,gp_Pln(origin,normal),false);
  section.Build();
  if(!section.IsDone()) throw std::runtime_error("Section operation failed");
  NCollection_IndexedMap<TopoDS_Shape,TopTools_ShapeMapHasher> edges;
  TopExp::MapShapes(section.Shape(),TopAbs_EDGE,edges);
  if(edges.Extent()>1000) throw std::runtime_error("Section contains more than 1000 edges");
  json result=json::array();
  double totalLength=0;
  for(int i=1;i<=edges.Extent();++i) {
    GProp_GProps props; BRepGProp::LinearProperties(edges(i),props);
    Bnd_Box box; BRepBndLib::AddOptimal(edges(i),box,false,false);
    double x0,y0,z0,x1,y1,z1; box.Get(x0,y0,z0,x1,y1,z1);
    totalLength+=props.Mass();
    result.push_back({{"id","section-edge:"+std::to_string(i-1)},
      {"curve_type",curveTypeName(BRepAdaptor_Curve(TopoDS::Edge(edges(i))).GetType())},
      {"length",props.Mass()},{"bbox",{{"min",{x0,y0,z0}},{"max",{x1,y1,z1}}}}});
  }
  return {{"edge_count",edges.Extent()},{"total_length",totalLength},{"edges",result}};
}

std::string continuityName(GeomAbs_Shape continuity) {
  switch(continuity) {
    case GeomAbs_C0:return "C0"; case GeomAbs_G1:return "G1";
    case GeomAbs_C1:return "C1"; case GeomAbs_G2:return "G2";
    case GeomAbs_C2:return "C2"; case GeomAbs_C3:return "C3";
    case GeomAbs_CN:return "CN"; default:return "unknown";
  }
}

json measureGeometry(const Model& m, const json& args) {
  const std::string kind=args.at("kind").get<std::string>();
  const auto ids=args.at("entityIds").get<std::vector<std::string>>();
  if(ids.empty() || ids.size()>100) throw std::runtime_error("entityIds must contain 1..100 IDs");
  json results=json::array();
  const double maxDistance=args.value("maxDistance",1.0e6);
  if(!std::isfinite(maxDistance)||maxDistance<=0||maxDistance>1.0e6)
    throw std::runtime_error("maxDistance must be finite and in (0, 1000000]");

  if(kind=="section") {
    const auto origin=args.at("planeOrigin").get<std::vector<double>>();
    if(origin.size()!=3) throw std::runtime_error("planeOrigin must be a 3-vector");
    const gp_Dir normal=normalizedDirection(args.at("planeNormal"),"planeNormal");
    int sectionEdgeCount=0;
    for(const auto& id:ids) {
      const json facts=sectionFacts(resolveEntity(m,id),gp_Pnt(origin[0],origin[1],origin[2]),normal);
      sectionEdgeCount+=facts.at("edge_count").get<int>();
      if(sectionEdgeCount>5000) throw std::runtime_error("Section result exceeds 5000 edges");
      results.push_back({{"entity_id",id},{"results",{{"section_by_plane",facts}}}});
    }
    return {{"results",results}};
  }

  if(kind=="point_analysis") {
    const auto points=args.at("points").get<std::vector<std::vector<double>>>();
    const auto checks=args.at("checks").get<std::vector<std::string>>();
    if(points.empty()||points.size()>100||checks.empty()||checks.size()>5)
      throw std::runtime_error("point_analysis requires 1..100 points and 1..5 checks");
    if(ids.size()*points.size()*checks.size()>5000)
      throw std::runtime_error("point_analysis exceeds 5000 entity-point-check combinations");
    const double tolerance=args.value("tolerance",0.01);
    if(!std::isfinite(tolerance)||tolerance<0) throw std::runtime_error("tolerance must be finite and non-negative");
    for(const auto& id:ids) {
      const TopoDS_Shape entity=resolveEntity(m,id);
      json pointResults=json::array();
      for(const auto& xyz:points) {
        if(xyz.size()!=3||!std::isfinite(xyz[0])||!std::isfinite(xyz[1])||!std::isfinite(xyz[2]))
          throw std::runtime_error("Each point must be a finite 3-vector");
        const gp_Pnt point(xyz[0],xyz[1],xyz[2]);
        json checked=json::object();
        for(const auto& check:checks) {
          if(check=="contains_body") {
            bool inside=false, on=false;
            for(TopExp_Explorer ex(m.shape,TopAbs_SOLID);ex.More();ex.Next()) {
              BRepClass3d_SolidClassifier classifier(ex.Current(),point,std::max(tolerance,Precision::Confusion()));
              if(classifier.State()==TopAbs_IN) inside=true;
              if(classifier.State()==TopAbs_ON) on=true;
            }
            checked[check]=inside?"in":on?"on":"out";
          } else if(entity.ShapeType()==TopAbs_FACE &&
                    (check=="classify_face"||check=="closest_face_point"||check=="surface_curvature")) {
            const TopoDS_Face face=TopoDS::Face(entity);
            TopLoc_Location location;
            const auto surface=BRep_Tool::Surface(face,location);
            gp_Pnt localPoint=point;
            localPoint.Transform(location.Transformation().Inverted());
            GeomAPI_ProjectPointOnSurf projection(localPoint,surface);
            if(projection.NbPoints()==0) { checked[check]={{"error","point does not project to face"}}; continue; }
            // OCCT exposes the nearest UV as two scalar outputs.
            double pu=0,pv=0; projection.LowerDistanceParameters(pu,pv);
            BRepClass_FaceClassifier faceClassifier(face,gp_Pnt2d(pu,pv),std::max(tolerance,Precision::Confusion()));
            if(check=="classify_face") {
              const char* state=faceClassifier.State()==TopAbs_IN?"in":faceClassifier.State()==TopAbs_ON?"on":"out";
              checked[check]=state;
            } else if(check=="closest_face_point") {
              if(faceClassifier.State()==TopAbs_OUT) {
                checked[check]={{"error","projection lies outside the trimmed face; boundary projection is unavailable"}};
                continue;
              }
              gp_Pnt closest=projection.NearestPoint();
              closest.Transform(location.Transformation());
              checked[check]={{"uv",{pu,pv}},{"point_on_surface",{closest.X(),closest.Y(),closest.Z()}},{"distance",projection.LowerDistance()}};
            } else {
              if(faceClassifier.State()==TopAbs_OUT) {
                checked[check]={{"error","point does not project inside the trimmed face"}};
                continue;
              }
              BRepAdaptor_Surface adaptor(face,true);
              BRepLProp_SLProps props(adaptor,pu,pv,2,std::max(tolerance,Precision::Confusion()));
              if(!props.IsCurvatureDefined()) checked[check]={{"error","curvature is undefined at projected point"}};
              else {
                const double k1=props.MinCurvature(), k2=props.MaxCurvature();
                checked[check]={{"min_curvature",k1},{"max_curvature",k2},{"gaussian_curvature",k1*k2},{"mean_curvature",(k1+k2)/2}};
              }
            }
          } else if(entity.ShapeType()==TopAbs_EDGE && check=="edge_projection") {
            TopLoc_Location location; double first=0,last=0;
            const auto curve=BRep_Tool::Curve(TopoDS::Edge(entity),location,first,last);
            if(curve.IsNull()) { checked[check]={{"error","edge has no 3D curve"}}; continue; }
            gp_Pnt localPoint=point;
            localPoint.Transform(location.Transformation().Inverted());
            GeomAPI_ProjectPointOnCurve projection(localPoint,curve,first,last);
            if(projection.NbPoints()==0) { checked[check]={{"error","edge projection failed"}}; continue; }
            const double parameter=projection.LowerDistanceParameter(); gp_Pnt closest; gp_Vec tangent;
            curve->D1(parameter,closest,tangent); closest.Transform(location.Transformation()); tangent.Transform(location.Transformation());
            if(tangent.Magnitude()>Precision::Confusion()) tangent.Normalize();
            checked[check]={{"closest_point",{closest.X(),closest.Y(),closest.Z()}},{"tangent",{tangent.X(),tangent.Y(),tangent.Z()}},{"parameter",parameter},{"distance",projection.LowerDistance()}};
          } else {
            checked[check]={{"error","check is incompatible with entity type"}};
          }
        }
        pointResults.push_back({{"point",xyz},{"checks",checked}});
      }
      results.push_back({{"entity_id",id},{"results",{{"point_analysis",pointResults}}}});
    }
    return {{"results",results}};
  }

  const bool grid=(kind=="ray_grid" || kind=="thickness");
  const bool ray=(kind=="ray");
  const bool draft=(kind=="draft");
  const bool continuity=(kind=="continuity");
  if(!grid&&!ray&&!draft&&!continuity) throw std::runtime_error("Unsupported measurement kind: "+kind);
  gp_Dir direction(0,0,1);
  if(args.contains("direction")) direction=normalizedDirection(args.at("direction"),"direction");
  else if((grid&&kind!="thickness")||ray||draft) {
    if(!args.contains("directionMode")) throw std::runtime_error("direction or directionMode is required");
  }
  const double spacing=args.value("spacingMm",2.0);
  if(grid&&(!std::isfinite(spacing)||spacing<=0)) throw std::runtime_error("spacingMm must be finite and positive");
  const int maxRaysPerFace=1500;
  int totalRays=0;
  for(const auto& id:ids) {
    const TopoDS_Shape entity=resolveEntity(m,id);
    gp_Dir entityDirection=direction;
    const std::string directionMode=args.value("directionMode",std::string());
    if(!directionMode.empty()) {
      if(entity.ShapeType()!=TopAbs_FACE) throw std::runtime_error("directionMode currently requires a face");
      const TopoDS_Face face=TopoDS::Face(entity);
      BRepAdaptor_Surface surface(face,true);
      if(directionMode=="normal" || (directionMode=="inward_normal"&&kind!="thickness")) {
        entityDirection=faceNormal(face,(surface.FirstUParameter()+surface.LastUParameter())/2,
          (surface.FirstVParameter()+surface.LastVParameter())/2);
        if(kind=="thickness" || directionMode=="inward_normal") entityDirection.Reverse();
      } else if(directionMode=="inward_normal") {
        entityDirection=faceNormal(face,(surface.FirstUParameter()+surface.LastUParameter())/2,
          (surface.FirstVParameter()+surface.LastVParameter())/2); entityDirection.Reverse();
      } else if(directionMode=="axis") {
        if(surface.GetType()==GeomAbs_Cylinder) entityDirection=surface.Cylinder().Axis().Direction();
        else if(surface.GetType()==GeomAbs_Cone) entityDirection=surface.Cone().Axis().Direction();
        else throw std::runtime_error("axis direction requires a cylindrical or conical face");
      } else throw std::runtime_error("Unsupported directionMode: "+directionMode);
    }
    if(kind=="thickness"&&!args.contains("direction")&&directionMode.empty()) {
      if(entity.ShapeType()!=TopAbs_FACE) throw std::runtime_error("thickness requires face IDs");
      BRepAdaptor_Surface surface(TopoDS::Face(entity),true);
      entityDirection=faceNormal(TopoDS::Face(entity),
        (surface.FirstUParameter()+surface.LastUParameter())/2,
        (surface.FirstVParameter()+surface.LastVParameter())/2);
      entityDirection.Reverse();
    }
    json facts;
    if(ray) {
      gp_Pnt origin(0,0,0);
      if(args.contains("origin")) {
        const auto xyz=args.at("origin").get<std::vector<double>>();
        if(xyz.size()!=3) throw std::runtime_error("origin must be a 3-vector");
        origin=gp_Pnt(xyz[0],xyz[1],xyz[2]);
      } else if(args.contains("originMode")) {
        const json bounds=shapeBounds(entity);
        const auto minimum=bounds.at("min").get<std::vector<double>>();
        const auto maximum=bounds.at("max").get<std::vector<double>>();
        const std::string mode=args.at("originMode").get<std::string>();
        if(mode=="extent_min") origin=gp_Pnt(minimum[0],minimum[1],minimum[2]);
        else if(mode=="extent_max") origin=gp_Pnt(maximum[0],maximum[1],maximum[2]);
        else if(mode=="extent_center") origin=gp_Pnt((minimum[0]+maximum[0])/2,(minimum[1]+maximum[1])/2,(minimum[2]+maximum[2])/2);
        else throw std::runtime_error("Unsupported originMode: "+mode);
      }
      facts["ray_test"]=rayHits(m.shape,origin,entityDirection,maxDistance);
    } else if(draft) {
      if(entity.ShapeType()!=TopAbs_FACE) throw std::runtime_error("draft requires face IDs");
      const TopoDS_Face face=TopoDS::Face(entity);
      BRepAdaptor_Surface surface(face,true);
      double u=(surface.FirstUParameter()+surface.LastUParameter())/2;
      double v=(surface.FirstVParameter()+surface.LastVParameter())/2;
      if(!std::isfinite(u)) u=0; if(!std::isfinite(v)) v=0;
      const gp_Dir normal=faceNormal(face,u,v);
      const double dot=std::max(-1.0,std::min(1.0,normal.Dot(entityDirection)));
      const double draftAngle=90.0-std::acos(dot)*180.0/3.14159265358979323846;
      facts["draft_angle"]={{"draft_angle_deg",draftAngle},{"normal",{normal.X(),normal.Y(),normal.Z()}},{"undercut",draftAngle<0}};
    } else if(continuity) {
      if(entity.ShapeType()!=TopAbs_EDGE) throw std::runtime_error("continuity requires edge IDs");
      std::vector<TopoDS_Face> adjacent;
      for(TopExp_Explorer ex(m.shape,TopAbs_FACE);ex.More();ex.Next()) {
        NCollection_IndexedMap<TopoDS_Shape,TopTools_ShapeMapHasher> edges;
        TopExp::MapShapes(ex.Current(),TopAbs_EDGE,edges);
        if(edges.Contains(entity)) adjacent.push_back(TopoDS::Face(ex.Current()));
      }
      if(adjacent.size()<2) facts["continuity"]={{"error","edge is not shared by two faces"}};
      else facts["continuity"]={{"continuity",continuityName(BRep_Tool::Continuity(TopoDS::Edge(entity),adjacent[0],adjacent[1]))}};
    } else {
      if(entity.ShapeType()!=TopAbs_FACE) throw std::runtime_error(kind+" requires face IDs");
      const TopoDS_Face face=TopoDS::Face(entity);
      double u0,u1,v0,v1; BRepTools::UVBounds(face,u0,u1,v0,v1);
      if(!std::isfinite(u0)||!std::isfinite(u1)||!std::isfinite(v0)||!std::isfinite(v1)||u1<=u0||v1<=v0)
        throw std::runtime_error("Cannot sample face parameter bounds");
      GProp_GProps areaProps; BRepGProp::SurfaceProperties(face,areaProps);
      const int n=std::max(1,static_cast<int>(std::ceil(std::sqrt(std::max(1.0,areaProps.Mass()))/spacing)));
      const int rayMultiplier=args.value("bidirectional",false)?2:1;
      if(n*n*rayMultiplier>maxRaysPerFace || totalRays+n*n*rayMultiplier>4000) throw std::runtime_error("Ray grid exceeds 4000-ray bounded limit; increase spacingMm");
      std::vector<double> distances; json samples=json::array(); int castCount=0;
      for(int iu=0;iu<n;++iu) for(int iv=0;iv<n;++iv) {
        const double u=u0+(iu+0.5)*(u1-u0)/n, v=v0+(iv+0.5)*(v1-v0)/n;
        gp_Pnt point; gp_Dir normal;
        try { normal=faceNormal(face,u,v,&point); } catch(...) { continue; }
        BRepClass_FaceClassifier classifier(face,gp_Pnt2d(u,v),Precision::Confusion());
        if(classifier.State()==TopAbs_OUT) continue;
        std::vector<gp_Dir> castDirections{entityDirection};
        if(args.value("bidirectional",false)) { gp_Dir opposite=entityDirection; opposite.Reverse(); castDirections.push_back(opposite); }
        for(const gp_Dir& castDirection:castDirections) {
          ++castCount; ++totalRays;
          const json hits=rayHits(m.shape,point.Translated(gp_Vec(castDirection)*Precision::Confusion()*10),castDirection,maxDistance);
          if(hits.empty()) continue;
          const double d=hits[0]["distance"].get<double>(); distances.push_back(d);
          if(args.value("detail",std::string("stats"))!="stats") samples.push_back({{"origin",{point.X(),point.Y(),point.Z()}},{"hit",hits[0]}});
        }
      }
      std::sort(distances.begin(),distances.end());
      double sum=0; for(double d:distances) sum+=d;
      json stats={{"total_rays",castCount},{"hit_count",distances.size()},{"miss_count",castCount-static_cast<int>(distances.size())}};
      if(!distances.empty()) stats.update({{"min_distance",distances.front()},{"max_distance",distances.back()},{"avg_distance",sum/distances.size()},{"median_distance",distances[distances.size()/2]}});
      facts[kind=="thickness"?"thickness":"ray_test_grid"]={{"statistics",stats},{"hits",samples}};
    }
    results.push_back({{"entity_id",id},{"results",facts}});
  }
  return {{"results",results}};
}

std::string surfaceTypeName(GeomAbs_SurfaceType type) {
  switch(type) {
    case GeomAbs_Plane:return "plane"; case GeomAbs_Cylinder:return "cylinder";
    case GeomAbs_Cone:return "cone"; case GeomAbs_Sphere:return "sphere";
    case GeomAbs_Torus:return "torus"; case GeomAbs_BSplineSurface:return "bspline";
    default:return "other";
  }
}
std::string curveTypeName(GeomAbs_CurveType type) {
  switch(type) {
    case GeomAbs_Line:return "line"; case GeomAbs_Circle:return "circle";
    case GeomAbs_Ellipse:return "ellipse"; case GeomAbs_BSplineCurve:return "bspline";
    default:return "other";
  }
}
json shapeBounds(const TopoDS_Shape& shape) {
  Bnd_Box box; BRepBndLib::AddOptimal(shape,box,false,false);
  double x0,y0,z0,x1,y1,z1; box.Get(x0,y0,z0,x1,y1,z1);
  return {{"min",{x0,y0,z0}},{"max",{x1,y1,z1}},{"center",{(x0+x1)/2,(y0+y1)/2,(z0+z1)/2}}};
}
json findEntities(const Model& m, const json& args) {
  const std::string kind=args.at("entityType").get<std::string>();
  const TopAbs_ShapeEnum shapeKind=kind=="face"?TopAbs_FACE:kind=="edge"?TopAbs_EDGE:kind=="vertex"?TopAbs_VERTEX:kind=="body"?TopAbs_SOLID:TopAbs_SHAPE;
  if(shapeKind==TopAbs_SHAPE) throw std::runtime_error("entityType must be face, edge, vertex, or body");
  const json filters=args.value("filters",json::object());
  if(!filters.is_object()) throw std::runtime_error("filters must be an object");
  const int limit=args.value("limit",100), offset=args.value("offset",0);
  if(limit<1||limit>1000||offset<0) throw std::runtime_error("Pagination must use limit 1..1000 and non-negative offset");
  std::set<std::string> requestedIds;
  const bool hasEntityIds=args.contains("entityIds");
  if(hasEntityIds) {
    if(!args.at("entityIds").is_array()||args.at("entityIds").size()>1000) throw std::runtime_error("entityIds must be an array of at most 1000 IDs");
    for(const auto& id:args.at("entityIds")) requestedIds.insert(id.get<std::string>());
  }
  std::vector<ComponentOccurrence> sources;
  if (args.contains("componentName")) {
    const std::string name = args.at("componentName").get<std::string>();
    if (name.empty() || name.size() > 256) throw std::runtime_error("Invalid componentName");
    for (const auto& occurrence : m.occurrences)
      if (occurrence.scope == name || occurrence.scope.rfind(name + "#", 0) == 0)
        sources.push_back(occurrence);
    if (sources.empty()) throw std::runtime_error("Unknown assembly component: " + name);
  } else {
    sources.push_back({"", m.shape});
  }
  json entities=json::array();
  int total=0;
  for (const auto& source : sources) {
    NCollection_IndexedMap<TopoDS_Shape,TopTools_ShapeMapHasher> shapes;
    TopExp::MapShapes(source.shape,shapeKind,shapes);
  for(int i=1;i<=shapes.Extent();++i) {
    const TopoDS_Shape& shape=shapes.FindKey(i); const json bounds=shapeBounds(shape);
    const std::string id=(source.scope.empty()?"":"component:"+source.scope+"/")+kind+":"+std::to_string(i-1);
    json entity={{"id",id},
      {"bbox",{{"min",bounds.at("min")},{"max",bounds.at("max")}}},
      {"bbox_center",bounds.at("center")}};
    if(kind=="face") {
      const TopoDS_Face face=TopoDS::Face(shape); BRepAdaptor_Surface surface(face,true);
      GProp_GProps props; BRepGProp::SurfaceProperties(face,props);
      entity["surface_type"]=surfaceTypeName(surface.GetType()); entity["area"]=props.Mass();
      if(surface.GetType()==GeomAbs_Plane) {
        gp_Dir normal=surface.Plane().Axis().Direction();
        if(face.Orientation()==TopAbs_REVERSED) normal.Reverse();
        entity["normal"]={normal.X(),normal.Y(),normal.Z()};
      }
      if(surface.GetType()==GeomAbs_Cylinder) entity["radius"]=surface.Cylinder().Radius();
      else if(surface.GetType()==GeomAbs_Sphere) entity["radius"]=surface.Sphere().Radius();
      else if(surface.GetType()==GeomAbs_Torus) entity["radius"]=surface.Torus().MinorRadius();
      if(entity.contains("radius")) entity["diameter"]=2.0*entity["radius"].get<double>();
    } else if(kind=="edge") {
      const TopoDS_Edge edge=TopoDS::Edge(shape); BRepAdaptor_Curve curve(edge);
      GProp_GProps props; BRepGProp::LinearProperties(edge,props);
      entity["curve_type"]=curveTypeName(curve.GetType()); entity["length"]=props.Mass();
      if(curve.GetType()==GeomAbs_Circle) entity["radius"]=curve.Circle().Radius();
      const gp_Pnt a=curve.Value(curve.FirstParameter()), b=curve.Value(curve.LastParameter());
      entity["start_point"]={a.X(),a.Y(),a.Z()}; entity["end_point"]={b.X(),b.Y(),b.Z()};
    } else if(kind=="body") {
      GProp_GProps props; BRepGProp::VolumeProperties(shape,props);
      entity["volume"]=props.Mass();
    } else {
      const gp_Pnt point=BRep_Tool::Pnt(TopoDS::Vertex(shape));
      entity["point"]={point.X(),point.Y(),point.Z()};
    }
    if(hasEntityIds&&!requestedIds.count(entity.at("id").get<std::string>())) continue;
    bool matched=true;
    const char* typeKey=kind=="face"?"surface_type":"curve_type";
    if(filters.contains(typeKey)&&entity.at(typeKey)!=filters.at(typeKey)) matched=false;
    const char* rangeKey=kind=="face"?"area":"length";
    const char* minKey=kind=="face"?"min_area":"min_length";
    const char* maxKey=kind=="face"?"max_area":"max_length";
    if(filters.contains(minKey)&&entity.at(rangeKey).get<double>()<filters.at(minKey).get<double>()) matched=false;
    if(filters.contains(maxKey)&&entity.at(rangeKey).get<double>()>filters.at(maxKey).get<double>()) matched=false;
    if(filters.contains("min_radius")&&(!entity.contains("radius")||entity.at("radius").get<double>()<filters.at("min_radius").get<double>())) matched=false;
    if(filters.contains("max_radius")&&(!entity.contains("radius")||entity.at("radius").get<double>()>filters.at("max_radius").get<double>())) matched=false;
    if(!matched) continue;
    if(total>=offset&&static_cast<int>(entities.size())<limit) entities.push_back(std::move(entity));
    ++total;
  }
  }
  return {{"entities",entities},{"total_matched",total}};
}
json dispatch(const std::string& op, const json& args) {
  if (op == "hello") return {{"occt", OCC_VERSION_COMPLETE}, {"protocol",2}, {"models",models.size()},
#if defined(__COSMOPOLITAN__)
    {"runtime","cosmopolitan"}
#else
    {"runtime","native"}
#endif
  };
  if (op == "ping") return args;
#if defined(__COSMOPOLITAN__)
  if (op == "configureAllocator") return configureAllocator(args);
  if (op == "allocatorSettings") return allocatorSettings;
  if (op == "releaseMemory") return {{"released",malloc_trim(0)!=0}};
#endif
  if (op == "memory") {
    struct rusage usage {};
    if (getrusage(RUSAGE_SELF, &usage)!=0) throw std::runtime_error("getrusage failed");
    json current=nullptr;
    std::ifstream status("/proc/self/status");
    std::string line;
    while(std::getline(status,line)) {
      if(line.rfind("VmRSS:",0)==0) { current=std::stoll(line.substr(6)); break; }
    }
    return {{"maxRssNativeUnits",usage.ru_maxrss},{"currentRssKiB",current},
      {"userSeconds",usage.ru_utime.tv_sec+usage.ru_utime.tv_usec/1e6},
      {"systemSeconds",usage.ru_stime.tv_sec+usage.ru_stime.tv_usec/1e6},
      {"minorFaults",usage.ru_minflt},{"majorFaults",usage.ru_majflt},
      {"voluntaryContextSwitches",usage.ru_nvcsw},{"involuntaryContextSwitches",usage.ru_nivcsw}};
  }
  if (op == "box") {
    auto dimensions = args.at("dimensions").get<std::vector<double>>();
    if (dimensions.size()!=3) throw std::runtime_error("dimensions needs 3 entries");
    for (double x:dimensions) if (!std::isfinite(x) || x<=0) throw std::runtime_error("dimensions must be finite and positive");
    Model m{BRepPrimAPI_MakeBox(dimensions[0],dimensions[1],dimensions[2]).Shape(), {}};
    const int id=nextModel++; models.emplace(id,std::move(m)); return {{"modelId",id}};
  }
  if (op == "open") {
    Model m;
    m.doc = new TDocStd_Document(TCollection_ExtendedString("BinXCAF"));
    STEPCAFControl_Reader reader;
    reader.SetGDTMode(true);
    auto readStart=Clock::now();
    if (reader.ReadFile(args.at("path").get<std::string>().c_str()) != IFSelect_RetDone)
      throw std::runtime_error("STEP read failed");
    const double readMs=milliseconds(readStart);
    auto transferStart=Clock::now();
    if (!reader.Transfer(m.doc)) throw std::runtime_error("STEP XCAF transfer failed");
    const double transferMs=milliseconds(transferStart);
    auto tool=XCAFDoc_DocumentTool::ShapeTool(m.doc->Main());
    NCollection_Sequence<TDF_Label> roots; tool->GetFreeShapes(roots);
    if (roots.Length()==0) throw std::runtime_error("No free root shape");
    if (roots.Length()==1) m.shape=tool->GetShape(roots.Value(1));
    else {
      TopoDS_Compound compound; BRep_Builder builder; builder.MakeCompound(compound);
      for(int i=1;i<=roots.Length();++i) builder.Add(compound,tool->GetShape(roots.Value(i)));
      m.shape=compound;
    }
    if (m.shape.IsNull()) throw std::runtime_error("No root shape");
    {
      auto shapeTool = XCAFDoc_DocumentTool::ShapeTool(m.doc->Main());
      NCollection_Sequence<TDF_Label> occurrenceRoots;
      shapeTool->GetFreeShapes(occurrenceRoots);
      std::map<std::string, int> counters;
      for (int i = 1; i <= occurrenceRoots.Length(); ++i)
        collectOccurrences(m, shapeTool, occurrenceRoots.Value(i), counters);
      std::map<std::string, int> nameCounts;
      for (const auto& occurrence : m.occurrences)
        ++nameCounts[occurrence.scope.substr(0, occurrence.scope.rfind('#'))];
      for (auto& occurrence : m.occurrences) {
        const auto separator = occurrence.scope.rfind('#');
        const std::string name = occurrence.scope.substr(0, separator);
        if (nameCounts[name] == 1) occurrence.scope = name;
      }
    }
    int id=nextModel++; models.emplace(id,std::move(m));
    return {{"modelId",id},{"readMs",readMs},{"transferMs",transferMs}};
  }
  if (op == "inspect") return inspect(model(args));
  if (op == "findEntities") return findEntities(model(args), args);
  if (op == "measureEntityDistances") return measureEntityDistances(model(args), args);
  if (op == "measureGeometry") return measureGeometry(model(args), args);
  if (op == "volume") return {{"volume",volume(model(args).shape)}};
  if (op == "close") {
    model(args); models.erase(args.at("modelId").get<int>()); return {{"closed",true}};
  }
  if (op == "mesh") {
    const double deflection=args.value("deflection",0.1);
    if (!std::isfinite(deflection)||deflection<=0) throw std::runtime_error("Invalid deflection");
    auto& m=model(args);
    if(args.contains("threads")) {
      if(!args.at("threads").is_number_integer()) throw std::runtime_error("threads must be an integer");
      const int threads=args.at("threads").get<int>();
      if(threads<1||threads>128) throw std::runtime_error("threads must be 1..128");
      auto pool=OSD_ThreadPool::DefaultPool();
      if(pool->NbThreads()!=threads)pool->Init(threads);
      pool->SetNbDefaultThreadsToLaunch(threads);
    }
    BRepMesh_IncrementalMesh mesher(m.shape,deflection,false,0.5,args.value("parallel",false));
    if (!mesher.IsDone()) throw std::runtime_error("Meshing failed");
    int triangles=0;
    for(TopExp_Explorer ex(m.shape,TopAbs_FACE);ex.More();ex.Next()) {
      TopLoc_Location location;
      auto triangulation=BRep_Tool::Triangulation(TopoDS::Face(ex.Current()),location);
      if(!triangulation.IsNull()) triangles+=triangulation->NbTriangles();
    }
    return {{"triangles",triangles}};
  }
  if (op == "cleanMesh") {
    BRepTools::Clean(model(args).shape);
    return {{"cleaned",true}};
  }
  if (op == "distance") {
    auto& a=model(args);
    auto it=models.find(args.at("otherModelId").get<int>());
    if(it==models.end()) throw std::runtime_error("Unknown otherModelId");
    BRepExtrema_DistShapeShape distance(a.shape,it->second.shape);
    if(!distance.IsDone()) throw std::runtime_error("Distance failed");
    return {{"distance",distance.Value()}};
  }
  if (op == "benchVolume") {
    const auto& m=model(args);
    int iterations=args.value("iterations",1000);
    if(iterations<1||iterations>1000000) throw std::runtime_error("Invalid iterations");
    double total=0;
    auto start=Clock::now();
    for(int i=0;i<iterations;++i) total+=volume(m.shape);
    return {{"iterations",iterations},{"elapsedMs",milliseconds(start)},{"checksum",total}};
  }
  throw std::runtime_error("Unknown operation: "+op);
}
constexpr std::size_t kFrameHeaderBytes = 16;
constexpr std::uint32_t kMaxJsonBytes = 16 * 1024 * 1024;
constexpr std::uint32_t kMaxBinaryBytes = 64 * 1024 * 1024;
constexpr std::uint8_t kJsonFrame = 1;
constexpr std::uint8_t kBinaryFrame = 2;

void appendLe32(std::string& output, std::uint32_t value) {
  std::array<char, 4> bytes{};
  for (unsigned i = 0; i < bytes.size(); ++i) bytes[i] = static_cast<char>((value >> (i * 8)) & 0xff);
  output.append(bytes.data(), bytes.size());
}
void appendFloat32(std::string& output, float value) {
  std::uint32_t bits = 0;
  std::memcpy(&bits, &value, sizeof(bits));
  appendLe32(output, bits);
}
std::string meshChunk(const json& args) {
  Model& m = model(args);
  const auto faceIndices = args.at("faceIndices").get<std::vector<int>>();
  if (faceIndices.empty() || faceIndices.size() > 96)
    throw std::runtime_error("faceIndices must contain 1..96 faces");
  const double deflection = args.value("deflection", 0.2);
  const double angular = args.value("angularDeflection", 0.35);
  if (!std::isfinite(deflection) || deflection <= 0 || !std::isfinite(angular) || angular <= 0 || angular > 3.141592653589793)
    throw std::runtime_error("Invalid mesh deflection");

  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> faceMap;
  TopExp::MapShapes(m.shape, TopAbs_FACE, faceMap);
  std::set<int> uniqueIndices;
  TopoDS_Compound selected;
  BRep_Builder builder;
  builder.MakeCompound(selected);
  for (const int index : faceIndices) {
    if (index < 0 || index >= faceMap.Extent() || !uniqueIndices.insert(index).second)
      throw std::runtime_error("faceIndices contains an invalid or repeated face");
    builder.Add(selected, faceMap(index + 1));
  }
  BRepMesh_IncrementalMesh mesher(selected, deflection, false, angular, args.value("parallel", false));
  if (!mesher.IsDone()) throw std::runtime_error("Mesh chunk generation failed");

  std::vector<float> positions;
  std::vector<float> normals;
  std::vector<std::uint32_t> indices;
  std::vector<std::uint32_t> triangleToFace;
  std::uint64_t estimatedBytes = 32;
  for (std::size_t faceSlot = 0; faceSlot < faceIndices.size(); ++faceSlot) {
    const TopoDS_Face face = TopoDS::Face(faceMap(faceIndices[faceSlot] + 1));
    TopLoc_Location location;
    const auto triangulation = BRep_Tool::Triangulation(face, location);
    if (triangulation.IsNull()) throw std::runtime_error("Selected face has no triangulation");
    const std::uint64_t newBytes =
      static_cast<std::uint64_t>(triangulation->NbNodes()) * 3 * sizeof(float) * 2 +
      static_cast<std::uint64_t>(triangulation->NbTriangles()) * 4 * sizeof(std::uint32_t);
    estimatedBytes += newBytes;
    if (estimatedBytes > kMaxBinaryBytes) throw std::runtime_error("Mesh chunk exceeds 64 MiB limit");
    if (positions.size() / 3 + triangulation->NbNodes() > std::numeric_limits<std::uint32_t>::max())
      throw std::runtime_error("Mesh chunk has too many vertices");

    std::vector<gp_Pnt> nodes;
    nodes.reserve(triangulation->NbNodes());
    for (int node = 1; node <= triangulation->NbNodes(); ++node) {
      gp_Pnt point = triangulation->Node(node);
      point.Transform(location.Transformation());
      nodes.push_back(point);
    }
    std::vector<gp_Vec> normalSums(triangulation->NbNodes(), gp_Vec(0, 0, 0));
    std::vector<std::array<std::uint32_t, 3>> faceTriangles;
    faceTriangles.reserve(triangulation->NbTriangles());
    const bool reversed = face.Orientation() == TopAbs_REVERSED;
    for (int triangleIndex = 1; triangleIndex <= triangulation->NbTriangles(); ++triangleIndex) {
      int n1, n2, n3;
      triangulation->Triangle(triangleIndex).Get(n1, n2, n3);
      if (reversed) std::swap(n2, n3);
      if (n1 < 1 || n2 < 1 || n3 < 1 || n1 > static_cast<int>(nodes.size()) ||
          n2 > static_cast<int>(nodes.size()) || n3 > static_cast<int>(nodes.size()))
        throw std::runtime_error("Mesh chunk contains an invalid node index");
      const gp_Vec normal = gp_Vec(nodes[n1 - 1], nodes[n2 - 1]).Crossed(gp_Vec(nodes[n1 - 1], nodes[n3 - 1]));
      normalSums[n1 - 1] += normal;
      normalSums[n2 - 1] += normal;
      normalSums[n3 - 1] += normal;
      faceTriangles.push_back({static_cast<std::uint32_t>(n1 - 1), static_cast<std::uint32_t>(n2 - 1), static_cast<std::uint32_t>(n3 - 1)});
    }

    const std::uint32_t vertexBase = static_cast<std::uint32_t>(positions.size() / 3);
    for (std::size_t node = 0; node < nodes.size(); ++node) {
      const gp_Pnt& point = nodes[node];
      positions.insert(positions.end(), {static_cast<float>(point.X()), static_cast<float>(point.Y()), static_cast<float>(point.Z())});
      gp_Vec normal = normalSums[node];
      if (normal.Magnitude() > 1e-12) normal.Normalize();
      else normal = gp_Vec(0, 0, 1);
      normals.insert(normals.end(), {static_cast<float>(normal.X()), static_cast<float>(normal.Y()), static_cast<float>(normal.Z())});
    }
    for (const auto& triangle : faceTriangles) {
      indices.insert(indices.end(), {vertexBase + triangle[0], vertexBase + triangle[1], vertexBase + triangle[2]});
      triangleToFace.push_back(static_cast<std::uint32_t>(faceSlot));
    }
  }
  if (triangleToFace.empty()) throw std::runtime_error("Mesh chunk contains no triangles");

  const auto vertexCount = static_cast<std::uint32_t>(positions.size() / 3);
  const auto indexCount = static_cast<std::uint32_t>(indices.size());
  const auto triangleCount = static_cast<std::uint32_t>(triangleToFace.size());
  std::string output;
  output.reserve(static_cast<std::size_t>(estimatedBytes));
  output.append("CVM1", 4);
  appendLe32(output, 1);
  appendLe32(output, vertexCount);
  appendLe32(output, indexCount);
  appendLe32(output, triangleCount);
  appendLe32(output, static_cast<std::uint32_t>(positions.size() * sizeof(float)));
  appendLe32(output, static_cast<std::uint32_t>(normals.size() * sizeof(float)));
  appendLe32(output, static_cast<std::uint32_t>(indices.size() * sizeof(std::uint32_t)));
  for (float value : positions) appendFloat32(output, value);
  for (float value : normals) appendFloat32(output, value);
  for (std::uint32_t value : indices) appendLe32(output, value);
  for (std::uint32_t value : triangleToFace) appendLe32(output, value);
  return output;
}

std::uint32_t readLe32(const char* bytes) {
  const auto* value = reinterpret_cast<const unsigned char*>(bytes);
  return static_cast<std::uint32_t>(value[0]) |
    (static_cast<std::uint32_t>(value[1]) << 8) |
    (static_cast<std::uint32_t>(value[2]) << 16) |
    (static_cast<std::uint32_t>(value[3]) << 24);
}
void writeLe32(char* bytes, std::uint32_t value) {
  for (unsigned i = 0; i < 4; ++i) bytes[i] = static_cast<char>((value >> (i * 8)) & 0xff);
}
bool readExact(std::istream& input, char* bytes, std::size_t length) {
  input.read(bytes, static_cast<std::streamsize>(length));
  const auto read = static_cast<std::size_t>(input.gcount());
  if (read == 0 && input.eof()) return false;
  if (read != length) throw std::runtime_error("Truncated sidecar frame");
  return true;
}
void writeFrame(std::ostream& output, std::uint8_t kind, std::uint32_t requestId, const std::string& payload) {
  const std::uint32_t limit = kind == kJsonFrame ? kMaxJsonBytes : kMaxBinaryBytes;
  if (kind != kJsonFrame && kind != kBinaryFrame) throw std::runtime_error("Unsupported sidecar response frame");
  if (payload.size() > limit) throw std::runtime_error("Sidecar response exceeds frame limit");
  std::array<char, kFrameHeaderBytes> header{};
  header[0] = 'O'; header[1] = 'C'; header[2] = 'S'; header[3] = '1';
  header[4] = static_cast<char>(kind);
  writeLe32(header.data() + 8, requestId);
  writeLe32(header.data() + 12, static_cast<std::uint32_t>(payload.size()));
  output.write(header.data(), static_cast<std::streamsize>(header.size()));
  output.write(payload.data(), static_cast<std::streamsize>(payload.size()));
  output.flush();
}

int main() {
  // OCCT diagnostics belong on stderr; stdout is a binary framed protocol.
  std::ostream protocol(std::cout.rdbuf());
  std::cout.rdbuf(std::cerr.rdbuf());
  std::array<char, kFrameHeaderBytes> header{};
  try {
    while (readExact(std::cin, header.data(), header.size())) {
      if (header[0] != 'O' || header[1] != 'C' || header[2] != 'S' || header[3] != '1')
        throw std::runtime_error("Invalid sidecar frame magic");
      if (header[4] != static_cast<char>(kJsonFrame) || header[5] || header[6] || header[7])
        throw std::runtime_error("Unsupported sidecar request frame");
      const std::uint32_t requestId = readLe32(header.data() + 8);
      const std::uint32_t length = readLe32(header.data() + 12);
      if (requestId == 0) throw std::runtime_error("Sidecar request id must be positive");
      if (length > kMaxJsonBytes) throw std::runtime_error("Sidecar request exceeds frame limit");
      std::string body(length, '\0');
      if (length && !readExact(std::cin, body.data(), length)) throw std::runtime_error("Truncated sidecar request");

      try {
        const json request = json::parse(body);
        const auto start = Clock::now();
        const std::string operation = request.at("op").get<std::string>();
        const json args = request.value("args", json::object());
        if (operation == "meshChunk") {
          writeFrame(protocol, kBinaryFrame, requestId, meshChunk(args));
        } else {
          const json result = dispatch(operation, args);
          writeFrame(protocol, kJsonFrame, requestId, json({{"ok", true}, {"result", result}, {"kernelMs", milliseconds(start)}}).dump());
        }
      } catch (const Standard_Failure& error) {
        writeFrame(protocol, kJsonFrame, requestId, json({{"ok", false}, {"error", error.what() ? error.what() : "OCCT failure"}}).dump());
      } catch (const std::exception& error) {
        writeFrame(protocol, kJsonFrame, requestId, json({{"ok", false}, {"error", error.what()}}).dump());
      }
    }
  } catch (const std::exception& error) {
    std::cerr << "Sidecar protocol failure: " << error.what() << '\n';
    return 2;
  }
  return 0;
}
