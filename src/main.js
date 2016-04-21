var THREE = require('three');

var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xf0f0f0);
document.body.appendChild(renderer.domElement);

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(
  30,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);

var depthMaterial, effectComposer, depthRenderTarget;
var ssaoPass;

var lastTick;

function render() {

  // Render depth into depthRenderTarget
  scene.overrideMaterial = depthMaterial;
  renderer.render(scene, camera, depthRenderTarget, true);

  // Render renderPass and SSAO shaderPass
  scene.overrideMaterial = null;
  effectComposer.render();

  // renderer.render(scene, camera);

  requestAnimationFrame(render);
  if (lastTick != null) {
    var dt = new Date().getTime() - lastTick;
    app.tick(dt);
  }
  lastTick = new Date().getTime();
};

function initPostprocessing() {

  // Setup render pass
  var renderPass = new THREE.RenderPass(scene, camera);

  // Setup depth pass
  depthMaterial = new THREE.MeshDepthMaterial();
  depthMaterial.depthPacking = THREE.RGBADepthPacking;
  depthMaterial.blending = THREE.NoBlending;

  var pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  depthRenderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, pars);

  // Setup SSAO pass
  ssaoPass = new THREE.ShaderPass(THREE.SSAOShader);
  ssaoPass.renderToScreen = true;
  //ssaoPass.uniforms[ "tDiffuse" ].value will be set by ShaderPass
  ssaoPass.uniforms["tDepth"].value = depthRenderTarget;
  ssaoPass.uniforms['size'].value.set(window.innerWidth, window.innerHeight);
  ssaoPass.uniforms['cameraNear'].value = camera.near;
  ssaoPass.uniforms['cameraFar'].value = camera.far;
  ssaoPass.uniforms['onlyAO'].value = false;
  ssaoPass.uniforms['aoClamp'].value = 10;
  ssaoPass.uniforms['lumInfluence'].value = 0.0;

  // Add pass to effect composer
  effectComposer = new THREE.EffectComposer(renderer);
  effectComposer.addPass(renderPass);
  effectComposer.addPass(ssaoPass);

}

initPostprocessing();
render();

window.addEventListener('resize', function() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

var app = require('./core/engine')();

app.register('blocks', require('./components/blocks'));
app.register('dragCamera', require('./components/dragcamera'));
app.register('tree', require('./components/tree'));
app.register('worm', require('./components/worm'));

var dragCamera = app.attach(camera, 'dragCamera');
dragCamera.distance = 2500;
dragCamera.updateCamera();

var ambientLight = new THREE.AmbientLight(0x888888);
scene.add(ambientLight);

var directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(5, 20, 10);
scene.add(directionalLight);

var object = new THREE.Object3D();
scene.add(object);
var ground = app.attach(object, 'blocks');
ground.scale = 10;

app.register('_ground', ground);

var tree = app.attach(ground, 'tree');
tree.gen();

var num = 2;
for (var i = 0; i < num; i++) {
  object = new THREE.Object3D();
  scene.add(object);
  var blocks = app.attach(object, 'blocks');
  blocks.scale = 10;
  worm = app.attach(blocks, 'worm');
}