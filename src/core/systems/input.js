var arrayUtils = require('../utils/arrayutils');

module.exports = function($window) {
  var mouseHolds = [];
  var input = {};

  var _mousedown, _mouseup, _mousemove;

  $window.addEventListener('mousedown',
    _mousedown = function(e) {
      if (!arrayUtils.includes(mouseHolds, e.button)) {
        mouseHolds.push(e.button);
      }
    });

  $window.addEventListener('mouseup',
    _mouseup = function(e) {
      arrayUtils.remove(mouseHolds, e.button);
    });

  $window.addEventListener('mousemove',
    _mousemove = function(e) {
      input.mouseX = e.clientX;
      input.mouseY = e.clientY;
    });

  $window.addEventListener('mouseenter', function() {
    mouseHolds = [];
  });

  $window.addEventListener('mouseleave', function() {
    mouseHolds = [];
  });

  function onDettach() {
    $window.removeEventListener('mousedown', _mousedown);
    $window.removeEventListener('mouseup', _mouseup);
    $window.removeEventListener('mousemove', _mousemove);
  };

  function mouse(button) {
    return arrayUtils.includes(mouseHolds, button);
  };

  input.onDettach = onDettach;
  input.mouse = mouse;

  return input;
};

module.exports.$inject = ['$window'];