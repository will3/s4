var THREE = require('three');

module.exports = function(camera, $input) {
  var lastX = 0;
  var lastY = 0;
  var rotation = new THREE.Euler();
  rotation.order = 'YXZ';

  function tick(dt) {
    if ($input.mouse(0)) {
      var diffX = $input.mouseX - lastX;
      var diffY = $input.mouseY - lastY;

      rotation.x += diffY * self.speed;
      rotation.y += diffX * self.speed;

      updateCamera();
    }

    lastX = $input.mouseX;
    lastY = $input.mouseY;
  }

  function updateCamera() {
    var vector = new THREE.Vector3(0, 0, 1)
      .applyEuler(rotation)
      .setLength(self.distance);

    var position = self.target.clone().add(vector);

    camera.position.copy(position);
    camera.lookAt(self.target, self.up);
  }

  var self = {
    speed: 0.01,
    tick: tick,
    target: new THREE.Vector3(),
    distance: 250,
    up: new THREE.Vector3(0, 1, 0),
    updateCamera: updateCamera
  };

  updateCamera();

  return self;
};

module.exports.$inject = ['$scope', '$input'];