struct Camera_1_1 {
  view_projection : mat4x4<f32>,
}

@group(1u) @binding(0u) var<uniform> v : Camera_1_1;

var<private> v_1 : vec2<f32>;

var<private> v_2 : vec4<f32>;

var<private> v_3 : vec4<f32>;

fn main_inner(v_4 : vec2<f32>, v_5 : vec2<f32>, v_6 : vec4<f32>, v_7 : vec4<f32>, v_8 : vec4<f32>, v_9 : vec4<f32>) {
  var v_10 : vec2<f32>;
  let v_11 = v_6.zw;
  let v_12 = (v_9.yz * v_11);
  let v_13 = v_9.x;
  let v_14 = cos(v_13);
  let v_15 = sin(v_13);
  v_10 = ((v_4 * v_11) - v_12);
  let v_16 = ((v_6.xy + v_12) + vec2<f32>(((v_10.x * v_14) - (v_10.y * v_15)), ((v_10.x * v_15) + (v_10.y * v_14))));
  let v_17 = (vec4<f32>(v_16.x, v_16.y, 0.0f, 1.0f) * transpose(v.view_projection));
  v_1 = (v_7.xy + (v_5 * v_7.zw));
  v_2 = v_8;
  v_3 = v_17;
}

struct tint_symbol {
  @location(0u)
  m : vec2<f32>,
  @location(1u)
  m_1 : vec4<f32>,
  @builtin(position)
  m_2 : vec4<f32>,
}

@vertex
fn main(@location(0u) v_18 : vec2<f32>, @location(1u) v_19 : vec2<f32>, @location(2u) v_20 : vec4<f32>, @location(3u) v_21 : vec4<f32>, @location(4u) v_22 : vec4<f32>, @location(5u) v_23 : vec4<f32>) -> tint_symbol {
  main_inner(v_18, v_19, v_20, v_21, v_22, v_23);
  return tint_symbol(v_1, v_2, v_3);
}
