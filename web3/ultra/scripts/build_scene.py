"""AFTERLIGHT / The Rain Court. Run with Blender 4.5+ --background --python.
All geometry is authored here as editable meshes; ImageGen surfaces are external inputs.
Units metres, Z up. UV reuse across modular instances is intentional.
"""
import bpy, bmesh, math, random, json, sys, struct, os, time
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
TEX = ASSETS / 'textures'
random.seed(42)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for d in list(bpy.data.materials): bpy.data.materials.remove(d)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
collections={}
def collection(name):
    if name not in collections:
        c=bpy.data.collections.new(name);scene.collection.children.link(c);collections[name]=c
    return collections[name]

def material(name, color, rough=.6, metal=0, texture=None, emission=0,
             texture_overrides=None, albedo_factor=1, normal_strength=.32):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    if texture:
        for suffix,socket in [('albedo','Base Color'),('roughness','Roughness'),('normal','Normal')]:
            path=TEX/(texture_overrides or {}).get(suffix,f'{texture}-{suffix}.png')
            if not path.exists(): continue
            img=bpy.data.images.load(str(path),check_existing=True)
            if suffix!='albedo': img.colorspace_settings.name='Non-Color'
            n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=img;n.label='ImageGen / '+suffix
            if suffix=='normal':
                normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=normal_strength
                m.node_tree.links.new(n.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs[0],p.inputs[socket])
            elif suffix=='albedo' and albedo_factor!=1:
                # Recognized as a standard glTF baseColorFactor by Blender's exporter.
                multiply=m.node_tree.nodes.new('ShaderNodeMix');multiply.data_type='RGBA';multiply.blend_type='MULTIPLY'
                multiply.inputs[0].default_value=1;multiply.inputs[7].default_value=(albedo_factor,albedo_factor,albedo_factor,1)
                m.node_tree.links.new(n.outputs['Color'],multiply.inputs[6]);m.node_tree.links.new(multiply.outputs[2],p.inputs[socket])
            else: m.node_tree.links.new(n.outputs['Color'],p.inputs[socket])
    if emission:
        p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m

stone=material('M01 | ImageGen - weathered concrete',(.32,.34,.29),texture='concrete')
wet=material('M02 | Wet paving - ImageGen concrete',(.22,.24,.22),.35,texture='concrete',
             texture_overrides={'roughness':'wet-concrete-roughness.png'},albedo_factor=.38)
wet.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.45
wet.node_tree.nodes.get('Principled BSDF').inputs['Coat Roughness'].default_value=.14
rust=material('M03 | ImageGen - oxidized iron',(.25,.11,.045),.48,.66,'rust')
teal=material('M04 | ImageGen - old teal enamel',(.05,.32,.3),.35,.5,'painted-metal')
wood=material('M05 | ImageGen - cargo timber',(.2,.13,.07),texture='timber')
dark=material('M06 | charcoal structural steel',(.046,.063,.062),.42,.65)
brass=material('M07 | worn brass',(.42,.3,.11),.32,.7)
ochre=material('M08 | ochre enamel',(.47,.24,.055),.38,.3)
grout=material('M09 | damp earth',(.08,.092,.079),.58)
water=material('M10 | Rainwater - shallow dielectric',(.018,.026,.023),.10,0,texture='rainwater',
               texture_overrides={'normal':'ripple-normal.png'},normal_strength=.55)
water.node_tree.nodes.get('Principled BSDF').inputs['IOR'].default_value=1.333
water.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=0
leaves=[material('M11 | ivy '+str(i),c,.78) for i,c in enumerate([(.13,.17,.065),(.23,.22,.065),(.085,.14,.073)])]
warm=material('M12 | lantern amber emission',(1,.56,.17),.27,emission=4)
cyan=material('M13 | signal cyan emission',(.17,.95,1),.3,emission=3.5)
letter=material('M14 | warm chalk',(.64,.62,.44),.7)
window=material('M15 | dusty amber glass',(.35,.22,.08),.3,emission=.65)
brickm=[material('M16 | masonry '+str(i),tuple(v*.65 for v in c),.58) for i,c in enumerate([(.23,.26,.23),(.31,.32,.27),(.38,.36,.28),(.19,.23,.21),(.285,.30,.26)])]

cache={}
def uv_project(mesh):
    obj=bpy.data.objects.new('_UV_WORK',mesh);collection('_UV_WORK').objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(65),island_margin=.035,area_weight=.0,correct_aspect=True,scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT');mesh.uv_layers.active.name='UVMap'
    bpy.data.objects.remove(obj,do_unlink=True)

def mesh_box(dims,bevel):
    key=('box',tuple(round(x,3) for x in dims),round(bevel,3))
    if key in cache:return cache[key]
    bm=bmesh.new();bmesh.ops.create_cube(bm,size=1)
    for v in bm.verts:v.co.x*=dims[0];v.co.y*=dims[1];v.co.z*=dims[2]
    if bevel:bmesh.ops.bevel(bm,geom=list(bm.edges),offset=min(bevel,min(dims)*.25),segments=1,affect='EDGES')
    mesh=bpy.data.meshes.new('module_'+str(len(cache)));bm.to_mesh(mesh);bm.free();mesh.update();uv_project(mesh);cache[key]=mesh
    return mesh

def obj_from(mesh,name,loc,mat,col,rot=(0,0,0),scale=(1,1,1)):
    # Material slot is object-linked, allowing material variants with shared geometry / UV.
    o=bpy.data.objects.new(name,mesh);collection(col).objects.link(o);o.location=loc;o.rotation_euler=rot;o.scale=scale
    if not mesh.materials:mesh.materials.append(mat)
    o.material_slots[0].link='OBJECT';o.material_slots[0].material=mat
    o['uv_policy']='Unique packed islands per module. Shared UV across intentional repeated instances.'
    return o
def box(name,loc,dims,mat,col='Architecture',bevel=.035,rot=(0,0,0),scale=(1,1,1)):
    return obj_from(mesh_box(dims,bevel),name,loc,mat,col,rot,scale)

def cylinder_mesh(radius,depth,verts=12):
    key=('cylinder',round(radius,3),round(depth,3),verts)
    if key in cache:return cache[key]
    bm=bmesh.new();bmesh.ops.create_cone(bm,cap_ends=True,cap_tris=False,segments=verts,radius1=radius,radius2=radius,depth=depth)
    me=bpy.data.meshes.new('cylinder_'+str(len(cache)));bm.to_mesh(me);bm.free();uv_project(me);cache[key]=me;return me
def cyl(name,loc,radius,depth,mat,col='Infrastructure',rot=(0,0,0),verts=12):
    return obj_from(cylinder_mesh(radius,depth,verts),name,loc,mat,col,rot)
def beam(name,a,b,radius,mat,col='Infrastructure',verts=10):
    delta=Vector(b)-Vector(a);o=cyl(name,(Vector(a)+Vector(b))/2,radius,delta.length,mat,col,verts=verts)
    o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();return o
def sphere(name,loc,scale,mat,col='Botany'):
    key=('ico',1)
    if key not in cache:
        bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=1,radius=1)
        me=bpy.data.meshes.new('ico_leaf_or_joint');bm.to_mesh(me);bm.free();uv_project(me);cache[key]=me
    return obj_from(cache[key],name,loc,mat,col,scale=scale)
def text_mesh(name,body,loc,size,mat,col='Signage',rot=(math.pi/2,0,0),align='CENTER'):
    curve=bpy.data.curves.new(name,'FONT');curve.body=body;curve.size=size;curve.align_x=align;curve.extrude=.012;curve.bevel_depth=0
    o=bpy.data.objects.new(name,curve);collection(col).objects.link(o);o.location=loc;o.rotation_euler=rot
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00001)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    zero_faces=[f for f in bm.faces if f.calc_area()<1e-12]
    if zero_faces:bmesh.ops.delete(bm,geom=zero_faces,context='FACES')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(o.data);bm.free();uv_project(o.data);o.data.materials.append(mat);return o

# The court is a complete diorama, open at the front to keep the subject legible.
WATER_LEVEL=.166
PUDDLE_LAYOUT=[('Long shop reflection',2.6,4.5,4.1,.8),('Pool around companion',4.6,0,3.2,3.55),('Gate runoff',-5.6,3.3,1.6,2.4),('Front rain pool',-2,-6.6,2.3,1),('Drained right edge',9,-1,1,5)]
terrain_rng=random.Random(271828)
terrain_tiles=[]
def smoothstep(low,high,value):
    t=max(0,min(1,(value-low)/(high-low)))
    return t*t*(3-2*t)

def basin_tile_pose(x,y,original_z,yaw):
    """Rigid stones settle into the closest elliptical basin, with a low rim.

    A private RNG preserves every original architecture/prop/plant placement.
    The normal points downhill towards the ellipse center, with small independent
    angular variation, while the flat water remains on a single horizontal plane.
    """
    candidates=[]
    for name,cx,cy,rx,ry in PUDDLE_LAYOUT:
        radius=math.hypot((x-cx)/rx,(y-cy)/ry)
        candidates.append((radius,name,cx,cy,rx,ry))
    radius,name,cx,cy,rx,ry=min(candidates)
    influence=1-smoothstep(1.15,1.75,radius)
    rim=.070*math.exp(-((radius-1.08)/.38)**2)
    sink=.065*(1-smoothstep(.08,1.02,radius))
    settling=terrain_rng.uniform(-.008,.008)*influence
    displacement=rim-sink+settling
    shoulder=math.exp(-((radius-.9)/.45)**2)
    basin_tilt=min(6,max(2,(2.1+3.7*shoulder)*terrain_rng.uniform(.86,1.08)))
    tilt_degrees=basin_tilt*influence+terrain_rng.uniform(.3,.9)*(1-influence)
    outward=math.atan2((y-cy)/(ry*ry),(x-cx)/(rx*rx))
    direction=outward+terrain_rng.uniform(-.22,.22)
    slope=math.tan(math.radians(tilt_degrees))
    normal=Vector((-slope*math.cos(direction),-slope*math.sin(direction),1)).normalized()
    tilt=Vector((0,0,1)).rotation_difference(normal)
    rotation=(tilt @ Quaternion((0,0,1),yaw)).to_euler('XYZ')
    return original_z+displacement,rotation,{'basin':name,'ellipse_radius':radius,
        'settlement_m':displacement,'tilt_degrees':tilt_degrees,
        'downhill_alignment':math.cos(direction-outward)}

# Lower the supporting surfaces, keeping the plinth's bottom at -.95 m.
# Their opaque depth remains continuous beneath the depressed paving.
box('Foundation | exposed diorama plinth',(0,0,-.56),(22.6,18.8,.78),dark,'Ground',.14)
box('Subgrade | mortar',(0,0,-.13),(21.8,18,.12),grout,'Ground',.02)
for row in range(18):
    for col in range(20):
        x=-10.15+col*1.08+(.52 if row%2 else 0);y=-8.25+row*.98
        if x>10.6:continue
        if random.random()<.035:continue
        original_z=.07+random.uniform(-.018,.018);yaw=random.uniform(-.012,.012)
        tile_z,tile_rotation,terrain_info=basin_tile_pose(x,y,original_z,yaw)
        tile=box('Paving | staggered wet flagstone',(x,y,tile_z),(1.035,.93,.15),wet,'Paving',.025,rot=tile_rotation)
        for key,value in terrain_info.items():tile['terrain_'+key]=value
        terrain_tiles.append((tile,terrain_info))
        if random.random()<.07:
            rotation=tile.rotation_euler.to_matrix()
            a=tile.location+rotation @ Vector((-.4,-.2,.071))
            b=tile.location+rotation @ Vector((.3,.3,.071))
            beam('Hairline paving fracture',a,b,.012,grout,'Ground',6)

def puddle(name,cx,cy,rx,ry):
    count=28;verts=[(cx,cy,WATER_LEVEL)]
    for i in range(count):
        a=2*math.pi*i/count;s=random.uniform(.79,1.12)
        random.uniform(-.0005,.0005)  # Preserve legacy RNG sequence; water stays level.
        verts.append((cx+math.cos(a)*rx*s,cy+math.sin(a)*ry*s,WATER_LEVEL))
    faces=[(0,i+1,(i+1)%count+1) for i in range(count)]
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    uv=me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=((v.x-cx)/(2.5*rx)+.5,(v.y-cy)/(2.5*ry)+.5)
    return obj_from(me,name,(0,0,0),water,'Rainwater')
for args in PUDDLE_LAYOUT:puddle(*args)

def inside_polygon(x,y,ring):
    inside=False
    previous=ring[-1]
    for current in ring:
        if (current.y>y)!=(previous.y>y):
            crossing=(previous.x-current.x)*(y-current.y)/(previous.y-current.y)+current.x
            if x<crossing:inside=not inside
        previous=current
    return inside

def audit_terrain():
    """Sample actual transformed top faces against the exact irregular water rings."""
    bpy.context.view_layer.update()
    rings=[[v.co.copy() for v in o.data.vertices][1:] for o in collection('Rainwater').objects]
    report={'schema':'rain-court-paving-validation/v1','terrain_seed':271828,
        'water_level_m':WATER_LEVEL,'mortar_top_m':-.07,'plinth_top_m':-.17,
        'puddle_xy_layout':PUDDLE_LAYOUT,'tile_count':len(terrain_tiles),'tiles':[]}
    depths=[];core_depths=[];all_top_heights=[];mixed=0
    for tile,info in terrain_tiles:
        matrix=tile.matrix_world
        top=max(v.co.z for v in tile.data.vertices)
        top_heights=[(matrix @ v.co).z for v in tile.data.vertices if abs(v.co.z-top)<1e-5]
        all_top_heights.extend(top_heights)
        tile_depths=[]
        for xi in range(5):
            for yi in range(5):
                p=matrix @ Vector((-.47+xi*.235,-.42+yi*.21,top))
                if any(inside_polygon(p.x,p.y,ring) for ring in rings):
                    tile_depths.append(WATER_LEVEL-p.z)
        depths.extend(tile_depths)
        if tile_depths and min(tile_depths)<-.002 and max(tile_depths)>.002:mixed+=1
        center=matrix @ Vector((0,0,top))
        if info['ellipse_radius']<.55 and any(inside_polygon(center.x,center.y,ring) for ring in rings):
            core_depths.append(WATER_LEVEL-center.z)
        item={'name':tile.name,**{key:round(value,6) if isinstance(value,float) else value for key,value in info.items()},
            'top_height_min_m':round(min(top_heights),6),'top_height_max_m':round(max(top_heights),6),
            'water_covered_samples':len(tile_depths)}
        if tile_depths:item.update(water_depth_min_m=round(min(tile_depths),6),water_depth_max_m=round(max(tile_depths),6))
        report['tiles'].append(item)
    wet_tiles=[info for tile,info in terrain_tiles if info['ellipse_radius']<=1.15]
    water_heights=[v.co.z for o in collection('Rainwater').objects for v in o.data.vertices]
    report['summary']={'tilt_min_degrees':min(info['tilt_degrees'] for tile,info in terrain_tiles),
        'tilt_max_degrees':max(info['tilt_degrees'] for tile,info in terrain_tiles),
        'wet_zone_tilt_min_degrees':min(info['tilt_degrees'] for info in wet_tiles),
        'wet_zone_tilt_max_degrees':max(info['tilt_degrees'] for info in wet_tiles),
        'minimum_inward_alignment_cosine':min(info['downhill_alignment'] for info in wet_tiles),
        'settlement_min_m':min(info['settlement_m'] for tile,info in terrain_tiles),
        'settlement_max_m':max(info['settlement_m'] for tile,info in terrain_tiles),
        'water_surface_height_range_m':max(water_heights)-min(water_heights),
        'water_covered_top_samples':len(depths),'submerged_top_samples':sum(d>.002 for d in depths),
        'exposed_top_samples':sum(d<-.002 for d in depths),'shore_crossing_tiles':mixed,
        'core_center_count':len(core_depths),'core_center_depth_min_m':min(core_depths),
        'core_center_depth_max_m':max(core_depths),'water_depth_max_m':max(depths),
        'exposed_height_max_m':-min(depths),
        'minimum_top_clearance_above_mortar_m':min(all_top_heights)+.07}
    assert report['summary']['water_surface_height_range_m']<1e-7
    assert report['summary']['core_center_depth_min_m']>.008
    assert report['summary']['minimum_top_clearance_above_mortar_m']>.025
    assert mixed>=10 and report['summary']['exposed_top_samples']>=20
    report['passed']=True
    (ROOT/'docs'/'paving-validation.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    return report['summary']

terrain_summary=audit_terrain()

def wall_segment(name,axis,fixed,start,end,height):
    # individually modelled bricks, courses, projecting pilasters and broken capstones
    rows=int(height/.36)
    length=end-start;count=int(length/.77)
    for row in range(rows):
        for j in range(count):
            t=start+.39+j*.78+(.38 if row%2 else 0)
            if t>end-.1:continue
            if row>=rows-2 and random.random()<.22:continue
            pos=(t,fixed,.32+row*.36) if axis=='X' else (fixed,t,.32+row*.36)
            dims=(.735,.5,.32) if axis=='X' else (.5,.735,.32)
            box(name+' | brick',pos,dims,random.choice(brickm),'Masonry',.025,rot=(0,0,random.uniform(-.018,.018)))
    for k in range(int(length/3)+1):
        t=start+.25+k*3
        if t>end:continue
        pos=(t,fixed,height*.49) if axis=='X' else (fixed,t,height*.49)
        box(name+' | pier',pos,(.62,.74,height) if axis=='X' else (.74,.62,height),stone,'Masonry',.025)
        for z in [.35,height-.12]:
            pos=(t,fixed,z) if axis=='X' else (fixed,t,z)
            box(name+' | pier cap',pos,(.86,.94,.2) if axis=='X' else (.94,.86,.2),random.choice(brickm),'Masonry',.04)
    for j in range(int(length/.6)):
        if random.random()<.13:continue
        t=start+.3+j*.6;z=height+random.uniform(-.1,.13)
        pos=(t,fixed,z) if axis=='X' else (fixed,t,z)
        box(name+' | loose coping',pos,(.56,.7,.18) if axis=='X' else (.7,.56,.18),random.choice(brickm),'Masonry',.02,rot=(0,0,random.uniform(-.09,.09)))

wall_segment('West boundary','Y',-10.6,-8.4,8.4,4.65)
wall_segment('East boundary','Y',10.6,-6.5,8.4,4.8)
wall_segment('North wall left','X',8,-10.6,-7.8,5.2)
wall_segment('North wall center','X',8,-4.7,10.6,5.15)
wall_segment('Front broken parapet','X',-8.55,-10.7,-5.1,1.15)
wall_segment('Front east remnant','X',-8.55,7.7,10.7,1.5)

# Monumental entrance between stone piers.
box('Gate shadow recess',(-6.2,8.13,2.5),(2.9,.36,4.7),dark,'Gate',.04)
for x in [-6.85,-5.55]:
    box('Gate teal panel',(x,7.87,2.2),(1.22,.18,3.6),teal,'Gate')
    for z in [1,1.35,2.7,3.25]:box('Gate reinforcement',(x,7.7,z),(1.12,.14,.09),dark,'Gate',.015)
    for dx in [-.42,.42]:box('Gate raised seam',(x+dx,7.69,2.25),(.065,.16,3.2),brass,'Gate',.01)
for x in [-7.7,-4.7]:
    box('Gate light groove',(x,7.62,2.7),(.15,.18,3.7),dark,'Gate')
    box('Gate cyan vertical',(x,7.5,2.8),(.045,.035,2.5),cyan,'Gate',.004)
box('Gate transom',(-6.2,7.66,4.37),(3.25,.54,.42),stone,'Gate')
for x in [-7.15,-6.2,-5.25]:box('Gate transom light',(x,7.36,4.37),(.58,.03,.06),cyan,'Gate',.005)
text_mesh('Gate district number','04',(-6.2,7.49,3.25),.47,letter,'Gate')

# Taller industrial backdrop, roof rails, window bays and chimney silhouettes.
for i,(x,y,w,d,h) in enumerate([(-9,11.2,6,5,8.6),(-2.5,12.4,5,4,10.7),(4.1,12.2,6.9,5.5,8.4),(10.8,11.7,5,4.5,10),(-14.1,1.4,5.5,13.5,7.4)]):
    box('Foundry block '+str(i),(x,y,h/2),(w,d,h),stone,'City',.08)
    box('Foundry roof overhang',(x,y,h+.1),(w+.4,d+.4,.23),dark,'City',.04)
    for floor in range(2,int(h/2.1)+1):
        z=floor*1.8-.5
        for c in range(max(1,int(w/1.2))):
            wx=x-w/2+.65+c*1.18
            box('Factory window recess',(wx,y-d/2-.031,z),(.69,.06,1.13),dark,'City',.015)
            if random.random()<.12:box('Dim inhabited window',(wx,y-d/2-.07,z),(.5,.02,.9),window,'City',.01)
            box('Factory window mullion',(wx,y-d/2-.081,z),(.035,.06,1.1),brass,'City',.005)
    for j in range(3):
        sx=x-w*.29+j*w*.28
        box('Roof ventilation stack',(sx,y,h+.64),(.85,1.2,1),dark,'City',.025)
        box('Vent rain cap',(sx,y,h+1.16),(1.2,1.5,.12),stone,'City',.02)
    for zz in [h-.5,1.5]:box('Building cornice',(x,y-d/2-.09,zz),(w+.18,.3,.21),brass,'City',.02)
for x in [-14.5,-12.9]:
    cyl('Boiler exhaust chimney',(x,5.7,9),.35,5.7,rust,'City',verts=16)
    cyl('Chimney crown',(x,5.7,11.83),.48,.2,dark,'City',verts=16)

# Repair kiosk, full shopfront, door, lit displays and riveted patched awning.
box('Kiosk shell',(2.1,6.67,1.8),(7.3,2.55,3.5),dark,'Shop',.055)
box('Kiosk top fascia',(2.1,5.3,3.48),(7.5,.28,.5),wood,'Shop',.025)
box('Warm service recess',(.25,5.3,1.87),(2.72,.12,1.79),teal,'Shop')
box('Service opening',(.25,5.19,2.06),(2.3,.09,1.12),dark,'Shop',.02)
for i in range(5):
    box('Service interior shelf',(.25,5.03,1.66+i*.205),(2.3,.19,.045),wood,'Shop',.005)
    for j in range(5):
        if random.random()<.4:box('Spare component on shelf',(-.65+j*.42,4.92,1.74+i*.205),(.19,.09,.11),random.choice([brass,ochre,teal]),'Shop',.01)
box('Service counter',(.25,4.84,1.31),(3.08,.7,.16),wood,'Shop',.035)
box('Warm repair window',(3.93,5.27,2.04),(1.65,.06,1.58),window,'Shop',.02)
for x in [3.11,3.66,4.21,4.76]:box('Window muntin',(x,5.19,2.04),(.052,.08,1.7),dark,'Shop',.008)
for z in [1.24,1.78,2.32,2.84]:box('Window crossbar',(3.93,5.18,z),(1.75,.08,.048),dark,'Shop',.008)
box('Repair shop door',(2.27,5.19,1.44),(.99,.19,2.55),teal,'Shop')
box('Door top glass',(2.27,5.07,2.02),(.67,.045,.95),window,'Shop',.01)
box('Door push plate',(2.54,5.02,1.18),(.055,.06,.31),brass,'Shop',.009)
box('Shop threshold',(2.28,4.87,.26),(1.27,.6,.21),stone,'Shop')
for x in [-1.53,5.68]:box('Shop upright',(x,5.18,1.77),(.2,.35,3.45),rust,'Shop')
for x in [-1.3,5.5]:
    box('Bench seat',(x,4.69,.65),(1.3,.57,.14),wood,'Shop')
    for dx in [-.43,.43]:box('Bench steel leg',(x+dx,4.72,.36),(.08,.36,.62),dark,'Shop',.012)
box('Repair shop signboard',(2.05,5.035,3.52),(5.1,.08,.49),dark,'Signage',.01)
text_mesh('The Rain Court sign','THE RAIN COURT',(2.05,4.974,3.39),.265,letter)
text_mesh('Shop lower label','REPAIRS  /  SALVAGE',(.25,4.72,1.05),.128,letter)
for j in range(19):
    x=-1.9+j*.44
    box('Corrugated kiosk roof',(x,6.25,3.93),(.42,3.7,.10),rust if j%4 else dark,'Roof',.012,rot=(.16,0,0))
    box('Roof standing seam',(x+.2,6.25,3.99),(.04,3.7,.055),brass,'Roof',.008,rot=(.16,0,0))
for j in range(4):box('Roof repair patch',(-.9+j*1.8,6.2+(j%2)*.8,4.04),(1.16,.79,.045),dark,'Roof',.01,rot=(.16,0,random.uniform(-.15,.15)))
beam('Awning front gutter',(-2.2,4.39,3.69),(6.5,4.39,3.69),.084,rust,'Roof')
for x in [-1.85,6.17]:
    beam('Awning diagonal bracket',(x,5.15,2.74),(x,4.46,3.68),.048,rust,'Roof')

def lamp(x,y,z):
    beam('Lantern wall bracket',(x,y+.4,z+.25),(x,y,z+.25),.04,dark,'Lighting')
    box('Lantern glowing glass',(x,y,z),(.23,.23,.43),warm,'Lighting',.025)
    for dz in [-.25,.25]:box('Lantern cap',(x,y,z+dz),(.35,.35,.09),dark,'Lighting',.025)
    for dx in [-.12,.12]:
        for dy in [-.12,.12]:box('Lantern cage',(x+dx,y+dy,z),(.035,.035,.49),brass,'Lighting',.008)
    light=bpy.data.lights.new('Amber lantern bounce','POINT');light.energy=70;light.color=(1,.52,.2);light.shadow_soft_size=.5
    o=bpy.data.objects.new('Lantern practical light',light);collection('Lighting').objects.link(o);o.location=(x,y-.2,z)
for x in [-1.45,1.45,5.47]:lamp(x,4.92,2.63)

# Surface-mounted services: parallel pipes, flanges, meters, conduits and cables.
for x in [7.1,7.46,8.06]:
    beam('North downpipe',(x,7.52,.45),(x,7.52,5.27),.075 if x<8 else .12,rust)
    for z in [.9,2.1,3.9]:cyl('Pipe clamp',(x,7.52,z),.108 if x<8 else .16,.085,brass)
    beam('North pipe elbow',(x,7.52,.55),(x,6.95,.26),.075,rust)
for z in [3.48,3.73]:
    beam('North service horizontal',(-4.1,7.57,z),(9.6,7.57,z),.043,rust)
for y in [-4.1,-3.75,2.5]:
    beam('West drain vertical',(-10.19,y,.4),(-10.19,y,4.9),.09,rust)
for z in [2.3,2.59]:beam('West long water main',(-10.1,-7.5,z),(-10.1,7.4,z),.105,dark)
box('Electrical meter cabinet',(8.7,7.49,1.4),(.85,.32,1.1),teal,'Infrastructure')
box('Meter face',(8.7,7.28,1.55),(.58,.06,.33),dark,'Infrastructure',.01)
for i in range(3):box('Meter indicator',(8.48+i*.19,7.23,1.55),(.07,.025,.07),cyan,'Infrastructure',.006)
for z in [1.03,1.11,1.19]:box('Meter vent',(8.7,7.26,z),(.62,.03,.018),dark,'Infrastructure',.003)
for x in [-8.7,9.2]:
    for y in [-5,0,4]:
        box('Storm drain rim',(x,y,.172),(.7,1.15,.045),dark,'Drainage',.015)
        for j in range(9):box('Storm drain grille',(x,y-.47+j*.115,.204),(.61,.032,.03),brass,'Drainage',.006)
# Hanging cable has geometry and is portable.
for shift in [0,.3]:
    points=[(-10+20*i/20,5.8+shift,5.7-1.28*math.sin(math.pi*i/20)) for i in range(21)]
    for i in range(20):beam('Overhead sagging utility cable',points[i],points[i+1],.022,dark)

def crate(x,y,z,s=1):
    box('Salvage crate body',(x,y,z+.45*s),(.88,.78,.88),wood,'Cargo',.035,scale=(s,s,s))
    for dx in [-.36,.36]:box('Crate front iron strap',(x+dx*s,y-.405*s,z+.45*s),(.075,.045,.91),rust,'Cargo',.009,scale=(s,s,s))
    for zz in [.12,.77]:box('Crate front cross slat',(x,y-.445*s,z+zz*s),(.92,.065,.13),wood,'Cargo',.015,scale=(s,s,s))
    for yy in [-.27,.27]:box('Crate lid strap',(x,y+yy*s,z+.91*s),(.91,.06,.05),brass,'Cargo',.008,scale=(s,s,s))
    box('Crate paper label',(x+.07*s,y-.484*s,z+.48*s),(.23,.008,.16),letter,'Cargo',.001,scale=(s,s,s))
for x,y in [(-7,-3.3),(-4,4.4),(8.5,-5.8)]:
    box('Cargo pallet',(x,y,.22),(2.35,1.63,.19),wood,'Cargo',.022)
    for dx,dy,s in [(-.52,-.3,1.15),(.55,-.25,1),(-.42,.52,.85),(.55,.55,.8)]:crate(x+dx,y+dy,.31,s)
    crate(x-.44,y-.24,1.38,.83);crate(x+.48,y+.1,1.23,.73)
for x,y in [(-8,1.8),(7.5,4.5)]:
    cyl('Reclaimed steel drum',(x,y,.66),.42,1.02,rust,'Cargo',verts=16)
    for z in [.24,.53,.97,1.14]:cyl('Drum rolled band',(x,y,z),.438,.05,dark,'Cargo',verts=16)

def robot(name,x,y,scale=1,color=teal,angle=0):
    col='Robots';made=[]
    # Parts are true separated meshes; parent transform poses the complete character.
    before=set(bpy.data.objects)
    for dx in [-.25,.25]:
        box(name+' | grounded foot',(x+dx,y-.13,.3),(.37,.59,.25),dark,col,.06)
        cyl(name+' | ankle',(x+dx,y,.51),.10,.3,brass,col)
        box(name+' | shin',(x+dx,y,.66),(.22,.28,.36),color,col,.035)
        sphere(name+' | knee',(x+dx,y,.91),(.14,.15,.14),dark,col)
    box(name+' | hip',(x,y,1.04),(.63,.39,.19),dark,col,.04)
    box(name+' | body shell',(x,y,1.42),(.83,.52,.67),color,col,.085)
    box(name+' | chest inset',(x,y-.282,1.45),(.59,.045,.35),dark,col,.025)
    for i in range(4):box(name+' | chest grille',(x-.2+i*.135,y-.313,1.38),(.065,.02,.15),brass,col,.01)
    box(name+' | chest signal',(x+.16,y-.316,1.57),(.12,.023,.037),cyan,col,.008)
    cyl(name+' | neck',(x,y,1.86),.12,.19,brass,col)
    box(name+' | head',(x,y-.03,2.04),(.63,.49,.39),color,col,.07)
    box(name+' | face visor',(x,y-.291,2.06),(.52,.045,.22),dark,col,.04)
    for dx in [-.145,.145]:box(name+' | warm optic',(x+dx,y-.32,2.075),(.105,.032,.073),warm,col,.015)
    box(name+' | cap brim',(x,y-.08,2.28),(.73,.64,.07),dark,col,.02)
    beam(name+' | antenna',(x+.22,y+.1,2.29),(x+.26,y+.1,2.67),.023,brass,col)
    sphere(name+' | antenna light',(x+.26,y+.1,2.68),(.054,.054,.054),cyan,col)
    for side in [-1,1]:
        sx=x+side*.52
        sphere(name+' | shoulder',(sx,y,1.65),(.16,.16,.16),brass,col)
        beam(name+' | upper arm',(sx,y,1.6),(sx+side*.1,y-.07,1.27),.105,dark,col)
        box(name+' | forearm',(sx+side*.09,y-.13,1.13),(.23,.26,.35),color,col,.04)
        for f in [-1,1]:box(name+' | claw',(sx+side*.09+f*.082,y-.15,.9),(.065,.22,.16),brass,col,.012)
    for dx in [-.31,.31]:
        for z in [1.2,1.66]:cyl(name+' | body rivet',(x+dx,y-.295,z),.025,.025,brass,col,rot=(math.pi/2,0,0),verts=8)
    box(name+' | backpack',(x,y+.37,1.45),(.5,.24,.46),dark,col,.035)
    for z in [1.3,1.41,1.52]:box(name+' | battery rib',(x,y+.51,z),(.45,.04,.043),brass,col,.007)
    origin=Vector((x,y,.17))
    for o in set(bpy.data.objects)-before:
        delta=o.location-origin;delta*=scale
        px=delta.x*math.cos(angle)-delta.y*math.sin(angle);py=delta.x*math.sin(angle)+delta.y*math.cos(angle)
        o.location=origin+Vector((px,py,delta.z));o.scale*=scale;o.rotation_euler.z+=angle
robot('MOSS / courier 07',4.8,-2.05,1,teal,-.25)
robot('PIP / repair unit',-4.9,2.3,.64,ochre,.18)
robot('TUG / cargo helper',2.88,-2.6,.72,stone,.18)
text_mesh('Courier ID','07',(4.8,-2.345,1.73),.11,letter,'Robots',rot=(math.pi/2,0,-.25))

# Ivy cascades and small ground vegetation break the hard edges.
for cx,cy,cz,side in [(-9.95,3.4,4.8,'W'),(-9.95,-5.2,4.7,'W'),(-8.8,7.53,5.3,'N'),(-4.15,7.5,5.35,'N'),(7.8,7.5,5.3,'N'),(10.23,2.8,4.9,'E')]:
    for branch in range(5):
        offset=random.uniform(-.65,.65);length=random.uniform(1.25,3.2)
        for i in range(13):
            t=i/12;z=cz-length*t;xx=cx+offset+math.sin(i*.8)*.1 if side=='N' else cx+math.sin(i)*.075
            yy=cy-.1+math.sin(i*.8)*.08 if side=='N' else cy+offset+math.sin(i)*.1
            if i<12:beam('Ivy woody runner',(xx,yy,z),(xx+.025,yy,z-length/12),.013,leaves[0],'Botany',6)
            for sign in [-1,1]:
                sphere('Ivy leaf',(xx+sign*.13,yy-.08,z),(.15,.045,.1),random.choice(leaves),'Botany')
for i in range(120):
    edge=random.choice(['W','N','E']);x=random.uniform(-10,10);y=random.uniform(-8,7.7)
    if edge=='W':x=random.uniform(-10.3,-9.55)
    elif edge=='E':x=random.uniform(9.6,10.35)
    else:y=random.uniform(7.15,7.7)
    sphere('Weed clump',(x,y,.24),(random.uniform(.1,.24),.11,random.uniform(.06,.2)),random.choice(leaves))
for i in range(70):
    x=random.uniform(-10,10);y=random.uniform(-8,8)
    if abs(x)<8 and y<5 and random.random()<.8:continue
    box('Loose masonry rubble',(x,y,.22),(.22,.18,.15),random.choice(brickm),'Debris',.01,rot=(random.uniform(-.2,.2),random.uniform(-.3,.3),random.random()*6.2))

# Lighting and hero camera. No composited reference image is used in the render.
def area(name,loc,power,color,size,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);collection('Lighting').objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Late sun through the foundry',(-10,-2,16),3200,(1,.76,.48),10,(0,1,0))
area('Cool sky fill',(7,-1,14),2200,(.39,.68,.74),14,(0,0,0))
area('Golden front reflection',(-3,-10,10),1600,(1,.84,.59),8,(0,0,0))
area('Shop threshold amber wash',(2,4.3,3.3),190,(1,.48,.14),3,(2,2,0))
area('Gate cyan bounce',(-6.2,6.9,3),110,(.15,.82,1),2,(-6.2,3.5,0))
world=bpy.data.worlds.new('After the rain / blue-grey sky');world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.16,.21,.225,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.45;scene.world=world
sun=bpy.data.lights.new('Low western sun','SUN');sun.energy=1.6;sun.angle=.15;sun.color=(1,.82,.58)
so=bpy.data.objects.new('Low western sun',sun);collection('Lighting').objects.link(so);so.rotation_euler=(.5,-.6,-.5)
camd=bpy.data.cameras.new('Hero 48mm');cam=bpy.data.objects.new('CAMERA | The Rain Court',camd);collection('Cameras').objects.link(cam)
cam.location=(22,-29,23);target=Vector((0,1.2,1.9));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camd.type='ORTHO';camd.ortho_scale=32;camd.lens=48;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type!='CPU'
    if any(d.type!='CPU' for d in prefs.devices):scene.cycles.device='GPU'
except Exception as e:print('GPU setup',e)
scene.render.resolution_x=1800;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.45
scene.render.image_settings.color_mode='RGB'
scene.use_nodes=True;nodes=scene.node_tree.nodes;nodes.clear();rl=nodes.new('CompositorNodeRLayers');glare=nodes.new('CompositorNodeGlare');glare.glare_type='FOG_GLOW';glare.quality='MEDIUM';glare.threshold=1.4;glare.mix=-.94
composite=nodes.new('CompositorNodeComposite');scene.node_tree.links.new(rl.outputs['Image'],glare.inputs['Image']);scene.node_tree.links.new(glare.outputs['Image'],composite.inputs['Image'])

# UV layout evidence for every unique mesh, with names linking repeated modules.
(ASSETS/'uv').mkdir(exist_ok=True)
manifest=[]
used={o.data for o in scene.objects if o.type=='MESH'}
for index,me in enumerate(sorted(used,key=lambda m:m.name)):
    uv=me.uv_layers.active
    if not uv:raise RuntimeError('No UV '+me.name)
    path=ASSETS/'uv'/f'{index:03d}-{me.name.replace("/","_")}.svg'
    lines=['<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">','<rect width="1024" height="1024" fill="#122126"/>','<g fill="#698579" fill-opacity=".27" stroke="#d0cf9b" stroke-width="1">']
    for poly in me.polygons:
        pts=' '.join(f'{uv.data[li].uv.x*1024:.3f},{(1-uv.data[li].uv.y)*1024:.3f}' for li in poly.loop_indices)
        lines.append(f'<polygon points="{pts}"/>')
    lines+=['</g></svg>'];path.write_text('\n'.join(lines),encoding='utf8')
    users=[o.name for o in scene.objects if o.type=='MESH' and o.data==me]
    manifest.append({'mesh':me.name,'file':path.name,'instances':len(users),'example_objects':users[:4],'polygons':len(me.polygons),'vertices':len(me.vertices)})
(ASSETS/'uv'/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
stats={'objects':sum(o.type=='MESH' for o in scene.objects),'unique_meshes':len(used),'triangles_instanced':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH'),'materials':len(bpy.data.materials),'imagegen_textures':13,'shader_data_textures':3,'units':'metres','seed':42,'uv_policy':'Packed islands per module, .035 smart_project island_margin. Intentional shared layout on repeated bricks, tiles, beams, crates, robot parts. Puddle planar UV continuous with adjacent edges. No atlas painting required; material-class tiling surfaces.','wet_surface_pbr':{'paving_albedo_factor_linear':.38,'paving_roughness_range':[.2,.5],'paving_clearcoat':.45,'water_metallic':0,'water_ior':1.333,'water_roughness':.1,'normal_map':'ripple-normal.png','runtime_world_wetness_map':'wetness-map.png'}}
stats['paving_terrain']=terrain_summary
(ROOT/'docs'/'scene-manifest.json').write_text(json.dumps(stats,indent=2),encoding='utf8')

for im in bpy.data.images:
    if im.source=='FILE':
        im.pack()
        im.filepath=bpy.path.relpath(im.filepath,start=str(ASSETS))
# Save source before render, and export mesh-only game assets with standard PBR.
def preserve_water_ior(path):
    """Blender omits IOR on opaque surfaces without another transmission extension.

    KHR_materials_ior itself permits opaque dielectrics. Preserve the exact source
    value without adding transmission or changing the physical specular weight.
    Buffer bytes and offsets within buffer views stay unchanged.
    """
    binary=path.suffix=='.glb'
    if binary:
        blob=path.read_bytes();size,kind=struct.unpack_from('<II',blob,12)
        assert kind==0x4e4f534a
        document=json.loads(blob[20:20+size]);remainder=blob[20+size:]
    else:document=json.loads(path.read_text(encoding='utf8'))
    for m in document['materials']:
        if m['name']==water.name:
            m.setdefault('extensions',{})['KHR_materials_ior']={'ior':round(water.node_tree.nodes.get('Principled BSDF').inputs['IOR'].default_value,4)}
    extensions=document.setdefault('extensionsUsed',[])
    if 'KHR_materials_ior' not in extensions:extensions.append('KHR_materials_ior')
    if binary:
        encoded=json.dumps(document,separators=(',',':'),ensure_ascii=False).encode('utf8')
        encoded+=b' '*((-len(encoded))%4)
        header=struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(remainder))
        path.write_bytes(header+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+remainder)
    else:path.write_text(json.dumps(document,indent=2,ensure_ascii=False),encoding='utf8')

bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    if o.type=='MESH':o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS/'rain-court.blend'),compress=True)
glb_staging=ASSETS/'.rain-court-export.glb'
try:
    bpy.ops.export_scene.gltf(filepath=str(glb_staging),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False,export_yup=True)
    preserve_water_ior(glb_staging)
    # Publish only the completed GLB, avoiding a write into a live HTTP download.
    for attempt in range(6):
        try:
            os.replace(glb_staging,ASSETS/'rain-court.glb')
            break
        except OSError:
            if attempt==5:raise
            time.sleep(.15*(attempt+1))
finally:glb_staging.unlink(missing_ok=True)
(ASSETS/'gltf').mkdir(exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(ASSETS/'gltf'/'rain-court.gltf'),export_format='GLTF_SEPARATE',use_selection=True,export_apply=True,export_animations=False,export_extras=True,export_yup=True)
preserve_water_ior(ASSETS/'gltf'/'rain-court.gltf')
bpy.ops.export_scene.fbx(filepath=str(ASSETS/'rain-court.fbx'),use_selection=True,object_types={'MESH'},apply_unit_scale=True,axis_forward='-Z',axis_up='Y',path_mode='RELATIVE',embed_textures=False,add_leaf_bones=False,bake_anim=False)
print('SCENE_STATS',json.dumps(stats),flush=True)
scene.render.filepath=str(ASSETS/'rain-court-hero.png');bpy.ops.render.render(write_still=True)
# Reproducible checker view, rendered using same geometry and UVs.
checker=bpy.data.images.new('UV_Checker_Grid_1024',width=1024,height=1024);checker.generated_type='COLOR_GRID';checker.filepath_raw=str(ASSETS/'uv'/'checker-grid.png');checker.file_format='PNG';checker.save()
checkmat=material('QA | UV checker',(.5,.5,.5),.8);tn=checkmat.node_tree.nodes.new('ShaderNodeTexImage');tn.image=checker;checkmat.node_tree.links.new(tn.outputs['Color'],checkmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
scene.view_layers[0].material_override=checkmat;scene.cycles.samples=12;scene.render.resolution_percentage=65;scene.render.filepath=str(ASSETS/'uv'/'checker-court.png');bpy.ops.render.render(write_still=True)
scene.view_layers[0].material_override=None
print('COMPLETE',flush=True)
