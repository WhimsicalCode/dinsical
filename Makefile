SRCDIR  := $(abspath $(lastword $(MAKEFILE_LIST))/..)
VERSION := $(shell cat VERSION)
PYTHON  := uv run --with fontparts --with xmltodict --with fonttools python

SOURCES := $(wildcard sources/Dinsy/*.ufo)
NAMES   := $(patsubst sources/Dinsy/%.ufo,%,$(SOURCES))
OTFS    := $(patsubst %,fonts/otf/%.otf,$(NAMES))
TTFS    := $(patsubst %,fonts/ttf/%.ttf,$(NAMES))
WOFFS   := $(patsubst %,fonts/woff/%.woff,$(NAMES))
WOFF2S  := $(patsubst %,fonts/woff2/%.woff2,$(NAMES))

.PHONY: all sources build full release update-upstream clean dist-clean help

all: sources full  ## Default: derive sources then full build

sources:  ## Derive sources from dinish/ submodule + overlay
	$(PYTHON) tools/derive-sources.py

build: sync_features $(OTFS) $(TTFS) $(WOFFS) $(WOFF2S)  ## Quick static-only build from current sources

full:  ## Full build: all weights + italics + variable font (syncs to fonts/)
	bash tools/build-ephemeral-ufos.sh

release:  ## Bump version, derive, build, update changelog, commit, tag
	$(PYTHON) tools/release.py

update-upstream:  ## Pull latest upstream from playbeing/dinish
	git submodule update --remote dinish
	@echo ""
	@echo "dinish updated. Review changes with:"
	@echo "  git -C dinish log --oneline HEAD@{1}..HEAD"
	@echo "Then run 'make release' to incorporate."

clean:  ## Remove built fonts from repo
	rm -rf fonts/

clean-build:  ## Remove ephemeral build directory (.build/)
	rm -rf .build/

dist-clean: clean clean-build  ## Remove all generated files

help:  ## Show this help
	@grep -E '^[a-z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

fonts/otf/%.otf: sources/Dinsy/%.ufo
	@mkdir -p $(@D)
	tools/process-font.sh $< $@

fonts/ttf/%.ttf: sources/Dinsy/%.ufo
	@mkdir -p $(@D)
	tools/process-font.sh $< $@

fonts/woff/%.woff: fonts/ttf/%.woff
	@mkdir -p $(@D)
	tools/process-font.sh $< $@

fonts/woff2/%.woff2: fonts/ttf/%.ttf
	@mkdir -p $(@D)
	tools/process-font.sh $< $@

.PHONY: sync_features fontbakery
sync_features:
	tools/sync-features.sh

fontbakery:
	-fontbakery check-universal --verbose --full-lists \
	  --html fontbakery-variable-report.html fonts/ttf/Dinsy-Var.ttf
	-fontbakery check-universal --verbose --full-lists \
	  --html fontbakery-static-report.html fonts/ttf/Dinsy-*.ttf
