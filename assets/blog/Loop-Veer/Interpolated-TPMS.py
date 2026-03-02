# Interpolated TPMS

UI(UI_label("Parameters"))
UI(UI_input("size", "Size", 4))

UI(UI_label("Yarn assignments"))
UI(UI_knit_category(knit_cell_type=UI_knit_cell_type(hidden=True), yarns=UI_yarns(label="Yarn A", default=[0])))
UI(UI_knit_category(knit_cell_type=UI_knit_cell_type(hidden=True), yarns=UI_yarns(label="Yarn B", default=[1])))
UI(UI_knit_category(knit_cell_type=UI_knit_cell_type(hidden=True), yarns=UI_yarns(label="Yarn C", default=[2])))
UI(UI_knit_category(knit_cell_type=UI_knit_cell_type(hidden=True), yarns=UI_yarns(label="Yarn D", default=[3])))

int_scale = 16
pp = (p.uv_smooth * 2 - 1) * int_scale
boundary = p.boundary_distance

x = pp.x * linear_map(p.uv_smooth.y, 1, 0, 1, 3)
y =  p.uv_smooth.y**2 * int_scale * 2 - 5
offset = ramp(boundary, 0, -0.5, -1, 0.2)
v = tpms_schwarz(vec3(x, y, 0), size, gyroid_blend = p.uv_smooth.y) * 2 + offset 

if v < -0.6:
    out.category = knit_categories[0]
elif v < 0.1:
    out.category = knit_categories[1]
elif v < 0.7:
    out.category = knit_categories[2]
else:
    out.category = knit_categories[3]