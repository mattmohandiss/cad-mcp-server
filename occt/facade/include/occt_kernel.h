#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <TopoDS_Shape.hxx>

/// Opaque pointer to BRepGraph (heavy header, keep out of this file).
class BRepGraph;

/// Mesh data returned from tessellation.
struct MeshData {
    float* positions = nullptr;
    float* normals = nullptr;
    float* uvs = nullptr;
    uint32_t* indices = nullptr;
    int32_t* faceGroups = nullptr; // [triStart, triCount, faceHash] per face
    int positionCount = 0;
    int normalCount = 0;
    int uvCount = 0;
    int indexCount = 0;
    int faceGroupCount = 0; // number of int32s (faceCount * 3)

    MeshData() = default;
    ~MeshData();
    MeshData(const MeshData& other);
    MeshData& operator=(const MeshData&) = delete;
    int getPositionsPtr() const;
    int getNormalsPtr() const;
    int getUvsPtr() const;
    int getIndicesPtr() const;
    int getFaceGroupsPtr() const;
};

/// Bounding box result.
struct BBoxData {
    double xmin, ymin, zmin, xmax, ymax, zmax;
};

/// Edge line data for wireframe rendering.
struct EdgeData {
    float* points = nullptr;
    int32_t* edgeGroups = nullptr; // [pointStart, pointCount, edgeHash] per edge
    int pointCount = 0;
    int edgeGroupCount = 0; // number of int32s (edgeCount * 3)

    EdgeData() = default;
    ~EdgeData();
    EdgeData(const EdgeData& other);
    EdgeData& operator=(const EdgeData&) = delete;
    int getPointsPtr() const;
    int getEdgeGroupsPtr() const;
};

/// NURBS/BSpline curve data extracted from an edge.
struct NurbsCurveData {
    int degree = 0;
    bool rational = false;
    bool periodic = false;
    std::vector<double> knots;
    std::vector<int> multiplicities;
    std::vector<double> poles; // flat [x,y,z, x,y,z, ...]
    std::vector<double> weights;
};

/// Batch mesh data: concatenated positions/normals/indices with per-shape offsets.
struct MeshBatchData {
    float* positions = nullptr;
    float* normals = nullptr;
    uint32_t* indices = nullptr;
    int32_t* shapeOffsets = nullptr; // [posStart, posCount, idxStart, idxCount] per shape
    int positionCount = 0;
    int normalCount = 0;
    int indexCount = 0;
    int shapeCount = 0; // number of shapes (shapeOffsets has shapeCount * 4 int32s)

    MeshBatchData() = default;
    ~MeshBatchData();
    MeshBatchData(const MeshBatchData& other);
    MeshBatchData& operator=(const MeshBatchData&) = delete;
    int getPositionsPtr() const;
    int getNormalsPtr() const;
    int getIndicesPtr() const;
    int getShapeOffsetsPtr() const;
};

/// Arena-based OCCT kernel.
class OcctKernel {
  public:
    OcctKernel();
    ~OcctKernel();

    // --- Arena management ---
    void release(uint32_t id);
    void releaseAll();
    uint32_t getShapeCount();

    // --- Transforms ---
    uint32_t translate(uint32_t id, double dx, double dy, double dz);
    uint32_t rotate(uint32_t id, double px, double py, double pz, double dx, double dy, double dz,
                    double angleRad);
    uint32_t scale(uint32_t id, double px, double py, double pz, double factor);
    uint32_t mirror(uint32_t id, double px, double py, double pz, double nx, double ny, double nz);
    uint32_t copy(uint32_t id);
    uint32_t transform(uint32_t id, std::vector<double> matrix);
    uint32_t generalTransform(uint32_t id, std::vector<double> matrix);
    uint32_t linearPattern(uint32_t id, double dx, double dy, double dz, double spacing, int count);
    uint32_t circularPattern(uint32_t id, double cx, double cy, double cz, double ax, double ay,
                             double az, double angle, int count);
    std::vector<double> composeTransform(std::vector<double> m1, std::vector<double> m2);
    std::vector<uint32_t> translateBatch(std::vector<uint32_t> ids, std::vector<double> offsets);
    std::vector<uint32_t> transformBatch(std::vector<uint32_t> ids, std::vector<double> matrices);
    std::vector<uint32_t> rotateBatch(std::vector<uint32_t> ids, std::vector<double> params);
    std::vector<uint32_t> scaleBatch(std::vector<uint32_t> ids, std::vector<double> params);
    std::vector<uint32_t> mirrorBatch(std::vector<uint32_t> ids, std::vector<double> params);

    // --- Shape construction ---
    uint32_t makeVertex(double x, double y, double z);
    uint32_t makeEdge(uint32_t v1, uint32_t v2);
    uint32_t makeLineEdge(double x1, double y1, double z1, double x2, double y2, double z2);
    uint32_t makeCircleEdge(double cx, double cy, double cz, double nx, double ny, double nz,
                            double radius);
    uint32_t makeCircleArc(double cx, double cy, double cz, double nx, double ny, double nz,
                           double radius, double startAngle, double endAngle);
    uint32_t makeArcEdge(double x1, double y1, double z1, double x2, double y2, double z2,
                         double x3, double y3, double z3);
    uint32_t makeEllipseEdge(double cx, double cy, double cz, double nx, double ny, double nz,
                             double majorRadius, double minorRadius);
    uint32_t makeEllipseArc(double cx, double cy, double cz, double nx, double ny, double nz,
                            double majorRadius, double minorRadius, double startAngle,
                            double endAngle);
    uint32_t makeBezierEdge(std::vector<double> flatPoints);
    uint32_t makeBSplineEdge(std::vector<double> poles, std::vector<double> weights,
                             std::vector<double> knots, std::vector<int> multiplicities, int degree,
                             bool periodic);
    uint32_t makeTangentArc(double x1, double y1, double z1, double tx, double ty, double tz,
                            double x2, double y2, double z2);
    uint32_t makeHelixWire(double px, double py, double pz, double dx, double dy, double dz,
                           double pitch, double height, double radius);
    uint32_t makeWire(std::vector<uint32_t> edgeIds);
    uint32_t makeFace(uint32_t wireId);
    uint32_t addHolesInFace(uint32_t faceId, std::vector<uint32_t> holeWireIds);
    uint32_t removeHolesFromFace(uint32_t faceId, std::vector<int> holeIndices);
    uint32_t solidFromShell(uint32_t shellId);
    uint32_t makeSolid(uint32_t shellId);
    uint32_t sew(std::vector<uint32_t> shapeIds, double tolerance);
    uint32_t sewAndSolidify(std::vector<uint32_t> faceIds, double tolerance);
    uint32_t buildSolidFromFaces(std::vector<uint32_t> faceIds, double tolerance);
    uint32_t makeCompound(std::vector<uint32_t> shapeIds);
    uint32_t buildTriFace(double ax, double ay, double az, double bx, double by, double bz,
                          double cx2, double cy2, double cz2);
    uint32_t makeFaceOnSurface(uint32_t faceId, uint32_t wireId);
    uint32_t bsplineSurface(std::vector<double> flatPoints, int rows, int cols);

    // --- Topology query ---
    std::string getShapeType(uint32_t id);
    std::vector<uint32_t> getSubShapes(uint32_t id, const std::string& shapeType);
    uint32_t downcast(uint32_t id, const std::string& targetType);
    double distanceBetween(uint32_t a, uint32_t b);
    bool isSame(uint32_t a, uint32_t b);
    bool isEqual(uint32_t a, uint32_t b);
    bool isNull(uint32_t id);
    int hashCode(uint32_t id, int upperBound);
    std::string shapeOrientation(uint32_t id);
    std::vector<uint32_t> sharedEdges(uint32_t faceA, uint32_t faceB);
    std::vector<uint32_t> adjacentFaces(uint32_t shapeId, uint32_t faceId);
    std::vector<uint32_t> iterShapes(uint32_t id);
    std::vector<int> edgeToFaceMap(uint32_t id, int hashUpperBound);

    // --- Query / Measure ---
    BBoxData getBoundingBox(uint32_t id, bool useTriangulation);
    double getVolume(uint32_t id);
    double getSurfaceArea(uint32_t id);
    double getLength(uint32_t id);
    std::vector<double> getCenterOfMass(uint32_t id);
    std::vector<double> getSurfaceCenterOfMass(uint32_t faceId);
    std::vector<double> getLinearCenterOfMass(uint32_t id);
    std::vector<double> surfaceCurvature(uint32_t faceId, double u, double v);
    std::vector<double> getInertia(uint32_t id);
    std::vector<double> getPrincipalProperties(uint32_t id);
    std::vector<double> getOrientedBoundingBox(uint32_t id);
    bool containsPoint(uint32_t id, double x, double y, double z, double tolerance);
    std::vector<double> vertexPosition(uint32_t vertexId);
    std::string surfaceType(uint32_t faceId);
    std::vector<double> surfaceNormal(uint32_t faceId, double u, double v);
    std::vector<double> pointOnSurface(uint32_t faceId, double u, double v);
    uint32_t outerWire(uint32_t faceId);
    std::vector<double> uvBounds(uint32_t faceId);
    std::vector<double> uvFromPoint(uint32_t faceId, double x, double y, double z);
    std::vector<double> getFaceCylinderData(uint32_t faceId);
    std::vector<double> projectPointOnFace(uint32_t faceId, double x, double y, double z);
    std::string classifyPointOnFace(uint32_t faceId, double u, double v);
    bool hasTriangulation(uint32_t id);
    std::vector<double> queryBatch(std::vector<uint32_t> ids);

    // --- Shape Analysis ---
    bool hasFreeEdges(uint32_t id);
    int freeEdgeCount(uint32_t id);
    std::vector<double> shapeContents(uint32_t id);

    // --- Geometry Utilities ---
    bool areAxesCoaxial(double ax1x, double ax1y, double ax1z,
                        double al1x, double al1y, double al1z,
                        double ax2x, double ax2y, double ax2z,
                        double al2x, double al2y, double al2z,
                        double angTol, double linTol);

    // --- Ray Intersection ---
    std::vector<double> rayIntersect(uint32_t id, double ox, double oy, double oz,
                                     double dx, double dy, double dz);

    // --- BRepGraph topology queries (O(1) graph-native lookups) ---
    void graphBuild(uint32_t id);
    std::vector<int> graphBodyMap();
    std::vector<int> graphFaceAdjacency(int faceIdx);
    std::vector<int> graphEdgeFaces(int edgeIdx);
    std::vector<int> graphWireTopology(int faceIdx);
    std::vector<int> graphEdgeVertices(int edgeIdx);

    // --- Curve ops ---
    std::string curveType(uint32_t edgeId);
    double edgeCircleRadius(uint32_t edgeId);
    std::vector<double> curvePointAtParam(uint32_t edgeId, double param);
    std::vector<double> curveTangent(uint32_t edgeId, double param);
    std::vector<double> curveParameters(uint32_t edgeId);
    bool curveIsClosed(uint32_t edgeId);
    bool curveIsPeriodic(uint32_t edgeId);
    double curveLength(uint32_t edgeId);
    uint32_t interpolatePoints(std::vector<double> flatPoints, bool periodic);
    uint32_t interpolatePointsWithTangents(std::vector<double> flatPoints, double startTanX,
                                           double startTanY, double startTanZ, double endTanX,
                                           double endTanY, double endTanZ);
    std::vector<double> projectPointOnEdge(uint32_t edgeId, double x, double y, double z);
    uint32_t approximatePoints(std::vector<double> flatPoints, double tolerance);
    uint32_t liftCurve2dToPlane(std::vector<double> flatPoints2d, double planeOx, double planeOy,
                                double planeOz, double planeZx, double planeZy, double planeZz,
                                double planeXx, double planeXy, double planeXz);
    NurbsCurveData getNurbsCurveData(uint32_t edgeId);
    uint32_t curveDegreeElevate(uint32_t edgeId, int elevateBy);
    uint32_t curveKnotInsert(uint32_t edgeId, double knot, int times);
    uint32_t curveKnotRemove(uint32_t edgeId, double knot, double tolerance);
    std::vector<uint32_t> curveSplit(uint32_t edgeId, double param);

    // --- Healing / Repair ---
    uint32_t fixShape(uint32_t id);
    uint32_t unifySameDomain(uint32_t id);
    bool isValid(uint32_t id);
    uint32_t healSolid(uint32_t id, double tolerance);
    uint32_t healFace(uint32_t id, double tolerance);
    uint32_t healWire(uint32_t id, double tolerance);
    uint32_t fixFaceOrientations(uint32_t id);
    uint32_t removeDegenerateEdges(uint32_t id);
    void buildCurves3d(uint32_t wireId);
    uint32_t fixWireOnFace(uint32_t wireId, uint32_t faceId, double tolerance);

    // --- I/O ---
    uint32_t importStep(const std::string& data);
    std::string exportStep(uint32_t id);
    uint32_t importStl(const std::string& data);
    std::string exportStl(uint32_t id, double linearDeflection, bool ascii);
    std::string toBREP(uint32_t id);
    uint32_t fromBREP(const std::string& data);
    std::string exportBrepBinary(uint32_t id);
    uint32_t importBrepBinary(const std::string& path);

    // --- Tessellation / Mesh ---
    MeshData tessellate(uint32_t id, double linearDeflection, double angularDeflection);
    MeshData tessellateRelative(uint32_t id, double linearDeflection, double angularDeflection);
    EdgeData wireframe(uint32_t id, double deflection);
    MeshData meshShape(uint32_t id, double linearDeflection, double angularDeflection);
    MeshBatchData meshBatch(std::vector<uint32_t> ids, double linearDeflection,
                            double angularDeflection);

    // --- Null shape (for test support) ---
    uint32_t makeNullShape();

    // --- Bulk array marshalling (Embind heap transfer) ---
    int allocBytes(int byteCount);
    void freeBytes(int ptr);
    std::vector<double> vectorF64FromHeap(int ptr, int count);
    std::vector<uint32_t> vectorU32FromHeap(int ptr, int count);
    std::vector<int> vectorI32FromHeap(int ptr, int count);

  private:
    uint32_t store(const TopoDS_Shape& shape);
    const TopoDS_Shape& get(uint32_t id) const;
    MeshData buildMeshData(const TopoDS_Shape& shape, double linearDeflection,
                           double angularDeflection, bool relative);
    void ensureGraph(const TopoDS_Shape& shape);

    std::unordered_map<uint32_t, TopoDS_Shape> arena_;
    uint32_t nextId_ = 1;
    std::unique_ptr<BRepGraph> graph_;
    TopoDS_Shape graphShape_; // the shape that was used to build graph_
};
