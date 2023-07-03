---
title: Unit Gradient Fields&#58; The Two-Body Field, &Xi; 
tags: SDF UGF Geometry TwoBody
sidebar:
    nav: sdf-ugf
---

So far in the series, we've defined the basic idea that [UGFs generalize SDFs](/2023/05/05/what-is-offset.html) and examined that when representing shapes, UGFs offer design freedom in [the shapes' normal cones](/2023/05/18/field-notation.html).  In most of the examples, we've shown that this freedom helps recapitulate the kinds of edge treatments we see in engineering software like rolling-ball blends and chamfers.  In this post, we'll take a look at the clearance and midsurface fields, generated from SDFs, and the two-body field, generated from UGFs.

*Use the slider to change viewing modes:*

<div>{%- include extensions/shadertoy.html id='DssczX' -%}</div>

{% include math.html %}

*The clearance field, $$\ugf{A} + \ugf{B}\,$$, the midsurface field, $$\ugf{A} - \ugf{B}\,$$, and the two-body field: $$\twobody{\ugf{A}}{\ugf{B}} \equiv \frac{(\ugf{A} - \ugf{B})}{(\ugf{A} + \ugf{B})}$$.  The clearance and midsurface fields are overlaid to demonstrate their orthogonality.*

<!--more-->

### Clearance and midsurface fields

There are few concepts to unpack.  First, lets just get a feel for why the sum and difference perform as clearance and midsurface fields.  Let's use one-dimensional functions on a line to represent the section between opposing shapes.  

<style>
	td.RL {
	  background-image: linear-gradient(to right, rgba(255, 0, 0, 0.2) 0%, rgba(255, 0, 0, 0.2) 100%);  /* your gradient */
	  background-position: 0% 50%;
	  background-repeat: no-repeat;  /* don't remove */
	}
	td.BR {
	  background-image: linear-gradient(to left, rgba(0, 0, 255, 0.2) 0%, rgba(0, 0, 255, 0.2) 100%);  /* your gradient */
	  background-position: 100% 50%;
	  background-repeat: no-repeat;  /* don't remove */
	} 
	td.GL {
	  background-image: linear-gradient(to right, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.2) 100%);  /* your gradient */
	  background-position: 0% 50%;
	  background-repeat: no-repeat;  /* don't remove */
	} 

	td.Div {
	  border-left: thin solid black;
	} 

	table, tbody {
	  table-layout: fixed;
	  width: 100%;  
	  margin-left: auto; 
	  margin-right: auto;
	}
	table, tr, td {
	  border: 0px solid;
	  text-align: center;
	  padding: 0px !important;
	}
	p.squash {
	  max-height: 2rem;
	  width: 8rem;
	  overflow-y: clip;
	  vertical-align: center;
	}
</style>
<div style='display:block; width: 60%; margin-left:auto; margin-right:auto;'>
<table>
  <tr>
  	<td style='width: 8rem;'><p class='squash'> $$ \ugf{A} $$ </p></td>
  	<td style='width: 1rem;' class='Div'></td>
    <td class='RL' style='background-size: 100% 60%'>-2</td>
    <td class='RL' style='background-size: 100% 60%'>-1</td>
    <td class='RL' style='background-size: 50% 60%'>0</td>
    <td class='RL' style='background-size: 0% 60%'>+1</td>
    <td class='RL' style='background-size: 0% 60%'>+2</td>
    <td class='RL' style='background-size: 0% 60%'>+3</td>
    <td class='RL' style='background-size: 0% 60%'>+4</td>
  </tr>
  <tr>
  	<td><p class='squash'> $$ \ugf{B} $$ </p></td>
  	<td class='Div'></td>
    <td class='BR' style='background-size: 0% 60%'>+4</td>
    <td class='BR' style='background-size: 0% 60%'>+3</td>
    <td class='BR' style='background-size: 0% 60%'>+2</td>
    <td class='BR' style='background-size: 0% 60%'>+1</td>
    <td class='BR' style='background-size: 50% 60%'>0</td>
    <td class='BR' style='background-size: 100% 60%'>-1</td>
    <td class='BR' style='background-size: 100% 60%'>-2</td>
  </tr>
  <tr>
  	<td><p class='squash'> $$ \ugf{A} + \ugf{B} $$ </p></td>
  	<td class='Div'></td>
    <td>+2</td>
    <td>+2</td>
    <td>+2</td>
    <td>+2</td>
    <td>+2</td>
    <td>+2</td>
    <td>+2</td>
  </tr>  
  <tr>
  	<td><p class='squash'> $$ \ugf{A} - \ugf{B} $$ </p></td>
  	<td class='Div'></td>
    <td class='GL' style='background-size: 100% 60%'>-6</td>
    <td class='GL' style='background-size: 100% 60%'>-4</td>
    <td class='GL' style='background-size: 100% 60%'>-2</td>
    <td class='GL' style='background-size: 50% 60%'>0</td>
    <td class='GL' style='background-size: 0% 60%'>+2</td>
    <td class='GL' style='background-size: 0% 60%'>+4</td>
    <td class='GL' style='background-size: 0% 60%'>+6</td>
  </tr>
  <tr>
  	<td><p class='squash'> $$ \twobody{\ugf{A}}{\ugf{B}} $$ </p></td>
  	<td class='Div'></td>
    <td class='GL' style='background-size: 100% 60%'>-3</td>
    <td class='GL' style='background-size: 100% 60%'>-2</td>
    <td class='GL' style='background-size: 100% 60%'>-1</td>
    <td class='GL' style='background-size: 50% 60%'>0</td>
    <td class='GL' style='background-size: 0% 60%'>+1</td>
    <td class='GL' style='background-size: 0% 60%'>+2</td>
    <td class='GL' style='background-size: 0% 60%'>+3</td>
  </tr>
</table>
</div>	

Clearly, the sum indicates the clearance.  The difference is the midsurface field, but scaled by a factor of two.  If one zooms out of the sum field to the far side of either shape, the sum also doubles up far from the midsurface, so we normalize by two in the Shadertoy above.  

The two-body field, $$\twobody{\ugf{A}}{\ugf{B}} \equiv \frac{(\ugf{A} - \ugf{B})}{(\ugf{A} + \ugf{B})}, clearly ranges in $$ [-1, 1] $$ in the region not contained in either of the shapes, creating a predictable parametric space for modulation, interpolation, and remapping.  

### The clearance is orthogonal to the midsurface 

In the visualization, the sum and difference fields are clearly orthogonal, but why?  Algebraically, it works out trivially enough, recalling that UGFs have unit gradient magnitude by definition and that orthogonal vectors dot to zero:

$$  \begin{aligned}
        \inner{(\grad\ugf{A} + \grad\ugf{B}\,)}{(\grad\ugf{A} - \grad\ugf{B}\,)} &= \\ 
        \inner{\grad\ugf{A}\,}{(\grad\ugf{A}\; - \grad\ugf{B}\,)} + \inner{\grad\ugf{B}\,}{(\grad\ugf{A}\; - \grad\ugf{B}\,)} &= \\
        \inner{\grad\ugf{A}}{\!\grad\ugf{A}}\; - \inner{\grad\ugf{A}}{\!\grad\ugf{B}}\; + \inner{\grad\ugf{B}}{\!\grad\ugf{A}}\; - \inner{\grad\ugf{B}}{\!\grad\ugf{B}} &= \\
        1 - \inner{\grad\ugf{A}}{\!\grad\ugf{B}} + \inner{\grad\ugf{A}}{\!\grad\ugf{B}}\; - 1 &= 0 \;.  
    \end{aligned} $$

However, those of us from the [Tristan Needham](https://en.wikipedia.org/wiki/Tristan_Needham) school of analysis might prefer a more geometric explanation:  

<div>{%- include extensions/shadertoy.html id='dd2cWy' -%}</div>

The key observation is that when $$ \ugf{A}\, $$ and $$ \ugf{B}\, $$ are UGFs, the sum and difference gradient vectors form the diagonals of a rhombus, and therefore, are orthogonal.  Note that this rhombus is contained in the normal cone of the fields' intersection (green).

The sum and difference fields, $$ S = \ugf{A}\, + \ugf{B}\, $$ and $$ D = \ugf{A}\, - \ugf{B}\, $$, produce an orthogonal basis and using the Sampson Norm, $$ \sampson{F} \equiv \frac{F}{\norm{\grad{F}}} $$, $$ \augf{S}\,' = \sampson{S} $$ and $$ \augf{D}\,' = \sampson{D} $$ form an orthonormal basis, which can be a useful way of approximating distance-to-curve and constructing edge treatments.  Perhaps we'll do a deeper dive on this topic in a future post, but here's a teaser from some old [twitter](/2022/06/22/constant-width-chamfer.html) [threads](/2022/06/25/edge-coordinate-system.html).

### Applications of the two-body field

The two-body field can be more useful than fields from geometry for modulating other fields and interpolating shape.  It perhaps most celebrated in engineering applications when mapping one a shape from Cartesian space into a new field-driven parametric space.  For example, consider the toolpath geometry for the saddle surface below.  Two pairs of side walls $$U$$ and $$V$$ form two two-body fields, which, when multiplied by a constant characteristic length, creates a $$UVW$$ coordinate space along with the the distance to the midsurface of the reference geometry, $$W$$.  

<div style='display:block; width: 80%; margin-left:auto; margin-right:auto;'>
<table>
  <tr>
    <td><img src="\assets\blog\UGFs\04 HyperUVW CAD.png" /></td>
    <td><img src="\assets\blog\UGFs\04 HyperUVW UVW.png" /></td>
    <td><img src="\assets\blog\UGFs\04 HyperUVW Final.png" /></td>
  </tr>
</table>
</div>	

If working with oriented open or nested shapes, several two-body fields map be combined into larger piecewise continuous maps.

### Generalized conics

When observing the two-body field above, you might have noticed that the circles inside the blue circle aren't concentric.  Let's simplify the situation down to the two-body field of two points:

<div>{%- include extensions/shadertoy.html id='cs2cW3' -%}</div>

*Apollonian circles and conic sections.  Unmodified, the Apollonian family are all circles, but between a circle and a line, ellipses occur near the circle, hyperbola occur near the line, and a parabola appears at $$ \Xi = 0 $$.  Observe the constant spacing along the horizontal axis containing the circle centers.*

If these circles look familiar, they are members of the family (pencil) of [Apollonian circles](https://en.wikipedia.org/wiki/Apollonian_circles) which sometimes appear in engineering applications.  These circles are described by curves that are the constant ratio of distance to two circles, and indeed, the two-body field may be suitably reparameterized:

$$ \frac{\df{A}-\df{B}}{\df{A}+\df{B}} = t  \quad\iff\quad  \frac{\df{A}}{\df{B}} = \frac{1+t}{1-t} \,. $$

When working with SDFs, our two-body parameterization has the useful property that the fields are evenly spaced, which is useful for both engineering and aesthetic applications.  (This reparameterization is a one-dimensional [Cayley transform](https://en.wikipedia.org/wiki/Cayley_transform), which often appears in hyperbolic geometry.)

As noticed by [Ponce and Santibáñez](https://www.tandfonline.com/doi/abs/10.4169/amer.math.monthly.121.01.018), ratios of distance fields generalize conics from points, circles, and planes to arbitrary shapes, and UGFs further generalize those results beyond distance fields.  

### Summary

The sum and difference fields represent clearance and interference when applied to SDFs.  When applied to UGFs, the two-body field, the ratio of the sum and difference fields, is a straightforward approach to setting up mapping spaces in engineering applications.  Mysteriously, notes of conformal mapping and complex analysis appear to present themselves, which can be useful when working on combined engineering and aesthetic challenges.  

[Sign up for major updates on the UGF manuscript](https://docs.google.com/forms/d/e/1FAIpQLSc7ODKkQD2kd8LXfOm2oLpm4oX-CWgO6g4Hz_fSaMZh3sm75Q/viewform?usp=sf_link){:target="_blank"}