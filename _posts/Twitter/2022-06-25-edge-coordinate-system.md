---
title: Edge coordinate system
tags: SDF nTopology Twitter
---

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark"><p lang="en" dir="ltr">Okay, let&#39;s build off of the implicit chamfer thread to demonstrate how you can quickly produce any edge treatment you can dream of using implicit geometry. <br><br>In <a href="https://twitter.com/nTopology?ref_src=twsrc%5Etfw">@ntopology</a>, we&#39;ll deliver the holy grail of edge treatments: the C∞ blend.<br><br>Previous:<a href="https://t.co/uKOXYihBD5">https://t.co/uKOXYihBD5</a><br><br>(1/n) <a href="https://t.co/UG7sRIbifa">pic.twitter.com/UG7sRIbifa</a></p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540711798495531009?ref_src=twsrc%5Etfw">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<!--more-->

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark">At the intersection of any two SDFs A and B, as happens at an edge, we can define the normalized sum and difference fields:<br><br>S = (A + B) / |∇A + ∇B|<br>D = (A - B) / |∇A - ∇B|<br><br>We also have a useful spatial parameter Θ for the edge dihedral angle:<br><br>cos(Θ) = ∇A · ∇B<br><br>(2/n) <a href="https://t.co/Tx0MPxOVy9">pic.twitter.com/Tx0MPxOVy9</a></p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540715015996465159?ref_src=twsrc%5Etfw">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark">S and D form a local coordinate system along the edge. It&#39;s the kind of frame we associate with 2D space, an &quot;orthonormal basis&quot; for our cross section.<br><br>A and B also create a kind of coordinate system or basis, but they are not perpendicular; rather they follow A and B. <br><br>(3/n)</p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540716765532934144?ref_src=twsrc%5Etfw">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark">In implicit modeling, when one sees a basis, orthonormal or not, one sees an opportunity for transformation. In explicit modeling, one can directly move geometry around, but with implicits, one must draw a new basis where one wants geometry to be.<a href="https://t.co/wsVs4RtVPA">https://t.co/wsVs4RtVPA</a><br><br>(4/n)</p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540718595075735553?ref_src=twsrc%5Etfw">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark">So we have two new normalized bases into which we can inject geometry. Let&#39;s start with a circular cross section in our canonical example of a cylinder intersecting a plane.<br><br>(5/n) <a href="https://t.co/st1Vc0slac">pic.twitter.com/st1Vc0slac</a></p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540720297917108225?ref_src=twsrc%5Etfw">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark">When we map to the (S, D) basis, the cutout of our remapped circle stays circular. When we map to the (A, B) basis, it gets warped to an ellipse based on the dihedral angle.<br><br>Notice that the (A, B) basis preserves depth, despite the stretch.<br><br>(6/n) <a href="https://t.co/M2aZg9ewq5">pic.twitter.com/M2aZg9ewq5</a></p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540722319479386116?ref_src=twsrc%5Etfw">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark">Let&#39;s try the same thing but with an axis-aligned square instead of a circle. While (S, D) produces a chamfer-like groove, the (A, B) field sweeps the square with a vertex resting one each face, stretched along the edge. It self-sizes while preserving depth!<br><br>(7/n) <a href="https://t.co/8Z9V3wRZYb">pic.twitter.com/8Z9V3wRZYb</a></p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540724446817931266?ref_src=twsrc%5Etfw">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark">The (S, D) map is also useful without an edge. It provides a way to sweep an arbitrary shape along a curve, with the twist along the curve defined by the pair of intersecting implicits. <br><br>Here&#39;s an Escher lizard swept along the (S, D) or our edge.<br><br>(8/n) <a href="https://t.co/Jle01m2WBc">pic.twitter.com/Jle01m2WBc</a></p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540725109375246337?ref_src=twsrc%5Etfw">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark">To achieve a C∞ blend, we need a curve that&#39;s infinitely differentiable and is fully contained in one quadrant. <br><br>(I misspoke in tweet 7. That groove is produced by one quadrant of the square, not the diagonal.)<br><br>(9/n)</p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540726566619123712?ref_src=twsrc%5Etfw">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark">Our high school friend y = 1/x is exactly such a curve. It&#39;s implicit form in units of length with the right sign convention for intersection is:<br><br>1 - ssqrt(xy) = 0<br><br>where ssqrt(t), the signed square root, is:<br><br>ssqrt(t) = sign(t) * sqrt(|t|)<br><br>(10/n) <a href="https://t.co/AMAx5AdQqG">pic.twitter.com/AMAx5AdQqG</a></p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540728703474442240?ref_src=twsrc%5Etfw">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark">Looking closely at the mapped result, just as 1/x is asymptotic to the x and y axes, our blended body never quite touches the original faces. <br><br>I like to think of this operation as rock tumbling.<br><br>(11/n) <a href="https://t.co/THupVajiBw">pic.twitter.com/THupVajiBw</a></p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540731192009363457?ref_src=twsrc%5Etfw">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark">The pattern of sum and difference fields arises over and over. Since we&#39;re looking at a hyperbola, you might have always wondered how 1/x was related to the x^2 - y^2 = 1 version. Turns out it&#39;s just mapping with our normalized S and D fields. <a href="https://t.co/YDJ1bKjErh">https://t.co/YDJ1bKjErh</a><br><br>(12/n)</p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540733908593041409?ref_src=twsrc%5Etfw">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<blockquote class="twitter-tweet" data-conversation="none" data-theme="dark">Now, you can do anything you want to pairs of edges.  When unioning instead of intersecting, use the opposite section quadrant. <br><br> There are other approaches to blending an arbitrary number of SDFs, as seen in nTop blends (including C∞). <br><br> eg <a href="https://mercury.sexy/hg_sdf/">https://mercury.sexy/hg_sdf/</a> <br><br> (13/n; n=13)</p>&mdash; Blake Courter (@bcourter) <a href="https://twitter.com/bcourter/status/1540734312600850434?ref_src=twsrc">June 25, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
