# Blake's Penrose Triangle Logo

UI(UI_label("Size"))
UI(UI_input("uvs_x", "U", 2))
UI(UI_input("uvs_y", "V", 5))
UI(UI_input("size", "Size", 4))
UI(UI_input("thick_bold", "Outline Width", 2.5))
UI(UI_input("thick_thin", "Internal Width", 1))

UI(UI_label("Yarn assignments"))
UI(UI_knit_category(knit_cell_type=UI_knit_cell_type(hidden=True), yarns=UI_yarns(label="Outline", default=[0])))
UI(UI_knit_category(knit_cell_type=UI_knit_cell_type(hidden=True), yarns=UI_yarns(label="Internal", default=[1])))
UI(UI_knit_category(knit_cell_type=UI_knit_cell_type(hidden=True), yarns=UI_yarns(label="Background", default=[2])))

ppi = env.uv_size * vec2(0.5, 0.58) - p.uv_integer

def arms(i, j):
    return [
        [vec2(2*i, 0), vec2(i, j)],
        [vec2(-i, j), vec2(-2*i, 0)],
        [vec2(-i, -j), vec2(i, -j)]
]

arms = arms(uvs_x, uvs_y)

def uv(i, j, k):
    offset = 8/3 * sum(k)
    out = i * k[0] + j * k[1] - offset
    return out * size

bold_arms = [
    union_sharp([
        line_segment(ppi, uv(1, 0, arm), uv(0, 1, arm)),
        line_segment(ppi, uv(1, 0, arm), uv(1, 5, arm)),
        line_segment(ppi, uv(0, 1, arm), uv(0, 7, arm)),
        line_segment(ppi, uv(2, 1, arm), uv(2, 4, arm))
    ], 0)
    for arm in arms
]

bold = union_sharp(bold_arms, 0) - thick_bold * 0.5

thin_arms = [
    union_sharp([
        line_segment(ppi, uv(0, 1, arm), uv(7, 1, arm)),
        line_segment(ppi, uv(0, 2, arm), uv(6, 2, arm)),
        line_segment(ppi, uv(0, 3, arm), uv(2, 3, arm)),
        line_segment(ppi, uv(3, 3, arm), uv(5, 3, arm)),
        line_segment(ppi, uv(0, 4, arm), uv(4, 4, arm)),
        line_segment(ppi, uv(0, 5, arm), uv(3, 5, arm)),
        line_segment(ppi, uv(0, 6, arm), uv(2, 6, arm))
    ], 0)
    for arm in arms
]
 
thin = union_sharp(thin_arms, 0) - thick_thin * 0.5

if bold < 0:
    out.category = knit_categories[0]
elif thin < 0:
    out.category = knit_categories[2]
else:
    out.category = knit_categories[1]