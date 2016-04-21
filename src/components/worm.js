var THREE = require('three');

module.exports = function(blocks, ground) {
  var coords = [];
  var coord = null;

  var count = 0;
  var interval = 10;

  function tick(dt) {
    count += dt;
    if (count < interval) {
      return;
    }
    count -= interval;

    coord = nextCoord(coord);
    coords.push(coord);
    blocks.setAtCoord(coord, 2);

    if (coords.length > self.length) {
      blocks.setAtCoord(coords[0], 0);
      coords.shift();
    }
  };

  function nextCoord(coord) {
    if (coord == null) {
      return new THREE.Vector3();
    }

    var possibleCoords = [];
    var allCoords = [];
    var fallbackCoords = [];
    visitNeighbourCoords(coord, function(neighbourCoord) {
      if (!ground.getAtCoord(neighbourCoord) &&
        hasNeighbour(neighbourCoord)) {
        if (includesCoord(neighbourCoord)) {
          fallbackCoords.push(neighbourCoord);
        } else {
          possibleCoords.push(neighbourCoord);
        }

      }
      allCoords.push(neighbourCoord);
    });

    if (possibleCoords.length === 0) {
      if (fallbackCoords.length === 0) {
        return allCoords[Math.floor(Math.random() * allCoords.length)];
      }
      return fallbackCoords[Math.floor(Math.random() * fallbackCoords.length)];
    }

    return possibleCoords[Math.floor(Math.random() * possibleCoords.length)];
  };

  function visitNeighbourCoords(coord, callback) {
    for (var i = -1; i <= 1; i++) {
      for (var j = -1; j <= 1; j++) {
        for (var k = -1; k <= 1; k++) {
          if (i === 0 && j === 0 && k === 0) {
            continue;
          }

          if (Math.abs(i) + Math.abs(j) + Math.abs(k) > 2) {
            continue;
          }

          callback(
            new THREE.Vector3(coord.x + i, coord.y + j, coord.z + k)
          );
        }
      }
    }
  };

  function hasNeighbour(coord) {
    return !!ground.get(coord.x + 1, coord.y, coord.z) ||
      !!ground.get(coord.x - 1, coord.y, coord.z) ||
      !!ground.get(coord.x, coord.y + 1, coord.z) ||
      !!ground.get(coord.x, coord.y - 1, coord.z) ||
      !!ground.get(coord.x, coord.y, coord.z + 1) ||
      !!ground.get(coord.x, coord.y, coord.z - 1);
  };

  function includesCoord(coord) {
    for (var i = 0; i < coords.length; i++) {
      if (coords[i].equals(coord)) {
        return true;
      }
    }

    return false;
  };

  var self = {
    length: 10,
    tick: tick
  };

  return self;

};

module.exports.$inject = ['$scope', '_ground'];