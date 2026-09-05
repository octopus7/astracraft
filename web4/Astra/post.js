import * as T from 'three';
// Linear HDR scene target. Threshold only values > 1.35; tiny 1–3 px bloom kernel.
export function postProcess(renderer){
  const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:2});
  const scene=new T.Scene(), camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const material=new T.ShaderMaterial({uniforms:{source:{value:target.texture},pixel:{value:new T.Vector2()},strength:{value:.15}},vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`uniform sampler2D source;uniform vec2 pixel;uniform float strength;varying vec2 st;
    vec3 bright(vec2 p){vec3 c=texture2D(source,p).rgb;return c*max(0.,max(c.r,max(c.g,c.b))-1.35)/max(1.,max(c.r,max(c.g,c.b)));}
    void main(){vec3 base=texture2D(source,st).rgb;vec3 glow=vec3(0.);float weight=0.;
      for(int x=-2;x<=2;x++)for(int y=-2;y<=2;y++){float w=exp(-float(x*x+y*y)*.65);glow+=bright(st+vec2(float(x),float(y))*pixel*1.2)*w;weight+=w;}
      gl_FragColor=vec4(base+glow/max(weight,.01)*strength,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
  return {resize(w,h){target.setSize(w,h);material.uniforms.pixel.value.set(1/w,1/h);},render(world,view){renderer.setRenderTarget(target);renderer.render(world,view);renderer.setRenderTarget(null);renderer.render(scene,camera);}};
}
