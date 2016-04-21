module.exports = function(app) {
  app.register('$window', window);
  app.register('$input', require('./systems/input'), true);

  app.attach('$input');
};