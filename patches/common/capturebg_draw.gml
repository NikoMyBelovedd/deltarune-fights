// Flat backdrop behind the boss while capturing menu previews (see drweb_capture_step).
// capturekey=1: key colour to cut out later; capturekey=0: black, like the menu behind it (for translucent effects).
if (global.drweb_capturekey)
    draw_set_color(make_color_rgb(1, 0, 254));
else
    draw_set_color(c_black);
draw_rectangle(-4000, -4000, 8000, 8000, false);
// 4x4 marker in the view's top-left corner tells the capture tool the backdrop is up.
var _vx = camera_get_view_x(view_camera[0]);
var _vy = camera_get_view_y(view_camera[0]);
draw_set_color(make_color_rgb(1, 0, 254));
draw_rectangle(_vx, _vy, _vx + 3, _vy + 3, false);
draw_set_color(c_white);
