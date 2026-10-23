var<private> v : vec4<f32>;

fn main_inner(v_1 : vec4<f32>) {
  v = v_1;
}

@fragment
fn main(@location(0u) v_2 : vec4<f32>) -> @location(0u) vec4<f32> {
  main_inner(v_2);
  return v;
}
