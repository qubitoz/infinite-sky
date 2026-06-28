// Custom shader materials: atmosphere rim scattering, animated water/lava,
// sun surface and planetary rings. All include log-depth chunks because the
// renderer runs with logarithmicDepthBuffer for interplanetary scale.
import * as THREE from 'three';

export const TIME = { value: 0 };

// Ashima/webgl-noise simplex 3D
export const GLSL_SNOISE = /* glsl */`
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0,0.5,1.0,2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0*floor(p*ns.z*ns.z);
  vec4 x_ = floor(j*ns.z);
  vec4 y_ = floor(j - 7.0*x_);
  vec4 x = x_*ns.x + ns.yyyy;
  vec4 y = y_*ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}`;

export function makeAtmosphereMaterial(colorHex, strength) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uStrength: { value: strength },
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform vec3 uSunDir; uniform float uStrength;
      varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec3 viewDir = normalize(cameraPosition - vW);
        vec3 n = normalize(vN);
        float rim = pow(clamp(1.0 - abs(dot(viewDir, n)), 0.0, 1.0), 3.4);
        float sun = 0.25 + 0.75 * clamp(dot(n, uSunDir) * 0.65 + 0.45, 0.0, 1.0);
        gl_FragColor = vec4(uColor * rim * sun * uStrength, 1.0);
      }`,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

export function makeWaterMaterial(deepHex, shallowHex, lava, lowQ = false) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uDeep: { value: new THREE.Color(deepHex) },
        uShallow: { value: new THREE.Color(shallowHex) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uLava: { value: lava ? 1 : 0 },
      },
    ]),
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSunDir; uniform float uLava;
      uniform float uTime;
      varying vec3 vN; varying vec3 vW;
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      ${GLSL_SNOISE}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN);
        float dist = distance(cameraPosition, vW);
        float fade = clamp(900.0 / max(dist, 1.0), 0.0, 1.0);
        vec3 col; float alpha;
        if (uLava > 0.5) {
          float t = uTime * 0.05;
          vec3 q = vW * 0.012;
          float g = snoise(q + vec3(t, 0.0, t * 0.7)) * 0.6
                  + snoise(q * 2.7 + vec3(0.0, t * 1.3, 0.0)) * 0.3;
          g = clamp(g * 0.5 + 0.5, 0.0, 1.0);
          vec3 hot = mix(vec3(0.95, 0.45, 0.08), vec3(1.0, 0.85, 0.3), g);
          col = mix(vec3(0.16, 0.02, 0.005), hot, smoothstep(0.35, 0.8, g));
          col *= 1.6;
          alpha = 1.0;
        } else {
          float t = uTime * 0.5;
          vec3 q = vW * 0.09;
          // ripple normal: skip the noise entirely once the surface is far (fade≈0,
          // where dn would vanish anyway), and on the low-quality path use a single
          // noise octave instead of three — the fragment cost here dominates lush flyovers
          vec3 n2 = n;
          if (fade > 0.02) {
            ${lowQ
            ? `float s = snoise(q + vec3(t, 0.0, 0.0));
            vec3 dn = vec3(s, s * 0.55, -s * 0.8) * 0.13 * fade;`
            : `vec3 dn = vec3(
              snoise(q + vec3(t, 0.0, 0.0)),
              snoise(q.yzx + vec3(0.0, t, 7.3)),
              snoise(q.zxy - vec3(t, 3.1, 0.0))) * 0.16 * fade;`}
            n2 = normalize(n + dn);
          }
          vec3 viewDir = normalize(cameraPosition - vW);
          float fres = pow(1.0 - clamp(dot(n2, viewDir), 0.0, 1.0), 3.0);
          float ndl = clamp(dot(n2, uSunDir), 0.0, 1.0);
          ${lowQ
            ? `float spec = 0.0;`
            : `float spec = pow(clamp(dot(reflect(-uSunDir, n2), viewDir), 0.0, 1.0), 110.0) * 1.6 * ndl;`}
          col = mix(uDeep, uShallow, fres * 0.65 + 0.12) * (0.18 + 0.92 * ndl) + spec;
          alpha = 0.82 + fres * 0.18;
        }
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
    transparent: true,
    // water is near-opaque (alpha 0.82–1.0); writing depth lets it early-Z reject the
    // sea floor and the cloud/atmosphere shells behind it — the big lush-flyover overdraw
    depthWrite: true,
    fog: true,
  });
  mat.uniforms.uTime = TIME;
  return mat;
}

export function makeSunMaterial(coreHex, edgeHex) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCore: { value: new THREE.Color(coreHex) },
      uEdge: { value: new THREE.Color(edgeHex) },
      uTime: TIME,
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vW; varying vec3 vLocal;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vLocal = normalize(position);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCore; uniform vec3 uEdge; uniform float uTime;
      varying vec3 vN; varying vec3 vW; varying vec3 vLocal;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GLSL_SNOISE}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 viewDir = normalize(cameraPosition - vW);
        float mu = clamp(dot(normalize(vN), viewDir), 0.0, 1.0);
        float limb = pow(mu, 0.5);
        float g = snoise(vLocal * 24.0 + vec3(uTime * 0.06)) * 0.55
                + snoise(vLocal * 70.0 - vec3(uTime * 0.03)) * 0.3;
        g = g * 0.5 + 0.5;
        vec3 col = mix(uEdge, uCore, g) * (0.5 + 0.6 * limb) * 2.4;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return mat;
}

export function makeRingMaterial(tex, inner, outer) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: tex },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uInner: { value: inner },
      uOuter: { value: outer },
    },
    vertexShader: /* glsl */`
      varying vec3 vLocal; varying vec3 vNW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vLocal = position;
        vNW = normalize((modelMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform vec3 uSunDir;
      uniform float uInner; uniform float uOuter;
      varying vec3 vLocal; varying vec3 vNW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float r = length(vLocal.xy);
        float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        vec4 s = texture2D(uTex, vec2(t, 0.5));
        float light = 0.3 + 0.7 * abs(dot(uSunDir, vNW));
        gl_FragColor = vec4(s.rgb * light, s.a * 0.95);
        if (gl_FragColor.a < 0.01) discard;
      }`,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}
