"""Compose the generated atlas into UV-ready base color + derived PBR maps.

Requires Pillow and numpy. This is texture preparation authorised with the
scene task: crop material swatches, normalise tile boundaries, and derive
micro-surface normals/roughness. Derived maps are approximations, not scans.
"""
from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
import json

ROOT=Path(__file__).resolve().parents[1]
TEX=ROOT/'assets'/'textures'
source=Image.open(TEX/'imagegen-source-atlas.png').convert('RGB')
w,h=source.size
mx,my=w//2,h//2
quads={'brickwall':(1,1,mx-1,my-1),'slate':(mx+1,1,w-1,my-1),'teal':(1,my+1,mx-1,h-1),'timber':(mx+1,my+1,w-1,h-1)}
tiles={k:source.crop(v).resize((512,512),Image.Resampling.LANCZOS) for k,v in quads.items()}
# Individual bricks should not depict an entire miniature brick wall.
# Extract the interior of one real brick and blend the slate micrograin.
brick=source.crop((267,272,357,295)).resize((512,512),Image.Resampling.BICUBIC)
grain=np.asarray(tiles['slate'],dtype=float).mean(axis=2)
grain=(grain-grain.mean())*.27
arr=np.asarray(brick,dtype=float)+grain[:,:,None]
tiles['masonry']=Image.fromarray(np.uint8(np.clip(arr,0,255)))

def compatible_edges(im):
    a=np.asarray(im,dtype=np.float32).copy()
    # Narrow 16-pixel feather to a shared opposing edge, keeping the centre.
    span=16
    for axis in [0,1]:
        a=np.swapaxes(a,0,axis)
        seam=(a[0]+a[-1])*.5
        for i in range(span):
            weight=(1-i/span)**2
            a[i]=a[i]*(1-weight)+seam*weight
            a[-1-i]=a[-1-i]*(1-weight)+seam*weight
        a=np.swapaxes(a,0,axis)
    return Image.fromarray(np.uint8(np.clip(a,0,255)))

report={'source':'imagegen-source-atlas.png','source_size':[w,h],'output_size':[512,512],'note':'Built-in ImageGen returned 1254 x 1254 rather than requested 2048. Preserve original; production quadrants are 512px. Normal/roughness are derived approximations. Opposite edges feathered over 16 pixels.','maps':[]}
for name,base in tiles.items():
    base=compatible_edges(base)
    if name=='slate':
        a=np.array(base,dtype=float)*1.38
        base=Image.fromarray(np.uint8(np.clip(a,0,255)))
    base.save(TEX/f'{name}_basecolor.png',optimize=True)
    smooth=base.convert('L').filter(ImageFilter.GaussianBlur(.65))
    height=np.asarray(smooth,dtype=float)/255
    dx=(np.roll(height,-1,1)-np.roll(height,1,1))*1.7
    dy=(np.roll(height,-1,0)-np.roll(height,1,0))*1.7
    normal=np.stack((-dx,dy,np.ones_like(dx)),axis=-1)
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    Image.fromarray(np.uint8(np.clip((normal*.5+.5)*255,0,255))).save(TEX/f'{name}_normal.png',optimize=True)
    mean={'slate':.31,'teal':.48,'masonry':.76,'brickwall':.80,'timber':.68}[name]
    rough=np.clip(mean+(height-height.mean())*.28,.15,.95)
    Image.fromarray(np.uint8(rough*255)).save(TEX/f'{name}_roughness.png',optimize=True)
    report['maps'].append({'material':name,'base_color':f'{name}_basecolor.png','normal':f'{name}_normal.png','roughness':f'{name}_roughness.png','base_color_space':'sRGB','data_space':'linear / Non-Color'})

# Checker includes numbered tiles and orientation marks for stretch review.
checker=Image.new('RGB',(1024,1024))
d=ImageDraw.Draw(checker)
for y in range(16):
    for x in range(16):
        col=(205,217,192) if (x+y)%2 else (37,72,76)
        d.rectangle((x*64,y*64,x*64+63,y*64+63),fill=col)
        d.text((x*64+7,y*64+6),f'{chr(65+y)}{x+1:02}',fill=(211,130,71) if (x+y)%2==0 else (30,57,60))
        d.line((x*64+20,y*64+43,x*64+43,y*64+43,x*64+38,y*64+38),fill=(235,177,79),width=2)
checker.save(TEX/'uv-checker.png',optimize=True)
(ROOT/'docs'/'texture-manifest.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
