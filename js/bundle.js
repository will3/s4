(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var iota = require("iota-array")
var isBuffer = require("is-buffer")

var hasTypedArrays  = ((typeof Float64Array) !== "undefined")

function compare1st(a, b) {
  return a[0] - b[0]
}

function order() {
  var stride = this.stride
  var terms = new Array(stride.length)
  var i
  for(i=0; i<terms.length; ++i) {
    terms[i] = [Math.abs(stride[i]), i]
  }
  terms.sort(compare1st)
  var result = new Array(terms.length)
  for(i=0; i<result.length; ++i) {
    result[i] = terms[i][1]
  }
  return result
}

function compileConstructor(dtype, dimension) {
  var className = ["View", dimension, "d", dtype].join("")
  if(dimension < 0) {
    className = "View_Nil" + dtype
  }
  var useGetters = (dtype === "generic")

  if(dimension === -1) {
    //Special case for trivial arrays
    var code =
      "function "+className+"(a){this.data=a;};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return -1};\
proto.size=0;\
proto.dimension=-1;\
proto.shape=proto.stride=proto.order=[];\
proto.lo=proto.hi=proto.transpose=proto.step=\
function(){return new "+className+"(this.data);};\
proto.get=proto.set=function(){};\
proto.pick=function(){return null};\
return function construct_"+className+"(a){return new "+className+"(a);}"
    var procedure = new Function(code)
    return procedure()
  } else if(dimension === 0) {
    //Special case for 0d arrays
    var code =
      "function "+className+"(a,d) {\
this.data = a;\
this.offset = d\
};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return this.offset};\
proto.dimension=0;\
proto.size=1;\
proto.shape=\
proto.stride=\
proto.order=[];\
proto.lo=\
proto.hi=\
proto.transpose=\
proto.step=function "+className+"_copy() {\
return new "+className+"(this.data,this.offset)\
};\
proto.pick=function "+className+"_pick(){\
return TrivialArray(this.data);\
};\
proto.valueOf=proto.get=function "+className+"_get(){\
return "+(useGetters ? "this.data.get(this.offset)" : "this.data[this.offset]")+
"};\
proto.set=function "+className+"_set(v){\
return "+(useGetters ? "this.data.set(this.offset,v)" : "this.data[this.offset]=v")+"\
};\
return function construct_"+className+"(a,b,c,d){return new "+className+"(a,d)}"
    var procedure = new Function("TrivialArray", code)
    return procedure(CACHED_CONSTRUCTORS[dtype][0])
  }

  var code = ["'use strict'"]

  //Create constructor for view
  var indices = iota(dimension)
  var args = indices.map(function(i) { return "i"+i })
  var index_str = "this.offset+" + indices.map(function(i) {
        return "this.stride[" + i + "]*i" + i
      }).join("+")
  var shapeArg = indices.map(function(i) {
      return "b"+i
    }).join(",")
  var strideArg = indices.map(function(i) {
      return "c"+i
    }).join(",")
  code.push(
    "function "+className+"(a," + shapeArg + "," + strideArg + ",d){this.data=a",
      "this.shape=[" + shapeArg + "]",
      "this.stride=[" + strideArg + "]",
      "this.offset=d|0}",
    "var proto="+className+".prototype",
    "proto.dtype='"+dtype+"'",
    "proto.dimension="+dimension)

  //view.size:
  code.push("Object.defineProperty(proto,'size',{get:function "+className+"_size(){\
return "+indices.map(function(i) { return "this.shape["+i+"]" }).join("*"),
"}})")

  //view.order:
  if(dimension === 1) {
    code.push("proto.order=[0]")
  } else {
    code.push("Object.defineProperty(proto,'order',{get:")
    if(dimension < 4) {
      code.push("function "+className+"_order(){")
      if(dimension === 2) {
        code.push("return (Math.abs(this.stride[0])>Math.abs(this.stride[1]))?[1,0]:[0,1]}})")
      } else if(dimension === 3) {
        code.push(
"var s0=Math.abs(this.stride[0]),s1=Math.abs(this.stride[1]),s2=Math.abs(this.stride[2]);\
if(s0>s1){\
if(s1>s2){\
return [2,1,0];\
}else if(s0>s2){\
return [1,2,0];\
}else{\
return [1,0,2];\
}\
}else if(s0>s2){\
return [2,0,1];\
}else if(s2>s1){\
return [0,1,2];\
}else{\
return [0,2,1];\
}}})")
      }
    } else {
      code.push("ORDER})")
    }
  }

  //view.set(i0, ..., v):
  code.push(
"proto.set=function "+className+"_set("+args.join(",")+",v){")
  if(useGetters) {
    code.push("return this.data.set("+index_str+",v)}")
  } else {
    code.push("return this.data["+index_str+"]=v}")
  }

  //view.get(i0, ...):
  code.push("proto.get=function "+className+"_get("+args.join(",")+"){")
  if(useGetters) {
    code.push("return this.data.get("+index_str+")}")
  } else {
    code.push("return this.data["+index_str+"]}")
  }

  //view.index:
  code.push(
    "proto.index=function "+className+"_index(", args.join(), "){return "+index_str+"}")

  //view.hi():
  code.push("proto.hi=function "+className+"_hi("+args.join(",")+"){return new "+className+"(this.data,"+
    indices.map(function(i) {
      return ["(typeof i",i,"!=='number'||i",i,"<0)?this.shape[", i, "]:i", i,"|0"].join("")
    }).join(",")+","+
    indices.map(function(i) {
      return "this.stride["+i + "]"
    }).join(",")+",this.offset)}")

  //view.lo():
  var a_vars = indices.map(function(i) { return "a"+i+"=this.shape["+i+"]" })
  var c_vars = indices.map(function(i) { return "c"+i+"=this.stride["+i+"]" })
  code.push("proto.lo=function "+className+"_lo("+args.join(",")+"){var b=this.offset,d=0,"+a_vars.join(",")+","+c_vars.join(","))
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'&&i"+i+">=0){\
d=i"+i+"|0;\
b+=c"+i+"*d;\
a"+i+"-=d}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a"+i
    }).join(",")+","+
    indices.map(function(i) {
      return "c"+i
    }).join(",")+",b)}")

  //view.step():
  code.push("proto.step=function "+className+"_step("+args.join(",")+"){var "+
    indices.map(function(i) {
      return "a"+i+"=this.shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "b"+i+"=this.stride["+i+"]"
    }).join(",")+",c=this.offset,d=0,ceil=Math.ceil")
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'){\
d=i"+i+"|0;\
if(d<0){\
c+=b"+i+"*(a"+i+"-1);\
a"+i+"=ceil(-a"+i+"/d)\
}else{\
a"+i+"=ceil(a"+i+"/d)\
}\
b"+i+"*=d\
}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a" + i
    }).join(",")+","+
    indices.map(function(i) {
      return "b" + i
    }).join(",")+",c)}")

  //view.transpose():
  var tShape = new Array(dimension)
  var tStride = new Array(dimension)
  for(var i=0; i<dimension; ++i) {
    tShape[i] = "a[i"+i+"]"
    tStride[i] = "b[i"+i+"]"
  }
  code.push("proto.transpose=function "+className+"_transpose("+args+"){"+
    args.map(function(n,idx) { return n + "=(" + n + "===undefined?" + idx + ":" + n + "|0)"}).join(";"),
    "var a=this.shape,b=this.stride;return new "+className+"(this.data,"+tShape.join(",")+","+tStride.join(",")+",this.offset)}")

  //view.pick():
  code.push("proto.pick=function "+className+"_pick("+args+"){var a=[],b=[],c=this.offset")
  for(var i=0; i<dimension; ++i) {
    code.push("if(typeof i"+i+"==='number'&&i"+i+">=0){c=(c+this.stride["+i+"]*i"+i+")|0}else{a.push(this.shape["+i+"]);b.push(this.stride["+i+"])}")
  }
  code.push("var ctor=CTOR_LIST[a.length+1];return ctor(this.data,a,b,c)}")

  //Add return statement
  code.push("return function construct_"+className+"(data,shape,stride,offset){return new "+className+"(data,"+
    indices.map(function(i) {
      return "shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "stride["+i+"]"
    }).join(",")+",offset)}")

  //Compile procedure
  var procedure = new Function("CTOR_LIST", "ORDER", code.join("\n"))
  return procedure(CACHED_CONSTRUCTORS[dtype], order)
}

function arrayDType(data) {
  if(isBuffer(data)) {
    return "buffer"
  }
  if(hasTypedArrays) {
    switch(Object.prototype.toString.call(data)) {
      case "[object Float64Array]":
        return "float64"
      case "[object Float32Array]":
        return "float32"
      case "[object Int8Array]":
        return "int8"
      case "[object Int16Array]":
        return "int16"
      case "[object Int32Array]":
        return "int32"
      case "[object Uint8Array]":
        return "uint8"
      case "[object Uint16Array]":
        return "uint16"
      case "[object Uint32Array]":
        return "uint32"
      case "[object Uint8ClampedArray]":
        return "uint8_clamped"
    }
  }
  if(Array.isArray(data)) {
    return "array"
  }
  return "generic"
}

var CACHED_CONSTRUCTORS = {
  "float32":[],
  "float64":[],
  "int8":[],
  "int16":[],
  "int32":[],
  "uint8":[],
  "uint16":[],
  "uint32":[],
  "array":[],
  "uint8_clamped":[],
  "buffer":[],
  "generic":[]
}

;(function() {
  for(var id in CACHED_CONSTRUCTORS) {
    CACHED_CONSTRUCTORS[id].push(compileConstructor(id, -1))
  }
});

function wrappedNDArrayCtor(data, shape, stride, offset) {
  if(data === undefined) {
    var ctor = CACHED_CONSTRUCTORS.array[0]
    return ctor([])
  } else if(typeof data === "number") {
    data = [data]
  }
  if(shape === undefined) {
    shape = [ data.length ]
  }
  var d = shape.length
  if(stride === undefined) {
    stride = new Array(d)
    for(var i=d-1, sz=1; i>=0; --i) {
      stride[i] = sz
      sz *= shape[i]
    }
  }
  if(offset === undefined) {
    offset = 0
    for(var i=0; i<d; ++i) {
      if(stride[i] < 0) {
        offset -= (shape[i]-1)*stride[i]
      }
    }
  }
  var dtype = arrayDType(data)
  var ctor_list = CACHED_CONSTRUCTORS[dtype]
  while(ctor_list.length <= d+1) {
    ctor_list.push(compileConstructor(dtype, ctor_list.length-1))
  }
  var ctor = ctor_list[d+1]
  return ctor(data, shape, stride, offset)
}

module.exports = wrappedNDArrayCtor

},{"iota-array":2,"is-buffer":3}],2:[function(require,module,exports){
"use strict"

function iota(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = i
  }
  return result
}

module.exports = iota
},{}],3:[function(require,module,exports){
/**
 * Determine if an object is Buffer
 *
 * Author:   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * License:  MIT
 *
 * `npm install is-buffer`
 */

module.exports = function (obj) {
  return !!(obj != null &&
    (obj._isBuffer || // For Safari 5-7 (missing Object.prototype.constructor)
      (obj.constructor &&
      typeof obj.constructor.isBuffer === 'function' &&
      obj.constructor.isBuffer(obj))
    ))
}

},{}],4:[function(require,module,exports){
(function (global){
var ndarray = require('ndarray');
var THREE = (typeof window !== "undefined" ? window['THREE'] : typeof global !== "undefined" ? global['THREE'] : null);

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
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./monotone":5,"ndarray":1}],5:[function(require,module,exports){
"use strict";

var MonotoneMesh = (function() {

  function MonotonePolygon(c, v, ul, ur) {
    this.color = c;
    this.left = [
      [ul, v]
    ];
    this.right = [
      [ur, v]
    ];
  };

  MonotonePolygon.prototype.close_off = function(v) {
    this.left.push([this.left[this.left.length - 1][0], v]);
    this.right.push([this.right[this.right.length - 1][0], v]);
  };

  MonotonePolygon.prototype.merge_run = function(v, u_l, u_r) {
    var l = this.left[this.left.length - 1][0],
      r = this.right[this.right.length - 1][0];
    if (l !== u_l) {
      this.left.push([l, v]);
      this.left.push([u_l, v]);
    }
    if (r !== u_r) {
      this.right.push([r, v]);
      this.right.push([u_r, v]);
    }
  };


  return function(chunk) {
    function f(i, j, k) {
      return chunk.get(i, j, k);
    };

    var dims = chunk.shape;

    //Sweep over 3-axes
    var vertices = [],
      faces = [];
    for (var d = 0; d < 3; ++d) {
      var i, j, k, u = (d + 1) % 3 //u and v are orthogonal directions to d
        ,
        v = (d + 2) % 3,
        x = new Int32Array(3),
        q = new Int32Array(3),
        runs = new Int32Array(2 * (dims[u] + 1)),
        frontier = new Int32Array(dims[u]) //Frontier is list of pointers to polygons
        ,
        next_frontier = new Int32Array(dims[u]),
        left_index = new Int32Array(2 * dims[v]),
        right_index = new Int32Array(2 * dims[v]),
        stack = new Int32Array(24 * dims[v]),
        delta = [
          [0, 0],
          [0, 0]
        ];
      //q points along d-direction
      q[d] = 1;
      //Initialize sentinel
      for (x[d] = -1; x[d] < dims[d];) {
        // --- Perform monotone polygon subdivision ---
        var n = 0,
          polygons = [],
          nf = 0;
        for (x[v] = 0; x[v] < dims[v]; ++x[v]) {
          //Make one pass over the u-scan line of the volume to run-length encode polygon
          var nr = 0,
            p = 0,
            c = 0;
          for (x[u] = 0; x[u] < dims[u]; ++x[u], p = c) {
            //Compute the type for this face
            var a = (0 <= x[d] ? f(x[0], x[1], x[2]) : 0),
              b = (x[d] < dims[d] - 1 ? f(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0);
            c = a;
            if ((!a) === (!b)) {
              c = 0;
            } else if (!a) {
              c = -b;
            }
            //If cell type doesn't match, start a new run
            if (p !== c) {
              runs[nr++] = x[u];
              runs[nr++] = c;
            }
          }
          //Add sentinel run
          runs[nr++] = dims[u];
          runs[nr++] = 0;
          //Update frontier by merging runs
          var fp = 0;
          for (var i = 0, j = 0; i < nf && j < nr - 2;) {
            var p = polygons[frontier[i]],
              p_l = p.left[p.left.length - 1][0],
              p_r = p.right[p.right.length - 1][0],
              p_c = p.color,
              r_l = runs[j] //Start of run
              ,
              r_r = runs[j + 2] //End of run
              ,
              r_c = runs[j + 1]; //Color of run
            //Check if we can merge run with polygon
            if (r_r > p_l && p_r > r_l && r_c === p_c) {
              //Merge run
              p.merge_run(x[v], r_l, r_r);
              //Insert polygon into frontier
              next_frontier[fp++] = frontier[i];
              ++i;
              j += 2;
            } else {
              //Check if we need to advance the run pointer
              if (r_r <= p_r) {
                if (!!r_c) {
                  var n_poly = new MonotonePolygon(r_c, x[v], r_l, r_r);
                  next_frontier[fp++] = polygons.length;
                  polygons.push(n_poly);
                }
                j += 2;
              }
              //Check if we need to advance the frontier pointer
              if (p_r <= r_r) {
                p.close_off(x[v]);
                ++i;
              }
            }
          }
          //Close off any residual polygons
          for (; i < nf; ++i) {
            polygons[frontier[i]].close_off(x[v]);
          }
          //Add any extra runs to frontier
          for (; j < nr - 2; j += 2) {
            var r_l = runs[j],
              r_r = runs[j + 2],
              r_c = runs[j + 1];
            if (!!r_c) {
              var n_poly = new MonotonePolygon(r_c, x[v], r_l, r_r);
              next_frontier[fp++] = polygons.length;
              polygons.push(n_poly);
            }
          }
          //Swap frontiers
          var tmp = next_frontier;
          next_frontier = frontier;
          frontier = tmp;
          nf = fp;
        }
        //Close off frontier
        for (var i = 0; i < nf; ++i) {
          var p = polygons[frontier[i]];
          p.close_off(dims[v]);
        }
        // --- Monotone subdivision of polygon is complete at this point ---

        x[d]++;

        //Now we just need to triangulate each monotone polygon
        for (var i = 0; i < polygons.length; ++i) {
          var p = polygons[i],
            c = p.color,
            flipped = false;
          if (c < 0) {
            flipped = true;
            c = -c;
          }
          for (var j = 0; j < p.left.length; ++j) {
            left_index[j] = vertices.length;
            var y = [0.0, 0.0, 0.0],
              z = p.left[j];
            y[d] = x[d];
            y[u] = z[0];
            y[v] = z[1];
            vertices.push(y);
          }
          for (var j = 0; j < p.right.length; ++j) {
            right_index[j] = vertices.length;
            var y = [0.0, 0.0, 0.0],
              z = p.right[j];
            y[d] = x[d];
            y[u] = z[0];
            y[v] = z[1];
            vertices.push(y);
          }
          //Triangulate the monotone polygon
          var bottom = 0,
            top = 0,
            l_i = 1,
            r_i = 1,
            side = true; //true = right, false = left

          stack[top++] = left_index[0];
          stack[top++] = p.left[0][0];
          stack[top++] = p.left[0][1];

          stack[top++] = right_index[0];
          stack[top++] = p.right[0][0];
          stack[top++] = p.right[0][1];

          while (l_i < p.left.length || r_i < p.right.length) {
            //Compute next side
            var n_side = false;
            if (l_i === p.left.length) {
              n_side = true;
            } else if (r_i !== p.right.length) {
              var l = p.left[l_i],
                r = p.right[r_i];
              n_side = l[1] > r[1];
            }
            var idx = n_side ? right_index[r_i] : left_index[l_i],
              vert = n_side ? p.right[r_i] : p.left[l_i];
            if (n_side !== side) {
              //Opposite side
              while (bottom + 3 < top) {
                if (flipped === n_side) {
                  faces.push([stack[bottom], stack[bottom + 3], idx, c]);
                } else {
                  faces.push([stack[bottom + 3], stack[bottom], idx, c]);
                }
                bottom += 3;
              }
            } else {
              //Same side
              while (bottom + 3 < top) {
                //Compute convexity
                for (var j = 0; j < 2; ++j)
                  for (var k = 0; k < 2; ++k) {
                    delta[j][k] = stack[top - 3 * (j + 1) + k + 1] - vert[k];
                  }
                var det = delta[0][0] * delta[1][1] - delta[1][0] * delta[0][1];
                if (n_side === (det > 0)) {
                  break;
                }
                if (det !== 0) {
                  if (flipped === n_side) {
                    faces.push([stack[top - 3], stack[top - 6], idx, c]);
                  } else {
                    faces.push([stack[top - 6], stack[top - 3], idx, c]);
                  }
                }
                top -= 3;
              }
            }
            //Push vertex
            stack[top++] = idx;
            stack[top++] = vert[0];
            stack[top++] = vert[1];
            //Update loop index
            if (n_side) {
              ++r_i;
            } else {
              ++l_i;
            }
            side = n_side;
          }
        }
      }
    }
    return { vertices: vertices, faces: faces };
  }
})();

if (exports) {
  exports.mesher = MonotoneMesh;
}
},{}],6:[function(require,module,exports){
(function (global){
var THREE = (typeof window !== "undefined" ? window['THREE'] : typeof global !== "undefined" ? global['THREE'] : null);

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
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],7:[function(require,module,exports){
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
},{}],8:[function(require,module,exports){
(function (global){
var THREE = (typeof window !== "undefined" ? window['THREE'] : typeof global !== "undefined" ? global['THREE'] : null);

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
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],9:[function(require,module,exports){
module.exports = function(app) {
  app.register('$window', window);
  app.register('$input', require('./systems/input'), true);

  app.attach('$input');
};
},{"./systems/input":12}],10:[function(require,module,exports){
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
},{"./bootstrap":9,"./injector":11}],11:[function(require,module,exports){
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
},{}],12:[function(require,module,exports){
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
},{"../utils/arrayutils":13}],13:[function(require,module,exports){
function includes(array, value) {
  for (var i = 0; i < array.length; i++) {
    if (array[i] === value) {
      return true;
    }
  }
  return false;
};

function remove(array, value) {
  for (var i = 0; i < array.length; i++) {
    if (array[i] === value) {
      array.splice(i, 1);
      return;
    }
  }
};

module.exports = {
  includes: includes,
  remove: remove
};
},{}],14:[function(require,module,exports){
(function (global){
var THREE = (typeof window !== "undefined" ? window['THREE'] : typeof global !== "undefined" ? global['THREE'] : null);

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
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./components/blocks":4,"./components/dragcamera":6,"./components/tree":7,"./components/worm":8,"./core/engine":10}]},{},[14])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbmRhcnJheS9uZGFycmF5LmpzIiwibm9kZV9tb2R1bGVzL25kYXJyYXkvbm9kZV9tb2R1bGVzL2lvdGEtYXJyYXkvaW90YS5qcyIsIm5vZGVfbW9kdWxlcy9uZGFycmF5L25vZGVfbW9kdWxlcy9pcy1idWZmZXIvaW5kZXguanMiLCJzcmMvY29tcG9uZW50cy9ibG9ja3MvaW5kZXguanMiLCJzcmMvY29tcG9uZW50cy9ibG9ja3MvbW9ub3RvbmUuanMiLCJzcmMvY29tcG9uZW50cy9kcmFnY2FtZXJhLmpzIiwic3JjL2NvbXBvbmVudHMvdHJlZS5qcyIsInNyYy9jb21wb25lbnRzL3dvcm0uanMiLCJzcmMvY29yZS9ib290c3RyYXAuanMiLCJzcmMvY29yZS9lbmdpbmUuanMiLCJzcmMvY29yZS9pbmplY3Rvci5qcyIsInNyYy9jb3JlL3N5c3RlbXMvaW5wdXQuanMiLCJzcmMvY29yZS91dGlscy9hcnJheXV0aWxzLmpzIiwic3JjL21haW4uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNoSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUMxUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDekdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBpb3RhID0gcmVxdWlyZShcImlvdGEtYXJyYXlcIilcbnZhciBpc0J1ZmZlciA9IHJlcXVpcmUoXCJpcy1idWZmZXJcIilcblxudmFyIGhhc1R5cGVkQXJyYXlzICA9ICgodHlwZW9mIEZsb2F0NjRBcnJheSkgIT09IFwidW5kZWZpbmVkXCIpXG5cbmZ1bmN0aW9uIGNvbXBhcmUxc3QoYSwgYikge1xuICByZXR1cm4gYVswXSAtIGJbMF1cbn1cblxuZnVuY3Rpb24gb3JkZXIoKSB7XG4gIHZhciBzdHJpZGUgPSB0aGlzLnN0cmlkZVxuICB2YXIgdGVybXMgPSBuZXcgQXJyYXkoc3RyaWRlLmxlbmd0aClcbiAgdmFyIGlcbiAgZm9yKGk9MDsgaTx0ZXJtcy5sZW5ndGg7ICsraSkge1xuICAgIHRlcm1zW2ldID0gW01hdGguYWJzKHN0cmlkZVtpXSksIGldXG4gIH1cbiAgdGVybXMuc29ydChjb21wYXJlMXN0KVxuICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KHRlcm1zLmxlbmd0aClcbiAgZm9yKGk9MDsgaTxyZXN1bHQubGVuZ3RoOyArK2kpIHtcbiAgICByZXN1bHRbaV0gPSB0ZXJtc1tpXVsxXVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gY29tcGlsZUNvbnN0cnVjdG9yKGR0eXBlLCBkaW1lbnNpb24pIHtcbiAgdmFyIGNsYXNzTmFtZSA9IFtcIlZpZXdcIiwgZGltZW5zaW9uLCBcImRcIiwgZHR5cGVdLmpvaW4oXCJcIilcbiAgaWYoZGltZW5zaW9uIDwgMCkge1xuICAgIGNsYXNzTmFtZSA9IFwiVmlld19OaWxcIiArIGR0eXBlXG4gIH1cbiAgdmFyIHVzZUdldHRlcnMgPSAoZHR5cGUgPT09IFwiZ2VuZXJpY1wiKVxuXG4gIGlmKGRpbWVuc2lvbiA9PT0gLTEpIHtcbiAgICAvL1NwZWNpYWwgY2FzZSBmb3IgdHJpdmlhbCBhcnJheXNcbiAgICB2YXIgY29kZSA9XG4gICAgICBcImZ1bmN0aW9uIFwiK2NsYXNzTmFtZStcIihhKXt0aGlzLmRhdGE9YTt9O1xcXG52YXIgcHJvdG89XCIrY2xhc3NOYW1lK1wiLnByb3RvdHlwZTtcXFxucHJvdG8uZHR5cGU9J1wiK2R0eXBlK1wiJztcXFxucHJvdG8uaW5kZXg9ZnVuY3Rpb24oKXtyZXR1cm4gLTF9O1xcXG5wcm90by5zaXplPTA7XFxcbnByb3RvLmRpbWVuc2lvbj0tMTtcXFxucHJvdG8uc2hhcGU9cHJvdG8uc3RyaWRlPXByb3RvLm9yZGVyPVtdO1xcXG5wcm90by5sbz1wcm90by5oaT1wcm90by50cmFuc3Bvc2U9cHJvdG8uc3RlcD1cXFxuZnVuY3Rpb24oKXtyZXR1cm4gbmV3IFwiK2NsYXNzTmFtZStcIih0aGlzLmRhdGEpO307XFxcbnByb3RvLmdldD1wcm90by5zZXQ9ZnVuY3Rpb24oKXt9O1xcXG5wcm90by5waWNrPWZ1bmN0aW9uKCl7cmV0dXJuIG51bGx9O1xcXG5yZXR1cm4gZnVuY3Rpb24gY29uc3RydWN0X1wiK2NsYXNzTmFtZStcIihhKXtyZXR1cm4gbmV3IFwiK2NsYXNzTmFtZStcIihhKTt9XCJcbiAgICB2YXIgcHJvY2VkdXJlID0gbmV3IEZ1bmN0aW9uKGNvZGUpXG4gICAgcmV0dXJuIHByb2NlZHVyZSgpXG4gIH0gZWxzZSBpZihkaW1lbnNpb24gPT09IDApIHtcbiAgICAvL1NwZWNpYWwgY2FzZSBmb3IgMGQgYXJyYXlzXG4gICAgdmFyIGNvZGUgPVxuICAgICAgXCJmdW5jdGlvbiBcIitjbGFzc05hbWUrXCIoYSxkKSB7XFxcbnRoaXMuZGF0YSA9IGE7XFxcbnRoaXMub2Zmc2V0ID0gZFxcXG59O1xcXG52YXIgcHJvdG89XCIrY2xhc3NOYW1lK1wiLnByb3RvdHlwZTtcXFxucHJvdG8uZHR5cGU9J1wiK2R0eXBlK1wiJztcXFxucHJvdG8uaW5kZXg9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5vZmZzZXR9O1xcXG5wcm90by5kaW1lbnNpb249MDtcXFxucHJvdG8uc2l6ZT0xO1xcXG5wcm90by5zaGFwZT1cXFxucHJvdG8uc3RyaWRlPVxcXG5wcm90by5vcmRlcj1bXTtcXFxucHJvdG8ubG89XFxcbnByb3RvLmhpPVxcXG5wcm90by50cmFuc3Bvc2U9XFxcbnByb3RvLnN0ZXA9ZnVuY3Rpb24gXCIrY2xhc3NOYW1lK1wiX2NvcHkoKSB7XFxcbnJldHVybiBuZXcgXCIrY2xhc3NOYW1lK1wiKHRoaXMuZGF0YSx0aGlzLm9mZnNldClcXFxufTtcXFxucHJvdG8ucGljaz1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfcGljaygpe1xcXG5yZXR1cm4gVHJpdmlhbEFycmF5KHRoaXMuZGF0YSk7XFxcbn07XFxcbnByb3RvLnZhbHVlT2Y9cHJvdG8uZ2V0PWZ1bmN0aW9uIFwiK2NsYXNzTmFtZStcIl9nZXQoKXtcXFxucmV0dXJuIFwiKyh1c2VHZXR0ZXJzID8gXCJ0aGlzLmRhdGEuZ2V0KHRoaXMub2Zmc2V0KVwiIDogXCJ0aGlzLmRhdGFbdGhpcy5vZmZzZXRdXCIpK1xuXCJ9O1xcXG5wcm90by5zZXQ9ZnVuY3Rpb24gXCIrY2xhc3NOYW1lK1wiX3NldCh2KXtcXFxucmV0dXJuIFwiKyh1c2VHZXR0ZXJzID8gXCJ0aGlzLmRhdGEuc2V0KHRoaXMub2Zmc2V0LHYpXCIgOiBcInRoaXMuZGF0YVt0aGlzLm9mZnNldF09dlwiKStcIlxcXG59O1xcXG5yZXR1cm4gZnVuY3Rpb24gY29uc3RydWN0X1wiK2NsYXNzTmFtZStcIihhLGIsYyxkKXtyZXR1cm4gbmV3IFwiK2NsYXNzTmFtZStcIihhLGQpfVwiXG4gICAgdmFyIHByb2NlZHVyZSA9IG5ldyBGdW5jdGlvbihcIlRyaXZpYWxBcnJheVwiLCBjb2RlKVxuICAgIHJldHVybiBwcm9jZWR1cmUoQ0FDSEVEX0NPTlNUUlVDVE9SU1tkdHlwZV1bMF0pXG4gIH1cblxuICB2YXIgY29kZSA9IFtcIid1c2Ugc3RyaWN0J1wiXVxuXG4gIC8vQ3JlYXRlIGNvbnN0cnVjdG9yIGZvciB2aWV3XG4gIHZhciBpbmRpY2VzID0gaW90YShkaW1lbnNpb24pXG4gIHZhciBhcmdzID0gaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkgeyByZXR1cm4gXCJpXCIraSB9KVxuICB2YXIgaW5kZXhfc3RyID0gXCJ0aGlzLm9mZnNldCtcIiArIGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgICAgcmV0dXJuIFwidGhpcy5zdHJpZGVbXCIgKyBpICsgXCJdKmlcIiArIGlcbiAgICAgIH0pLmpvaW4oXCIrXCIpXG4gIHZhciBzaGFwZUFyZyA9IGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgIHJldHVybiBcImJcIitpXG4gICAgfSkuam9pbihcIixcIilcbiAgdmFyIHN0cmlkZUFyZyA9IGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgIHJldHVybiBcImNcIitpXG4gICAgfSkuam9pbihcIixcIilcbiAgY29kZS5wdXNoKFxuICAgIFwiZnVuY3Rpb24gXCIrY2xhc3NOYW1lK1wiKGEsXCIgKyBzaGFwZUFyZyArIFwiLFwiICsgc3RyaWRlQXJnICsgXCIsZCl7dGhpcy5kYXRhPWFcIixcbiAgICAgIFwidGhpcy5zaGFwZT1bXCIgKyBzaGFwZUFyZyArIFwiXVwiLFxuICAgICAgXCJ0aGlzLnN0cmlkZT1bXCIgKyBzdHJpZGVBcmcgKyBcIl1cIixcbiAgICAgIFwidGhpcy5vZmZzZXQ9ZHwwfVwiLFxuICAgIFwidmFyIHByb3RvPVwiK2NsYXNzTmFtZStcIi5wcm90b3R5cGVcIixcbiAgICBcInByb3RvLmR0eXBlPSdcIitkdHlwZStcIidcIixcbiAgICBcInByb3RvLmRpbWVuc2lvbj1cIitkaW1lbnNpb24pXG5cbiAgLy92aWV3LnNpemU6XG4gIGNvZGUucHVzaChcIk9iamVjdC5kZWZpbmVQcm9wZXJ0eShwcm90bywnc2l6ZScse2dldDpmdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfc2l6ZSgpe1xcXG5yZXR1cm4gXCIraW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkgeyByZXR1cm4gXCJ0aGlzLnNoYXBlW1wiK2krXCJdXCIgfSkuam9pbihcIipcIiksXG5cIn19KVwiKVxuXG4gIC8vdmlldy5vcmRlcjpcbiAgaWYoZGltZW5zaW9uID09PSAxKSB7XG4gICAgY29kZS5wdXNoKFwicHJvdG8ub3JkZXI9WzBdXCIpXG4gIH0gZWxzZSB7XG4gICAgY29kZS5wdXNoKFwiT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb3RvLCdvcmRlcicse2dldDpcIilcbiAgICBpZihkaW1lbnNpb24gPCA0KSB7XG4gICAgICBjb2RlLnB1c2goXCJmdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfb3JkZXIoKXtcIilcbiAgICAgIGlmKGRpbWVuc2lvbiA9PT0gMikge1xuICAgICAgICBjb2RlLnB1c2goXCJyZXR1cm4gKE1hdGguYWJzKHRoaXMuc3RyaWRlWzBdKT5NYXRoLmFicyh0aGlzLnN0cmlkZVsxXSkpP1sxLDBdOlswLDFdfX0pXCIpXG4gICAgICB9IGVsc2UgaWYoZGltZW5zaW9uID09PSAzKSB7XG4gICAgICAgIGNvZGUucHVzaChcblwidmFyIHMwPU1hdGguYWJzKHRoaXMuc3RyaWRlWzBdKSxzMT1NYXRoLmFicyh0aGlzLnN0cmlkZVsxXSksczI9TWF0aC5hYnModGhpcy5zdHJpZGVbMl0pO1xcXG5pZihzMD5zMSl7XFxcbmlmKHMxPnMyKXtcXFxucmV0dXJuIFsyLDEsMF07XFxcbn1lbHNlIGlmKHMwPnMyKXtcXFxucmV0dXJuIFsxLDIsMF07XFxcbn1lbHNle1xcXG5yZXR1cm4gWzEsMCwyXTtcXFxufVxcXG59ZWxzZSBpZihzMD5zMil7XFxcbnJldHVybiBbMiwwLDFdO1xcXG59ZWxzZSBpZihzMj5zMSl7XFxcbnJldHVybiBbMCwxLDJdO1xcXG59ZWxzZXtcXFxucmV0dXJuIFswLDIsMV07XFxcbn19fSlcIilcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29kZS5wdXNoKFwiT1JERVJ9KVwiKVxuICAgIH1cbiAgfVxuXG4gIC8vdmlldy5zZXQoaTAsIC4uLiwgdik6XG4gIGNvZGUucHVzaChcblwicHJvdG8uc2V0PWZ1bmN0aW9uIFwiK2NsYXNzTmFtZStcIl9zZXQoXCIrYXJncy5qb2luKFwiLFwiKStcIix2KXtcIilcbiAgaWYodXNlR2V0dGVycykge1xuICAgIGNvZGUucHVzaChcInJldHVybiB0aGlzLmRhdGEuc2V0KFwiK2luZGV4X3N0citcIix2KX1cIilcbiAgfSBlbHNlIHtcbiAgICBjb2RlLnB1c2goXCJyZXR1cm4gdGhpcy5kYXRhW1wiK2luZGV4X3N0citcIl09dn1cIilcbiAgfVxuXG4gIC8vdmlldy5nZXQoaTAsIC4uLik6XG4gIGNvZGUucHVzaChcInByb3RvLmdldD1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfZ2V0KFwiK2FyZ3Muam9pbihcIixcIikrXCIpe1wiKVxuICBpZih1c2VHZXR0ZXJzKSB7XG4gICAgY29kZS5wdXNoKFwicmV0dXJuIHRoaXMuZGF0YS5nZXQoXCIraW5kZXhfc3RyK1wiKX1cIilcbiAgfSBlbHNlIHtcbiAgICBjb2RlLnB1c2goXCJyZXR1cm4gdGhpcy5kYXRhW1wiK2luZGV4X3N0citcIl19XCIpXG4gIH1cblxuICAvL3ZpZXcuaW5kZXg6XG4gIGNvZGUucHVzaChcbiAgICBcInByb3RvLmluZGV4PWZ1bmN0aW9uIFwiK2NsYXNzTmFtZStcIl9pbmRleChcIiwgYXJncy5qb2luKCksIFwiKXtyZXR1cm4gXCIraW5kZXhfc3RyK1wifVwiKVxuXG4gIC8vdmlldy5oaSgpOlxuICBjb2RlLnB1c2goXCJwcm90by5oaT1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfaGkoXCIrYXJncy5qb2luKFwiLFwiKStcIil7cmV0dXJuIG5ldyBcIitjbGFzc05hbWUrXCIodGhpcy5kYXRhLFwiK1xuICAgIGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgIHJldHVybiBbXCIodHlwZW9mIGlcIixpLFwiIT09J251bWJlcid8fGlcIixpLFwiPDApP3RoaXMuc2hhcGVbXCIsIGksIFwiXTppXCIsIGksXCJ8MFwiXS5qb2luKFwiXCIpXG4gICAgfSkuam9pbihcIixcIikrXCIsXCIrXG4gICAgaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIFwidGhpcy5zdHJpZGVbXCIraSArIFwiXVwiXG4gICAgfSkuam9pbihcIixcIikrXCIsdGhpcy5vZmZzZXQpfVwiKVxuXG4gIC8vdmlldy5sbygpOlxuICB2YXIgYV92YXJzID0gaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkgeyByZXR1cm4gXCJhXCIraStcIj10aGlzLnNoYXBlW1wiK2krXCJdXCIgfSlcbiAgdmFyIGNfdmFycyA9IGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHsgcmV0dXJuIFwiY1wiK2krXCI9dGhpcy5zdHJpZGVbXCIraStcIl1cIiB9KVxuICBjb2RlLnB1c2goXCJwcm90by5sbz1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfbG8oXCIrYXJncy5qb2luKFwiLFwiKStcIil7dmFyIGI9dGhpcy5vZmZzZXQsZD0wLFwiK2FfdmFycy5qb2luKFwiLFwiKStcIixcIitjX3ZhcnMuam9pbihcIixcIikpXG4gIGZvcih2YXIgaT0wOyBpPGRpbWVuc2lvbjsgKytpKSB7XG4gICAgY29kZS5wdXNoKFxuXCJpZih0eXBlb2YgaVwiK2krXCI9PT0nbnVtYmVyJyYmaVwiK2krXCI+PTApe1xcXG5kPWlcIitpK1wifDA7XFxcbmIrPWNcIitpK1wiKmQ7XFxcbmFcIitpK1wiLT1kfVwiKVxuICB9XG4gIGNvZGUucHVzaChcInJldHVybiBuZXcgXCIrY2xhc3NOYW1lK1wiKHRoaXMuZGF0YSxcIitcbiAgICBpbmRpY2VzLm1hcChmdW5jdGlvbihpKSB7XG4gICAgICByZXR1cm4gXCJhXCIraVxuICAgIH0pLmpvaW4oXCIsXCIpK1wiLFwiK1xuICAgIGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgIHJldHVybiBcImNcIitpXG4gICAgfSkuam9pbihcIixcIikrXCIsYil9XCIpXG5cbiAgLy92aWV3LnN0ZXAoKTpcbiAgY29kZS5wdXNoKFwicHJvdG8uc3RlcD1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfc3RlcChcIithcmdzLmpvaW4oXCIsXCIpK1wiKXt2YXIgXCIrXG4gICAgaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIFwiYVwiK2krXCI9dGhpcy5zaGFwZVtcIitpK1wiXVwiXG4gICAgfSkuam9pbihcIixcIikrXCIsXCIrXG4gICAgaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIFwiYlwiK2krXCI9dGhpcy5zdHJpZGVbXCIraStcIl1cIlxuICAgIH0pLmpvaW4oXCIsXCIpK1wiLGM9dGhpcy5vZmZzZXQsZD0wLGNlaWw9TWF0aC5jZWlsXCIpXG4gIGZvcih2YXIgaT0wOyBpPGRpbWVuc2lvbjsgKytpKSB7XG4gICAgY29kZS5wdXNoKFxuXCJpZih0eXBlb2YgaVwiK2krXCI9PT0nbnVtYmVyJyl7XFxcbmQ9aVwiK2krXCJ8MDtcXFxuaWYoZDwwKXtcXFxuYys9YlwiK2krXCIqKGFcIitpK1wiLTEpO1xcXG5hXCIraStcIj1jZWlsKC1hXCIraStcIi9kKVxcXG59ZWxzZXtcXFxuYVwiK2krXCI9Y2VpbChhXCIraStcIi9kKVxcXG59XFxcbmJcIitpK1wiKj1kXFxcbn1cIilcbiAgfVxuICBjb2RlLnB1c2goXCJyZXR1cm4gbmV3IFwiK2NsYXNzTmFtZStcIih0aGlzLmRhdGEsXCIrXG4gICAgaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIFwiYVwiICsgaVxuICAgIH0pLmpvaW4oXCIsXCIpK1wiLFwiK1xuICAgIGluZGljZXMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgIHJldHVybiBcImJcIiArIGlcbiAgICB9KS5qb2luKFwiLFwiKStcIixjKX1cIilcblxuICAvL3ZpZXcudHJhbnNwb3NlKCk6XG4gIHZhciB0U2hhcGUgPSBuZXcgQXJyYXkoZGltZW5zaW9uKVxuICB2YXIgdFN0cmlkZSA9IG5ldyBBcnJheShkaW1lbnNpb24pXG4gIGZvcih2YXIgaT0wOyBpPGRpbWVuc2lvbjsgKytpKSB7XG4gICAgdFNoYXBlW2ldID0gXCJhW2lcIitpK1wiXVwiXG4gICAgdFN0cmlkZVtpXSA9IFwiYltpXCIraStcIl1cIlxuICB9XG4gIGNvZGUucHVzaChcInByb3RvLnRyYW5zcG9zZT1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfdHJhbnNwb3NlKFwiK2FyZ3MrXCIpe1wiK1xuICAgIGFyZ3MubWFwKGZ1bmN0aW9uKG4saWR4KSB7IHJldHVybiBuICsgXCI9KFwiICsgbiArIFwiPT09dW5kZWZpbmVkP1wiICsgaWR4ICsgXCI6XCIgKyBuICsgXCJ8MClcIn0pLmpvaW4oXCI7XCIpLFxuICAgIFwidmFyIGE9dGhpcy5zaGFwZSxiPXRoaXMuc3RyaWRlO3JldHVybiBuZXcgXCIrY2xhc3NOYW1lK1wiKHRoaXMuZGF0YSxcIit0U2hhcGUuam9pbihcIixcIikrXCIsXCIrdFN0cmlkZS5qb2luKFwiLFwiKStcIix0aGlzLm9mZnNldCl9XCIpXG5cbiAgLy92aWV3LnBpY2soKTpcbiAgY29kZS5wdXNoKFwicHJvdG8ucGljaz1mdW5jdGlvbiBcIitjbGFzc05hbWUrXCJfcGljayhcIithcmdzK1wiKXt2YXIgYT1bXSxiPVtdLGM9dGhpcy5vZmZzZXRcIilcbiAgZm9yKHZhciBpPTA7IGk8ZGltZW5zaW9uOyArK2kpIHtcbiAgICBjb2RlLnB1c2goXCJpZih0eXBlb2YgaVwiK2krXCI9PT0nbnVtYmVyJyYmaVwiK2krXCI+PTApe2M9KGMrdGhpcy5zdHJpZGVbXCIraStcIl0qaVwiK2krXCIpfDB9ZWxzZXthLnB1c2godGhpcy5zaGFwZVtcIitpK1wiXSk7Yi5wdXNoKHRoaXMuc3RyaWRlW1wiK2krXCJdKX1cIilcbiAgfVxuICBjb2RlLnB1c2goXCJ2YXIgY3Rvcj1DVE9SX0xJU1RbYS5sZW5ndGgrMV07cmV0dXJuIGN0b3IodGhpcy5kYXRhLGEsYixjKX1cIilcblxuICAvL0FkZCByZXR1cm4gc3RhdGVtZW50XG4gIGNvZGUucHVzaChcInJldHVybiBmdW5jdGlvbiBjb25zdHJ1Y3RfXCIrY2xhc3NOYW1lK1wiKGRhdGEsc2hhcGUsc3RyaWRlLG9mZnNldCl7cmV0dXJuIG5ldyBcIitjbGFzc05hbWUrXCIoZGF0YSxcIitcbiAgICBpbmRpY2VzLm1hcChmdW5jdGlvbihpKSB7XG4gICAgICByZXR1cm4gXCJzaGFwZVtcIitpK1wiXVwiXG4gICAgfSkuam9pbihcIixcIikrXCIsXCIrXG4gICAgaW5kaWNlcy5tYXAoZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIFwic3RyaWRlW1wiK2krXCJdXCJcbiAgICB9KS5qb2luKFwiLFwiKStcIixvZmZzZXQpfVwiKVxuXG4gIC8vQ29tcGlsZSBwcm9jZWR1cmVcbiAgdmFyIHByb2NlZHVyZSA9IG5ldyBGdW5jdGlvbihcIkNUT1JfTElTVFwiLCBcIk9SREVSXCIsIGNvZGUuam9pbihcIlxcblwiKSlcbiAgcmV0dXJuIHByb2NlZHVyZShDQUNIRURfQ09OU1RSVUNUT1JTW2R0eXBlXSwgb3JkZXIpXG59XG5cbmZ1bmN0aW9uIGFycmF5RFR5cGUoZGF0YSkge1xuICBpZihpc0J1ZmZlcihkYXRhKSkge1xuICAgIHJldHVybiBcImJ1ZmZlclwiXG4gIH1cbiAgaWYoaGFzVHlwZWRBcnJheXMpIHtcbiAgICBzd2l0Y2goT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpKSB7XG4gICAgICBjYXNlIFwiW29iamVjdCBGbG9hdDY0QXJyYXldXCI6XG4gICAgICAgIHJldHVybiBcImZsb2F0NjRcIlxuICAgICAgY2FzZSBcIltvYmplY3QgRmxvYXQzMkFycmF5XVwiOlxuICAgICAgICByZXR1cm4gXCJmbG9hdDMyXCJcbiAgICAgIGNhc2UgXCJbb2JqZWN0IEludDhBcnJheV1cIjpcbiAgICAgICAgcmV0dXJuIFwiaW50OFwiXG4gICAgICBjYXNlIFwiW29iamVjdCBJbnQxNkFycmF5XVwiOlxuICAgICAgICByZXR1cm4gXCJpbnQxNlwiXG4gICAgICBjYXNlIFwiW29iamVjdCBJbnQzMkFycmF5XVwiOlxuICAgICAgICByZXR1cm4gXCJpbnQzMlwiXG4gICAgICBjYXNlIFwiW29iamVjdCBVaW50OEFycmF5XVwiOlxuICAgICAgICByZXR1cm4gXCJ1aW50OFwiXG4gICAgICBjYXNlIFwiW29iamVjdCBVaW50MTZBcnJheV1cIjpcbiAgICAgICAgcmV0dXJuIFwidWludDE2XCJcbiAgICAgIGNhc2UgXCJbb2JqZWN0IFVpbnQzMkFycmF5XVwiOlxuICAgICAgICByZXR1cm4gXCJ1aW50MzJcIlxuICAgICAgY2FzZSBcIltvYmplY3QgVWludDhDbGFtcGVkQXJyYXldXCI6XG4gICAgICAgIHJldHVybiBcInVpbnQ4X2NsYW1wZWRcIlxuICAgIH1cbiAgfVxuICBpZihBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgcmV0dXJuIFwiYXJyYXlcIlxuICB9XG4gIHJldHVybiBcImdlbmVyaWNcIlxufVxuXG52YXIgQ0FDSEVEX0NPTlNUUlVDVE9SUyA9IHtcbiAgXCJmbG9hdDMyXCI6W10sXG4gIFwiZmxvYXQ2NFwiOltdLFxuICBcImludDhcIjpbXSxcbiAgXCJpbnQxNlwiOltdLFxuICBcImludDMyXCI6W10sXG4gIFwidWludDhcIjpbXSxcbiAgXCJ1aW50MTZcIjpbXSxcbiAgXCJ1aW50MzJcIjpbXSxcbiAgXCJhcnJheVwiOltdLFxuICBcInVpbnQ4X2NsYW1wZWRcIjpbXSxcbiAgXCJidWZmZXJcIjpbXSxcbiAgXCJnZW5lcmljXCI6W11cbn1cblxuOyhmdW5jdGlvbigpIHtcbiAgZm9yKHZhciBpZCBpbiBDQUNIRURfQ09OU1RSVUNUT1JTKSB7XG4gICAgQ0FDSEVEX0NPTlNUUlVDVE9SU1tpZF0ucHVzaChjb21waWxlQ29uc3RydWN0b3IoaWQsIC0xKSlcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIHdyYXBwZWROREFycmF5Q3RvcihkYXRhLCBzaGFwZSwgc3RyaWRlLCBvZmZzZXQpIHtcbiAgaWYoZGF0YSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdmFyIGN0b3IgPSBDQUNIRURfQ09OU1RSVUNUT1JTLmFycmF5WzBdXG4gICAgcmV0dXJuIGN0b3IoW10pXG4gIH0gZWxzZSBpZih0eXBlb2YgZGF0YSA9PT0gXCJudW1iZXJcIikge1xuICAgIGRhdGEgPSBbZGF0YV1cbiAgfVxuICBpZihzaGFwZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgc2hhcGUgPSBbIGRhdGEubGVuZ3RoIF1cbiAgfVxuICB2YXIgZCA9IHNoYXBlLmxlbmd0aFxuICBpZihzdHJpZGUgPT09IHVuZGVmaW5lZCkge1xuICAgIHN0cmlkZSA9IG5ldyBBcnJheShkKVxuICAgIGZvcih2YXIgaT1kLTEsIHN6PTE7IGk+PTA7IC0taSkge1xuICAgICAgc3RyaWRlW2ldID0gc3pcbiAgICAgIHN6ICo9IHNoYXBlW2ldXG4gICAgfVxuICB9XG4gIGlmKG9mZnNldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgb2Zmc2V0ID0gMFxuICAgIGZvcih2YXIgaT0wOyBpPGQ7ICsraSkge1xuICAgICAgaWYoc3RyaWRlW2ldIDwgMCkge1xuICAgICAgICBvZmZzZXQgLT0gKHNoYXBlW2ldLTEpKnN0cmlkZVtpXVxuICAgICAgfVxuICAgIH1cbiAgfVxuICB2YXIgZHR5cGUgPSBhcnJheURUeXBlKGRhdGEpXG4gIHZhciBjdG9yX2xpc3QgPSBDQUNIRURfQ09OU1RSVUNUT1JTW2R0eXBlXVxuICB3aGlsZShjdG9yX2xpc3QubGVuZ3RoIDw9IGQrMSkge1xuICAgIGN0b3JfbGlzdC5wdXNoKGNvbXBpbGVDb25zdHJ1Y3RvcihkdHlwZSwgY3Rvcl9saXN0Lmxlbmd0aC0xKSlcbiAgfVxuICB2YXIgY3RvciA9IGN0b3JfbGlzdFtkKzFdXG4gIHJldHVybiBjdG9yKGRhdGEsIHNoYXBlLCBzdHJpZGUsIG9mZnNldClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB3cmFwcGVkTkRBcnJheUN0b3JcbiIsIlwidXNlIHN0cmljdFwiXG5cbmZ1bmN0aW9uIGlvdGEobikge1xuICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KG4pXG4gIGZvcih2YXIgaT0wOyBpPG47ICsraSkge1xuICAgIHJlc3VsdFtpXSA9IGlcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaW90YSIsIi8qKlxuICogRGV0ZXJtaW5lIGlmIGFuIG9iamVjdCBpcyBCdWZmZXJcbiAqXG4gKiBBdXRob3I6ICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIExpY2Vuc2U6ICBNSVRcbiAqXG4gKiBgbnBtIGluc3RhbGwgaXMtYnVmZmVyYFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gISEob2JqICE9IG51bGwgJiZcbiAgICAob2JqLl9pc0J1ZmZlciB8fCAvLyBGb3IgU2FmYXJpIDUtNyAobWlzc2luZyBPYmplY3QucHJvdG90eXBlLmNvbnN0cnVjdG9yKVxuICAgICAgKG9iai5jb25zdHJ1Y3RvciAmJlxuICAgICAgdHlwZW9mIG9iai5jb25zdHJ1Y3Rvci5pc0J1ZmZlciA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgb2JqLmNvbnN0cnVjdG9yLmlzQnVmZmVyKG9iaikpXG4gICAgKSlcbn1cbiIsInZhciBuZGFycmF5ID0gcmVxdWlyZSgnbmRhcnJheScpO1xudmFyIFRIUkVFID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ1RIUkVFJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydUSFJFRSddIDogbnVsbCk7XG5cbnZhciBtZXNoZXIgPSByZXF1aXJlKCcuL21vbm90b25lJykubWVzaGVyO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9iamVjdCkge1xuXG4gIHZhciBjaHVua3MgPSB7fTtcblxuICBmdW5jdGlvbiBzZXQoeCwgeSwgeiwgdikge1xuICAgIHZhciBvcmlnaW4gPSBnZXRPcmlnaW4oeCwgeSwgeik7XG4gICAgdmFyIGlkID0gb3JpZ2luLnRvQXJyYXkoKS5qb2luKCcsJyk7XG4gICAgaWYgKGNodW5rc1tpZF0gPT0gbnVsbCkge1xuICAgICAgdmFyIGNodW5rID0gbmRhcnJheShbXSwgW3NlbGYuY2h1bmtTaXplLCBzZWxmLmNodW5rU2l6ZSwgc2VsZi5jaHVua1NpemVdKTtcbiAgICAgIGNodW5rc1tpZF0gPSB7XG4gICAgICAgIGNodW5rOiBjaHVuayxcbiAgICAgICAgb3JpZ2luOiBvcmlnaW5cbiAgICAgIH07XG4gICAgfVxuXG4gICAgY2h1bmtzW2lkXS5jaHVuay5zZXQoeCAtIG9yaWdpbi54LCB5IC0gb3JpZ2luLnksIHogLSBvcmlnaW4ueiwgdik7XG4gICAgY2h1bmtzW2lkXS5kaXJ0eSA9IHRydWU7XG4gIH07XG5cbiAgZnVuY3Rpb24gZ2V0KHgsIHksIHopIHtcbiAgICB2YXIgb3JpZ2luID0gZ2V0T3JpZ2luKHgsIHksIHopO1xuICAgIHZhciBpZCA9IG9yaWdpbi50b0FycmF5KCkuam9pbignLCcpO1xuICAgIGlmIChjaHVua3NbaWRdID09IG51bGwpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBjaHVua3NbaWRdLmNodW5rLmdldCh4IC0gb3JpZ2luLngsIHkgLSBvcmlnaW4ueSwgeiAtIG9yaWdpbi56KTtcbiAgfTtcblxuICBmdW5jdGlvbiBzZXRBdENvb3JkKGNvb3JkLCB2KSB7XG4gICAgc2V0KGNvb3JkLngsIGNvb3JkLnksIGNvb3JkLnosIHYpO1xuICB9O1xuXG4gIGZ1bmN0aW9uIGdldEF0Q29vcmQoY29vcmQpIHtcbiAgICByZXR1cm4gZ2V0KGNvb3JkLngsIGNvb3JkLnksIGNvb3JkLnopO1xuICB9O1xuXG4gIGZ1bmN0aW9uIGdldE9yaWdpbih4LCB5LCB6KSB7XG4gICAgcmV0dXJuIG5ldyBUSFJFRS5WZWN0b3IzKFxuICAgICAgTWF0aC5mbG9vcih4IC8gc2VsZi5jaHVua1NpemUpLFxuICAgICAgTWF0aC5mbG9vcih5IC8gc2VsZi5jaHVua1NpemUpLFxuICAgICAgTWF0aC5mbG9vcih6IC8gc2VsZi5jaHVua1NpemUpXG4gICAgKS5tdWx0aXBseVNjYWxhcihzZWxmLmNodW5rU2l6ZSk7XG4gIH07XG5cbiAgZnVuY3Rpb24gdGljayhkdCkge1xuICAgIGZvciAodmFyIGlkIGluIGNodW5rcykge1xuICAgICAgaWYgKGNodW5rc1tpZF0uZGlydHkpIHtcbiAgICAgICAgdXBkYXRlTWVzaChjaHVua3NbaWRdKTtcbiAgICAgICAgY2h1bmtzW2lkXS5kaXJ0eSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBmdW5jdGlvbiB1cGRhdGVNZXNoKG1hcCkge1xuICAgIHZhciBtZXNoID0gbWFwLm1lc2g7XG5cbiAgICBpZiAobWVzaCAhPSBudWxsKSB7XG4gICAgICBtZXNoLnBhcmVudC5yZW1vdmUobWVzaCk7XG4gICAgICBtZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICB9XG5cbiAgICB2YXIgcmVzdWx0ID0gbWVzaGVyKG1hcC5jaHVuayk7XG5cbiAgICB2YXIgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuR2VvbWV0cnkoKTtcbiAgICByZXN1bHQudmVydGljZXMuZm9yRWFjaChmdW5jdGlvbih2KSB7XG4gICAgICB2YXIgdmVydGljZSA9IG5ldyBUSFJFRS5WZWN0b3IzKHZbMF0sIHZbMV0sIHZbMl0pO1xuICAgICAgdmVydGljZS5tdWx0aXBseVNjYWxhcihzZWxmLnNjYWxlKTtcbiAgICAgIGdlb21ldHJ5LnZlcnRpY2VzLnB1c2godmVydGljZSk7XG4gICAgfSk7XG5cbiAgICByZXN1bHQuZmFjZXMuZm9yRWFjaChmdW5jdGlvbihmKSB7XG4gICAgICB2YXIgZmFjZSA9IG5ldyBUSFJFRS5GYWNlMyhmWzBdLCBmWzFdLCBmWzJdKTtcbiAgICAgIGZhY2UuY29sb3IgPSBuZXcgVEhSRUUuQ29sb3Ioc2VsZi5wYWxldHRlW2ZbM11dKTtcbiAgICAgIGdlb21ldHJ5LmZhY2VzLnB1c2goZmFjZSk7XG4gICAgfSk7XG5cbiAgICBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIHNlbGYubWF0ZXJpYWwpO1xuXG4gICAgbWVzaC5wb3NpdGlvbi5jb3B5KG1hcC5vcmlnaW4uY2xvbmUoKS5tdWx0aXBseVNjYWxhcihzZWxmLnNjYWxlKSk7XG5cbiAgICBtYXAubWVzaCA9IG1lc2g7XG5cbiAgICBzZWxmLm9iamVjdC5hZGQobWVzaCk7XG4gIH07XG5cbiAgdmFyIHNlbGYgPSB7XG4gICAgdGljazogdGljayxcbiAgICBwYWxldHRlOiBbbnVsbCwgMHhmZmZmZmYsIDB4NjY2NjY2XSxcbiAgICBzY2FsZTogMS4wLFxuICAgIGNodW5rU2l6ZTogMTYsXG4gICAgbWF0ZXJpYWw6IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XG4gICAgICB2ZXJ0ZXhDb2xvcnM6IFRIUkVFLkZhY2VDb2xvcnNcbiAgICB9KSxcbiAgICBzZXQ6IHNldCxcbiAgICBnZXQ6IGdldCxcbiAgICBzZXRBdENvb3JkOiBzZXRBdENvb3JkLFxuICAgIGdldEF0Q29vcmQ6IGdldEF0Q29vcmQsXG4gICAgb2JqZWN0OiBuZXcgVEhSRUUuT2JqZWN0M0QoKVxuICB9O1xuXG4gIG9iamVjdC5hZGQoc2VsZi5vYmplY3QpO1xuXG4gIHJldHVybiBzZWxmO1xuXG59O1xuXG5tb2R1bGUuZXhwb3J0cy4kaW5qZWN0ID0gWyckc2NvcGUnXTsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIE1vbm90b25lTWVzaCA9IChmdW5jdGlvbigpIHtcblxuICBmdW5jdGlvbiBNb25vdG9uZVBvbHlnb24oYywgdiwgdWwsIHVyKSB7XG4gICAgdGhpcy5jb2xvciA9IGM7XG4gICAgdGhpcy5sZWZ0ID0gW1xuICAgICAgW3VsLCB2XVxuICAgIF07XG4gICAgdGhpcy5yaWdodCA9IFtcbiAgICAgIFt1ciwgdl1cbiAgICBdO1xuICB9O1xuXG4gIE1vbm90b25lUG9seWdvbi5wcm90b3R5cGUuY2xvc2Vfb2ZmID0gZnVuY3Rpb24odikge1xuICAgIHRoaXMubGVmdC5wdXNoKFt0aGlzLmxlZnRbdGhpcy5sZWZ0Lmxlbmd0aCAtIDFdWzBdLCB2XSk7XG4gICAgdGhpcy5yaWdodC5wdXNoKFt0aGlzLnJpZ2h0W3RoaXMucmlnaHQubGVuZ3RoIC0gMV1bMF0sIHZdKTtcbiAgfTtcblxuICBNb25vdG9uZVBvbHlnb24ucHJvdG90eXBlLm1lcmdlX3J1biA9IGZ1bmN0aW9uKHYsIHVfbCwgdV9yKSB7XG4gICAgdmFyIGwgPSB0aGlzLmxlZnRbdGhpcy5sZWZ0Lmxlbmd0aCAtIDFdWzBdLFxuICAgICAgciA9IHRoaXMucmlnaHRbdGhpcy5yaWdodC5sZW5ndGggLSAxXVswXTtcbiAgICBpZiAobCAhPT0gdV9sKSB7XG4gICAgICB0aGlzLmxlZnQucHVzaChbbCwgdl0pO1xuICAgICAgdGhpcy5sZWZ0LnB1c2goW3VfbCwgdl0pO1xuICAgIH1cbiAgICBpZiAociAhPT0gdV9yKSB7XG4gICAgICB0aGlzLnJpZ2h0LnB1c2goW3IsIHZdKTtcbiAgICAgIHRoaXMucmlnaHQucHVzaChbdV9yLCB2XSk7XG4gICAgfVxuICB9O1xuXG5cbiAgcmV0dXJuIGZ1bmN0aW9uKGNodW5rKSB7XG4gICAgZnVuY3Rpb24gZihpLCBqLCBrKSB7XG4gICAgICByZXR1cm4gY2h1bmsuZ2V0KGksIGosIGspO1xuICAgIH07XG5cbiAgICB2YXIgZGltcyA9IGNodW5rLnNoYXBlO1xuXG4gICAgLy9Td2VlcCBvdmVyIDMtYXhlc1xuICAgIHZhciB2ZXJ0aWNlcyA9IFtdLFxuICAgICAgZmFjZXMgPSBbXTtcbiAgICBmb3IgKHZhciBkID0gMDsgZCA8IDM7ICsrZCkge1xuICAgICAgdmFyIGksIGosIGssIHUgPSAoZCArIDEpICUgMyAvL3UgYW5kIHYgYXJlIG9ydGhvZ29uYWwgZGlyZWN0aW9ucyB0byBkXG4gICAgICAgICxcbiAgICAgICAgdiA9IChkICsgMikgJSAzLFxuICAgICAgICB4ID0gbmV3IEludDMyQXJyYXkoMyksXG4gICAgICAgIHEgPSBuZXcgSW50MzJBcnJheSgzKSxcbiAgICAgICAgcnVucyA9IG5ldyBJbnQzMkFycmF5KDIgKiAoZGltc1t1XSArIDEpKSxcbiAgICAgICAgZnJvbnRpZXIgPSBuZXcgSW50MzJBcnJheShkaW1zW3VdKSAvL0Zyb250aWVyIGlzIGxpc3Qgb2YgcG9pbnRlcnMgdG8gcG9seWdvbnNcbiAgICAgICAgLFxuICAgICAgICBuZXh0X2Zyb250aWVyID0gbmV3IEludDMyQXJyYXkoZGltc1t1XSksXG4gICAgICAgIGxlZnRfaW5kZXggPSBuZXcgSW50MzJBcnJheSgyICogZGltc1t2XSksXG4gICAgICAgIHJpZ2h0X2luZGV4ID0gbmV3IEludDMyQXJyYXkoMiAqIGRpbXNbdl0pLFxuICAgICAgICBzdGFjayA9IG5ldyBJbnQzMkFycmF5KDI0ICogZGltc1t2XSksXG4gICAgICAgIGRlbHRhID0gW1xuICAgICAgICAgIFswLCAwXSxcbiAgICAgICAgICBbMCwgMF1cbiAgICAgICAgXTtcbiAgICAgIC8vcSBwb2ludHMgYWxvbmcgZC1kaXJlY3Rpb25cbiAgICAgIHFbZF0gPSAxO1xuICAgICAgLy9Jbml0aWFsaXplIHNlbnRpbmVsXG4gICAgICBmb3IgKHhbZF0gPSAtMTsgeFtkXSA8IGRpbXNbZF07KSB7XG4gICAgICAgIC8vIC0tLSBQZXJmb3JtIG1vbm90b25lIHBvbHlnb24gc3ViZGl2aXNpb24gLS0tXG4gICAgICAgIHZhciBuID0gMCxcbiAgICAgICAgICBwb2x5Z29ucyA9IFtdLFxuICAgICAgICAgIG5mID0gMDtcbiAgICAgICAgZm9yICh4W3ZdID0gMDsgeFt2XSA8IGRpbXNbdl07ICsreFt2XSkge1xuICAgICAgICAgIC8vTWFrZSBvbmUgcGFzcyBvdmVyIHRoZSB1LXNjYW4gbGluZSBvZiB0aGUgdm9sdW1lIHRvIHJ1bi1sZW5ndGggZW5jb2RlIHBvbHlnb25cbiAgICAgICAgICB2YXIgbnIgPSAwLFxuICAgICAgICAgICAgcCA9IDAsXG4gICAgICAgICAgICBjID0gMDtcbiAgICAgICAgICBmb3IgKHhbdV0gPSAwOyB4W3VdIDwgZGltc1t1XTsgKyt4W3VdLCBwID0gYykge1xuICAgICAgICAgICAgLy9Db21wdXRlIHRoZSB0eXBlIGZvciB0aGlzIGZhY2VcbiAgICAgICAgICAgIHZhciBhID0gKDAgPD0geFtkXSA/IGYoeFswXSwgeFsxXSwgeFsyXSkgOiAwKSxcbiAgICAgICAgICAgICAgYiA9ICh4W2RdIDwgZGltc1tkXSAtIDEgPyBmKHhbMF0gKyBxWzBdLCB4WzFdICsgcVsxXSwgeFsyXSArIHFbMl0pIDogMCk7XG4gICAgICAgICAgICBjID0gYTtcbiAgICAgICAgICAgIGlmICgoIWEpID09PSAoIWIpKSB7XG4gICAgICAgICAgICAgIGMgPSAwO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghYSkge1xuICAgICAgICAgICAgICBjID0gLWI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvL0lmIGNlbGwgdHlwZSBkb2Vzbid0IG1hdGNoLCBzdGFydCBhIG5ldyBydW5cbiAgICAgICAgICAgIGlmIChwICE9PSBjKSB7XG4gICAgICAgICAgICAgIHJ1bnNbbnIrK10gPSB4W3VdO1xuICAgICAgICAgICAgICBydW5zW25yKytdID0gYztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgLy9BZGQgc2VudGluZWwgcnVuXG4gICAgICAgICAgcnVuc1tucisrXSA9IGRpbXNbdV07XG4gICAgICAgICAgcnVuc1tucisrXSA9IDA7XG4gICAgICAgICAgLy9VcGRhdGUgZnJvbnRpZXIgYnkgbWVyZ2luZyBydW5zXG4gICAgICAgICAgdmFyIGZwID0gMDtcbiAgICAgICAgICBmb3IgKHZhciBpID0gMCwgaiA9IDA7IGkgPCBuZiAmJiBqIDwgbnIgLSAyOykge1xuICAgICAgICAgICAgdmFyIHAgPSBwb2x5Z29uc1tmcm9udGllcltpXV0sXG4gICAgICAgICAgICAgIHBfbCA9IHAubGVmdFtwLmxlZnQubGVuZ3RoIC0gMV1bMF0sXG4gICAgICAgICAgICAgIHBfciA9IHAucmlnaHRbcC5yaWdodC5sZW5ndGggLSAxXVswXSxcbiAgICAgICAgICAgICAgcF9jID0gcC5jb2xvcixcbiAgICAgICAgICAgICAgcl9sID0gcnVuc1tqXSAvL1N0YXJ0IG9mIHJ1blxuICAgICAgICAgICAgICAsXG4gICAgICAgICAgICAgIHJfciA9IHJ1bnNbaiArIDJdIC8vRW5kIG9mIHJ1blxuICAgICAgICAgICAgICAsXG4gICAgICAgICAgICAgIHJfYyA9IHJ1bnNbaiArIDFdOyAvL0NvbG9yIG9mIHJ1blxuICAgICAgICAgICAgLy9DaGVjayBpZiB3ZSBjYW4gbWVyZ2UgcnVuIHdpdGggcG9seWdvblxuICAgICAgICAgICAgaWYgKHJfciA+IHBfbCAmJiBwX3IgPiByX2wgJiYgcl9jID09PSBwX2MpIHtcbiAgICAgICAgICAgICAgLy9NZXJnZSBydW5cbiAgICAgICAgICAgICAgcC5tZXJnZV9ydW4oeFt2XSwgcl9sLCByX3IpO1xuICAgICAgICAgICAgICAvL0luc2VydCBwb2x5Z29uIGludG8gZnJvbnRpZXJcbiAgICAgICAgICAgICAgbmV4dF9mcm9udGllcltmcCsrXSA9IGZyb250aWVyW2ldO1xuICAgICAgICAgICAgICArK2k7XG4gICAgICAgICAgICAgIGogKz0gMjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vQ2hlY2sgaWYgd2UgbmVlZCB0byBhZHZhbmNlIHRoZSBydW4gcG9pbnRlclxuICAgICAgICAgICAgICBpZiAocl9yIDw9IHBfcikge1xuICAgICAgICAgICAgICAgIGlmICghIXJfYykge1xuICAgICAgICAgICAgICAgICAgdmFyIG5fcG9seSA9IG5ldyBNb25vdG9uZVBvbHlnb24ocl9jLCB4W3ZdLCByX2wsIHJfcik7XG4gICAgICAgICAgICAgICAgICBuZXh0X2Zyb250aWVyW2ZwKytdID0gcG9seWdvbnMubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgcG9seWdvbnMucHVzaChuX3BvbHkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBqICs9IDI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy9DaGVjayBpZiB3ZSBuZWVkIHRvIGFkdmFuY2UgdGhlIGZyb250aWVyIHBvaW50ZXJcbiAgICAgICAgICAgICAgaWYgKHBfciA8PSByX3IpIHtcbiAgICAgICAgICAgICAgICBwLmNsb3NlX29mZih4W3ZdKTtcbiAgICAgICAgICAgICAgICArK2k7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgLy9DbG9zZSBvZmYgYW55IHJlc2lkdWFsIHBvbHlnb25zXG4gICAgICAgICAgZm9yICg7IGkgPCBuZjsgKytpKSB7XG4gICAgICAgICAgICBwb2x5Z29uc1tmcm9udGllcltpXV0uY2xvc2Vfb2ZmKHhbdl0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvL0FkZCBhbnkgZXh0cmEgcnVucyB0byBmcm9udGllclxuICAgICAgICAgIGZvciAoOyBqIDwgbnIgLSAyOyBqICs9IDIpIHtcbiAgICAgICAgICAgIHZhciByX2wgPSBydW5zW2pdLFxuICAgICAgICAgICAgICByX3IgPSBydW5zW2ogKyAyXSxcbiAgICAgICAgICAgICAgcl9jID0gcnVuc1tqICsgMV07XG4gICAgICAgICAgICBpZiAoISFyX2MpIHtcbiAgICAgICAgICAgICAgdmFyIG5fcG9seSA9IG5ldyBNb25vdG9uZVBvbHlnb24ocl9jLCB4W3ZdLCByX2wsIHJfcik7XG4gICAgICAgICAgICAgIG5leHRfZnJvbnRpZXJbZnArK10gPSBwb2x5Z29ucy5sZW5ndGg7XG4gICAgICAgICAgICAgIHBvbHlnb25zLnB1c2gobl9wb2x5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgLy9Td2FwIGZyb250aWVyc1xuICAgICAgICAgIHZhciB0bXAgPSBuZXh0X2Zyb250aWVyO1xuICAgICAgICAgIG5leHRfZnJvbnRpZXIgPSBmcm9udGllcjtcbiAgICAgICAgICBmcm9udGllciA9IHRtcDtcbiAgICAgICAgICBuZiA9IGZwO1xuICAgICAgICB9XG4gICAgICAgIC8vQ2xvc2Ugb2ZmIGZyb250aWVyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbmY7ICsraSkge1xuICAgICAgICAgIHZhciBwID0gcG9seWdvbnNbZnJvbnRpZXJbaV1dO1xuICAgICAgICAgIHAuY2xvc2Vfb2ZmKGRpbXNbdl0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIC0tLSBNb25vdG9uZSBzdWJkaXZpc2lvbiBvZiBwb2x5Z29uIGlzIGNvbXBsZXRlIGF0IHRoaXMgcG9pbnQgLS0tXG5cbiAgICAgICAgeFtkXSsrO1xuXG4gICAgICAgIC8vTm93IHdlIGp1c3QgbmVlZCB0byB0cmlhbmd1bGF0ZSBlYWNoIG1vbm90b25lIHBvbHlnb25cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwb2x5Z29ucy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIHZhciBwID0gcG9seWdvbnNbaV0sXG4gICAgICAgICAgICBjID0gcC5jb2xvcixcbiAgICAgICAgICAgIGZsaXBwZWQgPSBmYWxzZTtcbiAgICAgICAgICBpZiAoYyA8IDApIHtcbiAgICAgICAgICAgIGZsaXBwZWQgPSB0cnVlO1xuICAgICAgICAgICAgYyA9IC1jO1xuICAgICAgICAgIH1cbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHAubGVmdC5sZW5ndGg7ICsraikge1xuICAgICAgICAgICAgbGVmdF9pbmRleFtqXSA9IHZlcnRpY2VzLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciB5ID0gWzAuMCwgMC4wLCAwLjBdLFxuICAgICAgICAgICAgICB6ID0gcC5sZWZ0W2pdO1xuICAgICAgICAgICAgeVtkXSA9IHhbZF07XG4gICAgICAgICAgICB5W3VdID0gelswXTtcbiAgICAgICAgICAgIHlbdl0gPSB6WzFdO1xuICAgICAgICAgICAgdmVydGljZXMucHVzaCh5KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBwLnJpZ2h0Lmxlbmd0aDsgKytqKSB7XG4gICAgICAgICAgICByaWdodF9pbmRleFtqXSA9IHZlcnRpY2VzLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciB5ID0gWzAuMCwgMC4wLCAwLjBdLFxuICAgICAgICAgICAgICB6ID0gcC5yaWdodFtqXTtcbiAgICAgICAgICAgIHlbZF0gPSB4W2RdO1xuICAgICAgICAgICAgeVt1XSA9IHpbMF07XG4gICAgICAgICAgICB5W3ZdID0gelsxXTtcbiAgICAgICAgICAgIHZlcnRpY2VzLnB1c2goeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vVHJpYW5ndWxhdGUgdGhlIG1vbm90b25lIHBvbHlnb25cbiAgICAgICAgICB2YXIgYm90dG9tID0gMCxcbiAgICAgICAgICAgIHRvcCA9IDAsXG4gICAgICAgICAgICBsX2kgPSAxLFxuICAgICAgICAgICAgcl9pID0gMSxcbiAgICAgICAgICAgIHNpZGUgPSB0cnVlOyAvL3RydWUgPSByaWdodCwgZmFsc2UgPSBsZWZ0XG5cbiAgICAgICAgICBzdGFja1t0b3ArK10gPSBsZWZ0X2luZGV4WzBdO1xuICAgICAgICAgIHN0YWNrW3RvcCsrXSA9IHAubGVmdFswXVswXTtcbiAgICAgICAgICBzdGFja1t0b3ArK10gPSBwLmxlZnRbMF1bMV07XG5cbiAgICAgICAgICBzdGFja1t0b3ArK10gPSByaWdodF9pbmRleFswXTtcbiAgICAgICAgICBzdGFja1t0b3ArK10gPSBwLnJpZ2h0WzBdWzBdO1xuICAgICAgICAgIHN0YWNrW3RvcCsrXSA9IHAucmlnaHRbMF1bMV07XG5cbiAgICAgICAgICB3aGlsZSAobF9pIDwgcC5sZWZ0Lmxlbmd0aCB8fCByX2kgPCBwLnJpZ2h0Lmxlbmd0aCkge1xuICAgICAgICAgICAgLy9Db21wdXRlIG5leHQgc2lkZVxuICAgICAgICAgICAgdmFyIG5fc2lkZSA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGxfaSA9PT0gcC5sZWZ0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICBuX3NpZGUgPSB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChyX2kgIT09IHAucmlnaHQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgIHZhciBsID0gcC5sZWZ0W2xfaV0sXG4gICAgICAgICAgICAgICAgciA9IHAucmlnaHRbcl9pXTtcbiAgICAgICAgICAgICAgbl9zaWRlID0gbFsxXSA+IHJbMV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgaWR4ID0gbl9zaWRlID8gcmlnaHRfaW5kZXhbcl9pXSA6IGxlZnRfaW5kZXhbbF9pXSxcbiAgICAgICAgICAgICAgdmVydCA9IG5fc2lkZSA/IHAucmlnaHRbcl9pXSA6IHAubGVmdFtsX2ldO1xuICAgICAgICAgICAgaWYgKG5fc2lkZSAhPT0gc2lkZSkge1xuICAgICAgICAgICAgICAvL09wcG9zaXRlIHNpZGVcbiAgICAgICAgICAgICAgd2hpbGUgKGJvdHRvbSArIDMgPCB0b3ApIHtcbiAgICAgICAgICAgICAgICBpZiAoZmxpcHBlZCA9PT0gbl9zaWRlKSB7XG4gICAgICAgICAgICAgICAgICBmYWNlcy5wdXNoKFtzdGFja1tib3R0b21dLCBzdGFja1tib3R0b20gKyAzXSwgaWR4LCBjXSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIGZhY2VzLnB1c2goW3N0YWNrW2JvdHRvbSArIDNdLCBzdGFja1tib3R0b21dLCBpZHgsIGNdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYm90dG9tICs9IDM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vU2FtZSBzaWRlXG4gICAgICAgICAgICAgIHdoaWxlIChib3R0b20gKyAzIDwgdG9wKSB7XG4gICAgICAgICAgICAgICAgLy9Db21wdXRlIGNvbnZleGl0eVxuICAgICAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgMjsgKytqKVxuICAgICAgICAgICAgICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCAyOyArK2spIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsdGFbal1ba10gPSBzdGFja1t0b3AgLSAzICogKGogKyAxKSArIGsgKyAxXSAtIHZlcnRba107XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIGRldCA9IGRlbHRhWzBdWzBdICogZGVsdGFbMV1bMV0gLSBkZWx0YVsxXVswXSAqIGRlbHRhWzBdWzFdO1xuICAgICAgICAgICAgICAgIGlmIChuX3NpZGUgPT09IChkZXQgPiAwKSkge1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChkZXQgIT09IDApIHtcbiAgICAgICAgICAgICAgICAgIGlmIChmbGlwcGVkID09PSBuX3NpZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZmFjZXMucHVzaChbc3RhY2tbdG9wIC0gM10sIHN0YWNrW3RvcCAtIDZdLCBpZHgsIGNdKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGZhY2VzLnB1c2goW3N0YWNrW3RvcCAtIDZdLCBzdGFja1t0b3AgLSAzXSwgaWR4LCBjXSk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRvcCAtPSAzO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvL1B1c2ggdmVydGV4XG4gICAgICAgICAgICBzdGFja1t0b3ArK10gPSBpZHg7XG4gICAgICAgICAgICBzdGFja1t0b3ArK10gPSB2ZXJ0WzBdO1xuICAgICAgICAgICAgc3RhY2tbdG9wKytdID0gdmVydFsxXTtcbiAgICAgICAgICAgIC8vVXBkYXRlIGxvb3AgaW5kZXhcbiAgICAgICAgICAgIGlmIChuX3NpZGUpIHtcbiAgICAgICAgICAgICAgKytyX2k7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICArK2xfaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNpZGUgPSBuX3NpZGU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7IHZlcnRpY2VzOiB2ZXJ0aWNlcywgZmFjZXM6IGZhY2VzIH07XG4gIH1cbn0pKCk7XG5cbmlmIChleHBvcnRzKSB7XG4gIGV4cG9ydHMubWVzaGVyID0gTW9ub3RvbmVNZXNoO1xufSIsInZhciBUSFJFRSA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydUSFJFRSddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnVEhSRUUnXSA6IG51bGwpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNhbWVyYSwgJGlucHV0KSB7XG4gIHZhciBsYXN0WCA9IDA7XG4gIHZhciBsYXN0WSA9IDA7XG4gIHZhciByb3RhdGlvbiA9IG5ldyBUSFJFRS5FdWxlcigpO1xuICByb3RhdGlvbi5vcmRlciA9ICdZWFonO1xuXG4gIGZ1bmN0aW9uIHRpY2soZHQpIHtcbiAgICBpZiAoJGlucHV0Lm1vdXNlKDApKSB7XG4gICAgICB2YXIgZGlmZlggPSAkaW5wdXQubW91c2VYIC0gbGFzdFg7XG4gICAgICB2YXIgZGlmZlkgPSAkaW5wdXQubW91c2VZIC0gbGFzdFk7XG5cbiAgICAgIHJvdGF0aW9uLnggKz0gZGlmZlkgKiBzZWxmLnNwZWVkO1xuICAgICAgcm90YXRpb24ueSArPSBkaWZmWCAqIHNlbGYuc3BlZWQ7XG5cbiAgICAgIHVwZGF0ZUNhbWVyYSgpO1xuICAgIH1cblxuICAgIGxhc3RYID0gJGlucHV0Lm1vdXNlWDtcbiAgICBsYXN0WSA9ICRpbnB1dC5tb3VzZVk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVDYW1lcmEoKSB7XG4gICAgdmFyIHZlY3RvciA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDEpXG4gICAgICAuYXBwbHlFdWxlcihyb3RhdGlvbilcbiAgICAgIC5zZXRMZW5ndGgoc2VsZi5kaXN0YW5jZSk7XG5cbiAgICB2YXIgcG9zaXRpb24gPSBzZWxmLnRhcmdldC5jbG9uZSgpLmFkZCh2ZWN0b3IpO1xuXG4gICAgY2FtZXJhLnBvc2l0aW9uLmNvcHkocG9zaXRpb24pO1xuICAgIGNhbWVyYS5sb29rQXQoc2VsZi50YXJnZXQsIHNlbGYudXApO1xuICB9XG5cbiAgdmFyIHNlbGYgPSB7XG4gICAgc3BlZWQ6IDAuMDEsXG4gICAgdGljazogdGljayxcbiAgICB0YXJnZXQ6IG5ldyBUSFJFRS5WZWN0b3IzKCksXG4gICAgZGlzdGFuY2U6IDI1MCxcbiAgICB1cDogbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCksXG4gICAgdXBkYXRlQ2FtZXJhOiB1cGRhdGVDYW1lcmFcbiAgfTtcblxuICB1cGRhdGVDYW1lcmEoKTtcblxuICByZXR1cm4gc2VsZjtcbn07XG5cbm1vZHVsZS5leHBvcnRzLiRpbmplY3QgPSBbJyRzY29wZScsICckaW5wdXQnXTsiLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGJsb2Nrcykge1xuICBmdW5jdGlvbiBnZW4oKSB7XG4gICAgdmFyIG51bSA9IDEwMDAwO1xuICAgIHZhciBjb3VudCA9IDA7XG4gICAgdmFyIGNvb3JkcyA9IFt7IHg6IDAsIHk6IDAsIHo6IDAgfV07XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bTsgaSsrKSB7XG4gICAgICB2YXIgaW5kZXggPSBjb29yZHMubGVuZ3RoIC0gMSAtIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGNvb3Jkcy5sZW5ndGggKiAwLjEpO1xuICAgICAgdmFyIGNvb3JkID0gY29vcmRzW2luZGV4XTtcbiAgICAgIHZhciBuZXh0ID0gbmV4dENvb3JkKGNvb3JkKTtcbiAgICAgIGlmIChibG9ja3MuZ2V0QXRDb29yZChuZXh0KSA+IDApIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvb3Jkcy5wdXNoKG5leHQpO1xuXG4gICAgICBibG9ja3Muc2V0KG5leHQueCwgbmV4dC55LCBuZXh0LnosIDEpO1xuICAgIH1cbiAgfTtcblxuICBmdW5jdGlvbiBuZXh0Q29vcmQoY29vcmQpIHtcbiAgICB2YXIgbmV4dCA9IHsgeDogY29vcmQueCwgeTogY29vcmQueSwgejogY29vcmQueiB9O1xuICAgIHZhciBudW0gPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiA2KTtcbiAgICBzd2l0Y2ggKG51bSkge1xuICAgICAgY2FzZSAwOlxuICAgICAgICBuZXh0LngrKztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDE6XG4gICAgICAgIG5leHQueC0tO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgbmV4dC55Kys7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzOlxuICAgICAgICBuZXh0LnktLTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDQ6XG4gICAgICAgIG5leHQueisrO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNTpcbiAgICAgICAgbmV4dC56LS07XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHJldHVybiBuZXh0O1xuICB9O1xuXG4gIHJldHVybiB7XG4gICAgZ2VuOiBnZW5cbiAgfTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLiRpbmplY3QgPSBbJyRzY29wZSddOyIsInZhciBUSFJFRSA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydUSFJFRSddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnVEhSRUUnXSA6IG51bGwpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGJsb2NrcywgZ3JvdW5kKSB7XG4gIHZhciBjb29yZHMgPSBbXTtcbiAgdmFyIGNvb3JkID0gbnVsbDtcblxuICB2YXIgY291bnQgPSAwO1xuICB2YXIgaW50ZXJ2YWwgPSAxMDtcblxuICBmdW5jdGlvbiB0aWNrKGR0KSB7XG4gICAgY291bnQgKz0gZHQ7XG4gICAgaWYgKGNvdW50IDwgaW50ZXJ2YWwpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY291bnQgLT0gaW50ZXJ2YWw7XG5cbiAgICBjb29yZCA9IG5leHRDb29yZChjb29yZCk7XG4gICAgY29vcmRzLnB1c2goY29vcmQpO1xuICAgIGJsb2Nrcy5zZXRBdENvb3JkKGNvb3JkLCAyKTtcblxuICAgIGlmIChjb29yZHMubGVuZ3RoID4gc2VsZi5sZW5ndGgpIHtcbiAgICAgIGJsb2Nrcy5zZXRBdENvb3JkKGNvb3Jkc1swXSwgMCk7XG4gICAgICBjb29yZHMuc2hpZnQoKTtcbiAgICB9XG4gIH07XG5cbiAgZnVuY3Rpb24gbmV4dENvb3JkKGNvb3JkKSB7XG4gICAgaWYgKGNvb3JkID09IG51bGwpIHtcbiAgICAgIHJldHVybiBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgIH1cblxuICAgIHZhciBwb3NzaWJsZUNvb3JkcyA9IFtdO1xuICAgIHZhciBhbGxDb29yZHMgPSBbXTtcbiAgICB2YXIgZmFsbGJhY2tDb29yZHMgPSBbXTtcbiAgICB2aXNpdE5laWdoYm91ckNvb3Jkcyhjb29yZCwgZnVuY3Rpb24obmVpZ2hib3VyQ29vcmQpIHtcbiAgICAgIGlmICghZ3JvdW5kLmdldEF0Q29vcmQobmVpZ2hib3VyQ29vcmQpICYmXG4gICAgICAgIGhhc05laWdoYm91cihuZWlnaGJvdXJDb29yZCkpIHtcbiAgICAgICAgaWYgKGluY2x1ZGVzQ29vcmQobmVpZ2hib3VyQ29vcmQpKSB7XG4gICAgICAgICAgZmFsbGJhY2tDb29yZHMucHVzaChuZWlnaGJvdXJDb29yZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcG9zc2libGVDb29yZHMucHVzaChuZWlnaGJvdXJDb29yZCk7XG4gICAgICAgIH1cblxuICAgICAgfVxuICAgICAgYWxsQ29vcmRzLnB1c2gobmVpZ2hib3VyQ29vcmQpO1xuICAgIH0pO1xuXG4gICAgaWYgKHBvc3NpYmxlQ29vcmRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgaWYgKGZhbGxiYWNrQ29vcmRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gYWxsQ29vcmRzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGFsbENvb3Jkcy5sZW5ndGgpXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxsYmFja0Nvb3Jkc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBmYWxsYmFja0Nvb3Jkcy5sZW5ndGgpXTtcbiAgICB9XG5cbiAgICByZXR1cm4gcG9zc2libGVDb29yZHNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogcG9zc2libGVDb29yZHMubGVuZ3RoKV07XG4gIH07XG5cbiAgZnVuY3Rpb24gdmlzaXROZWlnaGJvdXJDb29yZHMoY29vcmQsIGNhbGxiYWNrKSB7XG4gICAgZm9yICh2YXIgaSA9IC0xOyBpIDw9IDE7IGkrKykge1xuICAgICAgZm9yICh2YXIgaiA9IC0xOyBqIDw9IDE7IGorKykge1xuICAgICAgICBmb3IgKHZhciBrID0gLTE7IGsgPD0gMTsgaysrKSB7XG4gICAgICAgICAgaWYgKGkgPT09IDAgJiYgaiA9PT0gMCAmJiBrID09PSAwKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoTWF0aC5hYnMoaSkgKyBNYXRoLmFicyhqKSArIE1hdGguYWJzKGspID4gMikge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY2FsbGJhY2soXG4gICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMyhjb29yZC54ICsgaSwgY29vcmQueSArIGosIGNvb3JkLnogKyBrKVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgZnVuY3Rpb24gaGFzTmVpZ2hib3VyKGNvb3JkKSB7XG4gICAgcmV0dXJuICEhZ3JvdW5kLmdldChjb29yZC54ICsgMSwgY29vcmQueSwgY29vcmQueikgfHxcbiAgICAgICEhZ3JvdW5kLmdldChjb29yZC54IC0gMSwgY29vcmQueSwgY29vcmQueikgfHxcbiAgICAgICEhZ3JvdW5kLmdldChjb29yZC54LCBjb29yZC55ICsgMSwgY29vcmQueikgfHxcbiAgICAgICEhZ3JvdW5kLmdldChjb29yZC54LCBjb29yZC55IC0gMSwgY29vcmQueikgfHxcbiAgICAgICEhZ3JvdW5kLmdldChjb29yZC54LCBjb29yZC55LCBjb29yZC56ICsgMSkgfHxcbiAgICAgICEhZ3JvdW5kLmdldChjb29yZC54LCBjb29yZC55LCBjb29yZC56IC0gMSk7XG4gIH07XG5cbiAgZnVuY3Rpb24gaW5jbHVkZXNDb29yZChjb29yZCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29vcmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoY29vcmRzW2ldLmVxdWFscyhjb29yZCkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xuXG4gIHZhciBzZWxmID0ge1xuICAgIGxlbmd0aDogMTAsXG4gICAgdGljazogdGlja1xuICB9O1xuXG4gIHJldHVybiBzZWxmO1xuXG59O1xuXG5tb2R1bGUuZXhwb3J0cy4kaW5qZWN0ID0gWyckc2NvcGUnLCAnX2dyb3VuZCddOyIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oYXBwKSB7XG4gIGFwcC5yZWdpc3RlcignJHdpbmRvdycsIHdpbmRvdyk7XG4gIGFwcC5yZWdpc3RlcignJGlucHV0JywgcmVxdWlyZSgnLi9zeXN0ZW1zL2lucHV0JyksIHRydWUpO1xuXG4gIGFwcC5hdHRhY2goJyRpbnB1dCcpO1xufTsiLCJ2YXIgSW5qZWN0b3IgPSByZXF1aXJlKCcuL2luamVjdG9yJyk7XG5cbmZ1bmN0aW9uIGd1aWQoKSB7XG4gIGZ1bmN0aW9uIHM0KCkge1xuICAgIHJldHVybiBNYXRoLmZsb29yKCgxICsgTWF0aC5yYW5kb20oKSkgKiAweDEwMDAwKVxuICAgICAgLnRvU3RyaW5nKDE2KVxuICAgICAgLnN1YnN0cmluZygxKTtcbiAgfVxuICByZXR1cm4gczQoKSArIHM0KCkgKyAnLScgKyBzNCgpICsgJy0nICsgczQoKSArICctJyArXG4gICAgczQoKSArICctJyArIHM0KCkgKyBzNCgpICsgczQoKTtcbn07XG5cbnZhciBFbmdpbmUgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5tYXAgPSB7fTtcbiAgdGhpcy5yb290ID0ge307XG4gIHRoaXMuaW5qZWN0b3IgPSBuZXcgSW5qZWN0b3IoKTtcbiAgdGhpcy5tYXhEdCA9IDEwMDAgLyAyNC4wO1xufTtcblxuRW5naW5lLnByb3RvdHlwZS5yZWdpc3RlciA9IGZ1bmN0aW9uKHR5cGUsIGFyZ3MsIG9wdGlvbnMpIHtcbiAgdGhpcy5pbmplY3Rvci5yZWdpc3Rlcih0eXBlLCBhcmdzLCBvcHRpb25zKTtcbn07XG5cbkVuZ2luZS5wcm90b3R5cGUuYXR0YWNoID0gZnVuY3Rpb24ob2JqZWN0LCBjb21wb25lbnQpIHtcbiAgLy8gQXR0YWNoIHRvIHJvb3QgaWYgb25lIGFyZ3VtZW50XG4gIGlmIChjb21wb25lbnQgPT09IHVuZGVmaW5lZCkge1xuICAgIGNvbXBvbmVudCA9IG9iamVjdDtcbiAgICBvYmplY3QgPSB0aGlzLnJvb3Q7XG4gIH1cblxuICBpZiAob2JqZWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2V4cGVjdGVkIGZpcnN0IGFyZ3VtZW50Jyk7XG4gIH1cblxuICBpZiAodHlwZW9mIGNvbXBvbmVudCA9PT0gJ3N0cmluZycpIHtcbiAgICBjb21wb25lbnQgPSB0aGlzLmluamVjdG9yLnJlc29sdmUoY29tcG9uZW50LCBmdW5jdGlvbihkZXApIHtcbiAgICAgIGlmIChkZXAgPT09ICckc2NvcGUnKSB7XG4gICAgICAgIHJldHVybiBvYmplY3Q7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBpZiAob2JqZWN0Ll9pZCA9PSBudWxsKSBvYmplY3QuX2lkID0gZ3VpZCgpO1xuICBpZiAoY29tcG9uZW50Ll9pZCA9PSBudWxsKSBjb21wb25lbnQuX2lkID0gZ3VpZCgpO1xuXG4gIGlmICh0aGlzLm1hcFtvYmplY3QuX2lkXSA9PSBudWxsKSB7XG4gICAgdGhpcy5tYXBbb2JqZWN0Ll9pZF0gPSB7fTtcbiAgfVxuXG4gIHRoaXMubWFwW29iamVjdC5faWRdW2NvbXBvbmVudC5faWRdID0gY29tcG9uZW50O1xuXG4gIHJldHVybiBjb21wb25lbnQ7XG59O1xuXG5FbmdpbmUucHJvdG90eXBlLmRldHRhY2ggPSBmdW5jdGlvbihvYmplY3QpIHtcbiAgaWYgKHRoaXMucm9vdFtvYmplY3QuX2lkXSAhPSBudWxsKSB7XG4gICAgdmFyIGNvbXBvbmVudCA9IHRoaXMucm9vdFtvYmplY3QuX2lkXTtcbiAgICBpZiAoY29tcG9uZW50Lm9uRGV0dGFjaCAhPSBudWxsKSB7XG4gICAgICBjb21wb25lbnQub25EZXR0YWNoKCk7XG4gICAgfVxuXG4gICAgZGVsZXRlIHRoaXMucm9vdFtjb21wb25lbnRdO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGZvciAodmFyIGkgaW4gdGhpcy5tYXBbb2JqZWN0Ll9pZF0pIHtcbiAgICB2YXIgY29tcG9uZW50ID0gdGhpcy5tYXBbb2JqZWN0Ll9pZF1baV07XG4gICAgaWYgKGNvbXBvbmVudC5vbkRldHRhY2ggIT0gbnVsbCkge1xuICAgICAgY29tcG9uZW50Lm9uRGV0dGFjaCgpO1xuICAgIH1cbiAgfVxuXG4gIGRlbGV0ZSB0aGlzLm1hcFtvYmplY3QuX2lkXTtcbn07XG5cbkVuZ2luZS5wcm90b3R5cGUudGljayA9IGZ1bmN0aW9uKGR0KSB7XG4gIHZhciBjb21wb25lbnQ7XG5cbiAgaWYgKGR0ID4gdGhpcy5tYXhEdCkge1xuICAgIGR0ID0gdGhpcy5tYXhEdDtcbiAgfVxuXG4gIGZvciAodmFyIGkgaW4gdGhpcy5yb290KSB7XG4gICAgY29tcG9uZW50ID0gdGhpcy5yb290W2ldO1xuICAgIGlmIChjb21wb25lbnQudGljayAhPSBudWxsKSB7XG4gICAgICBjb21wb25lbnQudGljaygpO1xuICAgIH1cbiAgfVxuXG4gIGZvciAodmFyIGkgaW4gdGhpcy5tYXApIHtcbiAgICBmb3IgKHZhciBqIGluIHRoaXMubWFwW2ldKSB7XG4gICAgICBjb21wb25lbnQgPSB0aGlzLm1hcFtpXVtqXTtcbiAgICAgIGlmIChjb21wb25lbnQudGljayAhPSBudWxsKSB7XG4gICAgICAgIGNvbXBvbmVudC50aWNrKGR0KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKHZhciBpIGluIHRoaXMubWFwKSB7XG4gICAgZm9yICh2YXIgaiBpbiB0aGlzLm1hcFtpXSkge1xuICAgICAgY29tcG9uZW50ID0gdGhpcy5tYXBbaV1bal07XG4gICAgICBpZiAoY29tcG9uZW50LmxhdGVUaWNrICE9IG51bGwpIHtcbiAgICAgICAgY29tcG9uZW50LmxhdGVUaWNrKGR0KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKHZhciBpIGluIHRoaXMucm9vdCkge1xuICAgIGNvbXBvbmVudCA9IHRoaXMucm9vdFtpXTtcbiAgICBpZiAoY29tcG9uZW50LmxhdGVUaWNrICE9IG51bGwpIHtcbiAgICAgIGNvbXBvbmVudC5sYXRlVGljaygpO1xuICAgIH1cbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGFwcCA9IG5ldyBFbmdpbmUoKTtcbiAgcmVxdWlyZSgnLi9ib290c3RyYXAnKShhcHApO1xuICByZXR1cm4gYXBwO1xufTtcblxubW9kdWxlLmV4cG9ydHMuY29uc3RydWN0b3IgPSBFbmdpbmU7IiwidmFyIEluamVjdG9yID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuYmluZGluZ3MgPSB7fTtcbn07XG5cbkluamVjdG9yLnByb3RvdHlwZS5yZWdpc3RlciA9IGZ1bmN0aW9uKHR5cGUsIG9iamVjdCwgb3B0KSB7XG4gIG9wdCA9IG9wdCB8fCB7fTtcbiAgaWYgKHR5cGVvZiBvcHQgPT09ICdib29sZWFuJykge1xuICAgIG9wdCA9IHtcbiAgICAgIG9uY2U6IG9wdFxuICAgIH07XG4gIH1cblxuICB2YXIgZGVwcyA9IFtdO1xuXG4gIGlmIChBcnJheS5pc0FycmF5KG9iamVjdCkpIHtcbiAgICBkZXBzID0gb2JqZWN0LnNsaWNlKDAsIG9iamVjdC5sZW5ndGggLSAxKTtcbiAgICBvYmplY3QgPSBvYmplY3Rbb2JqZWN0Lmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgaWYgKG9iamVjdC4kaW5qZWN0ICE9IG51bGwpIHtcbiAgICBkZXBzID0gb2JqZWN0LiRpbmplY3Q7XG4gIH1cblxuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGlmICh0eXBlb2Ygb2JqZWN0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdGhpcy5iaW5kaW5nc1t0eXBlXSA9IHtcbiAgICAgIGZhY3Rvcnk6IGZ1bmN0aW9uKHRyYW5zZm9ybSkge1xuICAgICAgICByZXR1cm4gc2VsZi5uZXdJbnN0YW5jZShvYmplY3QsIGRlcHMsIHRyYW5zZm9ybSk7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRoaXMuYmluZGluZ3NbdHlwZV0gPSB7XG4gICAgICB2YWx1ZTogb2JqZWN0XG4gICAgfTtcbiAgfVxuXG4gIGZvciAodmFyIGkgaW4gb3B0KSB7XG4gICAgdGhpcy5iaW5kaW5nc1t0eXBlXVtpXSA9IG9wdFtpXTtcbiAgfVxufTtcblxuSW5qZWN0b3IucHJvdG90eXBlLm5ld0luc3RhbmNlID0gZnVuY3Rpb24oZnVuYywgZGVwcywgdHJhbnNmb3JtKSB7XG4gIHZhciBhcmdzID0gW251bGxdO1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGRlcHMuZm9yRWFjaChmdW5jdGlvbihkZXApIHtcbiAgICBhcmdzLnB1c2goc2VsZi5yZXNvbHZlKGRlcCwgdHJhbnNmb3JtKSk7XG4gIH0pO1xuXG4gIHJldHVybiBuZXcoRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQuYXBwbHkoZnVuYywgYXJncykpO1xufTtcblxuSW5qZWN0b3IucHJvdG90eXBlLnJlc29sdmUgPSBmdW5jdGlvbih0eXBlLCB0cmFuc2Zvcm0pIHtcbiAgdmFyIGJpbmRpbmcgPSB0aGlzLmJpbmRpbmdzW3R5cGVdO1xuICB2YXIgb2JqZWN0O1xuXG4gIGlmICh0cmFuc2Zvcm0gIT0gbnVsbCkge1xuICAgIG9iamVjdCA9IHRyYW5zZm9ybSh0eXBlKTtcbiAgICBpZiAob2JqZWN0ICE9IG51bGwpIHtcbiAgICAgIHJldHVybiBvYmplY3Q7XG4gICAgfVxuICB9XG5cbiAgaWYgKGJpbmRpbmcgPT0gbnVsbCkge1xuICAgIHRocm93IG5ldyBFcnJvcignYmluZGluZyBub3QgZm91bmQgZm9yIHR5cGU6ICcgKyB0eXBlKTtcbiAgfVxuXG4gIGlmIChiaW5kaW5nLnZhbHVlICE9IG51bGwpIHtcbiAgICByZXR1cm4gYmluZGluZy52YWx1ZTtcbiAgfVxuXG4gIG9iamVjdCA9IGJpbmRpbmcuZmFjdG9yeSh0cmFuc2Zvcm0pO1xuXG4gIGlmIChiaW5kaW5nLm9uY2UpIHtcbiAgICBiaW5kaW5nLnZhbHVlID0gb2JqZWN0O1xuICB9XG5cbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gSW5qZWN0b3I7IiwidmFyIGFycmF5VXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy9hcnJheXV0aWxzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oJHdpbmRvdykge1xuICB2YXIgbW91c2VIb2xkcyA9IFtdO1xuICB2YXIgaW5wdXQgPSB7fTtcblxuICB2YXIgX21vdXNlZG93biwgX21vdXNldXAsIF9tb3VzZW1vdmU7XG5cbiAgJHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLFxuICAgIF9tb3VzZWRvd24gPSBmdW5jdGlvbihlKSB7XG4gICAgICBpZiAoIWFycmF5VXRpbHMuaW5jbHVkZXMobW91c2VIb2xkcywgZS5idXR0b24pKSB7XG4gICAgICAgIG1vdXNlSG9sZHMucHVzaChlLmJ1dHRvbik7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgJHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJyxcbiAgICBfbW91c2V1cCA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgIGFycmF5VXRpbHMucmVtb3ZlKG1vdXNlSG9sZHMsIGUuYnV0dG9uKTtcbiAgICB9KTtcblxuICAkd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsXG4gICAgX21vdXNlbW92ZSA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgIGlucHV0Lm1vdXNlWCA9IGUuY2xpZW50WDtcbiAgICAgIGlucHV0Lm1vdXNlWSA9IGUuY2xpZW50WTtcbiAgICB9KTtcblxuICAkd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCBmdW5jdGlvbigpIHtcbiAgICBtb3VzZUhvbGRzID0gW107XG4gIH0pO1xuXG4gICR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsIGZ1bmN0aW9uKCkge1xuICAgIG1vdXNlSG9sZHMgPSBbXTtcbiAgfSk7XG5cbiAgZnVuY3Rpb24gb25EZXR0YWNoKCkge1xuICAgICR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgX21vdXNlZG93bik7XG4gICAgJHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgX21vdXNldXApO1xuICAgICR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgX21vdXNlbW92ZSk7XG4gIH07XG5cbiAgZnVuY3Rpb24gbW91c2UoYnV0dG9uKSB7XG4gICAgcmV0dXJuIGFycmF5VXRpbHMuaW5jbHVkZXMobW91c2VIb2xkcywgYnV0dG9uKTtcbiAgfTtcblxuICBpbnB1dC5vbkRldHRhY2ggPSBvbkRldHRhY2g7XG4gIGlucHV0Lm1vdXNlID0gbW91c2U7XG5cbiAgcmV0dXJuIGlucHV0O1xufTtcblxubW9kdWxlLmV4cG9ydHMuJGluamVjdCA9IFsnJHdpbmRvdyddOyIsImZ1bmN0aW9uIGluY2x1ZGVzKGFycmF5LCB2YWx1ZSkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGFycmF5W2ldID09PSB2YWx1ZSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbmZ1bmN0aW9uIHJlbW92ZShhcnJheSwgdmFsdWUpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykge1xuICAgIGlmIChhcnJheVtpXSA9PT0gdmFsdWUpIHtcbiAgICAgIGFycmF5LnNwbGljZShpLCAxKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBpbmNsdWRlczogaW5jbHVkZXMsXG4gIHJlbW92ZTogcmVtb3ZlXG59OyIsInZhciBUSFJFRSA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydUSFJFRSddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnVEhSRUUnXSA6IG51bGwpO1xuXG52YXIgcmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcigpO1xucmVuZGVyZXIuc2V0U2l6ZSh3aW5kb3cuaW5uZXJXaWR0aCwgd2luZG93LmlubmVySGVpZ2h0KTtcbnJlbmRlcmVyLnNldENsZWFyQ29sb3IoMHhmMGYwZjApO1xuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChyZW5kZXJlci5kb21FbGVtZW50KTtcblxudmFyIHNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG52YXIgY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKFxuICAzMCxcbiAgd2luZG93LmlubmVyV2lkdGggLyB3aW5kb3cuaW5uZXJIZWlnaHQsXG4gIDAuMSxcbiAgNTAwMFxuKTtcblxudmFyIGRlcHRoTWF0ZXJpYWwsIGVmZmVjdENvbXBvc2VyLCBkZXB0aFJlbmRlclRhcmdldDtcbnZhciBzc2FvUGFzcztcblxudmFyIGxhc3RUaWNrO1xuXG5mdW5jdGlvbiByZW5kZXIoKSB7XG5cbiAgLy8gUmVuZGVyIGRlcHRoIGludG8gZGVwdGhSZW5kZXJUYXJnZXRcbiAgc2NlbmUub3ZlcnJpZGVNYXRlcmlhbCA9IGRlcHRoTWF0ZXJpYWw7XG4gIHJlbmRlcmVyLnJlbmRlcihzY2VuZSwgY2FtZXJhLCBkZXB0aFJlbmRlclRhcmdldCwgdHJ1ZSk7XG5cbiAgLy8gUmVuZGVyIHJlbmRlclBhc3MgYW5kIFNTQU8gc2hhZGVyUGFzc1xuICBzY2VuZS5vdmVycmlkZU1hdGVyaWFsID0gbnVsbDtcbiAgZWZmZWN0Q29tcG9zZXIucmVuZGVyKCk7XG5cbiAgLy8gcmVuZGVyZXIucmVuZGVyKHNjZW5lLCBjYW1lcmEpO1xuXG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShyZW5kZXIpO1xuICBpZiAobGFzdFRpY2sgIT0gbnVsbCkge1xuICAgIHZhciBkdCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gbGFzdFRpY2s7XG4gICAgYXBwLnRpY2soZHQpO1xuICB9XG4gIGxhc3RUaWNrID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG59O1xuXG5mdW5jdGlvbiBpbml0UG9zdHByb2Nlc3NpbmcoKSB7XG5cbiAgLy8gU2V0dXAgcmVuZGVyIHBhc3NcbiAgdmFyIHJlbmRlclBhc3MgPSBuZXcgVEhSRUUuUmVuZGVyUGFzcyhzY2VuZSwgY2FtZXJhKTtcblxuICAvLyBTZXR1cCBkZXB0aCBwYXNzXG4gIGRlcHRoTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaERlcHRoTWF0ZXJpYWwoKTtcbiAgZGVwdGhNYXRlcmlhbC5kZXB0aFBhY2tpbmcgPSBUSFJFRS5SR0JBRGVwdGhQYWNraW5nO1xuICBkZXB0aE1hdGVyaWFsLmJsZW5kaW5nID0gVEhSRUUuTm9CbGVuZGluZztcblxuICB2YXIgcGFycyA9IHsgbWluRmlsdGVyOiBUSFJFRS5MaW5lYXJGaWx0ZXIsIG1hZ0ZpbHRlcjogVEhSRUUuTGluZWFyRmlsdGVyIH07XG4gIGRlcHRoUmVuZGVyVGFyZ2V0ID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyVGFyZ2V0KHdpbmRvdy5pbm5lcldpZHRoLCB3aW5kb3cuaW5uZXJIZWlnaHQsIHBhcnMpO1xuXG4gIC8vIFNldHVwIFNTQU8gcGFzc1xuICBzc2FvUGFzcyA9IG5ldyBUSFJFRS5TaGFkZXJQYXNzKFRIUkVFLlNTQU9TaGFkZXIpO1xuICBzc2FvUGFzcy5yZW5kZXJUb1NjcmVlbiA9IHRydWU7XG4gIC8vc3Nhb1Bhc3MudW5pZm9ybXNbIFwidERpZmZ1c2VcIiBdLnZhbHVlIHdpbGwgYmUgc2V0IGJ5IFNoYWRlclBhc3NcbiAgc3Nhb1Bhc3MudW5pZm9ybXNbXCJ0RGVwdGhcIl0udmFsdWUgPSBkZXB0aFJlbmRlclRhcmdldDtcbiAgc3Nhb1Bhc3MudW5pZm9ybXNbJ3NpemUnXS52YWx1ZS5zZXQod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XG4gIHNzYW9QYXNzLnVuaWZvcm1zWydjYW1lcmFOZWFyJ10udmFsdWUgPSBjYW1lcmEubmVhcjtcbiAgc3Nhb1Bhc3MudW5pZm9ybXNbJ2NhbWVyYUZhciddLnZhbHVlID0gY2FtZXJhLmZhcjtcbiAgc3Nhb1Bhc3MudW5pZm9ybXNbJ29ubHlBTyddLnZhbHVlID0gZmFsc2U7XG4gIHNzYW9QYXNzLnVuaWZvcm1zWydhb0NsYW1wJ10udmFsdWUgPSAxMDtcbiAgc3Nhb1Bhc3MudW5pZm9ybXNbJ2x1bUluZmx1ZW5jZSddLnZhbHVlID0gMC4wO1xuXG4gIC8vIEFkZCBwYXNzIHRvIGVmZmVjdCBjb21wb3NlclxuICBlZmZlY3RDb21wb3NlciA9IG5ldyBUSFJFRS5FZmZlY3RDb21wb3NlcihyZW5kZXJlcik7XG4gIGVmZmVjdENvbXBvc2VyLmFkZFBhc3MocmVuZGVyUGFzcyk7XG4gIGVmZmVjdENvbXBvc2VyLmFkZFBhc3Moc3Nhb1Bhc3MpO1xuXG59XG5cbmluaXRQb3N0cHJvY2Vzc2luZygpO1xucmVuZGVyKCk7XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCBmdW5jdGlvbigpIHtcbiAgcmVuZGVyZXIuc2V0U2l6ZSh3aW5kb3cuaW5uZXJXaWR0aCwgd2luZG93LmlubmVySGVpZ2h0KTtcbiAgY2FtZXJhLmFzcGVjdCA9IHdpbmRvdy5pbm5lcldpZHRoIC8gd2luZG93LmlubmVySGVpZ2h0O1xuICBjYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xufSk7XG5cbnZhciBhcHAgPSByZXF1aXJlKCcuL2NvcmUvZW5naW5lJykoKTtcblxuYXBwLnJlZ2lzdGVyKCdibG9ja3MnLCByZXF1aXJlKCcuL2NvbXBvbmVudHMvYmxvY2tzJykpO1xuYXBwLnJlZ2lzdGVyKCdkcmFnQ2FtZXJhJywgcmVxdWlyZSgnLi9jb21wb25lbnRzL2RyYWdjYW1lcmEnKSk7XG5hcHAucmVnaXN0ZXIoJ3RyZWUnLCByZXF1aXJlKCcuL2NvbXBvbmVudHMvdHJlZScpKTtcbmFwcC5yZWdpc3Rlcignd29ybScsIHJlcXVpcmUoJy4vY29tcG9uZW50cy93b3JtJykpO1xuXG52YXIgZHJhZ0NhbWVyYSA9IGFwcC5hdHRhY2goY2FtZXJhLCAnZHJhZ0NhbWVyYScpO1xuZHJhZ0NhbWVyYS5kaXN0YW5jZSA9IDI1MDA7XG5kcmFnQ2FtZXJhLnVwZGF0ZUNhbWVyYSgpO1xuXG52YXIgYW1iaWVudExpZ2h0ID0gbmV3IFRIUkVFLkFtYmllbnRMaWdodCgweDg4ODg4OCk7XG5zY2VuZS5hZGQoYW1iaWVudExpZ2h0KTtcblxudmFyIGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMC41KTtcbmRpcmVjdGlvbmFsTGlnaHQucG9zaXRpb24uc2V0KDUsIDIwLCAxMCk7XG5zY2VuZS5hZGQoZGlyZWN0aW9uYWxMaWdodCk7XG5cbnZhciBvYmplY3QgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcbnNjZW5lLmFkZChvYmplY3QpO1xudmFyIGdyb3VuZCA9IGFwcC5hdHRhY2gob2JqZWN0LCAnYmxvY2tzJyk7XG5ncm91bmQuc2NhbGUgPSAxMDtcblxuYXBwLnJlZ2lzdGVyKCdfZ3JvdW5kJywgZ3JvdW5kKTtcblxudmFyIHRyZWUgPSBhcHAuYXR0YWNoKGdyb3VuZCwgJ3RyZWUnKTtcbnRyZWUuZ2VuKCk7XG5cbnZhciBudW0gPSAyO1xuZm9yICh2YXIgaSA9IDA7IGkgPCBudW07IGkrKykge1xuICBvYmplY3QgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcbiAgc2NlbmUuYWRkKG9iamVjdCk7XG4gIHZhciBibG9ja3MgPSBhcHAuYXR0YWNoKG9iamVjdCwgJ2Jsb2NrcycpO1xuICBibG9ja3Muc2NhbGUgPSAxMDtcbiAgd29ybSA9IGFwcC5hdHRhY2goYmxvY2tzLCAnd29ybScpO1xufSJdfQ==
