# CodeMirror 6 vendor bundle

This directory holds a one-shot, prebuilt ESM bundle of the CodeMirror 6 subset
that the viewer's editor (`examples/viewer/editor/editor.js`) uses.

`codemirror.js` is **committed to the repo** so runtime fetch is a single file
and contributors don't need Node just to run `omega-core`. The `three` vendor
directory follows the same pattern.

## When to rebuild

You only need to rebuild if you're:

- Upgrading CodeMirror (bump versions in [package.json](package.json))
- Adding/removing re-exports in [build.mjs](build.mjs) (e.g. because `editor.js` started using a new CM6 symbol)

## How to rebuild

```sh
cd examples/viewer/vendor/codemirror
npm install
npm run build
git add codemirror.js package-lock.json
```

The only two files that matter at runtime are `codemirror.js` and the importmap
entry in [index.html](../../index.html) that points at it
(`"codemirror": "./vendor/codemirror/codemirror.js"`).

`node_modules/` and any other build artifacts are git-ignored.
