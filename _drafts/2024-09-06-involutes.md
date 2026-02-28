---
title: Involute UGFs and Abstracting Two Body Fields
layout: article
tags: SDF UGF Geometry TwoBody
hidden: true
exclude_from_archive: true
---

The fun at [nTop](http://www.ntop.com) never ends, as our customers continue to push us to use nTop in new ways.  In the early days, I'd made a basic gear generator in nTop after seeing some engineers get started by approximating their involute faces with arcs.  While I found an implicit form on [MathOverflow](https://math.stackexchange.com/questions/411855/implicit-representation-of-the-involute-of-a-circle/415023
), it was not a UGF and had a weird right angle hook.  I was able to get a decent implicit modeling out, it wasn't going to shell correclty and had a bit of a messy inside.  As an engineer, I had delivered the result to tolerance, and therefore could call it done, but was unsatisfied.  

<iframe class="fullsize" frameborder="0" src="https://www.shadertoy.com/embed/3lG3WR?gui=false&t=10&paused=false&muted=false" allowfullscreen></iframe>

*ShaderToy by [Stanislav Pidhorskyi](https://www.shadertoy.com/user/Pidhorskyi)*

Fast forward to the present, as a large customer shared a lightweighting application that would requre circular involutes.  The topic provoked a bit of a discovery session with fellow nTop Fellow [George Allen](https://www.youtube.com/watch?v=fXm5LqLcupo) and geometry engineer [Roman Kogan](https://romankogan.net/math/), where we we affirmed, mostly at Roman's provoking:

* All curves generate unique involute curves as a function of their parameter point and direction.  These curves will not self-intersect when generated from convex curves.
* In the language of curves, involutes always form a "parallel" family.  The isosurfaces of SDFs are also parallel curves.  
* If we assign to involute curves the value of each curve's base point's curve distance from the end of the curve, we produce a UGF in the domain of the involute.

We'll limit the discussion to 2D curves and fields, noting that the involutes of 3D curves generate developable surfaces.  Convex shapes always produce an involute on their exterior, which must always be a periodic, spiral-like UGF.  Given that we are creating the UGF by parameterizing by the curve distance, the inside of a convex shape can always be completed by the parameter length field.  Let's take a look at the picture 