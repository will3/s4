module.exports = function(grunt) {

  require('load-grunt-tasks')(grunt);

  grunt.initConfig({
    copy: {
      main: {
        files: [{
          expand: true,
          src: [
            'node_modules/three/three.js',
            'node_modules/ndarray/ndarray.js'
          ],
          dest: 'js',
          flatten: true
        }]
      }
    },
    clean: ['js', 'css'],
    sass: {
      options: {
        sourceMap: true
      },
      dist: {
        files: {
          'css/main.css': 'stylesheets/main.scss'
        }
      }
    },
    shell: {
      open: {
        command: 'open index.html'
      },
      build: {
        command: 'watchify src/main.js -o js/bundle.js --debug -v'
      }
    },
    concurrent: {
      dev: [
        ['sass', 'copy', 'shell:open', 'watch'], 'shell:build'
      ]
    },
    curl: {
      "js/shaders/SSAOShader.js": "http://raw.githubusercontent.com/mrdoob/three.js/r75/examples/js/shaders/SSAOShader.js",
      "js/shaders/CopyShader.js": "http://raw.githubusercontent.com/mrdoob/three.js/r75/examples/js/shaders/CopyShader.js",
      "js/postprocessing/EffectComposer.js": "http://raw.githubusercontent.com/mrdoob/three.js/r75/examples/js/postprocessing/EffectComposer.js",
      "js/postprocessing/RenderPass.js": "http://raw.githubusercontent.com/mrdoob/three.js/r75/examples/js/postprocessing/RenderPass.js",
      "js/postprocessing/ShaderPass.js": "http://raw.githubusercontent.com/mrdoob/three.js/r75/examples/js/postprocessing/ShaderPass.js",
      "js/postprocessing/MaskPass.js": "http://raw.githubusercontent.com/mrdoob/three.js/r75/examples/js/postprocessing/MaskPass.js"
    },
    watch: {
      dev: {
        files: ['stylesheets/**/*.scss'],
        tasks: ['sass', 'copy']
      }
    }
  });

  grunt.registerTask('default', ['concurrent:dev']);
  grunt.registerTask('build', ['shell:build']);
};