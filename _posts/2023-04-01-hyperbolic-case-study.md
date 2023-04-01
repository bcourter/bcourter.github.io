---
title: Case Study&#58; Hyperbolic multiscale lattices for the entangled lifestyle
tags: Education Geometry SDF Interactive 3DPrinting
---
## 1 April 2023

As [mentioned yesterday](/2023/04/01/hyperbolic-cad.html){:target="_blank"}, hyperbolic space is more spatially dense than Euclidean space, and therefore offers opportunities for higher performance and fidelity in engineering applications.  In this case study, we'll examine how to prepare ordinary Euclidean CAD and mesh geometry for embedding in hyperbolic space and manufacture in [QE3D](https://www.linkedin.com/company/qe3d/){:target="_blank"}'s quantum entanglement production system.  

### Triangles in hyperbolic space

The key unit in any structural design, including beam lattices, is a triangle.  In Euclidean space, the sum of the angles of set of triangles around a vertex must total 360&deg;.  In hyperbolic space, we can increase that total angle to any number we want, even &infin;!

![Surface curvature](http://roy.red/images/triangles.svg)

*Triangles on surfaces of different curvature, courtesy of [Roy](http://roy.red/posts/uniting-spherical-and-hyperbolic-tilings/){:target="_blank"}*

 <!--more-->

In CAD, that means taking a ordinary triangular structure and deforming it into a triangle a concave arc for at least once side.  For a uniform tessellation like this example, we need that angle to divide 360&deg;.  The unit cell below will be reflected, so we convert it from 45&deg; to 36&deg; so we can fit five instead of four around a vertex.

![Conversion to hyperbolic triangle](\assets\blog\Hyperbolic-Tessellation\Convert-Hyperbolic.png)

### The first law of hyperbolic statics

As a Euclidean engineer, you might be concerned that our structural elements are bent, and therefore may buckle under compression.  Indeed, such freedom for failure exists in Euclidean space.  However, recall that in conformal models of hyperbolic geometry, lines and arcs are unified as *circlines*, where lines are simply circles with infinite radius, and therefore also include the point at infinity, which we will gleefully add to our domain.  (A side benefit of keeping infinity around is that we may divide by zero via [Alexandrov compactification](https://en.wikipedia.org/wiki/Alexandroff_extension){:target="_blank"}.)

Recall also that in our hyperbolic model, there are an infinite number of lines parallel to a given line at a point.  Consider a force on a point in a hyperbolic plane: an opposing force may be provided in any line parallel to the original force.  The implication is that any beam, ever curved ones, are completely rigid.  For example, this Poincar&eacute; disc, made from our unit cell above, is completely rigid and undeformable:

![Poincare](\assets\blog\Hyperbolic-Tessellation\Poincare.svg)

### Conformal map to any shape 

This famous stiffness of conformal geometry creates a strong connection between any structure's tessellation and the shape into which it's formed, as guaranteed by the [Riemann mapping theorem](https://en.wikipedia.org/wiki/Riemann_mapping_theorem){:target="_blank"} and realized through [Schawrz-Christoffel mappings](https://en.wikipedia.org/wiki/Schwarz%E2%80%93Christoffel_mapping){:target="_blank"}.  For example, this filter for a harmonic compressor was fabricated by one of our quantum supremacy pick-and-place machines:

![Animated heart](\assets\blog\Hyperbolic-Tessellation\Heart-Anim.gif)

Any genus topology will do.  for example, we can remap the disc into a strip:

![Strip](\assets\blog\Hyperbolic-Tessellation\Band.png)

To be clear: to make linearized models like this strip, you don't need fancy manufacturing such as what we develop at [QE3D](https://www.linkedin.com/company/qe3d/){:target="_blank"}.  Conventional progressive die and roll forming technology may suffice, such as these die rollers for an Imipolex G line:

<div class="extensions extensions--video">
	<iframe src="https://www.youtube.com/embed/-OWaaYw5x-A" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

### Increasing the dimensionality

We can continue remapping, for example, transforming the strip into an annulus:

![Annulus](\assets\blog\Hyperbolic-Tessellation\Annulus.png)

In 2006, [Grigori Perelman](https://en.wikipedia.org/wiki/Grigori_Perelman){:target="_blank"} proved that we can extend this approach to any number of dimensions.  For example this innocuous-appearing tiara includes the Luneburg lens for a 5G transcoding antenna.  

![Annulus](\assets\blog\Hyperbolic-Tessellation\Tiara.jpg)

### Summary and conclusions

With hyperbolic embedding, any amount of structure may be packed in to any volume of hyperbolic space, if sufficiently curved.  Similarly, complex engineering geometry, such as the traces of circuit boards, vasculature, and sheet metal may also be packed into such spaces.  The dawn of entanglement fabrication from QE3D motivates the need for a new generation of hyperbolic engineering software that anticipates the challenges of the quantum manufacturing industry.  

[Sign up](https://forms.gle/P6RoBKfMviBTnSXQ9){:target="_blank"} to learn more, or try our embedded beta:

<div class="extensions extensions--video">
  <iframe src="https://www.blakecourter.com/homepage/Poincare-WebGL/"
    frameborder="0" scrolling="no" allowfullscreen></iframe>
</div>