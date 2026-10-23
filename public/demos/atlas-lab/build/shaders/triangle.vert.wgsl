var<private> v : vec4<f32>;

var<private> v_1 : vec4<f32>;

fn main_inner(vertex_index : u32) {
  var v_2 : array<vec2<f32>, 3u>;
  var v_3 : array<vec3<f32>, 3u>;
  v_2 = array<vec2<f32>, 3u>(vec2<f32>(0.0f, 0.60000002384185791016f), vec2<f32>(-0.60000002384185791016f), vec2<f32>(0.60000002384185791016f, -0.60000002384185791016f));
  let v_4 = v_2[vertex_index];
  v_3 = array<vec3<f32>, 3u>(vec3<f32>(1.0f, 0.20000000298023223877f, 0.20000000298023223877f), vec3<f32>(0.20000000298023223877f, 1.0f, 0.20000000298023223877f), vec3<f32>(0.20000000298023223877f, 0.20000000298023223877f, 1.0f));
  let v_5 = v_3[vertex_index];
  v = vec4<f32>(v_5.x, v_5.y, v_5.z, 1.0f);
  v_1 = vec4<f32>(v_4.x, v_4.y, 0.0f, 1.0f);
}

struct tint_symbol {
  @location(0u)
  m : vec4<f32>,
  @builtin(position)
  m_1 : vec4<f32>,
}

@vertex
fn main(@builtin(vertex_index) vertex_index : u32) -> tint_symbol {
  main_inner(vertex_index);
  return tint_symbol(v, v_1);
}
