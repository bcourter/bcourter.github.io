/*
Copyright (c) 2013 Suffick at Codepen (http://codepen.io/suffick) and GitHub (https://github.com/suffick)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

// settings

var physics_accuracy = 3,
    mouse_influence = 20,
    mouse_cut = 5,
    gravity = 1200,
   // cloth_height = 30,
  //  cloth_width = 50,
  //  start_y = 20,
  //  spacing = 7,
    tear_distance = 60;

var soften = 1000;


window.requestAnimFrame =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function (callback) {
        window.setTimeout(callback, 1000 / 60);
};

var canvas,
    ctx,
    cloth,
    boundsx,
    boundsy,
    mouse = {
        down: false,
        button: 1,
        x: 0,
        y: 0,
        px: 0,
        py: 0
    };

var Point = function (x, y) {

    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.vx = 0;
    this.vy = 0;
    this.pin_x = null;
    this.pin_y = null;

    this.constraints = [];
};

Point.prototype.update = function (delta) {

    if (mouse.down) {

        var diff_x = this.x - mouse.x,
            diff_y = this.y - mouse.y,
            dist = Math.sqrt(diff_x * diff_x + diff_y * diff_y);

        if (mouse.button == 1) {

            if (dist < mouse_influence) {
                this.px = this.x - (mouse.x - mouse.px) * 1.8;
                this.py = this.y - (mouse.y - mouse.py) * 1.8;
            }

        } else if (dist < mouse_cut) this.constraints = [];
    }

    this.add_force(0, gravity /  soften);

    delta *= delta;
    nx = this.x + ((this.x - this.px) * .99) + ((this.vx / 2) * delta);
    ny = this.y + ((this.y - this.py) * .99) + ((this.vy / 2) * delta);

    this.px = this.x;
    this.py = this.y;

    this.x = nx;
    this.y = ny;

    this.vy = this.vx = 0
};

Point.prototype.draw = function () {

    if (this.constraints.length <= 0) return;

    var i = this.constraints.length;
    while (i--) this.constraints[i].draw();
};

Point.prototype.resolve_constraints = function () {

    if (this.pin_x != null && this.pin_y != null) {

        this.x = this.pin_x;
        this.y = this.pin_y;
        return;
    }

    var i = this.constraints.length;
    while (i--) this.constraints[i].resolve();

    if (this.x > boundsx) {

        this.x = 2 * boundsx - this.x;
        
    } else if (this.x < 1) {

        this.x = 2 - this.x;
    }

    if (this.y > boundsy) {

        this.y = 2 * boundsy - this.y;
        
    } else if (this.y < 1) {

        this.y = 2 - this.y;
    }
};

Point.prototype.separate = function (point, distance) {
    this.constraints.push(
        new Constraint(this, point, distance)
    );
};


Point.prototype.attach = function (point) {
    this.constraints.push(
        new Constraint(this, point, spacing)
    );
};

Point.prototype.remove_constraint = function (lnk) {
    var i = this.constraints.length;
    while (i--)
        if (this.constraints[i] == lnk) this.constraints.splice(i, 1);
};

Point.prototype.add_force = function (x, y) {
    this.vx += x;
    this.vy += y;
};

Point.prototype.pin = function (pinx, piny) {
    this.pin_x = pinx;
    this.pin_y = piny;
};

var Constraint = function (p1, p2, distance) {
    this.p1 = p1;
    this.p2 = p2;
    this.length = distance;
};

Constraint.prototype.resolve = function () {

    var diff_x = this.p1.x - this.p2.x,
        diff_y = this.p1.y - this.p2.y,
        dist = Math.sqrt(diff_x * diff_x + diff_y * diff_y),
        diff = (this.length - dist) / dist;

    if (dist > tear_distance) this.p1.remove_constraint(this);

    var px = diff_x * diff * 0.5 / soften;
    var py = diff_y * diff * 0.5 / soften;

    this.p1.x += px;
    this.p1.y += py;
    this.p2.x -= px;
    this.p2.y -= py;
};

var drawScale = 500;
Constraint.prototype.draw = function () {

    ctx.moveTo(this.p1.x * drawScale, this.p1.y * drawScale);
    ctx.lineTo(this.p2.x * drawScale, this.p2.y * drawScale);
};

var Cloth = function (edges) {

    this.points = [];

    var maxEdge = 0.3;

    for (var i = 0; i < edges.length; i++) {
        var vertices = edges[i].vertices;
        var a = vertices[0];
        var b = vertices[vertices.length - 1];
 
        var pa = getPoint(this.points, a);
        if (pa == null) {
            pa = new Point(a.x + 0.5, a.y);
            this.points.push(pa);
        }

        var pb = getPoint(this.points, b);
        if (pb == null) {
            pb = new Point(b.x + 0.5, b.y);
            this.points.push(pb);
        }

        var distance = a.distanceTo(b);

        if (distance < maxEdge)
           pa.separate(pb, distance);

        var pinthresh = 0.01;
        if (pa.y < pinthresh) 
           pa.pin(pa.x, pa.y); 
        if (pb.y < pinthresh) 
           pb.pin(pb.x, pb.y);
    }
};

function getPoint(points, point) {
    for (var i = 0; i < points.length; i++) {
        var p = points[i];
        var dx = p.x - point.x;
        var dy = p.y - point.y;
        if (dx * dx + dy * dy < 1E-10)
            return p;
    }

    return null;
}


// var Cloth = function () {

//     this.points = [];

//     var start_x = canvas.width / 2 - cloth_width * spacing / 2;

//     for (var y = 0; y <= cloth_height; y++) {

//         for (var x = 0; x <= cloth_width; x++) {

//             var p = new Point(start_x + x * spacing, start_y + y * spacing);

//             x != 0 && p.attach(this.points[this.points.length - 1]);
//             y == 0 && p.pin(p.x, p.y);
//             y != 0 && p.attach(this.points[x + (y - 1) * (cloth_width + 1)])

//             this.points.push(p);
//         }
//     }
// };

Cloth.prototype.update = function () {

    var i = physics_accuracy;

    while (i--) {
        var p = this.points.length;
        while (p--) this.points[p].resolve_constraints();
    }

    i = this.points.length;
    while (i--) this.points[i].update(.016);
};

Cloth.prototype.draw = function () {

    ctx.beginPath();

    var i = cloth.points.length;
    while (i--) cloth.points[i].draw();

    ctx.stroke();
};

function update() {

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    cloth.update();
    cloth.draw();

    requestAnimFrame(update);
}

function start() {

    canvas.onmousedown = function (e) {
        mouse.button = e.which;
        mouse.px = mouse.x;
        mouse.py = mouse.y;
        var rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left,
        mouse.y = e.clientY - rect.top,
        mouse.down = true;
        e.preventDefault();
    };

    canvas.onmouseup = function (e) {
        mouse.down = false;
        e.preventDefault();
    };

    canvas.onmousemove = function (e) {
        mouse.px = mouse.x;
        mouse.py = mouse.y;
        var rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left,
        mouse.y = e.clientY - rect.top,
        e.preventDefault();
    };

    canvas.oncontextmenu = function (e) {
        e.preventDefault();
    };

    boundsx = canvas.width - 1;
    boundsy = canvas.height - 1;

    ctx.strokeStyle = '#888';
}

window.onload = function () {

    canvas = document.getElementById('c');
    ctx = canvas.getContext('2d');

    var spoonflowerwidth = 8100;
    var spoonflowerheight = 18100;
    var scale = 1/10;

    canvas.width = spoonflowerwidth * scale;
    canvas.height = spoonflowerheight * scale;

    start();
};

function start2D(edges) {
    cloth = new Cloth(edges);
    update();
}