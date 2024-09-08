---
title: Knowing versus experiencing math
tags: Education Geometry
---

On the Geometric Processing Worldwide Discord server (contact me for an invite), a frequent participant was lamenting the challenge of absorbing all the great work going on in computational geometry.  It caused me to consider my own challenges with learning math.

For a long time I wanted to know math.  I thought that I could learn what was out there but by glossing over the text and seeing the ideas, maintaining some sort of mental index to the math I might someday need to use.  I would assume that the author's introductory instructions to do the exercises didn't apply to me.  I usually only made it a few chapters into such texts.

 <!--more-->

What changed it for me was [Tristan Needham](https://www.usfca.edu/faculty/tristan-needham){:target="_blank"}'s [_Visual Complex Analysis_](https://www.amazon.com/gp/product/0198534469/ref=as_li_tl?ie=UTF8&camp=1789&creative=9325&creativeASIN=0198534469&linkCode=as2&tag=visualcomplexana&linkId=5a33a723c536b28ce25c6100ce67f927){:target="_blank"}.  I was right with him through the chapter on non-Euclidean geometry, at which point I was inspired to write a hyperbolic geometry kernel as an art project.  (There's more room to put stuff in hyperbolic space, so there are obvious engineering applications e.g. to make smaller mobile phones.)   

In the process of representing circlines (circles that can have infinite radius) in hyperbolic space, I started with simple constructions, but the approach seemed clumsy and inelegant.  Empowered by the text, I was able to just absorb enough of [some notes by Casselman](http://www.math.ubc.ca/~cass/research/pdf/Geometry.pdf){:target="_blank"} to directly transform the circlines by conjugating with M&ouml;bius transformations, all in matrix representation.  Although I had previously struggled with the abstractions of group theory, I could now appreciate this deeper pattern in algebra.  

The first app based off the kernel with a Poincar&eacute; disc viewer hooked up to a joystick that I took to lowbrow art events, Burning Man, etc.  People loved not only the art, but also learning about the extra motions of hyperbolic space.  [The desktop version is here.](https://github.com/bcourter/Poincare-Kaleidoscope){:target="_blank"}  I later made a web version that works differently.  It needs a new backend for image upload and has some other glitches, but [here](https://www.blakecourter.com/homepage/Poincare-WebGL/){:target="_blank"}.

<div class="extensions extensions--video">
  <iframe src="https://www.blakecourter.com/homepage/Poincare-WebGL/"
    frameborder="0" scrolling="no" allowfullscreen></iframe>
</div>

Through these projects, I finally realized what the authors meant about math being best experienced, instead of just known.  This journey empowered me to pursue new approaches in implicit modeling where, despite continuing my math education, I appear to have a list of questions that grows longer every time I try to write down and document something that I think I know.  Perhaps doing the exercises in those textbooks would have provided similar experiences.

In computational geometry today, there appears to be a trend of putting cool number fields on explicit geometry and solving for lovely and useful properties, mostly on the surface.  Cool stuff, but math-heavy.  There are many other techniques that have created pockets of interest in the past, such as level sets, subdivision surfaces, and even solid modeling itself, all of which seem to have mathematical barriers to entry.  Academic circles often appear to reinforce variations on particularly beautiful or useful constructs like these, but you have to work to get there.  If you are pursuing an academic career, you likely have the support of your institution to ramp up into such territory, but I have found it difficult to navigate independently.  Fortunately, the community appears to offer plenty of on-ramps, such as [Alec Jacobson's](https://github.com/alecjacobson/geometry-processing-csc2520){:target="_blank"} and [Keenan Crane's](https://www.cs.cmu.edu/~kmcrane/Projects/DDG/){:target="_blank"}.  

If there is any one piece of advice I can offer, it is to be intentional with your curiosity.  If you find yourself becoming interested in a problem, enable yourself to pursue it with reasonable boundaries.  Stop and smell the flowers when they appear.  Don't worry about where things will lead.  Also, don't confuse commercial activity with art or educational experiments.  In the former, the customer's voice and deployment should dominate priorities, but in the latter you have complete creative authority, and time is on your side.

Meanwhile, I'm thrilled to be working through Needham's [visual approach to differential geometry](https://www.vdgf.space/){:target="_blank"}, and look forward to someday finishing _Visual Complex Analysis_.  