import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
export async function waterSystem(scene) {
  const loader=new T.TextureLoader();
  const [mask,noise]=await Promise.all(['shore-mask','wave-noise'].map(n=>loader.loadAsync(`./assets/textures/${n}.png`)));
  noise.wrapS=noise.wrapT=T.RepeatWrapping;
  const surfaces=[];
  const vertex=`uniform mat4 textureMatrix; varying vec4 proj; varying vec2 st; varying vec3 wp;
  void main(){st=uv;wp=(modelMatrix*vec4(position,1.)).xyz;proj=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`;
  const fragment=`uniform sampler2D tDiffuse,maskMap,noiseMap;uniform float time;uniform vec3 color;varying vec4 proj;varying vec2 st;varying vec3 wp;
  void main(){float depth=texture2D(maskMap,st).r;if(depth<.005)discard;
    vec2 drift=vec2(time*.008,time*-.005);float n=texture2D(noiseMap,st*3.+drift).r;
    float n2=texture2D(noiseMap,st.yx*4.-drift*.7).r;
    vec3 normal=normalize(vec3((n-.5)*.17,1.,(n2-.5)*.17));
    vec3 viewDir=normalize(cameraPosition-wp);float fresnel=.08+.78*pow(1.-max(dot(viewDir,normal),0.),3.);
    vec2 uv=proj.xy/proj.w+vec2(n-.5,n2-.5)*.006*depth;
    vec3 reflection=texture2D(tDiffuse,uv).rgb;
    vec3 shallow=vec3(.17,.13,.08);vec3 deep=vec3(.09,.22,.23);
    vec3 base=mix(mix(shallow,deep,depth*.65),reflection,.35+fresnel*.6);
    vec3 halfDir=normalize(viewDir+normalize(vec3(-.4,.85,.25)));
    float spark=pow(max(dot(normal,halfDir),0.),900.)*smoothstep(.5,.78,n)*7.;
    float narrow=pow(max(0.,sin(st.x*210.+n2*10.+time*.7)),32.)*pow(max(0.,sin(st.y*160.-time*.4)),20.);
    spark+=narrow*smoothstep(.76,.94,n)*2.8;
    float shore=(1.-smoothstep(.05,.38,depth))*smoothstep(.015,.1,depth);
    float foam=shore*smoothstep(.64,.85,n+n2*.13)*(.1+.06*sin(time*.5));
    gl_FragColor=vec4(base+vec3(1.,.79,.45)*spark+vec3(.72,.77,.67)*foam,depth*.93);
  }`;
  return {
    add(root,detail){
      root.traverse(o=>{if(o.name.startsWith('PuddleReflection'))o.visible=false;
        if(o.isMesh&&o.name.startsWith('Stream_Water')){
          const m=new T.MeshStandardMaterial({color:'#54989b',roughness:.16,metalness:.15,transparent:true,opacity:.85,side:T.DoubleSide});
          m.onBeforeCompile=s=>{s.uniforms.time={value:0};s.uniforms.waveMap={value:noise};surfaces.push(s.uniforms);
            s.vertexShader='varying vec3 waterPos;\n'+s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nwaterPos=(modelMatrix*vec4(transformed,1.)).xyz;');
            s.fragmentShader='uniform float time;uniform sampler2D waveMap;varying vec3 waterPos;\n'+s.fragmentShader;
            s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
              float wave=texture2D(waveMap,waterPos.xz*.7+vec2(0.,time*.035)).r;
              normal=normalize(normal+vec3((wave-.5)*.16,0.,(wave-.5)*.13));`);
            s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
              float foam=pow(max(0.,sin(waterPos.z*19.+time*1.4+wave*8.)),16.)*smoothstep(.64,.88,wave);
              float bank=abs(waterPos.x-(2.2+.22*sin(waterPos.z*.8)));
              totalEmissiveRadiance+=vec3(.55,.64,.56)*foam*smoothstep(.55,1.05,bank)*.3;
              totalEmissiveRadiance+=vec3(3.,2.5,1.7)*pow(foam,4.)*.24;`);
          };o.material=m;
        }
      });
      const reflector=new Reflector(new T.PlaneGeometry(8.2,4.8),{textureWidth:detail?1024:512,textureHeight:detail?1024:512,clipBias:.003,shader:{uniforms:{tDiffuse:{value:null},textureMatrix:{value:null},color:{value:new T.Color('#729fa2')},maskMap:{value:mask},noiseMap:{value:noise},time:{value:0}},vertexShader:vertex,fragmentShader:fragment}});
      reflector.position.set(-5.35,.42,6.25);reflector.rotation.x=-Math.PI/2;reflector.material.transparent=true;reflector.material.depthWrite=false;reflector.renderOrder=3;
      // Reflector clones uniforms, so retain the loaded texture objects explicitly.
      reflector.material.uniforms.maskMap.value=mask;reflector.material.uniforms.noiseMap.value=noise;
      // Orthographic-compatible planar reflection: the stock oblique clipping
      // formula assumes perspective. Mirror the active camera and clip globally.
      const mirrored=new T.OrthographicCamera();
      reflector.onBeforeRender=(renderer,world,camera)=>{
        const h=reflector.getWorldPosition(new T.Vector3()).y;
        const position=camera.getWorldPosition(new T.Vector3());
        const look=position.clone().add(camera.getWorldDirection(new T.Vector3()));
        position.y=2*h-position.y;look.y=2*h-look.y;
        mirrored.position.copy(position);mirrored.up.copy(camera.up);mirrored.up.y*=-1;
        mirrored.lookAt(look);mirrored.near=camera.near;mirrored.far=camera.far;
        mirrored.projectionMatrix.copy(camera.projectionMatrix);
        mirrored.projectionMatrixInverse.copy(camera.projectionMatrixInverse);mirrored.updateMatrixWorld();
        reflector.material.uniforms.textureMatrix.value.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(mirrored.projectionMatrix).multiply(mirrored.matrixWorldInverse).multiply(reflector.matrixWorld);
        const previous=renderer.getRenderTarget(),clips=renderer.clippingPlanes,shadow=renderer.shadowMap.autoUpdate;
        reflector.visible=false;renderer.clippingPlanes=[new T.Plane(new T.Vector3(0,1,0),-h-.005)];renderer.shadowMap.autoUpdate=false;
        try{renderer.setRenderTarget(reflector.getRenderTarget());renderer.render(world,mirrored);}
        finally{renderer.setRenderTarget(previous);renderer.clippingPlanes=clips;renderer.shadowMap.autoUpdate=shadow;reflector.visible=true;}
      };
      surfaces.push(reflector.material.uniforms);root.add(reflector);
      const wet=new T.Mesh(new T.PlaneGeometry(9.4,5.5),new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{maskMap:{value:mask}},vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D maskMap;varying vec2 st;void main(){float m=texture2D(maskMap,st).r;gl_FragColor=vec4(.16,.105,.055,m*.65);}'}));
      wet.rotation.x=-Math.PI/2;wet.position.set(-5.35,.395,6.25);wet.renderOrder=2;root.add(wet);
    },
    update(time){for(const uniforms of surfaces)uniforms.time.value=time;}
  };
}
