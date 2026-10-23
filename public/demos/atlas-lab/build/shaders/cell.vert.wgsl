struct Cells_1_1 {
  view_projection : mat4x4<f32>,
  cell_size : vec4<f32>,
  m : vec4<u32>,
}

@group(1u) @binding(0u) var<uniform> v : Cells_1_1;

var<private> v_1 : vec4<f32>;

var<private> v_2 : vec4<f32>;

fn main_inner(v_3 : vec4<f32>, vertex_id : u32, instance_id : u32) {
  let v_4 = v.m.x;
  let v_5 = (v_4 * v_4);
  let v_6 = (v.m.z + (instance_id / v_5));
  let v_7 = (instance_id % v_5);
  let v_8 = (((v_6 % v.m.y) * v_4) + (v_7 % v_4));
  let v_9 = (((v_6 / v.m.y) * v_4) + (v_7 / v_4));
  let v_10 = ((vec2<f32>(f32(v_8), f32(v_9)) + vec2<f32>(f32((vertex_id & 1u)), f32((vertex_id >> 1u)))) * v.cell_size.x);
  let v_11 = (vec4<f32>(v_10.x, v_10.y, 0.0f, 1.0f) * transpose(v.view_projection));
  v_1 = v_3;
  v_2 = v_11;
}

struct tint_symbol {
  @location(0u)
  m_1 : vec4<f32>,
  @builtin(position)
  m_2 : vec4<f32>,
}

@vertex
fn main(@location(0u) v_12 : vec4<f32>, @builtin(vertex_index) vertex_id : u32, @builtin(instance_index) instance_id : u32) -> tint_symbol {
  main_inner(v_12, vertex_id, instance_id);
  return tint_symbol(v_1, v_2);
}
