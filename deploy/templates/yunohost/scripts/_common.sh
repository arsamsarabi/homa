#!/bin/bash
# Shared by the install, upgrade and restore scripts.

bun_bin="$install_dir/bun/bun"

# Installs the pinned Bun, the dependencies, and builds the web app.
homa_build() {
	ynh_setup_source --dest_dir="$install_dir/bun" --source_id=bun --full_replace
	chmod +x "$bun_bin"
	pushd "$install_dir/app"
	ynh_exec_as_app "$bun_bin" install --frozen-lockfile
	ynh_exec_as_app "$bun_bin" run build
	popd
}
