use std::path::PathBuf;

use anyhow::{Context, Result};

use super::config;
use super::emitter;
use super::types::MethodKind;

fn project_root() -> Result<PathBuf> {
    let dir = std::env::var("CARGO_MANIFEST_DIR")
        .unwrap_or_else(|_| env!("CARGO_MANIFEST_DIR").to_string());
    Ok(PathBuf::from(dir)
        .parent()
        .context("no parent")?
        .to_path_buf())
}

pub fn run() -> Result<()> {
    let root = project_root()?;
    let facade_out = root.join("facade/generated");

    std::fs::create_dir_all(&facade_out).context("failed to create facade/generated/")?;

    let all_methods = config::target_methods();

    config::validate(all_methods).context("method spec validation failed")?;

    let generable: Vec<&_> = all_methods
        .iter()
        .filter(|m| m.kind != MethodKind::Skip)
        .collect();

    let skipped = all_methods.len() - generable.len();

    eprintln!(
        "Codegen: {} methods generable, {skipped} skipped, {} total",
        generable.len(),
        all_methods.len()
    );

    let kernel_cpp = emitter::emit_kernel(&generable);
    let bindings_cpp = emitter::emit_bindings(&all_methods.iter().collect::<Vec<_>>());

    let kernel_path = facade_out.join("kernel.cpp");
    let bindings_path = facade_out.join("bindings.cpp");

    std::fs::write(&kernel_path, &kernel_cpp).context("failed to write kernel.cpp")?;
    std::fs::write(&bindings_path, &bindings_cpp).context("failed to write bindings.cpp")?;

    eprintln!("  Wrote {}", kernel_path.display());
    eprintln!("  Wrote {}", bindings_path.display());

    let mut categories: std::collections::BTreeMap<&str, usize> = std::collections::BTreeMap::new();
    for m in &generable {
        *categories.entry(m.category).or_insert(0) += 1;
    }
    for (cat, count) in &categories {
        eprintln!("    {cat}: {count} methods");
    }

    Ok(())
}
