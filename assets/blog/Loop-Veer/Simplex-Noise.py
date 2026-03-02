# Simplex noise

UI(UI_label("Parameters"))
UI(UI_input("size", "Size", 4))

UI(UI_label("Yarn assignments"))
UI(UI_knit_category(knit_cell_type=UI_knit_cell_type(hidden=True), yarns=UI_yarns(label="Yarn A", default=[0])))
UI(UI_knit_category(knit_cell_type=UI_knit_cell_type(hidden=True), yarns=UI_yarns(label="Yarn B", default=[1])))
UI(UI_knit_category(knit_cell_type=UI_knit_cell_type(hidden=True), yarns=UI_yarns(label="Yarn C", default=[2])))
UI(UI_knit_category(knit_cell_type=UI_knit_cell_type(hidden=True), yarns=UI_yarns(label="Yarn D", default=[3])))

pp = (p.uv_smooth * 2 - 1) / size * 20
boundary = p.boundary_distance * 0.5
v = noise.snoise2(pp.x, pp.y, 1) - 1 - boundary

if v < -0.5:
    out.category = knit_categories[0]
elif v < 0:
    out.category = knit_categories[1]
elif v < 0.5:
    out.category = knit_categories[2]
else:
    out.category = knit_categories[3]