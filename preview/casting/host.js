// The viewer's host in a page `gsl export` wrote, where it is saved as host.js: the documents
// and their compiled fields are files beside the page, and nothing compiles.
//
//   models/index.json    { examples: [{ name, label, file }] }, in the order they were exported
//   models/<file>        { name, source, field }: a document and the field bundle it compiled to,
//                        the same bundle `gsl serve` answers /api/compile with
//
// Every path is relative to the page, so the folder works wherever a web server puts it.
// See host.js for what each call answers.

export const editable = false;

let examples = null;        // the index, once read
const fields = new Map();   // source -> the field bundle it compiled to

async function readJSON(path) {
    const res = await fetch(path);
    if (!res.ok) {
        throw new Error(`${path}: HTTP ${res.status}`);
    }
    return res.json();
}

export async function listExamples() {
    if (!examples) {
        const index = await readJSON("models/index.json");
        examples = Array.isArray(index.examples) ? index.examples : [];
    }
    return examples.map(({ name, label }) => ({ name, label }));
}

export async function loadExample(name) {
    await listExamples();
    const entry = examples.find((e) => e.name === name);
    if (!entry) {
        throw new Error("not in this export");
    }
    const model = await readJSON(`models/${encodeURIComponent(entry.file)}`);
    // main.js compiles the source as it shows it, trimmed.
    fields.set((model.source || "").trim(), model.field);
    return { name: model.name || name, source: model.source || "" };
}

// compile answers with the field the source was exported with. The page compiles nothing, so
// any other source is an error; the editor is read-only, so none is asked for.
export async function compile(request) {
    const field = fields.get((request.source || "").trim());
    if (!field) {
        return { ok: false, status: 0, data: { errors: [{ lineNum: 1, column: 1, length: 1, message: "This page shows the model as it was exported and cannot compile changes to it." }] } };
    }
    return { ok: true, status: 200, data: { ...field, id: request.id } };
}

function unavailable(what) {
    return Promise.reject(new Error(`${what} needs gsl viewer; this page was exported and has no server`));
}

export function saveExample() {
    return unavailable("Saving");
}

export function mesh() {
    return unavailable("Meshing");
}

export function exportPage() {
    return unavailable("Exporting a web page");
}

export function uploadAsset() {
    return unavailable("Importing a mesh");
}

// Nothing here takes long enough to report progress.
export function connectProgress() {
    return Promise.resolve();
}
