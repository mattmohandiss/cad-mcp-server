mod config;
mod emitter;
mod run;
mod types;

use anyhow::Result;

fn main() -> Result<()> {
    run::run()
}
