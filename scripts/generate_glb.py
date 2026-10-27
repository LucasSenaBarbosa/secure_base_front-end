import trimesh, numpy as np, math
from pathlib import Path
S=trimesh.Scene()
WOOD=[223,202,164,255]; EDGE=[89,66,43,255]; PCB=[20,28,32,255]; GOLD=[232,183,41,255]; BLUE=[25,105,214,255]; BLACK=[25,26,30,255]; WHITE=[230,234,232,255]; GLASS=[31,48,59,255]; RED=[215,65,59,255]
count=0
def add(mesh,name,color):
 global count
 mesh.visual.face_colors=color
 S.add_geometry(mesh,node_name=name+'_'+str(count),geom_name=name+'_'+str(count));count+=1
def box(name,at,dim,color):
 m=trimesh.creation.box(extents=dim);m.apply_translation(at);add(m,name,color)
def cyl(name,at,r,h,color,axis='z',sections=20):
 m=trimesh.creation.cylinder(radius=r,height=h,sections=sections)
 if axis=='y':m.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2,[1,0,0]))
 if axis=='x':m.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2,[0,1,0]))
 m.apply_translation(at);add(m,name,color)
def roof(side):
 # cross section gable, face oriented parallel to depth; roof ridge y=2.02, eaves y=1.25
 x0=0 if side<0 else 1.08
 a=np.array([x0,2.04,-.72]);b=np.array([(-1.15 if side<0 else 1.15),1.3,-.72]);c=a.copy();c[2]=.73;d=b.copy();d[2]=.73
 vertices=np.array([a,b,d,c]);f=np.array([[0,1,2],[0,2,3]])
 add(trimesh.Trimesh(vertices=vertices,faces=f,process=False),'Roof_Left' if side<0 else 'Roof_Right',WOOD)
 for z in [-.71,.72]:
  xavg=(a[0]+b[0])/2; yavg=(a[1]+b[1])/2
  box('Roof_Fastener',(xavg,yavg+.013,z),(.04,.03,.052),EDGE)
# plinth and body
box('Foundation',(0,.04,0),(2.28,.08,1.62),EDGE)
box('Floor',(0,.12,0),(2.24,.08,1.58),WOOD)
box('Front_Wall',(0,.72,.77),(2.24,1.15,.055),WOOD)
box('Rear_Wall',(0,.72,-.77),(2.24,1.15,.055),WOOD)
box('Left_Wall',(-1.10,.72,0),(.055,1.15,1.58),WOOD)
box('Right_Wall',(1.10,.72,0),(.055,1.15,1.58),WOOD)
# roof gable inset left/right
for z in [-.77,.77]:
 tri=trimesh.Trimesh(vertices=[[-1.1,1.29,z],[1.1,1.29,z],[0,2.035,z]],faces=[[0,1,2]],process=False)
 add(tri,'Gable',WOOD)
roof(-1);roof(1)
# silhouette and slot details
box('Door_Frame',(.07,.365,.81),(.30,.58,.038),EDGE)
box('Door_Interior',(.07,.35,.839),(.235,.525,.018),[110,84,57,255])
for x in [-.75,.74]:
 for y in [.34,.92]:
  cyl('Front_Bolt',(x,y,.814),.018,.013,EDGE)
# lcd
box('LCD_Housing',(.05,.90,.82),(.82,.38,.08),WHITE)
box('LCD_Screen',(.05,.91,.871),(.53,.18,.016),[38,31,177,255])
for x in [-.30,.4]:
 for y in [.77,1.04]:cyl('LCD_Screw',(x,y,.873),.013,.008,BLACK)
# front RFID
box('RFID_Module',(-.88,.91,.83),(.28,.40,.070),PCB)
for i in range(4):
 box('RFID_Coil',(-.88,.83+i*.047,.872),(.19-i*.028,.009,.008),[171,143,96,255])
# front sensor and keys
box('PIR_Sensor',(-.63,.89,.838),(.23,.27,.09),PCB)
cyl('PIR_Dome',(-.63,.94,.90),.068,.06,WHITE,axis='z')
for x in [-.69,-.23]:
 box('Button_Module',(x,.36,.84),(.25,.31,.070),PCB)
 cyl('Button_Yellow',(x,.40,.89),.091,.06,GOLD,axis='z')
for i,x in enumerate([-.28,.22,.70]):
 # roof-mounted components: inclined positioning approx
 box(['Steam_Sensor','Gas_Sensor','Temperature_Humidity'][i],(x,1.68,.46),(.22,.065,.29),PCB)
 for k in range(4):cyl('Sensor_Pin',(x-.065+k*.043,1.733,.45),.012,.018,GOLD,axis='y')
box('DHT11_Blue',(.70,1.73,.47),(.137,.11,.14),BLUE)
# roof RGB
box('RGB_LED_Board',(-.70,1.68,.44),(.25,.08,.18),PCB)
for x in [-.77,-.63]:
 for z in [.40,.49]:box('RGB_Light',(x,1.73,z),(.057,.015,.05),WHITE)
# roof fan
box('Fan_Motor',(1.00,1.98,.42),(.22,.2,.23),BLACK)
cyl('Fan_Hub',(1.00,2.11,.42),.13,.12,GOLD,'y')
for i in range(4):
 ang=i*math.pi/2
 m=trimesh.creation.box(extents=(.115,.03,.33));m.apply_transform(trimesh.transformations.rotation_matrix(ang,[0,1,0]));m.apply_translation([1.00+math.sin(ang)*.13,2.16,.42+math.cos(ang)*.13]);add(m,'Fan_Blade',WHITE)
# back accessories
box('Battery_Holder',(-.6,.6,-.82),(.79,.55,.11),BLACK)
for x in [-.88,-.69,-.50,-.31]:box('Battery_Slot',(x,.63,-.889),(.10,.39,.01),[67,70,75,255])
for x in [.08,.44]:
 box('Rear_Sensor',(x,.48,-.827),(.25,.36,.07),PCB)
 cyl('Rear_Gas_Head',(x,.57,-.875),.088,.04,[172,178,177,255])
# left servo side
box('Servo_Unit',(-1.17,.76,.14),(.18,.28,.29),BLACK)
box('Servo_Arm',(-1.29,.79,.12),(.09,.04,.37),WHITE)
# right windows
for z in [-.20,.35]:
 box('Window_Frame',(1.132,.87,z),(.019,.37,.35),EDGE)
 box('Window_Glass',(1.147,.87,z),(.012,.28,.26),GLASS)
 box('Window_Cross',(1.159,.87,z),(.017,.027,.32),WOOD)
 box('Window_Cross',(1.159,.87,z),(.017,.34,.025),WOOD)
# roof vents & screw holes
for z in [-.61,.62]:
 for x in [-.88,.87]:box('Wood_Tab',(x,1.46,z),(.15,.065,.04),EDGE)
# export
out=Path(__file__).resolve().parents[1]/'public/models/keyestudio-smart-home.glb'
S.export(out)
print(out,round(out.stat().st_size/1024),'KB',len(S.geometry),'objects')
