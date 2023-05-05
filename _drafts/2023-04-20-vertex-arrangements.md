---
title: The Non-Uniqueness of Sharp Offset via Distance Fields
tags: Geometry SDF 
---

Here's an oberservation for which I don't have a reference, inspired by a coversation off of the [Geometric Processing Worldwide](https://discord.gg/Bk5FZ7g4sv){:target="_blank"} Discord server.  [Daniel Piker](http://kangaroo3d.com/){:target="_blank"} provided this demonstration that there are two solutions, in general, to an offset discrete saddle vertex:

<div class="sketchfab-embed-wrapper"> <iframe title="offset" frameborder="0" allowfullscreen mozallowfullscreen="true" webkitallowfullscreen="true" allow="autoplay; fullscreen; xr-spatial-tracking" xr-spatial-tracking execution-while-out-of-viewport execution-while-not-rendered web-share src="https://sketchfab.com/models/0017fa3e8fa340dea043f05e5ee27f47/embed?ui_theme=dark"> </iframe> </div>

In [a beautiful 2015 paper](http://papers.cumincad.org/data/works/att/acadia15_203.pdf){:target="_blank"}, Ross and Hambleton show that the possible conbinatorics of planar offsets are equivalent to the possible tesselations of the vertex figure (an n-gon of the n-valent vertex).  These conbinatorics are described by [Catalan Numbers](https://en.wikipedia.org/wiki/Catalan_number){:target="_blank"}:

![tessellations of a hexagon](https://upload.wikimedia.org/wikipedia/commons/a/a8/Catalan-Hexagons-example.svg)

Ross and Hambleton's approach allows for different faces to have different offsets, but Piker demonstrates non-uniqueness for a single case with constant offset.  There appears to be an unresolved question: in general, what are the maxmium number of possibilities for a constant planar offset?

$$ \vec{i} $$

