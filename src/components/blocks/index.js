var ndarray = require('ndarray');
var THREE = require('three');

var mesher = require('./monotone').mesher;

module.exports = function(object) {

  var chunks = {};

  function set(x, y, z, v) {
    var origin = getOrigin(x, y, z);
    var id = origin.toArray().join(',');
    if (chunks[id] == null) {
      var chunk = ndarray([], [self.chunkSize, self.chunkSize, self.chunkSize]);
      chunks[id] = {
        chunk: chunk,
        origin: origin
      };
    }

    chunks[id].chunk.set(x - origin.x, y - origin.y, z - origin.z, v);
    chunks[id].dirty = true;
  };

  function get(x, y, z) {
    var origin = getOrigin(x, y, z);
    var id = origin.toArray().join(',');
    if (chunks[id] == null) {
      return null;
    }

    return chunks[id].chunk.get(x - origin.x, y - origin.y, z - origin.z);
  };

  function setAtCoord(coord, v) {
    set(coord.x, coord.y, coord.z, v);
  };

  function getAtCoord(coord) {
    return get(coord.x, coord.y, coord.z);
  };

  function getOrigin(x, y, z) {
    return new THREE.Vector3(
      Math.floor(x / self.chunkSize),
      Math.floor(y / self.chunkSize),
      Math.floor(z / self.chunkSize)
    ).multiplyScalar(self.chunkSize);
  };

  function tick(dt) {
    for (var id in chunks) {
      if (chunks[id].dirty) {
        updateMesh(chunks[id]);
        chunks[id].dirty = false;
      }
    }
  };

  function updateMesh(map) {
    var mesh = map.mesh;

    if (mesh != null) {
      mesh.parent.remove(mesh);
      mesh.geometry.dispose();
    }

    var result = mesher(map.chunk);

    var geometry = new THREE.Geometry();
    result.vertices.forEach(function(v) {
      var vertice = new THREE.Vector3(v[0], v[1], v[2]);
      vertice.multiplyScalar(self.scale);
      geometry.vertices.push(vertice);
    });

    result.faces.forEach(function(f) {
      var face = new THREE.Face3(f[0], f[1], f[2]);
      face.color = new THREE.Color(self.palette[f[3]]);
      geometry.faces.push(face);
    });

    mesh = new THREE.Mesh(geometry, self.material);

    mesh.position.copy(map.origin.clone().multiplyScalar(self.scale));

    map.mesh = mesh;

    self.object.add(mesh);
  };

  var self = {
    tick: tick,
    palette: [null, 0xffffff, 0x666666],
    scale: 1.0,
    chunkSize: 16,
    material: new THREE.MeshBasicMaterial({
      vertexColors: THREE.FaceColors
    }),
    set: set,
    get: get,
    setAtCoord: setAtCoord,
    getAtCoord: getAtCoord,
    object: new THREE.Object3D()
  };

  object.add(self.object);

  return self;

};

module.exports.$inject = ['$scope'];