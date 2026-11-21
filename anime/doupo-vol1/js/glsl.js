// Shared GLSL: hashes, value noise, fbm, fire colour ramp.
export const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash13(vec3 p3){ p3=fract(p3*.1031); p3+=dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
vec3 hash33(vec3 p3){ p3=fract(p3*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yxz+33.33); return fract((p3.xxy+p3.yxx)*p3.zyx); }
float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y); }
float vnoise3(vec3 p){ vec3 i=floor(p),f=fract(p); vec3 u=f*f*(3.-2.*f);
  float a=hash13(i),b=hash13(i+vec3(1,0,0)),c=hash13(i+vec3(0,1,0)),d=hash13(i+vec3(1,1,0));
  float e=hash13(i+vec3(0,0,1)),f1=hash13(i+vec3(1,0,1)),g=hash13(i+vec3(0,1,1)),h=hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),mix(mix(e,f1,u.x),mix(g,h,u.x),u.y),u.z); }
float fbm(vec2 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.02+vec2(17.1,3.7); a*=.5; } return s; }
float fbm3(vec3 p){ float s=0.,a=.5; for(int i=0;i<4;i++){ s+=a*vnoise3(p); p=p*2.03+vec3(11.3,5.1,7.7); a*=.5; } return s; }
vec3 fireRamp(float h){
  return vec3(1.15,0.24,0.025)*smoothstep(0.,0.32,h) + vec3(0.55,0.46,0.06)*smoothstep(0.3,0.78,h) + vec3(0.35,0.42,0.38)*smoothstep(0.8,1.2,h);
}
`;
