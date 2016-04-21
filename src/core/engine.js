var Injector = require('./injector');

function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
};

var Engine = function() {
  this.map = {};
  this.root = {};
  this.injector = new Injector();
  this.maxDt = 1000 / 24.0;
};

Engine.prototype.register = function(type, args, options) {
  this.injector.register(type, args, options);
};

Engine.prototype.attach = function(object, component) {
  // Attach to root if one argument
  if (component === undefined) {
    component = object;
    object = this.root;
  }

  if (object === undefined) {
    throw new Error('expected first argument');
  }

  if (typeof component === 'string') {
    component = this.injector.resolve(component, function(dep) {
      if (dep === '$scope') {
        return object;
      }
    });
  }

  if (object._id == null) object._id = guid();
  if (component._id == null) component._id = guid();

  if (this.map[object._id] == null) {
    this.map[object._id] = {};
  }

  this.map[object._id][component._id] = component;

  return component;
};

Engine.prototype.dettach = function(object) {
  if (this.root[object._id] != null) {
    var component = this.root[object._id];
    if (component.onDettach != null) {
      component.onDettach();
    }

    delete this.root[component];
    return;
  }

  for (var i in this.map[object._id]) {
    var component = this.map[object._id][i];
    if (component.onDettach != null) {
      component.onDettach();
    }
  }

  delete this.map[object._id];
};

Engine.prototype.tick = function(dt) {
  var component;

  if (dt > this.maxDt) {
    dt = this.maxDt;
  }

  for (var i in this.root) {
    component = this.root[i];
    if (component.tick != null) {
      component.tick();
    }
  }

  for (var i in this.map) {
    for (var j in this.map[i]) {
      component = this.map[i][j];
      if (component.tick != null) {
        component.tick(dt);
      }
    }
  }

  for (var i in this.map) {
    for (var j in this.map[i]) {
      component = this.map[i][j];
      if (component.lateTick != null) {
        component.lateTick(dt);
      }
    }
  }

  for (var i in this.root) {
    component = this.root[i];
    if (component.lateTick != null) {
      component.lateTick();
    }
  }
};

module.exports = function() {
  var app = new Engine();
  require('./bootstrap')(app);
  return app;
};

module.exports.constructor = Engine;