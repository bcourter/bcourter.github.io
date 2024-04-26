---
title: Differentiable Engineering
layout: article
tags: SDF UGF Differentiable AI/ML Management
---

## Executive summary
* By including differentiable, parametric models in engineering processes, engineering software can better interoperate between human and artificial designers.  
* Existing CAD, CAM, and CAE tools can speak this language by adding differential interoperability to their APIs.
* We provide a visually compelling introduction to differential engineering using a cantilevered beam.
* By examining the derivative of a rotation, we briefly unlock some deep math beauty and an application of [Unit Gradient Fields (UGFs)](https://www.blakecourter.com/2023/05/18/field-notation.html).
* Differentiable engineering scales to product level systems engineering.

✏️ *Math advisory: this post assumes your okay with derivatives and the chain rule from basic calculus and a little vector math.  We will introduce intuitive visual tools to illustrate such concepts in design engineering.  While I feel compelled to show the work, you can probably skim and glean the concepts from the illustrations.*

👥 *Lots of credit: These ideas came from discussions with many people, including:*

* {: style="font-size: 80%;"} [Sandilya Kambampati](https://www.linkedin.com/in/sandilya-kambampati-85595475/), [Intact Solutions](https://www.intact-solutions.com/)
* {: style="font-size: 80%;"} [Luke Church](https://www.linkedin.com/in/lukechurch/), [Gradient Control Laboratories](https://www.gradientcontrol.com/)
* {: style="font-size: 80%;"} [Trevor Laughlin](https://www.linkedin.com/in/trevorlaughlin/), [nTop](https://www.nTop.com/)
* {: style="font-size: 80%;"} [Jon Hiller](https://www.linkedin.com/in/jonathan-hiller-6b7656123/), [PTC](https://www.ptc.com/)
* {: style="font-size: 80%;"} [Peter Harman](https://www.linkedin.com/in/peterharman/), [Infinitive](https://cae.tech/)

## Introduction

If AI and ML are to participate in the team sport known as "engineering," they will need not only to produce helpful results, but also fit in with the rest of the team, including human engineers.  The situation seems unworkable today, where AI and ML frameworks, emerging computational tools, and even traditional, feature-based CAD appear designed to be used by human operators.  For example:
* Generative design for new components via topology optimization typically produces incomplete models that require manual rework.
* The [exploding market](/2024/04/01/moat-map.html) of simulation tools mostly promises to accelerate simulation but still requires traditional, manual, validation.
* Systems engineers can deploy MDO tools at product or subsystems levels, but such systems typically provide guidance during the concept phase and become reinterpreted by humans for detailed design.  

If part of the promise of AI and ML is to increase the size of the design space that engineers can navigate, how can we bridge these human gaps in the process?  As generative design scales to the subsystem and product level, how can we connect all the pieces without the meaning becoming hidden in a nonintuitive latent space?  How will we ever achieve the dream of synthetic, cyber-physical systems if there must always be humans in the loop?

## Abstracting the design engineer

Let's propose a model for a design engineer, human or automated, rekindling the old term "MDA" as the Mechanical Design *Automaton*:

<object data="/assets/blog/Differentiable/DifferentiableEngineeringTriangle.svg" type="image/svg+xml"></object>

<!--more-->

{% include math.html %}
$$ \newcommand{\Shape}{\Omega} $$  <!-- redefinition -->
$$ \newcommand{\parameters}{\boldsymbol{\Theta}} $$
$$ \newcommand{\fitness}{\boldsymbol{F}} $$
$$ \newcommand{\CAD}{\text{CAD}} $$
$$ \newcommand{\CAE}{\text{CAE}} $$
$$ \newcommand{\MDA}{\text{MDA}} $$

There appear to be three main roles in an engineering process:
* Model creation tools, like CAD systems, that generate output like parts, assemblies, and manufacturing deliverables.  We can model CAD as a function $$\CAD\!: \parameters \mapsto \Shape$$.  We'll focus on simple dimensional and angular parameters as in parametric CAD, but other parameter types include the feature recipe, explicit positions of mesh vertices, density values on a voxel model, material selection, etc.  
* Engineering (CAE) tools that measure various finesses of CAD designs, such as mass properties, testing mechanical and other physical properties, cost, environmental impact, and aesthetics.  We can model engineering software as $$\CAE\!: v \mapsto v$$,
* Finally, there is a designer interested in producing optimal designs by tuning the parameters to optimize fitness.  $$\MDA\!: \parameters \mapsto \fitness$$

✏️ *Math tip: the notation $$f: x \mapsto y$$ defines the function $$y = f(x)$$ and can be read as "maps to."*

### The designer's shape paradox

This system suggests that a designer cares not about the shape of their design, only its fitness.  Paradoxically, most design engineers focus their work on drawing and documenting shapes!  If industrial design and assembly context are taken as constraints, perhaps nonintuitive, topology optimized results are closer to home than we thought.  

On the other hand, this model shows that a designer is most interested in navigating an available set of design parameters to achieve a fitness goal.  Somehow, the designer needs to use a set of fitnesses to update the set of parameters.  And we only have one shape $$\Shape$$ for every vector of input parameters $$\parameters$$ and vector of fitnesses $$\fitness$$.  

What is the map from fitnesses to parameters?  It's the inverse of $$\MDA$$, $$\MDA^{-1}$$, the origin story for the term "inverse engineering."  In many cases, we might optimize a design by minimizing a scalar loss function $$\lambda(\fitness)$$.  Various optimization techniques such topology optimization and multi-disciplinary optimization (MDO) are examples of this setup.  

Therefore, the job of the designer is to find the magical set of parameters to achieve a set of fitnesses that please all stakeholders, while being opinionated about the output shape.  It stands to reason one might proceed incrementally.  In such a world, it might be helpful to know in what direction and how far to turn a knob to get the intended result.  The tools of calculus provide such an estimate.  

When I was an AE out of college selling [Pro/E](https://www.ptc.com/en/products/creo/parametric), I used to demo parametrically optimizing a part through FEA.  The first thing the solver would do is make a small change to the parameters to compute a slope to find the optimal value and iterate until it was close enough.  The terms "gradient descent" and "Newton's method" describe this process.  In those days, it would take some time to regenerate the CAD part for each parameter set, so you had to do some story telling while it was computing that slope.  Now, in [nTop field optimization](https://www.ntop.com/software/capabilities/field-optimization/), we wait for a similar loop, but with spatially varying fields as in topology optimization.

### Enter the derivative

It sure would have been nice if Pro/E know that slope right away, so the FEA didn't need to compute an extra model.  Due to the advent of machine learning, we see many emerging solutions to this challenge.  Today, we have three commonly used forms of computational differentiation, the nuances of which we can ignore:
* **Symbolic differentiation**: If we have a mathematical expression, we can manipulate it like we did in high school and have a new function for each derivative of interest.  
* **Forward mode automatic differentiation**: Equivalent to the fascinating [dual numbers](https://blog.demofox.org/2014/12/30/dual-numbers-automatic-differentiation/) and highly compatible with [geometric algebra](https://assets.cambridge.org/052148/0221/sample/0521480221ws.pdf), you maintain and update each parameter's derivative with its value.  It can be straightforward to implement using types.  
* **Reverse mode automatic differentiation**: When computing, build a structure that can be used to compute derivatives later, which is efficient when you have many inputs and only a few outputs.  When differentiating though FEA and CFD simulations, the **adjoint method** is an efficient reverse mode technique.

Given the scale and complexity of machine learning, such techniques are critical.  At what point do they go from a *nice-to-have* to a *must-have*?  Maybe [Claude](https://claude.ai/) can help:

<object data="/assets/blog/Differentiable/Claude-AD.svg" type="image/svg+xml"></object>

For more detail about automatic differentiation and optimization algorithms, see Nick McCleery's [thorough post on differentiable programming in engineering](https://nickmccleery.github.io/posts/05-differentiable-programming-in-engineering/). 

An with all of that setup, we differentiate our maps and observe the chain rule through the shape, arriving at the main observation of this article:

$$\Large{\pdv{\fitness}{\parameters} = \pdv{\fitness}{\Shape} \pdv{\Shape}{\parameters}}$$

✏️ *Math tip: read the partial derivative notation "$$\partial x$$" as the same as "$$dx$$" assuming all partials are independent, but be aware that there are more of them.  If $$\p = (x, y)$$, we express a vector of those partials as the gradient $$\grad f(\p) = \left(\pdv{f}{x}, \pdv{f}{y}\right)$$.*

Speaking in the language of differentials, we can summarize that:
* CAD systems are concerned with shapes' *parametric sensitivities* $$\pdv{\Shape}{\parameters}$$;
* CAE systems determine shapes' *functional sensitivities* $$\pdv{\fitness}{\Shape}$$; and
* The outer product of those two vectors becomes our *design Jacobian* matrix that captures the map of how the parametric sensitivities become functional sensitivities.  

Again, any of these parameters might or might not also be spatially varying.  

## Visualizing derivatives as fields

Let's work through a simple engineering example: a cantilevered beam.  We will represent it as a [UGF](https://www.blakecourter.com/2023/05/18/field-notation.html), embedding offset behavior and edge treatments into the booleans.  In this example, we only require a sharp intersection, but we will implement the exact SDF for comparison with [Mercury](https://mercury.sexy/hg_sdf/) and [IQ's haikus](https://iquilezles.org/articles/distfunctions2d/), which are optimized for the GPU but complicate the derivative.  

### A rectangle and its derivatives

For our shape $$\Shape$$, we'll use a rectangle $$\shape{R}(\p; \point{s}_½)$$ at centered on the origin with size $$\point{s} = (w, h)$$.  Due to symmetry, we'll parameterize via the half-size vector $$\point{s}_½ = (w, h) / 2$$, our $$\parameters$$.  Given position $$\p$$:

$$ \text{let} \quad \p_c \equiv \abs{\p} - \point{s_½} \, , $$

where $$\abs{\cdot}$$ is the absolute value of the components, which provides us with local coordinates for the entire rectangle in the first quadrant.  Then, given components of $$\p_c = (\p_{cx}, \p_{cy})$$ and (Euclidean) length $$\norm{\cdot}$$, case-wise:

$$ \shape{R} = \begin{cases}
	\norm{\p_c} \, , & \p_{cx} > 0 \text{ and } \p_{cy} > 0  \\
	\begin{cases}
		\p_{cx} \, , & \p_{cx} \ge \p_{cy} \\
		\p_{cy} \, , & \p_{cx}  <  \p_{cy}
	\end{cases} & \text{otherwise.}  
\end{cases}$$

Here's our rectangle and it's partial derivatives (click to sample the field):

<iframe class="fullsize" frameborder="0" src="https://www.shadertoy.com/embed/4f2XzW?gui=false&t=10&paused=false&muted=false" allowfullscreen></iframe>

The case-wise construction simplifies taking derivatives, as the same cases apply.  Here is our spatial gradient, which always points to the boundary:

$$ \grad \shape{R} = \left( \frac{\partial\shape{R}}{\partial x} , \frac{\partial\shape{R}}{\partial y} \right) = \begin{cases}
	\left( \frac{\p_x}{\shape{R}} , \frac{\p_y}{\shape{R}} \right) \, , 
		& \p_{cx} > 0 \text{ and } \p_{cy} > 0  \\
	\begin{cases}
		(\sgn(\p_x), 0) \, , & \p_{cx} \ge \p_{cy} \\
		(0, \sgn(\p_y)) \, , & \p_{cx}  <  \p_{cy}
	\end{cases} 
		& \text{otherwise.}  
\end{cases}$$

and our derivatives with respect to the half-size vector components:

$$ \pdv{\shape{R}}{\point{s}_½} = \begin{cases}
	\left( \frac{-\p_{cx}}{\shape{R}} , \frac{-\p_{cy}}{\shape{R}} \right) \, , 
		& \p_{cx} > 0 \text{ and } \p_{cy} > 0  \\
	\begin{cases}
		(-1, 0) \, , & \p_{cx} \ge \p_{cy} \\
		(0, -1) \, , & \p_{cx}  <  \p_{cy}
	\end{cases} 
		& \text{otherwise.}  
\end{cases}$$

Why the negative values?  As the rectangle gets bigger, the field at locations on either side of it get smaller.  

What if we want the derivatives WRT $$w$$ and $$h$$?  $$\pdv{\point{s}_½x}{w}$$ and $$\pdv{\point{s}_½y}{h}$$ are both $$\frac{1}{2}$$, so $$\pdv{\shape{R}}{\point{s}} = \frac{1}{2} \pdv{\shape{R}}{\point{s}_½}$$ .

### Chaining in the fitness functions

Let's introduce some fitness properties ($$\fitness$$) for our rectangle $$\shape{R}$$, which, despite its symmetry, could be a cantilevered beam adding depth $$d$$.  We'll fix one side and put a downward load $$f$$ on the other.  We can the write down our textbook deflection formula for volume $$V$$, sectional inertia $$I$$, and deflection $$\delta$$ for elastic modulus $$E$$:

$$\begin{align}
V &= w h d \;, \\[1ex]
I &= \frac{d h^3}{12} \;, \\[1ex]
\delta &= \frac{f w^3}{3 E I} = \frac{4 f w^3}{E d h^3} \;.
\end{align}$$

Which are clear functions of the basic dimensions of $$\shape{R}$$.  We don't need to pull out the chain rule through a shape, as that work is already baked into the integrals used to derive these formulas.  Observe that the volume calculation for our cuboid beam is equivalent to an approximate Riemann integral with one big element.  We can work with any kind of geometry across which we can integrate, and folks like [Intact Solutions](https://www.intact-solutions.com/) use that trick to simulate physics on geometry unsuitable for FEM.

Here, we can just analytically differentiate with respect to $$\point{s}$$:

$$\begin{align}
\pdv{V}{\point{s}} &= (h d, w d) \;, \\[1ex]
\pdv{\delta}{\point{s}} &= \frac{12 f}{E d} \left(\frac{w^2}{h^3}, -\frac{w^3}{h^4}\right) \;.
\end{align}$$

These values, the rows of our design Jacobian, $$\pdv{\fitness}{\parameters}$$, are constant with respect to space.

### Shape, topology, and field optimization

Modern optimization tools add more parameters to the model, for example this parameterized cantilever from Sandy, optimized using derivatives with respect to parameters at each arrow: 

![A cantilevered beam with several dimensions used to optimize its height over its length.](\assets\blog\Differentiable\IntactShapeOpt.png)

Other kinds of shape optimization might use the positions of mesh vertices or subdivision surface control points.  Topology optimization extends this concept using voxel-based parameters for density or implicit boundary values.   

## Transforming our shape

Let's take a look at the effect of rotation on our shape.  As our rectangle rotates about its center, the difference is whether the new increment adds material to or removes material from each face.  Another way to think about this derivative is whether the rectangle would be seeing wind or in the lee of the wind while it turns.  In regions where the material is being added, the derivative is negative, like with the rectangle's size.  The sign of the derivative on the surface is equivalent to whether the rotation is towards or away from the shape.  

To get a feel, let's illustrate the rotational derivative on explicit geometry.  Using differentiable boundary models, it's possible to compute such derivatives directly on the surface.  For example, here is the rotational derivative through the center of the box visualized on the faces using [Engineering Sketch Pad](https://acdl.mit.edu/ESP/ESP_flyer.pdf).  

![Derivative on the surface of a rotating box](/assets\blog\Differentiable\EngineeringSketchPad-RotatingBox.png){: style="width: 70%; height: 70%; display: block; margin-left: auto; margin-right: auto"}

### The derivative of a rotation

As a casual mathematician, it's rare to get a window into the inner workings of math.  Rotating our rectangle provides such an opportunity.  Consider rotating $$\shape{R}(\p; \point{s}_½)$$ through its center by angle $$\alpha$$ by remapping via the transformation $$T(\alpha)\!: \p \mapsto \p'$$, where:

$$T(\alpha) \equiv 
\begin{bmatrix}
\cos(\alpha) & \sin(\alpha)\\
-\sin(\alpha) & \cos(\alpha)
\end{bmatrix} \,.$$

Differentiating:

$$
\begin{align}
\pdv{T}{\alpha} 
&= 
\begin{bmatrix}
-\sin(\alpha) & \cos(\alpha)\\
-\cos(\alpha) & -\sin(\alpha)
\end{bmatrix}  
\\[1ex] &= 
\begin{bmatrix}
\cos\left(\alpha + \frac{\pi}{2}\right) & \sin\left(\alpha + \frac{\pi}{2}\right)\\
-\sin\left(\alpha + \frac{\pi}{2}\right) & \cos\left(\alpha + \frac{\pi}{2}\right)
\end{bmatrix} 
\\[1ex] &=
T\left(\alpha + \frac{\pi}{2}\right) 
\\[1ex] &=
T(\alpha) \; T\!\left(\frac{\pi}{2}\right) 
\,. \end{align}$$

Therefore, taking the derivative of a rotation is the same thing as adding a quarter turn to your rotation.  In complex analysis, we learn this operation as multiplying by $$i$$.  In geometric algebra, it is the pseudoscalar $$I$$.  In differential forms, it becomes known as the complex structure $$J$$ and lets us perform rotations on surfaces.  All of them square to $$-1$$.

Before we perform the derivation, let's take a look at $$\frac{\partial\shape{R}}{\partial\alpha}$$ with fields rotated through the center of the image.  The animation illustrates the complex structure of the derivative of a rotation.  We illustrate the rotation via the family ("[pencil](https://en.wikipedia.org/wiki/Pencil_(geometry))") of these fields:

$$\shape{R} \cos(\phi) + \frac{\partial\shape{R}}{\partial\alpha} \sin(\phi) \;,$$

while animating $$\phi$$.

<iframe class="fullsize" frameborder="0" src="https://www.shadertoy.com/embed/mtKfWz?gui=false&t=10&paused=false&muted=false" allowfullscreen></iframe>

How to interpret the animation?  It's similar to the rotating box, but we are holding the shape fixed and rotating space around it, which seems to me to be the nature of the complex structure induced by a rotation.  Observe that the rotating space passes through the boundary almost as if we were observing the wind on the rotating box, but from the reference frame of our rectangle.  

### The rotational derivative of a field

With the help of Claude, let's take the "rotational derivative" of $$\shape{R}(\p')$$ with respect to $$\alpha$$:

To find $$\frac{\partial\shape{R}}{\partial\alpha}$$, we start with the rotated scalar field $$\shape{R}(\p')$$, where $$\p' = T(\alpha)\,\p$$ is the rotated position vector.

$$\frac{\partial\shape{R}}{\partial\alpha} = \frac{\partial\shape{R}}{\partial\p'} \cdot \pdv{\p'}{\alpha}$$

Using the chain rule and the fact that $$\p' = T(\alpha)\,\p$$, we have:

$$\pdv{\p'}{\alpha} = 
\frac{\partial}{\partial\alpha}(T(\alpha)\,\p) = 
\pdv{T}{\alpha}\,\p =
T(\alpha) \; T\!\left(\frac{\pi}{2}\right) \p$$

Substituting into the earlier expression and defining our quarter-turned $$\p$$ as $$\p_i \equiv T\!\left(\frac{\pi}{2}\right) \p$$:

$$\frac{\partial\shape{R}}{\partial\alpha} 
 = \frac{\partial\shape{R}}{\partial\p'} \cdot T(\alpha) \p_i
 = \nabla_{\p'}\shape{R} \cdot T(\alpha) \p_i$$

In 2D, $$T\!\left(\frac{\pi}{2}\right)\!: (x, y) \mapsto (-y, x)$$, the same operation as multiplying $$x + iy$$ by $$i$$.

### Connection to UGFs

If we are interested in $$\frac{\partial\shape{R}}{\partial\alpha}$$ for an unrotated object, we can set $$\alpha = 0$$, so $$T(\alpha)$$ becomes the identity, so:

$$\frac{\partial\shape{R}}{\partial\alpha} 
 = \nabla_{\p'}\shape{R} \cdot \p_i$$

As our rotation $$T$$ is a rigid motion, if $$\nabla_{\p}\shape{R}$$ is a UGF, so is $$\nabla_{\p'}\shape{R}$$.  Therefore, the property that avoids stretching in the rotational derivative is the property of having unit gradient magnitude, the defining property of UGFs (and of which SDFs are subset).  Uncomment line 91 in the Shadertoy to try a shape with a non-Euclidean metric to see what happens if you break UGFness.  

## Differential systems engineering

Once we have parametric shape providers and fitness evaluators, we can connect them into PLM frameworks and consider systems models of process and product scale generative design.  For example, consider the problem of fining the optimal orientation to place a part in advanced manufacturing, where perhaps we want to minimize material consumption use while minimizing deflection:

<object data="/assets/blog/Differentiable/AdditiveSupportOpt.svg" type="image/svg+xml"></object>

We have our placed CAD part $$\Shape(w, h, \alpha, \ldots)$$, our supports $$\Psi(\Shape, \ldots)$$, and fitnesses like volume of $$\Psi$$ and max deflection $$\delta$$.  Then:

$${\pdv{\fitness}{\alpha} = \pdv{\fitness}{\Psi} \pdv{\Psi}{\Shape} \pdv{\Shape}{\alpha}}$$

Observe that the shapes are spatially varying scalars, and that when we derive one CAD model from another, as common in tooling, we can pass the relationship along via the chain rule.  While it's not always possible to change part parameters to improve manufacturing performance, these chained relationships indicate such sensitivities, showing causality typically obscured by disjointed PLM processes.  

Clearly, we can chain derived parts to more derived parts.  Are there other structures we can form?  Multiple parts could contribute to one, as in a CAD assembly.  Consider parts $$\Shape_1(\parameters_1)$$ and $$\Shape_2(\parameters_2)$$ assembled into Assembly $$\Shape_A$$ via assembly placement parameters $$\parameters_A$$ including separation distance $$d$$.  

<object data="/assets/blog/Differentiable/DifferentiableAssembly.svg" type="image/svg+xml"></object>

Then:

$$\Shape_A = \Shape_A(\Shape_1, \Shape_2, \parameters_A) \;.$$

Similarly, for analogously named fitnesses:

$$\fitness_A = \fitness_A(\Shape_A) = \fitness_A(\Shape_1, \Shape_2, \parameters_A) \;.$$

This structure mirrors the V model of systems engineering, where a design process commences with high level fitness requirements, becomes subdivided into subsystems and subassemblies, finally designed at the individual component level at the bottom of the V.  Then integration and validation exercises validation these fitnesses all the way back up.  Differentiable engineering pipelines therefore should fit naturally in the PLM and other product development methodologies.  

<object data="/assets/blog/Differentiable/DifferentiableVeeModel.svg" type="image/svg+xml"></object>

As artificial intelligence becomes increasingly present in our engineering processes, it appears that differentiable engineering's inherent compatibility with the V model may expedite integrating human designers with intelligent design aides at product scale problems. 

## Background and credits

With the launch of interactivity in [nTop](https://www.ntop.com) 3.0 three years ago, we shared some research around ["CodeReps"](https://www.ntop.com/resources/product-updates/codereps-a-better-way-to-communicate/), which showed how we could export nTop data as pure code.  [Sandy](https://www.linkedin.com/in/sandilya-kambampati-85595475/) from [Intact](https://www.intact-solutions.com/) not only performed simulations on these code reps, he also observed that we could take parametric derivatives of it for the purpose of optimization, should CodeReps become pervasive.  Trevor from nTop also saw potential of geometry to be a parametric black box for optimization routines.  [Matt Keeter](https://www.mattkeeter.com/) how to use such derivatives for parametric editing in [libfive studio](https://libfive.com/studio/) when explicitly declared, and Luke Church prototyped a 2D implicit modeler that provided UX on-the-fly on the local parametric sensitivities.  

Around that time I started to notice the use of differentiable simulation pipelines, both in open source packages like [FEniCS](https://fenicsproject.org/) and research using the adjoint method. About a year ago, Jon Hiller and I started regular conversations about the future of implicit modeling and generative design, and became interested in the challenge of federating separate CAD, CAM, and CAE tools through differentiable interfaces.  Would be be possible to design such APIs to support the different differentiation techniques, such as forward, reverse, and symbolic approaches in a manner that could scale to product definitions?  Eventually, I test drove [Engineering Sketch Pad](https://acdl.mit.edu/ESP/ESP_flyer.pdf) and met [Afshawn](https://www.linkedin.com/in/afshawn-lotfi/) from [Open Orion](https://openorion.org/), who are making explicit differential tech usable for design engineers.    

2024 appears to be a great year for differential engineering.  nTop's [new kernel](https://cdfam.com/ntop-siemens/) has a great engine for derivatives, which has unprecedented potential for automation and interop.  [Gradient Control Laboratories](https://www.gradientcontrol.com/)' meta-kernel generates forward-mode AD while generating other useful transformations like symbolic derivatives.  I expect both technologies to be used as black boxes to realize the first generation of differential interoperability.  

Please be in touch if you have have direct interest in getting started with differentiable engineering.  