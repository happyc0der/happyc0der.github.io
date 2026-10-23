struct Chunk_1_1 {
  view_projection : mat4x4<f32>,
  origin_and_cell : vec4<f32>,
  m : vec4<u32>,
}

@group(1u) @binding(0u) var<uniform> v : Chunk_1_1;

var<private> v_1 : u32;

var<private> v_2 : vec4<f32>;

fn main_inner(vertex_id : u32, instance_id : u32) {
  let v_3 = v.m.x;
  let v_4 = v.origin_and_cell.z;
  let v_5 = (v.origin_and_cell.xy + ((vec2<f32>(f32((instance_id % v_3)), f32((instance_id / v_3))) + vec2<f32>(f32((vertex_id & 1u)), f32((vertex_id >> 1u)))) * v_4));
  let v_6 = (vec4<f32>(v_5.x, v_5.y, 0.0f, 1.0f) * transpose(v.view_projection));
  v_1 = ((v.m.y + instance_id) + 1u);
  v_2 = v_6;
}

struct tint_symbol {
  @location(0u) @interpolate(flat)
  m_1 : u32,
  @builtin(position)
  m_2 : vec4<f32>,
}

@vertex
fn main(@builtin(vertex_index) vertex_id : u32, @builtin(instance_index) instance_id : u32) -> tint_symbol {
  main_inner(vertex_id, instance_id);
  return tint_symbol(v_1, v_2);
}
