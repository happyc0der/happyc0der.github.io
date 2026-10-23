var<private> v : u32;

fn main_inner(v_1 : u32) {
  v = v_1;
}

@fragment
fn main(@location(0u) @interpolate(flat) v_2 : u32) -> @location(0u) @interpolate(flat) u32 {
  main_inner(v_2);
  return v;
}
