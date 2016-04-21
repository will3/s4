module.exports = function(blocks) {
  function gen() {
    var num = 10000;
    var count = 0;
    var coords = [{ x: 0, y: 0, z: 0 }];

    for (var i = 0; i < num; i++) {
      var index = coords.length - 1 - Math.floor(Math.random() * coords.length * 0.1);
      var coord = coords[index];
      var next = nextCoord(coord);
      if (blocks.getAtCoord(next) > 0) {
        continue;
      }

      coords.push(next);

      blocks.set(next.x, next.y, next.z, 1);
    }
  };

  function nextCoord(coord) {
    var next = { x: coord.x, y: coord.y, z: coord.z };
    var num = Math.floor(Math.random() * 6);
    switch (num) {
      case 0:
        next.x++;
        break;
      case 1:
        next.x--;
        break;
      case 2:
        next.y++;
        break;
      case 3:
        next.y--;
        break;
      case 4:
        next.z++;
        break;
      case 5:
        next.z--;
        break;
    }

    return next;
  };

  return {
    gen: gen
  };
};

module.exports.$inject = ['$scope'];