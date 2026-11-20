// Assigning a surface to a body, as a source edit.
//
// The document is the truth: picking a swatch writes the same GSL an author
// would write by hand, so the choice survives a reload, shows up in the diff,
// and composes with everything else the material libraries do. Nothing here
// touches the renderer.
//
// The two annotation kinds are written differently, and the difference is the
// one internal/assembler/annotation draws. An @material returns a record AND the
// albedo that goes with it, so it is destructured and sets both properties. An
// @finish carries no colour on purpose, so it sets .material alone and leaves
// whatever colour the body already had — which is the whole point of a finish:
// it is meant to be paired with a colour from somewhere else.
//
// This module is a pure string -> string function, the way mesh-import.js's
// placeMeshInSource is, so the whole contract is testable without a browser.

import { topLevelReturnSpan } from "../render/gsl-return-span.js";

// isAssignableBody reports whether `name` is something a surface can be put on.
//
// A shape's name comes from program.OperandName (used by backend/wgsl), which is a
// label rather than a binding: a document returning `sphere(3)` names that
// shape "sphere", and one returning `min(a, b)` names it "min(a, b)". Neither
// is a value the document binds, so assigning to it would write GSL that means
// nothing — `sphere.material = …` sets a property on a library function.
//
// A body is assignable when it is an identifier the document binds at the top
// level, which is where the panel's own lines go. Column zero is what makes it
// top level, the same convention the libraries' doc extraction reads.
//
// A binding can name more than one body at once. A multi-return destructure —
//
//	g1, g2 = gears.gearPair(…);
//	return g1, g2;
//
// binds g1 and g2 just as separate lines would, and `g1.material = …` is
// ordinary GSL. So the whole left-hand side is read, not just a first name.
export function isAssignableBody(source, name) {
    if (!name || !/^[A-Za-z_]\w*$/.test(name)) return false;
    for (const line of source.split("\n")) {
        const bound = boundNames(line);
        if (bound && bound.includes(name)) return true;
    }
    return false;
}

// boundNames returns the names a top-level binding line declares, or null when
// the line is not one. The left-hand side is identifiers and commas only, which
// is what separates a binding from a property assignment (`bolt.material = …`,
// which has a dot), a function declaration (which has parentheses) and a
// comparison (`=`, never `==`).
function boundNames(line) {
    const m = line.match(/^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*=(?!=)/);
    return m ? m[1].split(",").map((n) => n.trim()) : null;
}

// propertyStartRE matches the first line of `body.prop = …`. The body name is
// anchored so `bolt` does not match `boltHead`.
function propertyStartRE(body, prop) {
    return new RegExp(`^\\s*${escapeName(body)}\\.${prop}\\s*=`);
}

// destructureRE matches a binding of two or more names from one call: the
// pair a material assignment writes, `a, b = pkg.sym();`, or the fuller
// destructure Adjust writes, `a, b, c, d = pkg.ctor(x, y, z);`.
const destructureRE = /^\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)+)\s*=\s*([^;]*);\s*$/;

// destructureOf reads such a line: the names it binds, in order, and the text
// it binds them from; null for any other line. The first name is the surface
// and the second its colour, which is how both the libraries' pairs and the
// Adjust templates are laid out.
function destructureOf(line) {
    const m = line.match(destructureRE);
    return m ? { names: m[1].split(",").map((n) => n.trim()), value: m[2].trim() } : null;
}

// callName is the name a destructure's call is known by: `metal.brass` for
// `metal.brass()`, `coating.powderCoat` for `coating.powderCoat(a, b, c)`, and
// the text itself when it is not a call.
function callName(value) {
    const open = value.indexOf("(");
    return open >= 0 && value.endsWith(")") ? value.slice(0, open).trim() : value;
}

function escapeName(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// surfaceNames are the two values a material assignment binds, named after the
// body rather than after the material, so assigning a second material to the
// same body rewrites the same lines instead of leaving the first one's names
// behind as litter.
function surfaceNames(source, body) {
    let base = `${body}Surface`;
    let suffix = 2;
    while (new RegExp(`\\b${escapeName(base)}\\b`).test(source)) base = `${body}Surface${suffix++}`;
    return [base, `${base}Color`];
}

// codeOf strips a line comment and the contents of string literals, so that a
// `;` or a bracket inside either is not mistaken for syntax.
function codeOf(line) {
    let out = "";
    let quote = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
            if (c === "\\") i++;
            else if (c === '"') quote = false;
            continue;
        }
        if (c === '"') { quote = true; continue; }
        if (c === "/" && line[i + 1] === "/") break;
        out += c;
    }
    return out;
}

// findProperty locates an existing `body.prop = …;`, returning the inclusive
// line range it occupies and the text it assigns, or null.
//
// It is a statement scan rather than a line match, because an existing
// assignment is not reliably one tidy line. Both of these are in the examples:
//
//	plates.material = material.withRoughness(aluminumMat, 0.5);  // anodized
//	screwPH.material = material.withDisplacement(zincMat,
//	  remap(thread.maleRelief(…), …));
//
// Matching only `… = …;` to end of line misses both — and missing one is not
// harmless: the caller then believes the property is unset and writes a second
// assignment, which the compiler rejects with "property already assigned".
function findProperty(lines, body, prop) {
    const re = propertyStartRE(body, prop);
    const from = lines.findIndex((line) => re.test(line));
    return from < 0 ? null : statementAt(lines, from);
}

// statementAt reads the assignment starting on line `from`, returning its
// inclusive line range and the text it assigns, or null.
function statementAt(lines, from) {
    let depth = 0;
    let value = "";
    for (let i = from; i < lines.length; i++) {
        let code = codeOf(lines[i]);
        // A continuation line's indentation is layout, not part of the value.
        code = i === from ? code.slice(code.indexOf("=") + 1) : code.trimStart();
        for (const ch of code) {
            if ("([{".includes(ch)) depth++;
            else if (")]}".includes(ch)) depth--;
            else if (ch === ";" && depth <= 0) return { from, to: i, value: value.trim() };
            value += ch;
        }
        value += " ";
    }
    return null; // unterminated; treat as absent rather than guess at its extent
}

// inheritedMaterial is the material a body with no .material of its own wears,
// as an expression, or null when the document does not say. The language cannot
// read a material back, so this reads the document: a body takes the material of
// the shape it is made from. `b = remap(a, q);` wears a's material moved by q, so
// the relief written on it is remapped with it; a body made from several shapes
// wears the material of the one that has one, and from two it is not one
// expression.
function inheritedMaterial(lines, body, seen = new Set()) {
    if (seen.has(body)) return null;
    seen.add(body);
    const re = new RegExp(`^${escapeName(body)}\\s*=(?!=)`);
    const from = lines.findIndex((line) => re.test(line));
    const value = from < 0 ? null : statementAt(lines, from)?.value;
    if (!value) return null;
    const read = (name) => findProperty(lines, name, "material")?.value ?? inheritedMaterial(lines, name, seen);
    if (callName(value) === "remap") {
        const [shape, point] = callArguments(value);
        const moved = /^[A-Za-z_]\w*$/.test(shape) ? read(shape) : null;
        if (!moved) return null;
        const { inner, carried } = unwrapCarried(lines, moved);
        return wrapCarried(inner, carried.map((c) => (c.height ? reliefOf(`remap(${c.height}, ${point})`) : c)));
    }
    const found = [...new Set(value.match(/[A-Za-z_]\w*/g) || [])].map(read).filter(Boolean);
    return found.length === 1 ? found[0] : null;
}

// returnLine is the line the document's top-level return starts on, or the end
// of the file when it has none. Assignments go above it, because a value has to
// be bound before the return reads it.
function returnLine(source, lines) {
    const span = topLevelReturnSpan(source);
    if (!span) return lines.length;
    return source.slice(0, span.start).split("\n").length - 1;
}

// assignSurface writes `entry` onto the body named `body`, returning the new
// source. entry is one catalog row: { kind, package, symbol }.
//
// Re-assigning a body the panel has already written rewrites the call in place,
// so a user trying six materials in a row leaves one set of lines behind, not
// six.
//
// options.keepColor applies a material's surface alone, as a finish is applied:
// the material half of its pair goes on .material and .color is left as it is.
// options.colorLiteral is the body's colour as numbers when the panel knows it,
// which keepColor needs when that colour is the half of a pair it is about to
// rewrite (see assignMaterialOnly).
//
// This replaces the surface whole, what is written round it included; the panel
// picks through assignBase, which leaves that and the layers where they are.
export function assignSurface(source, body, entry, options = {}) {
    if (!isAssignableBody(source, body)) {
        throw new Error(`${body} is not a named body this document binds`);
    }
    const call = entry.kind === "finish"
        ? `${entry.package}.${entry.symbol}`
        : `${entry.package}.${entry.symbol}()`;
    const next = entry.kind === "material" && options.keepColor
        ? assignMaterialOnly(source, body, call, options.colorLiteral)
        : assignWhole(source, body, entry, call);
    return pruneOrphanPairs(next, body);
}

// assignWhole is a finish on .material, or a material on both properties.
function assignWhole(source, body, entry, call) {
    const lines = source.split("\n");

    if (entry.kind === "finish") {
        const line = `${body}.material = ${call};`;
        const found = findProperty(lines, body, "material");
        if (found) {
            replaceStatement(lines, found, line);
            return lines.join("\n");
        }
        return insertBlock(source, lines, [line]);
    }

    // A material sets both properties through a destructure. If the body's
    // .material and .color already read the two names of one pair line of the
    // panel's own naming, that line is a previous assignment of ours: rewrite
    // its call and stop. A pair of any other name, an author's, is not the
    // panel's to rewrite.
    const mat = findProperty(lines, body, "material");
    const col = findProperty(lines, body, "color");
    if (mat && col) {
        const pairIdx = lines.findIndex((line) => {
            const d = destructureOf(line);
            return d && d.names[0] === mat.value && d.names[1] === col.value && oursRE(body).test(d.names[0]);
        });
        if (pairIdx >= 0) return rewriteDestructure(lines, pairIdx, body, call);
    }

    // A colour picked since the panel wrote the pair leaves .material reading
    // the pair while .color holds the pick. A material brings its own colour,
    // so the pair's call is rewritten and .color goes back to reading it —
    // rather than writing a second pair beside the first. Only a pair of the
    // panel's own naming is taken over: a hand-written `steelMat, steelColor`
    // may be read by other bodies, which rewriting its call would change too.
    if (mat) {
        const pairIdx = lines.findIndex((line) => {
            const d = destructureOf(line);
            return d && d.names[0] === mat.value && oursRE(body).test(d.names[0]);
        });
        if (pairIdx >= 0) {
            const colName = destructureOf(lines[pairIdx]).names[1];
            const colLine = `${body}.color = ${colName};`;
            if (col) replaceStatement(lines, col, colLine);
            else lines.splice(mat.to + 1, 0, colLine);
            return rewriteDestructure(lines, pairIdx, body, call);
        }
    }

    // Otherwise write a fresh set: the pair, then the two properties. Whatever
    // is already there is replaced where it stands, and only what is missing is
    // inserted — in ONE block, so the three lines stay together. Inserting them
    // one at a time would pad between them and split the block up.
    const [matName, colName] = surfaceNames(source, body);
    const pairLine = `${matName}, ${colName} = ${call};`;
    const matLine = `${body}.material = ${matName};`;
    const colLine = `${body}.color = ${colName};`;

    // Replace what is already there, the LATER statement first: a replacement
    // collapses a range of lines to one and so moves everything below it.
    const present = [
        mat && { range: mat, line: matLine },
        col && { range: col, line: colLine },
    ].filter(Boolean).sort((a, b) => b.range.from - a.range.from);
    for (const { range, line } of present) replaceStatement(lines, range, line);

    const block = [pairLine];
    if (!mat) block.push(matLine);
    if (!col) block.push(colLine);

    if (present.length === 0) return insertBlock(source, lines, block);
    // The destructure has to be bound before anything reads it, so it goes
    // above the first of the statements that survived. That one's position is
    // still good: only lines below it were rewritten.
    lines.splice(Math.min(...present.map((p) => p.range.from)), 0, ...block);
    return lines.join("\n");
}

// assignColor writes `rgb` as the body's colour, returning the new source.
//
// A colour is sRGB in [0, 1], the hex code over 255, which is what the colour
// library's constants are and what the viewer decodes to linear light. Three
// decimals round-trip every 8-bit channel. The colour replaces whatever .color
// was — a literal, a library constant, or the colour half of a material's
// pair — and leaves .material alone, so a material keeps its roughness and
// metalness under a colour chosen for it.
//
// Given the catalog's operators, a body whose color comes up through layers
// takes the pick at the bottom of them (colorOwner), so what the layers draw is
// drawn over the new color rather than replaced by it.
export function assignColor(source, body, rgb, operators) {
    if (!isAssignableBody(source, body)) {
        throw new Error(`${body} is not a named body this document binds`);
    }
    const lines = source.split("\n");
    const layers = operators ? stackOf(source, body, operators).layers : [];
    const owner = colorOwner(layers, operators);
    if (owner) {
        setLayerArgument(lines, owner.name, operators[owner.op].slots.color, colorLiteralText(rgb));
        readTopColor(lines, body, layers, operators);
        return lines.join("\n");
    }
    const line = `${body}.color = ${colorLiteralText(rgb)};`;
    const found = findProperty(lines, body, "color");
    if (found) {
        replaceStatement(lines, found, line);
        return lines.join("\n");
    }
    return insertBlock(source, lines, [line]);
}

function colorLiteralText(rgb) {
    const channel = (v) => String(Number(Math.max(0, Math.min(1, v)).toFixed(3)));
    return `[${rgb.map(channel).join(", ")}]`;
}

// rewriteDestructure points the panel's destructure at line idx at a new
// call, returning the new source. A pair stays a pair with its call swapped.
// The fuller destructure Adjust wrote collapses back to the pair, since a
// preset returns two values, and the parameter variables only its call read
// go with it, so a preset tried after an adjustment leaves no sliders behind.
function rewriteDestructure(lines, idx, body, call) {
    const d = destructureOf(lines[idx]);
    const lifted = liftedNames(d.value, body);
    lines[idx] = `${d.names[0]}, ${d.names[1]} = ${call};`;
    return removeUnreadDeclarations(lines.join("\n"), lifted);
}

// expandSurface opens the preset on `body` up into its parameters, returning
// the new source. entry is the preset's catalog row and adjust its adjust
// record: the constructors it calls, their annotated parameters with the
// preset's own arguments as defaults, and the preset's body as a template
// (tool/materialswatch, adjust.go).
//
// One top-level variable is written per parameter, named `<body><Param>`
// (boltCoatColor, boltGlossUnits), each with the control its kind declares:
// a scalar with .min and .max for the slider, @color for the chip row, @point,
// @direction and @transform for the gizmos. The template follows, filled in
// for the body, in place of the one-line form the panel wrote. From here the
// Parameters panel and the viewer take over; this edit is made once.
export function expandSurface(source, body, entry, adjust) {
    if (!isAssignableBody(source, body)) {
        throw new Error(`${body} is not a named body this document binds`);
    }
    if (!adjust?.parameters?.length || !adjust.template) {
        throw new Error(`${entry.package}.${entry.symbol} has nothing to adjust`);
    }
    const lines = source.split("\n");

    // Each parameter's variable, fresh against the document and each other.
    const names = {};
    let taken = source;
    for (const p of adjust.parameters) {
        names[p.name] = freshName(taken, `${body}${p.name[0].toUpperCase()}${p.name.slice(1)}`);
        taken += ` ${names[p.name]}`;
    }
    const block = [
        ...adjust.parameters.flatMap((p) => declarationLines(p, names)),
        ...adjust.template.split("\n").map((line) =>
            line.replace(/\$\{(\w+)\}/g, (m, key) => (key === "body" ? body : names[key] ?? m))),
    ];

    // The lines the block replaces: the panel's pair and the two properties.
    // What is there is removed where it stands and the block goes in at the
    // first of those places, so it lands where the surface was written.
    const mat = findProperty(lines, body, "material");
    const col = findProperty(lines, body, "color");
    const { inner, carried } = mat ? unwrapCarried(lines, mat.value) : { inner: null, carried: [] };
    const pairIdx = inner === null ? -1 : lines.findIndex((line) => {
        const d = destructureOf(line);
        return d && d.names[0] === inner && oursRE(body).test(d.names[0]);
    });
    const ranges = [];
    if (pairIdx >= 0) ranges.push({ from: pairIdx, to: pairIdx });
    if (mat) ranges.push(mat);
    if (col) ranges.push(col);
    if (ranges.length === 0) return insertBlock(source, lines, block);
    ranges.sort((a, b) => b.from - a.from);
    const at = ranges[ranges.length - 1].from;
    for (const r of ranges) lines.splice(r.from, r.to - r.from + 1);
    lines.splice(at, 0, ...block);
    return pruneOrphanPairs(rewrapMaterial(lines.join("\n"), body, carried), body);
}

// declarationLines writes one parameter's variable with the control its kind
// declares. The value is the preset's own argument, so the document draws
// exactly as it did before the expansion.
function declarationLines(p, names) {
    const v = names[p.name];
    const vec = (xs) => `[${xs.map(numberText).join(", ")}]`;
    switch (p.kind) {
        case "range":
            return [`${v} = ${numberText(p.default[0])};`, `${v}.min = ${numberText(p.min)};`, `${v}.max = ${numberText(p.max)};`];
        case "color":
            return [`@color ${v} = ${vec(p.default)};`];
        case "point":
            return [`@point ${v} = ${vec(p.default)};`];
        case "direction": {
            // Drawn from the point parameter the constructor anchors it to,
            // when that was lifted too; from the origin otherwise.
            const anchor = p.anchor && names[p.anchor] ? `(${names[p.anchor]})` : "";
            return [`@direction${anchor} ${v} = ${vec(p.default)};`];
        }
        case "transform":
            // A matrix is a list of columns.
            return [`@transform ${v} = [${[0, 4, 8, 12].map((i) => vec(p.default.slice(i, i + 4))).join(", ")}];`];
        default:
            return [`${v} = ${p.default.length === 1 ? numberText(p.default[0]) : vec(p.default)};`];
    }
}

// numberText writes a number as GSL: six decimals at most, no trailing zeros.
function numberText(v) {
    return String(Number(Number(v).toFixed(6)));
}

// liftedNames are the variables Adjust wrote that a destructure's call reads:
// the identifiers of the panel's `<body><Param>` naming among its arguments.
function liftedNames(value, body) {
    const open = value.indexOf("(");
    if (open < 0) return [];
    const re = new RegExp(`\\b${escapeName(body)}[A-Z]\\w*\\b`, "g");
    return [...new Set(value.slice(open).match(re) || [])];
}

// removeUnreadDeclarations drops the top-level declarations of `names` that
// nothing reads any more, with their .min and .max lines, until none is left
// to drop: a direction's declaration reads its anchor's, so the anchor goes
// on the pass after the direction.
function removeUnreadDeclarations(source, names) {
    let lines = source.split("\n");
    let pending = new Set(names);
    for (let changed = true; changed && pending.size;) {
        changed = false;
        for (const name of [...pending]) {
            const own = (line) => declaresOrSets(line, name);
            const readElsewhere = lines.some((line) => !own(line) && new RegExp(`\\b${escapeName(name)}\\b`).test(codeOf(line)));
            if (readElsewhere) continue;
            lines = lines.filter((line) => !own(line));
            pending.delete(name);
            changed = true;
        }
    }
    return lines.join("\n");
}

// declaresOrSets: the line is `name = …`, with or without an annotation in
// front, or `name.min = …` / `name.max = …`.
function declaresOrSets(line, name) {
    const n = escapeName(name);
    return new RegExp(`^(@\\w+(\\([^)]*\\))?\\s+)?${n}\\s*=(?!=)`).test(line) ||
        new RegExp(`^\\s*${n}\\.(min|max)\\s*=`).test(line);
}

// declarationRE matches the top-level declaration of `name`, with or without
// an annotation in front, capturing the annotation prefix and the value.
function declarationRE(name) {
    return new RegExp(`^(@\\w+(?:\\([^)]*\\))?\\s+)?${escapeName(name)}\\s*=\\s*([^;]*);\\s*$`);
}

// callArguments splits a call's arguments at its top-level commas: the text
// inside the outermost parentheses, each argument trimmed.
function callArguments(value) {
    const open = value.indexOf("(");
    if (open < 0 || !value.endsWith(")")) return [];
    const inner = value.slice(open + 1, -1);
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < inner.length; i++) {
        const c = inner[i];
        if ("([{".includes(c)) depth++;
        else if (")]}".includes(c)) depth--;
        else if (c === "," && depth === 0) {
            out.push(inner.slice(start, i).trim());
            start = i + 1;
        }
    }
    if (inner.trim() !== "") out.push(inner.slice(start).trim());
    return out;
}

// adjustedColorOf reads the coat colour of an adjusted body: the literal the
// document declares for the one @color parameter of a preset's adjust record,
// found through the constructor call the body's surface reads. Returns the
// variable's name and its colour as numbers, or null: the record has no
// single colour parameter, the body does not read that constructor, or the
// parameter's argument is not a variable declared as a literal.
export function adjustedColorOf(source, body, adjust) {
    const colours = (adjust?.parameters || []).filter((p) => p.kind === "color");
    if (colours.length !== 1) return null;
    const [param] = colours;
    const lines = source.split("\n");

    // The calls the body's surface and colour read: a destructure's, or the
    // property's own text.
    const calls = [];
    for (const prop of ["material", "color"]) {
        const found = findProperty(lines, body, prop);
        if (!found) continue;
        const inner = prop === "material" ? unwrapCarried(lines, found.value).inner : found.value;
        let value = inner;
        for (const line of lines) {
            const d = destructureOf(line);
            if (d && d.names.includes(inner)) { value = d.value; break; }
        }
        calls.push(value);
    }
    const value = calls.find((v) => callName(v) === param.call);
    if (!value) return null;
    const arg = callArguments(value)[param.arg];
    if (!arg || !/^[A-Za-z_]\w*$/.test(arg)) return null;
    const decl = lines.map((line) => line.match(declarationRE(arg))).find(Boolean);
    const rgb = decl ? parseColorLiteral(decl[2].trim()) : null;
    return rgb ? { name: arg, rgb } : null;
}

// assignAdjustedColor writes `rgb` as the literal of the colour variable
// `name` declares, keeping its annotation, so an adjusted body's coat colour
// can be picked from the Bodies chip as well as the Parameters panel.
export function assignAdjustedColor(source, name, rgb) {
    const lines = source.split("\n");
    const at = lines.findIndex((line) => declarationRE(name).test(line));
    if (at < 0) throw new Error(`${name} is not a variable this document declares`);
    const prefix = lines[at].match(declarationRE(name))[1] || "";
    lines[at] = `${prefix}${name} = ${colorLiteralText(rgb)};`;
    return lines.join("\n");
}

// ── Operators: a stack of layers on a body's surface ──
//
// An operator takes a surface and returns it modified, so in the document it
// is a wrapping edit, not the replacing edit a swatch makes: a layer line binds
// the operator's result and the body's properties read the layer instead of
// what it wraps. The catalog's operators (tool/materialswatch, operators.go)
// are @surface presets, overloads of each operator taking only the slots a
// document supplies: the substrate material, its colour, the body's frame
// (doc/material_composition.md, "Design: operators as presets").

// The material a body has when its document sets none; what a wrap wraps then.
const DEFAULT_MATERIAL = "material.standard";

// LAYER_SUFFIXES are the names a layer binds after its base, in the order the
// operators return their values.
const LAYER_SUFFIXES = ["", "Color", "Height", "Slope"];

// layerBase is the name the panel binds a layer to, <body><Op>: boltTurned.
function layerBase(body, opCall) {
    const op = opCall.slice(opCall.indexOf(".") + 1);
    return `${body}${op[0].toUpperCase()}${op.slice(1)}`;
}

// slotCount is how many arguments the preset form of an operator takes.
function slotCount(op) {
    return 1 + (op.slots.color >= 0 ? 1 : 0) + (op.slots.frame >= 0 ? 1 : 0);
}

// bindingOf reads a line binding one or more names from one value: the single
// binding an arity-1 layer writes, `a = material.withRoughness(b);`, as well as
// a destructure. Null for any other line.
function bindingOf(line) {
    const m = line.match(/^\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*=(?!=)\s*([^;]*);\s*$/);
    return m ? { names: m[1].split(",").map((n) => n.trim()), value: m[2].trim() } : null;
}

// bindingLineOf finds the line binding `name` first, with what it binds.
function bindingLineOf(lines, name) {
    const at = lines.findIndex((line) => {
        const b = bindingOf(line);
        return b && b.names[0] === name;
    });
    return at < 0 ? null : { at, ...bindingOf(lines[at]) };
}

// stackOf reads the body's stack of operators: from .material, each layer whose
// call is a catalog operator, by preset or by its full form, down to the base
// that is not one. Layers come innermost first. Each has the name it binds,
// the operator's catalog key, its arguments, and whether it is still the
// preset form (one argument per slot), which is what Adjust can open.
// baseSurface is the base named as surfaceOf names a surface: the call behind a
// pair, else the text itself; null when the body sets no material. carried is
// what is written round the surface by hand (see unwrapCarried), wherever in the
// stack it stands: a layer of the stack like the rest, innermost first, each with
// `at`, the layer whose material slot holds it, or null for .material. A body
// with no .material shows what is written round the one it inherits; the layers
// there belong to the shape that has them, so they are not this body's to edit.
export function stackOf(source, body, operators) {
    const lines = source.split("\n");
    const mat = findProperty(lines, body, "material");
    if (!mat) {
        const inherited = inheritedMaterial(lines, body);
        if (!inherited) return { base: null, baseSurface: null, layers: [], carried: [] };
        const { inner, carried } = unwrapCarried(lines, unwrapRelief(inherited).inner);
        return { base: inner, baseSurface: inner, layers: [], carried: carried.map((c) => ({ ...c, at: null })) };
    }
    const carried = [];
    const peel = (text, at) => {
        const found = unwrapCarried(lines, text, operators);
        carried.unshift(...found.carried.map((c) => ({ ...c, at })));
        return found.inner;
    };
    let current = peel(unwrapRelief(mat.value).inner, null);
    const layers = [];
    const seen = new Set();
    while (/^[A-Za-z_]\w*$/.test(current) && !seen.has(current)) {
        seen.add(current);
        const bind = bindingLineOf(lines, current);
        const op = bind ? operators?.[callName(bind.value)] : null;
        if (!op) break;
        const args = callArguments(bind.value);
        layers.unshift({ name: current, names: bind.names, op: callName(bind.value), call: bind.value, args, preset: args.length === slotCount(op) });
        current = peel(args[op.slots.material] ?? "", current);
    }
    const pair = bindingLineOf(lines, current);
    return { base: current, baseSurface: pair ? callName(pair.value) : current, layers, carried };
}

// wrapSurface wraps the body's surface with the operator preset op, returning
// the new source: one layer line binding what the preset returns, and the
// body's properties repointed at it. The material slot is whatever .material
// read, as text, or what it inherits (inheritedMaterial), or the default
// material when it has neither; the colour
// slot is .color's text, or options.colorLiteral (the colour the body is drawn
// in) when the body sets none; the frame slot is the body's own frame. An
// operator returning the material alone leaves .color as it is.
export function wrapSurface(source, body, op, options = {}) {
    if (!isAssignableBody(source, body)) {
        throw new Error(`${body} is not a named body this document binds`);
    }
    const lines = source.split("\n");
    const mat = findProperty(lines, body, "material");
    const col = findProperty(lines, body, "color");

    // The relief of the layers already on the body stays outside the new
    // layer, and the new layer's own joins it when its operator returns one.
    const { inner: matInner, heights } = mat ? unwrapRelief(mat.value) : { inner: null, heights: [] };
    const colorText = col ? col.value : colorLiteralText(options.colorLiteral || [0.5, 0.5, 0.5]);
    const base = mat ? matInner : inheritedMaterial(lines, body) || DEFAULT_MATERIAL;
    const { names, line: layerLine } = layerOf(source, body, op, base, colorText);
    const reliefs = op.relief && op.arity >= 3 ? [...heights, names[2]] : heights;
    const matLine = `${body}.material = ${wrapRelief(names[0], reliefs)};`;
    const colLine = op.arity >= 2 ? `${body}.color = ${names[1]};` : null;

    // Replace the properties where they stand, the later first, and put the
    // layer line above the first of them; with neither present the block goes
    // above the return, as an assignment does.
    const present = [
        mat && { range: mat, line: matLine },
        colLine && col && { range: col, line: colLine },
    ].filter(Boolean).sort((a, b) => b.range.from - a.range.from);
    for (const { range, line } of present) replaceStatement(lines, range, line);
    const block = [layerLine];
    if (!mat) block.push(matLine);
    if (colLine && !col) block.push(colLine);
    if (present.length === 0) return insertBlock(source, lines, block);
    lines.splice(Math.min(...present.map((p) => p.range.from)), 0, ...block);
    return lines.join("\n");
}

// layerOf is the line binding operator op's preset over materialText and
// colorText, with the names it binds.
function layerOf(source, body, op, materialText, colorText) {
    const args = new Array(slotCount(op));
    args[op.slots.material] = materialText;
    if (op.slots.color >= 0) args[op.slots.color] = colorText;
    if (op.slots.frame >= 0) args[op.slots.frame] = `[${body}.u, ${body}.v]`;
    const base = freshName(source, layerBase(body, op.call));
    const names = LAYER_SUFFIXES.slice(0, op.arity).map((s) => `${base}${s}`);
    return { names, line: `${names.join(", ")} = ${op.call}(${args.join(", ")});` };
}

// wrapUnder wraps the body's surface with operator op, returning the new
// source. The layer goes under the body's first layer of the operators in
// `over`, reading what that layer read, and that layer reads it; with none of
// them on the body it is an ordinary wrap.
export function wrapUnder(source, body, op, operators, over, options = {}) {
    const above = stackOf(source, body, operators).layers.find((layer) => over.includes(layer.op));
    if (!above) return wrapSurface(source, body, op, options);

    const lines = source.split("\n");
    const upper = operators[above.op];
    const materialText = above.args[upper.slots.material];
    const pair = bindingLineOf(lines, materialText);
    const colorText = upper.slots.color >= 0 ? above.args[upper.slots.color]
        : pair && pair.names.length >= 2 ? pair.names[1]
        : colorLiteralText(options.colorLiteral || [0.5, 0.5, 0.5]);
    const { names, line } = layerOf(source, body, op, materialText, colorText);

    // The property is below that layer's line, so it is rewritten first.
    const mat = findProperty(lines, body, "material");
    if (op.relief && op.arity >= 3) {
        const { inner, heights } = unwrapRelief(mat.value);
        replaceStatement(lines, mat, `${body}.material = ${wrapRelief(inner, [...heights, names[2]])};`);
    }
    setLayerArgument(lines, above.name, upper.slots.material, names[0]);
    if (upper.slots.color >= 0 && op.arity >= 2) setLayerArgument(lines, above.name, upper.slots.color, names[1]);
    lines.splice(bindingLineOf(lines, above.name).at, 0, line);
    return lines.join("\n");
}

// assignBase puts a surface under what is on the body, returning the new source:
// the base changes, and the layers and what is written round the base stay, so a
// thread is still there on the new metal. A finish replaces the base's material
// and leaves its color, as it does on a bare body. With options.keepColor a
// material does the same. options.replaceLayers takes the layers off with the old
// base, for a surface that is finished already; what is written by hand stays.
export function assignBase(source, body, entry, operators, options = {}) {
    if (options.replaceLayers) source = removePanelLayers(source, body, operators);
    const { base, layers, carried } = stackOf(source, body, operators);
    if (!layers.length || options.replaceLayers) {
        const bare = setMaterialValue(source, body, base, carried.length > 0);
        return pruneOrphanPairs(rewrapMaterial(assignSurface(bare, body, entry, options), body, carried), body);
    }

    const lines = source.split("\n");
    const inner = layers[0];
    const slot = operators[inner.op].slots.material;
    // What the innermost layer holds round the base stays there; anything
    // written further out does not read the base.
    const around = (value) => wrapCarried(value, carried.filter((c) => c.at === inner.name));

    if (entry.kind === "finish") {
        setLayerArgument(lines, inner.name, slot, around(`${entry.package}.${entry.symbol}`));
        return pruneOrphanPairs(lines.join("\n"), body);
    }

    const call = `${entry.package}.${entry.symbol}()`;
    // A pair of the panel's own naming is rewritten where it stands, as
    // assignWhole does; any other may be read by other bodies.
    const pair = bindingLineOf(lines, base);
    if (pair && oursRE(body).test(base) && !options.keepColor) {
        readBaseColor(lines, body, layers, operators, pair.names[1]);
        setLayerArgument(lines, inner.name, slot, around(base));
        return rewriteDestructure(lines, pair.at, body, call);
    }
    const [matName, colName] = surfaceNames(lines.join("\n"), body);
    setLayerArgument(lines, inner.name, slot, around(matName));
    if (!options.keepColor) readBaseColor(lines, body, layers, operators, colName);
    lines.splice(bindingLineOf(lines, inner.name).at, 0, `${matName}, ${colName} = ${call};`);
    return pruneOrphanPairs(lines.join("\n"), body);
}

// removePanelLayers takes off the layers of the panel's naming, outermost first,
// with the parameters written for them. One an author wrote stays.
function removePanelLayers(source, body, operators) {
    const { layers } = stackOf(source, body, operators);
    return [...layers].reverse().filter((layer) => isPanelLayer(layer, body)).reduce(
        (next, layer) => removeLayer(next, body, layer.name, operators[layer.op]), source);
}

function isPanelLayer(layer, body) {
    return new RegExp(`^${escapeName(layerBase(body, layer.op))}\\d*$`).test(layer.name);
}

// readBaseColor makes whatever reads the base's color read colorText: the lowest
// layer taking a color, or .color when only modifiers sit on the base. A layer
// making its own color hides the base's, and nothing changes.
function readBaseColor(lines, body, layers, operators, colorText) {
    if (colorOwner(layers, operators)) readTopColor(lines, body, layers, operators);
    for (const layer of layers) {
        const op = operators[layer.op];
        if (op.slots.color >= 0) {
            setLayerArgument(lines, layer.name, op.slots.color, colorText);
            return;
        }
        if (op.arity >= 2) return;
    }
    const col = findProperty(lines, body, "color");
    if (col) replaceStatement(lines, col, `${body}.color = ${colorText};`);
}

// stackColorOf is the color picked for a body through its layers, sRGB, when
// colorOwner's argument is a literal; null otherwise.
export function stackColorOf(source, body, operators) {
    const { layers } = stackOf(source, body, operators);
    const owner = colorOwner(layers, operators);
    return owner ? parseColorLiteral(owner.args[operators[owner.op].slots.color]) : null;
}

// stackColorSource is the call whose color comes up through the body's layers:
// the pair colorOwner's argument reads, so a turned body names its substance.
// Null when no layer takes a color; a coat's own color names the coat.
export function stackColorSource(source, body, operators) {
    const { layers } = stackOf(source, body, operators);
    const owner = colorOwner(layers, operators);
    if (!owner) return null;
    const color = owner.args[operators[owner.op].slots.color];
    const pair = source.split("\n").map(bindingOf).find((bind) => bind?.names[1] === color);
    return pair ? callName(pair.value) : null;
}

// colorOwner is the layer a picked color belongs in: walking down from the
// outermost layer, the last one the color comes up through. A layer returning
// the material alone leaves the color as it found it and is passed over; one
// with no color slot makes its own color, so the walk stops above it. Null when
// no layer takes a color, where a pick replaces .color.
function colorOwner(layers, operators) {
    let owner = null;
    for (const layer of [...layers].reverse()) {
        const op = operators[layer.op];
        if (op.arity < 2) continue;
        if (op.slots.color < 0) break;
        owner = layer;
    }
    return owner;
}

// readTopColor points .color at the outermost layer that returns one, so a
// color set by hand over the layers gives way to the one coming up through them.
function readTopColor(lines, body, layers, operators) {
    const top = [...layers].reverse().find((layer) => operators[layer.op].arity >= 2);
    const col = findProperty(lines, body, "color");
    if (top && col) replaceStatement(lines, col, `${body}.color = ${top.names[1]};`);
}

// setLayerArgument rewrites one argument of the layer bound to name.
function setLayerArgument(lines, name, slot, text) {
    const bind = bindingLineOf(lines, name);
    const args = callArguments(bind.value);
    args[slot] = text;
    lines[bind.at] = `${bind.names.join(", ")} = ${callName(bind.value)}(${args.join(", ")});`;
}

// expandLayer opens the layer bound to layerName up into the operator's
// parameters, as expandSurface opens a preset: one variable per parameter
// above the layer, and the layer's line rewritten as the operator's full call
// from the catalog template, its slots carried over from the preset call.
export function expandLayer(source, body, layerName, op) {
    return writeLayerOut(source, body, layerName, op, op.adjust?.parameters || []);
}

// The parameter kinds the Materials panel drives. A direction or a point is
// dragged in the viewer instead, so it stays a literal until Adjust asks for it.
const DRIVEN_KINDS = ["range", "color"];

// openLayer opens the layer up as far as the panel drives it: a variable for
// each range and color, so the uniforms are there before a slider is touched,
// and the rest written as the preset's own values. A layer with nothing to drive
// stays the preset.
export function openLayer(source, body, layerName, op) {
    const driven = (op.adjust?.parameters || []).filter((p) => DRIVEN_KINDS.includes(p.kind));
    return driven.length ? writeLayerOut(source, body, layerName, op, driven) : source;
}

// writeLayerOut rewrites the layer's preset line as the operator's full call
// with a variable for each of `declared`.
function writeLayerOut(source, body, layerName, op, declared) {
    const lines = source.split("\n");
    const bind = bindingLineOf(lines, layerName);
    if (!bind || callName(bind.value) !== op.call) {
        throw new Error(`${layerName} is not a layer of ${op.call} this document binds`);
    }
    const args = callArguments(bind.value);
    if (args.length !== slotCount(op)) throw new Error(`${layerName} is already opened up`);
    if (!op.adjust?.parameters?.length || !op.adjust.template) {
        throw new Error(`${op.call} has nothing to adjust`);
    }

    const names = freshParameterNames(source, body, declared);
    const literals = Object.fromEntries(op.adjust.parameters.map((p) => [p.name, parameterLiteral(p)]));
    const slots = {
        material: args[op.slots.material],
        color: op.slots.color >= 0 ? args[op.slots.color] : "",
        frame: op.slots.frame >= 0 ? args[op.slots.frame] : "",
    };
    const fill = (line) => line.replace(/\$\{(\w+)\}/g, (m, key) =>
        key === "body" ? body : key === "layer" ? layerName : key in slots ? slots[key] : names[key] ?? literals[key] ?? m);
    // The template's property lines already stand in the document, reading
    // the layer; only its binding lines replace the preset's one.
    const bindings = op.adjust.template.split("\n").filter((line) => !line.startsWith("${body}."));
    const block = [...declared.flatMap((p) => declarationLines(p, names)), ...bindings.map(fill)];
    lines.splice(bind.at, 1, ...block);
    return lines.join("\n");
}

// freshParameterNames names one variable per parameter, `<body><Param>`, fresh
// against the document and each other.
function freshParameterNames(source, body, parameters) {
    const names = {};
    let taken = source;
    for (const p of parameters) {
        names[p.name] = freshName(taken, parameterName(body, p));
        taken += ` ${names[p.name]}`;
    }
    return names;
}

function parameterName(body, p) {
    return `${body}${p.name[0].toUpperCase()}${p.name.slice(1)}`;
}

// parameterLiteral is a parameter's preset value as the text of an argument.
function parameterLiteral(p) {
    return p.default.length === 1 ? numberText(p.default[0]) : `[${p.default.map(numberText).join(", ")}]`;
}

// adjustLayer writes out what openLayer leaves in the call, so the viewer's
// gizmos take over the directions and points, returning the new source. A
// preset is opened all the way.
export function adjustLayer(source, body, layerName, op) {
    const lines = source.split("\n");
    const args = callArguments(bindingLineOf(lines, layerName).value);
    if (args.length === slotCount(op)) return expandLayer(source, body, layerName, op);
    const left = op.adjust.parameters.filter((p) => isLeftLiteral(p, args));
    const names = { ...Object.fromEntries(op.adjust.parameters.map((p) => [p.name, args[p.arg]])), ...freshParameterNames(source, body, left) };
    const block = left.flatMap((p) => declarationLines({ ...p, default: parseColorLiteral(args[p.arg]) }, names));
    for (const p of left) setLayerArgument(lines, layerName, p.arg, names[p.name]);
    lines.splice(bindingLineOf(lines, layerName).at, 0, ...block);
    return lines.join("\n");
}

// isLeftLiteral: the parameter is one the panel does not drive, written in the
// call as numbers.
function isLeftLiteral(p, args) {
    return !DRIVEN_KINDS.includes(p.kind) && !!parseColorLiteral(args[p.arg] ?? "");
}

// layerHasMoreToAdjust: Adjust would write something out that the panel's
// sliders and chips do not reach.
export function layerHasMoreToAdjust(layer, op) {
    const parameters = op.adjust?.parameters || [];
    return parameters.some((p) => !DRIVEN_KINDS.includes(p.kind) && (layer.preset || isLeftLiteral(p, layer.args)));
}

// layerParameters are what the panel drives on a layer of stackOf: the
// operator's ranges and colors, each with its name, kind and value, and a
// range's bounds. A preset has them as the catalog's defaults, and `variable`
// null. Opened up, each reads its argument: `variable` is the literal's name,
// with the bounds the document gives it, and a value in the call has none. An
// argument the document computes is left out, there being nothing to move.
export function layerParameters(source, layer, op) {
    const lines = source.split("\n");
    return (op.adjust?.parameters || []).filter((p) => DRIVEN_KINDS.includes(p.kind)).flatMap((p) => {
        const read = layer.preset ? { value: p.kind === "color" ? p.default : p.default[0], variable: null } : readParameter(lines, p, layer.args[p.arg] ?? "");
        return read ? [{ name: p.name, kind: p.kind, min: p.min, max: p.max, ...read }] : [];
    });
}

// readParameter reads the value a parameter's argument holds, or null when it
// holds none the panel can write.
function readParameter(lines, p, arg) {
    const parse = p.kind === "color" ? parseColorLiteral : (text) => NUMBER_RE.test(text) ? Number(text) : null;
    const written = parse(arg);
    if (written !== null) return { value: written, variable: null };
    const decl = lines.map((line) => line.match(declarationRE(arg))).find(Boolean);
    const value = decl ? parse(decl[2].trim()) : null;
    if (value === null) return null;
    if (p.kind === "color") return { value, variable: arg };
    return { value, variable: arg, min: numberProperty(lines, arg, "min") ?? p.min, max: numberProperty(lines, arg, "max") ?? p.max };
}

const NUMBER_RE = /^-?(\d+\.?\d*|\.\d+)$/;

// numberProperty is the number a line `name.property = …;` sets, or null.
function numberProperty(lines, name, property) {
    const re = new RegExp(`^\\s*${escapeName(name)}\\.${property}\\s*=\\s*([^;]*);`);
    const text = lines.map((line) => line.match(re)).find(Boolean)?.[1].trim();
    return text !== undefined && NUMBER_RE.test(text) ? Number(text) : null;
}

// valueText writes a parameter's value as GSL: a number, or a color.
function valueText(value) {
    return Array.isArray(value) ? colorLiteralText(value) : numberText(value);
}

// setVariable gives the top-level variable `name` a new value, keeping its
// annotation, returning the new source.
export function setVariable(source, name, value) {
    const lines = source.split("\n");
    const at = lines.findIndex((line) => declarationRE(name).test(line));
    if (at < 0) throw new Error(`${name} is not a variable this document declares`);
    const prefix = lines[at].match(declarationRE(name))[1] || "";
    lines[at] = `${prefix}${name} = ${valueText(value)};`;
    return lines.join("\n");
}

// setLayerParameter gives a parameter of the layer bound to layerName a value,
// returning the new source. A preset is opened up first.
export function setLayerParameter(source, body, layerName, op, name, value) {
    const param = op.adjust?.parameters?.find((p) => p.name === name);
    if (!param) throw new Error(`${op.call} has no parameter ${name}`);
    const bound = bindingLineOf(source.split("\n"), layerName);
    if (!bound) throw new Error(`${layerName} is not a layer this document binds`);
    const opened = callArguments(bound.value).length === slotCount(op) ? openLayer(source, body, layerName, op) : source;
    const lines = opened.split("\n");
    const arg = callArguments(bindingLineOf(lines, layerName).value)[param.arg] ?? "";
    if (NUMBER_RE.test(arg) || parseColorLiteral(arg)) {
        setLayerArgument(lines, layerName, param.arg, valueText(value));
        return lines.join("\n");
    }
    return setVariable(opened, arg, value);
}

// wrapOpen is wrapUnder with the new layer opened up, which is what a pick in
// the panel writes: a slider under it has a uniform from the first drag.
export function wrapOpen(source, body, op, operators, over, options = {}) {
    const before = stackOf(source, body, operators).layers.map((layer) => layer.name);
    const next = wrapUnder(source, body, op, operators, over, options);
    const added = stackOf(next, body, operators).layers.find((layer) => !before.includes(layer.name));
    return added ? openLayer(next, body, added.name, op) : next;
}

// baseParameters are the parameters Adjust wrote for the surface under the
// layers: those of the calls the base is built from, by adjust's records (the
// catalog's, keyed by preset), held in variables of the panel's own naming, on a
// pair of its naming. Anything else an author wrote, and its sliders are theirs.
export function baseParameters(source, body, stack, adjust) {
    if (!stack.base || !oursRE(body).test(stack.base)) return [];
    const lines = source.split("\n");
    const found = new Map();
    const seen = new Set();
    const walk = (name) => {
        if (seen.has(name)) return;
        seen.add(name);
        const bind = bindingLineOf(lines, name);
        if (!bind) return;
        const args = callArguments(bind.value);
        for (const record of Object.values(adjust || {})) {
            for (const p of record.parameters) {
                if (p.call !== callName(bind.value) || !DRIVEN_KINDS.includes(p.kind)) continue;
                const arg = args[p.arg] ?? "";
                if (!isPanelVariable(arg, body, p) || found.has(arg)) continue;
                const read = readParameter(lines, p, arg);
                if (read?.variable) found.set(arg, { name: p.name, kind: p.kind, min: p.min, max: p.max, ...read });
            }
        }
        for (const arg of args) if (/^[A-Za-z_]\w*$/.test(arg)) walk(arg);
    };
    walk(stack.base);
    return [...found.values()];
}

// isPanelVariable: `name` is the variable the panel writes for parameter p, by
// its naming.
function isPanelVariable(name, body, p) {
    return new RegExp(`^${escapeName(parameterName(body, p))}\\d*$`).test(name);
}

// panelVariables are the variables the panel wrote and shows, so the Parameters
// panel leaves them out.
export function panelVariables(source, operators, adjust) {
    return new Set(panelVariableList(source, operators, adjust));
}

export function panelVariableList(source, operators, adjust) {
    const names = [];
    for (const [, body] of source.matchAll(/^([A-Za-z_]\w*)\.material\s*=/gm)) {
        const stack = stackOf(source, body, operators);
        for (const layer of stack.layers) {
            const op = operators[layer.op];
            if (!isPanelLayer(layer, body)) continue;
            for (const item of layerParameters(source, layer, op)) {
                const p = op.adjust.parameters.find((each) => each.name === item.name);
                if (item.variable && isPanelVariable(item.variable, body, p)) names.push(item.variable);
            }
        }
        names.push(...baseParameters(source, body, stack, adjust).map((item) => item.variable));
    }
    return names;
}

// removeLayer takes the layer bound to layerName out of the body's stack,
// returning the new source. Whatever read the layer, the body's properties or
// the layer above, reads the layer's own slots instead: its material argument
// and its colour argument. A coat has no colour slot, so the colour it
// replaced is given back as the substrate pair's when the substrate is a pair
// and dropped otherwise. The layer's line goes, and with it the parameter
// variables only its call read.
export function removeLayer(source, body, layerName, op) {
    let lines = source.split("\n");
    const bind = bindingLineOf(lines, layerName);
    if (!bind || callName(bind.value) !== op.call) {
        throw new Error(`${layerName} is not a layer of ${op.call} this document binds`);
    }
    const args = callArguments(bind.value);
    const materialText = args[op.slots.material];
    let colorText = op.slots.color >= 0 ? args[op.slots.color] : null;
    if (colorText === null) {
        const pair = bindingLineOf(lines, materialText);
        colorText = pair && pair.names.length >= 2 ? pair.names[1] : null;
    }
    const lifted = liftedNames(bind.value, body);
    lines.splice(bind.at, 1);

    const word = (name) => new RegExp(`\\b${escapeName(name)}\\b`, "g");
    const [matName, colName, heightName] = bind.names;
    // The layer's relief, applied outside whatever read the layer, goes with it.
    const relief = heightName ? new RegExp(`material\\.withDisplacement\\((.*), ${escapeName(heightName)}\\)`) : null;
    lines = lines.flatMap((line) => {
        let next = line;
        if (relief && relief.test(next)) next = next.replace(relief, "$1");
        if (word(matName).test(codeOf(next))) next = next.replace(word(matName), materialText);
        if (colName && word(colName).test(codeOf(next))) {
            if (colorText) next = next.replace(word(colName), colorText);
            else if (propertyStartRE(body, "color").test(next)) return [];
            else next = next.replace(word(colName), colorLiteralText([0.5, 0.5, 0.5]));
        }
        return [next];
    });
    return removeUnreadDeclarations(lines.join("\n"), lifted);
}

// surfaceOf reads what the document gives the body: the surface it is
// assigned, as the call that made it when that was a material's pair
// (`metal.brass`) and as the assigned text otherwise (`material.matte`), and
// its colour, as text and, when the colour is a literal, as numbers. Either is
// null when the document does not set it. colorIsSurface is true when the
// colour is the material's own, the colour half of the same pair.
//
// colorSource is the call whose colour the body wears, whenever .color reads
// the colour half of a pair: the same pair as the material's, or another —
// the one a finish was put over, say, which still supplies the colour after
// .material has moved on. The panel looks that call's colours up, so a body
// in brass's colour under a matte finish shows brass's colour, not a guess.
export function surfaceOf(source, body) {
    const lines = source.split("\n");
    const mat = findProperty(lines, body, "material");
    const col = findProperty(lines, body, "color");

    // Seen through the relief of its layers and what is written round it, the
    // surface is the one inside.
    const inner = mat ? unwrapCarried(lines, unwrapRelief(mat.value).inner).inner : null;
    let surface = inner;
    let colorIsSurface = false;
    if (mat) {
        for (const line of lines) {
            const d = destructureOf(line);
            if (d && d.names[0] === inner) {
                surface = callName(d.value);
                colorIsSurface = !!col && col.value === d.names[1];
                break;
            }
        }
    }
    let colorSource = null;
    if (col) {
        for (const line of lines) {
            const d = destructureOf(line);
            if (d && d.names[1] === col.value) {
                colorSource = callName(d.value);
                break;
            }
        }
    }
    return { surface, color: col ? col.value : null, rgb: col ? parseColorLiteral(col.value) : null, colorIsSurface, colorSource };
}

function parseColorLiteral(text) {
    const num = "\\s*(-?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?)\\s*";
    const m = text.match(new RegExp(`^\\[${num},${num},${num}\\]$`));
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// oursRE matches the names the panel binds a body's pairs to, boltSurface,
// boltSurface2, …: the only pairs it may rewrite or remove, since one an author
// wrote may be read by other bodies.
function oursRE(body) {
    return new RegExp(`^${escapeName(body)}Surface\\d*$`);
}

function freshName(source, base) {
    let name = base;
    for (let n = 2; new RegExp(`\\b${escapeName(name)}\\b`).test(source); n++) name = `${base}${n}`;
    return name;
}

// The relief of a body's layers: an operator that returns a height the layer
// has to apply (a knurl's teeth; the catalog marks it `relief`) is applied as
// displacement on the body's material, outside every layer,
// material.withDisplacement(<layer>, <layer>Height), one wrapping per such
// layer. unwrapRelief reads them off a .material value, innermost height
// first; wrapRelief writes them back round inner.
const reliefRE = /^material\.withDisplacement\((.*), ([A-Za-z_]\w*Height)\)$/;
function unwrapRelief(value) {
    let inner = value;
    const heights = [];
    for (let m = inner.match(reliefRE); m; m = inner.match(reliefRE)) {
        inner = m[1];
        heights.unshift(m[2]);
    }
    return { inner, heights };
}
function wrapRelief(inner, heights) {
    return heights.reduce((v, h) => `material.withDisplacement(${v}, ${h})`, inner);
}

// What is written round a surface by hand: relief, such as a thread,
// material.withDisplacement(<surface>, <height>), and a lay. It is not the
// surface's own, so it stays when the surface changes, as a layer does, until
// Remove takes it off. A height a layer returns is that layer's (unwrapRelief).
//
// Each carried item is { call, rest, height }: the call that wraps, the arguments
// after the surface, and for relief the height. Relief goes back as
// material.addDisplacement, since the surface it now wraps may have its own.
function reliefOf(height) {
    return { call: "material.addDisplacement", rest: [height], height };
}

// unwrapCarried reads what is written round value: the surface inside, and the
// carried items, innermost first. A name bound to such a value reads through,
// since its text is the same value; the binding stays for whatever else reads it.
// A name bound to one of `operators` is a layer of the stack, not carried: an
// opened-up material.withLay reads like a lay written by hand.
function unwrapCarried(lines, value, operators) {
    let inner = value;
    const carried = [];
    for (let changed = true; changed;) {
        changed = false;
        const name = callName(inner);
        const args = callArguments(inner);
        if ((name === "material.withDisplacement" || name === "material.addDisplacement") && args.length === 2) {
            carried.unshift(reliefOf(args[1]));
        } else if (name === "material.withLay" && args.length === 3) {
            carried.unshift({ call: name, rest: args.slice(1) });
        } else {
            const bind = /^[A-Za-z_]\w*$/.test(inner) ? bindingLineOf(lines, inner) : null;
            if (!bind || bind.names.length !== 1 || operators?.[callName(bind.value)] || !unwrapCarried(lines, bind.value, operators).carried.length) continue;
            inner = bind.value;
            changed = true;
            continue;
        }
        inner = args[0];
        changed = true;
    }
    return { inner, carried };
}

// wrapCarried writes carried back round inner, innermost first.
function wrapCarried(inner, carried) {
    return carried.reduce((v, c) => `${c.call}(${[v, ...c.rest].join(", ")})`, inner);
}

// setMaterialValue points .material at value, writing the line when the body
// inherits. With nothing to change it leaves the source alone.
function setMaterialValue(source, body, value, change) {
    if (!change) return source;
    const lines = source.split("\n");
    const mat = findProperty(lines, body, "material");
    if (!mat) return insertBlock(source, lines, [`${body}.material = ${value};`]);
    replaceStatement(lines, mat, `${body}.material = ${value};`);
    return lines.join("\n");
}

// rewrapMaterial writes carried round whatever .material now is.
function rewrapMaterial(source, body, carried) {
    if (!carried.length) return source;
    const lines = source.split("\n");
    const mat = findProperty(lines, body, "material");
    if (!mat) return source;
    replaceStatement(lines, mat, `${body}.material = ${wrapCarried(mat.value, carried)};`);
    return lines.join("\n");
}

// removeCarried takes one carried item off the body, returning the new source;
// `index` is its place in stackOf's carried. A body that inherits gets a .material
// of its own, the inherited surface without the item.
export function removeCarried(source, body, index, operators) {
    const { carried } = stackOf(source, body, operators);
    const item = carried[index];
    if (!item) throw new Error(`${body} has no such layer`);
    const lines = source.split("\n");
    const without = (text) => {
        const found = unwrapCarried(lines, text, operators);
        const at = found.carried.findIndex((c) => c.call === item.call && c.rest.join() === item.rest.join());
        return wrapCarried(found.inner, found.carried.filter((c, i) => i !== at));
    };
    if (item.at) {
        const bind = bindingLineOf(lines, item.at);
        const op = operators[callName(bind.value)];
        setLayerArgument(lines, item.at, op.slots.material, without(callArguments(bind.value)[op.slots.material]));
        return lines.join("\n");
    }
    const mat = findProperty(lines, body, "material");
    if (!mat) return setMaterialValue(source, body, without(inheritedMaterial(lines, body)), true);
    const { inner, heights } = unwrapRelief(mat.value);
    replaceStatement(lines, mat, `${body}.material = ${wrapRelief(without(inner), heights)};`);
    return lines.join("\n");
}

// assignMaterialOnly puts a material's surface on the body and keeps its
// colour.
//
// The one case that needs care is a colour that is itself the colour half of
// the pair the panel is about to rewrite — `bolt.color = boltSurfaceColor` after
// a material was applied whole. Rewriting that pair's call would change the
// colour too. So the colour is pinned first: to colorLiteral, when the panel
// knows it as numbers (a uniform catalog material); otherwise — a patterned
// colour, which numbers cannot hold — the old pair is left to go on supplying
// the colour, and the new surface gets a pair of its own.
function assignMaterialOnly(source, body, call, colorLiteral) {
    const lines = source.split("\n");
    const ours = oursRE(body);
    const pairOf = (name) => lines.findIndex((line) => {
        const d = destructureOf(line);
        return d && d.names[0] === name && ours.test(d.names[0]);
    });

    let mat = findProperty(lines, body, "material");
    if (mat && pairOf(mat.value) >= 0) {
        const colName = destructureOf(lines[pairOf(mat.value)]).names[1];
        const col = findProperty(lines, body, "color");
        const colourIsThePair = col && col.value === colName;
        if (colourIsThePair && colorLiteral) {
            replaceStatement(lines, col, `${body}.color = ${colorLiteralText(colorLiteral)};`);
        }
        if (!colourIsThePair || colorLiteral) {
            const idx = pairOf(findProperty(lines, body, "material").value);
            return rewriteDestructure(lines, idx, body, call);
        }
    }

    // A pair of its own, of which only the material half is read.
    const [matName, colName] = surfaceNames(source, body);
    const pairLine = `${matName}, ${colName} = ${call};`;
    const matLine = `${body}.material = ${matName};`;
    mat = findProperty(lines, body, "material");
    if (!mat) return insertBlock(source, lines, [pairLine, matLine]);
    replaceStatement(lines, mat, matLine);
    lines.splice(mat.from, 0, pairLine);
    return lines.join("\n");
}

// pruneOrphanPairs removes the body's panel-written pair lines that nothing
// reads any more — the line a pinned colour or a second pair left behind — so
// trying surfaces leaves no litter.
function pruneOrphanPairs(source, body) {
    const lines = source.split("\n");
    const ours = oursRE(body);
    const readElsewhere = (name, at) => lines.some((line, i) =>
        i !== at && new RegExp(`\\b${escapeName(name)}\\b`).test(codeOf(line)));
    // The parameter variables a dropped destructure read go with it, when
    // nothing else reads them.
    let lifted = [];
    const remaining = lines.filter((line, i) => {
        const d = destructureOf(line);
        if (!d || !ours.test(d.names[0])) return true;
        if (d.names.some((name) => readElsewhere(name, i))) return true;
        lifted = lifted.concat(liftedNames(d.value, body));
        return false;
    });
    return removeUnreadDeclarations(remaining.join("\n"), lifted);
}

// replaceStatement swaps the lines a statement occupies for a single line.
function replaceStatement(lines, range, line) {
    lines.splice(range.from, range.to - range.from + 1, line);
}

// insertBlock puts `block` above the document's top-level return, separated
// from what comes before by a single blank line.
function insertBlock(source, lines, block) {
    const next = lines.slice();
    const at = returnLine(source, next);
    const pad = at > 0 && next[at - 1].trim() !== "" ? ["", ...block] : block;
    next.splice(at, 0, ...pad);
    return next.join("\n");
}
