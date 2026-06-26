#include "occt_kernel.h"

#include <BRepGProp.hxx>
#include <BRepLib_ToolTriangulatedShape.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <GProp_GProps.hxx>
#include <NCollection_Vec3.hxx>
#include <OSD.hxx>
#include <Poly_Triangulation.hxx>
#include <TopAbs_Orientation.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopTools_ShapeMapHasher.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Iterator.hxx>
#include <cstdlib>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <gp_Pnt2d.hxx>
#include <stdexcept>
#include <vector>

#include <BRepAdaptor_Surface.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <GeomAPI_IntCS.hxx>
#include <Geom_Line.hxx>

#include <BRepGraph.hxx>
#include <BRepGraph_Builder.hxx>
#include <BRepGraph_Tool.hxx>
#include <BRepGraph_TopoView.hxx>
#include <BRepGraph_WireExplorer.hxx>
#include <TopAbs_ShapeEnum.hxx>

// --- MeshData implementation ---

MeshData::~MeshData() {
    std::free(positions);
    std::free(normals);
    std::free(uvs);
    std::free(indices);
    std::free(faceGroups);
}

MeshData::MeshData(const MeshData& other)
    : positions(other.positions), normals(other.normals), uvs(other.uvs), indices(other.indices),
      faceGroups(other.faceGroups), positionCount(other.positionCount),
      normalCount(other.normalCount), uvCount(other.uvCount), indexCount(other.indexCount),
      faceGroupCount(other.faceGroupCount) {
    auto& mut = const_cast<MeshData&>(other);
    mut.positions = nullptr;
    mut.normals = nullptr;
    mut.uvs = nullptr;
    mut.indices = nullptr;
    mut.faceGroups = nullptr;
}

int MeshData::getPositionsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(positions));
}

int MeshData::getNormalsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(normals));
}

int MeshData::getUvsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(uvs));
}

int MeshData::getIndicesPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(indices));
}

int MeshData::getFaceGroupsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(faceGroups));
}

// --- OcctKernel implementation ---

OcctKernel::OcctKernel() {
    OSD::SetSignal(false);
}

OcctKernel::~OcctKernel() {
    releaseAll();
}

uint32_t OcctKernel::store(const TopoDS_Shape& shape) {
    uint32_t id = nextId_++;
    arena_.emplace(id, shape);
    return id;
}

const TopoDS_Shape& OcctKernel::get(uint32_t id) const {
    auto it = arena_.find(id);
    if (it == arena_.end()) {
        throw std::runtime_error("Invalid shape ID: " + std::to_string(id));
    }
    return it->second;
}

MeshData OcctKernel::buildMeshData(const TopoDS_Shape& shape, double linearDeflection,
                                   double angularDeflection, bool relative) {
    BRepMesh_IncrementalMesh mesher(shape, linearDeflection, relative, angularDeflection, false);
    if (!mesher.IsDone()) {
        throw std::runtime_error("tessellate: meshing failed");
    }

    struct FaceEntry {
        Handle(Poly_Triangulation) tri;
        TopLoc_Location loc;
        TopoDS_Face face;
    };
    std::vector<FaceEntry> faces;

    int totalNodes = 0;
    int totalTris = 0;
    for (TopExp_Explorer ex(shape, TopAbs_FACE); ex.More(); ex.Next()) {
        const TopoDS_Face& face = TopoDS::Face(ex.Current());
        TopLoc_Location loc;
        auto tri = BRep_Tool::Triangulation(face, loc);
        if (tri.IsNull())
            continue;
        totalNodes += tri->NbNodes();
        totalTris += tri->NbTriangles();
        faces.push_back({tri, loc, face});
    }
    int totalFaces = static_cast<int>(faces.size());

    MeshData result;
    result.positionCount = totalNodes * 3;
    result.normalCount = totalNodes * 3;
    result.uvCount = totalNodes * 2;
    result.indexCount = totalTris * 3;

    result.positions = static_cast<float*>(std::malloc(result.positionCount * sizeof(float)));
    result.normals = static_cast<float*>(std::malloc(result.normalCount * sizeof(float)));
    result.uvs = static_cast<float*>(std::malloc(result.uvCount * sizeof(float)));
    result.indices = static_cast<uint32_t*>(std::malloc(result.indexCount * sizeof(uint32_t)));
    result.faceGroupCount = totalFaces * 3;
    result.faceGroups = static_cast<int32_t*>(std::malloc(result.faceGroupCount * sizeof(int32_t)));

    if ((!result.positions && result.positionCount > 0) ||
        (!result.normals && result.normalCount > 0) || (!result.uvs && result.uvCount > 0) ||
        (!result.indices && result.indexCount > 0) ||
        (!result.faceGroups && result.faceGroupCount > 0)) {
        throw std::runtime_error("tessellate: memory allocation failed");
    }

    int vertexOffset = 0;
    int triOffset = 0;
    int faceGroupIdx = 0;

    for (const auto& entry : faces) {
        const TopoDS_Face& face = entry.face;
        const TopLoc_Location& loc = entry.loc;
        Handle(Poly_Triangulation) tri = entry.tri;

        const auto& trsf = loc.Transformation();
        bool identityLoc = loc.IsIdentity();
        int nbNodes = tri->NbNodes();
        int nbTri = tri->NbTriangles();

        if (identityLoc) {
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

        bool hasUV = tri->HasUVNodes();
        for (int i = 1; i <= nbNodes; i++) {
            int uvBase = (vertexOffset + i - 1) * 2;
            if (hasUV) {
                const gp_Pnt2d& uv = tri->UVNode(i);
                result.uvs[uvBase + 0] = static_cast<float>(uv.X());
                result.uvs[uvBase + 1] = static_cast<float>(uv.Y());
            } else {
                result.uvs[uvBase + 0] = 0.0f;
                result.uvs[uvBase + 1] = 0.0f;
            }
        }

        if (!tri->HasNormals()) {
            BRepLib_ToolTriangulatedShape::ComputeNormals(face, tri);
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
            if (!identityLoc) {
                d = d.Transformed(trsf);
            }
            int base = (vertexOffset + i - 1) * 3;
            result.normals[base + 0] = static_cast<float>(d.X());
            result.normals[base + 1] = static_cast<float>(d.Y());
            result.normals[base + 2] = static_cast<float>(d.Z());
        }

        bool isReversed = (face.Orientation() != TopAbs_FORWARD);
        for (int t = 1; t <= nbTri; t++) {
            const auto& triangle = tri->Triangle(t);
            int n1 = triangle.Value(1);
            int n2 = triangle.Value(2);
            int n3 = triangle.Value(3);

            if (isReversed) {
                int tmp = n1;
                n1 = n2;
                n2 = tmp;
            }

            result.indices[triOffset + 0] = static_cast<uint32_t>(n1 - 1 + vertexOffset);
            result.indices[triOffset + 1] = static_cast<uint32_t>(n2 - 1 + vertexOffset);
            result.indices[triOffset + 2] = static_cast<uint32_t>(n3 - 1 + vertexOffset);
            triOffset += 3;
        }

        int faceTriStart = triOffset - nbTri * 3;
        int faceHash = static_cast<int>(TopTools_ShapeMapHasher{}(face) % 2147483647);
        result.faceGroups[faceGroupIdx + 0] = faceTriStart;
        result.faceGroups[faceGroupIdx + 1] = nbTri * 3;
        result.faceGroups[faceGroupIdx + 2] = faceHash;
        faceGroupIdx += 3;

        vertexOffset += nbNodes;
    }

    return result;
}

// --- MeshBatchData implementation ---

MeshBatchData::~MeshBatchData() {
    std::free(positions);
    std::free(normals);
    std::free(indices);
    std::free(shapeOffsets);
}

MeshBatchData::MeshBatchData(const MeshBatchData& other)
    : positions(other.positions), normals(other.normals), indices(other.indices),
      shapeOffsets(other.shapeOffsets), positionCount(other.positionCount),
      normalCount(other.normalCount), indexCount(other.indexCount), shapeCount(other.shapeCount) {
    auto& mut = const_cast<MeshBatchData&>(other);
    mut.positions = nullptr;
    mut.normals = nullptr;
    mut.indices = nullptr;
    mut.shapeOffsets = nullptr;
}

int MeshBatchData::getPositionsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(positions));
}

int MeshBatchData::getNormalsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(normals));
}

int MeshBatchData::getIndicesPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(indices));
}

int MeshBatchData::getShapeOffsetsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(shapeOffsets));
}

// --- EdgeData implementation ---

EdgeData::~EdgeData() {
    std::free(points);
    std::free(edgeGroups);
}

EdgeData::EdgeData(const EdgeData& other)
    : points(other.points), edgeGroups(other.edgeGroups), pointCount(other.pointCount),
      edgeGroupCount(other.edgeGroupCount) {
    auto& mut = const_cast<EdgeData&>(other);
    mut.points = nullptr;
    mut.edgeGroups = nullptr;
}

int EdgeData::getPointsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(points));
}

int EdgeData::getEdgeGroupsPtr() const {
    return static_cast<int>(reinterpret_cast<uintptr_t>(edgeGroups));
}

// --- Ray intersection ---

std::vector<double> OcctKernel::rayIntersect(uint32_t id, double ox, double oy, double oz,
                                             double dx, double dy, double dz) {
    const auto& shape = get(id);
    Handle(Geom_Line) line = new Geom_Line(gp_Pnt(ox, oy, oz), gp_Dir(dx, dy, dz));
    const double dirLen = std::sqrt(dx * dx + dy * dy + dz * dz);
    if (dirLen < 1e-12) return {};

    std::vector<double> results;

    for (TopExp_Explorer ex(shape, TopAbs_FACE); ex.More(); ex.Next()) {
        const TopoDS_Face& face = TopoDS::Face(ex.Current());
        Handle(Geom_Surface) surf = BRep_Tool::Surface(face);
        if (surf.IsNull()) continue;

        GeomAPI_IntCS intersector(line, surf);
        if (!intersector.IsDone()) continue;

        for (int i = 1; i <= intersector.NbPoints(); i++) {
            gp_Pnt pt = intersector.Point(i);
            double u = 0, v = 0, w = 0;
            intersector.Parameters(i, u, v, w);

            BRepClass_FaceClassifier classifier(face, gp_Pnt2d(u, v), 1e-7);
            if (classifier.State() == TopAbs_OUT) continue;

            double dist = pt.Distance(gp_Pnt(ox, oy, oz));
            int faceHash = static_cast<int>(TopTools_ShapeMapHasher{}(face) % 2147483647);
            results.push_back(static_cast<double>(faceHash));
            results.push_back(dist);
            results.push_back(pt.X());
            results.push_back(pt.Y());
            results.push_back(pt.Z());
            results.push_back(u);
            results.push_back(v);
        }
    }

    const int stride = 7;
    for (size_t i = 0; i + stride <= results.size(); i += stride) {
        for (size_t j = i + stride; j + stride <= results.size(); j += stride) {
            if (results[j + 1] < results[i + 1]) {
                for (int k = 0; k < stride; k++)
                    std::swap(results[i + k], results[j + k]);
            }
        }
    }

    return results;
}

// --- BRepGraph topology queries ---

void OcctKernel::ensureGraph(const TopoDS_Shape& shape) {
    if (graph_ && graphShape_.IsSame(shape)) return;
    auto g = std::make_unique<BRepGraph>();
    BRepGraph_Builder::Options opts;
    opts.CreateAutoProduct = false;
    auto result = BRepGraph_Builder::Add(*g, shape, opts);
    if (!result.Ok) {
        throw std::runtime_error("graphBuild: failed to populate BRepGraph from shape");
    }
    graph_ = std::move(g);
    graphShape_ = shape;
}

void OcctKernel::graphBuild(uint32_t id) {
    const auto& shape = get(id);
    ensureGraph(shape);
}

std::vector<int> OcctKernel::graphBodyMap() {
    if (!graph_)
        throw std::runtime_error("graphBodyMap: no graph built");
    const auto& topo = graph_->Topo();
    const auto& faces = topo.Faces();
    const auto& edges = topo.Edges();
    const auto& shells = topo.Shells();
    const int fc = faces.NbActive();
    const int ec = edges.NbActive();
    std::vector<int> bodyMap;
    bodyMap.reserve(2 + fc + ec);
    bodyMap.push_back(fc);
    bodyMap.push_back(ec);
    for (int fi = 0; fi < fc; fi++) {
        auto fId = BRepGraph_FaceId(fi);
        const auto& parShells = faces.Shells(fId);
        int body = -1;
        if (parShells.Size() > 0) {
            const auto& parSolids = shells.Solids(parShells[0]);
            if (parSolids.Size() > 0) body = static_cast<int>(parSolids[0].Index);
        }
        bodyMap.push_back(body);
    }
    for (int ei = 0; ei < ec; ei++) {
        auto eId = BRepGraph_EdgeId(ei);
        const auto& edgeFaces = edges.Faces(eId);
        int body = -1;
        for (const auto& efId : edgeFaces) {
            const auto& parShells = faces.Shells(efId);
            if (parShells.Size() > 0) {
                const auto& parSolids = shells.Solids(parShells[0]);
                if (parSolids.Size() > 0) { body = static_cast<int>(parSolids[0].Index); break; }
            }
        }
        bodyMap.push_back(body);
    }
    return bodyMap;
}

std::vector<int> OcctKernel::graphFaceAdjacency(int faceIdx) {
    if (!graph_)
        throw std::runtime_error("graphFaceAdjacency: no graph built");
    const auto& faces = graph_->Topo().Faces();
    auto fId = BRepGraph_FaceId(faceIdx);
    occ::handle<NCollection_BaseAllocator> alloc;
    auto adjFaces = faces.Adjacent(fId, alloc);
    std::vector<int> result;
    for (const auto& adjId : adjFaces) {
        result.push_back(static_cast<int>(adjId.Index));
        auto shared = faces.SharedEdges(fId, adjId, alloc);
        result.push_back(shared.Size() > 0 ? static_cast<int>(shared[0].Index) : -1);
    }
    return result;
}

std::vector<int> OcctKernel::graphEdgeFaces(int edgeIdx) {
    if (!graph_)
        throw std::runtime_error("graphEdgeFaces: no graph built");
    auto eId = BRepGraph_EdgeId(edgeIdx);
    const auto& edgeFaces = graph_->Topo().Edges().Faces(eId);
    std::vector<int> result;
    for (const auto& fId : edgeFaces)
        result.push_back(static_cast<int>(fId.Index));
    return result;
}

std::vector<int> OcctKernel::graphWireTopology(int faceIdx) {
    if (!graph_)
        throw std::runtime_error("graphWireTopology: no graph built");
    const auto& topo = graph_->Topo();
    auto fId = BRepGraph_FaceId(faceIdx);
    auto outerWireId = BRepGraph_Tool::Face::OuterWireId(*graph_, fId);
    std::vector<int> result;
    auto collectEdges = [&](BRepGraph_WireId wId) -> std::vector<int> {
        std::vector<int> egs;
        BRepGraph_WireExplorer exp(*graph_, wId);
        for (; exp.More(); exp.Next())
            egs.push_back(static_cast<int>(
                BRepGraph_Tool::CoEdge::EdgeOf(*graph_, exp.CurrentCoEdgeId()).Index));
        return egs;
    };
    auto outerEg = collectEdges(outerWireId);
    result.push_back(static_cast<int>(outerEg.size()));
    for (auto e : outerEg) result.push_back(e);
    int innerCount = 0;
    int innerCountPos = static_cast<int>(result.size());
    result.push_back(0);
    for (int wi = 0; wi < topo.Wires().NbActive(); wi++) {
        auto wId = BRepGraph_WireId(wi);
        if (wId.Index == outerWireId.Index) continue;
        auto owner = BRepGraph_Tool::Wire::FaceOf(*graph_, wId);
        if (static_cast<int>(owner.Index) != faceIdx) continue;
        auto eg = collectEdges(wId);
        result.push_back(static_cast<int>(eg.size()));
        for (auto e : eg) result.push_back(e);
        innerCount++;
    }
    result[innerCountPos] = innerCount;
    return result;
}

std::vector<int> OcctKernel::graphEdgeVertices(int edgeIdx) {
    if (!graph_)
        throw std::runtime_error("graphEdgeVertices: no graph built");
    auto eId = BRepGraph_EdgeId(edgeIdx);
    auto v0 = BRepGraph_Tool::Edge::StartVertexId(*graph_, eId);
    auto v1 = BRepGraph_Tool::Edge::EndVertexId(*graph_, eId);
    return {static_cast<int>(v0.Index), static_cast<int>(v1.Index)};
}

