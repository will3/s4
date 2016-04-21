var Injector = function() {
  this.bindings = {};
};

Injector.prototype.register = function(type, object, opt) {
  opt = opt || {};
  if (typeof opt === 'boolean') {
    opt = {
      once: opt
    };
  }

  var deps = [];

  if (Array.isArray(object)) {
    deps = object.slice(0, object.length - 1);
    object = object[object.length - 1];
  }

  if (object.$inject != null) {
    deps = object.$inject;
  }

  var self = this;
  if (typeof object === 'function') {
    this.bindings[type] = {
      factory: function(transform) {
        return self.newInstance(object, deps, transform);
      }
    }
  } else {
    this.bindings[type] = {
      value: object
    };
  }

  for (var i in opt) {
    this.bindings[type][i] = opt[i];
  }
};

Injector.prototype.newInstance = function(func, deps, transform) {
  var args = [null];
  var self = this;
  deps.forEach(function(dep) {
    args.push(self.resolve(dep, transform));
  });

  return new(Function.prototype.bind.apply(func, args));
};

Injector.prototype.resolve = function(type, transform) {
  var binding = this.bindings[type];
  var object;

  if (transform != null) {
    object = transform(type);
    if (object != null) {
      return object;
    }
  }

  if (binding == null) {
    throw new Error('binding not found for type: ' + type);
  }

  if (binding.value != null) {
    return binding.value;
  }

  object = binding.factory(transform);

  if (binding.once) {
    binding.value = object;
  }

  return object;
};

module.exports = Injector;