SRCDIR  := $(abspath $(lastword $(MAKEFILE_LIST))/..)
VERSION := $(shell cat VERSION)
PYTHON  := uv run --with fontparts --with xmltodict --with fonttools python

SOURCES := $(wildcard sources/*/*.ufo)
OTFNAMES := $(patsubst sources/%.ufo,otf/%.otf,$(SOURCES))
TTFNAMES := $(patsubst sources/%.ufo,ttf/%.ttf,$(SOURCES))
WOFFNAMES := $(patsubst sources/%.ufo,woff/%.woff,$(SOURCES))
WOFF2NAMES := $(patsubst sources/%.ufo,woff2/%.woff2,$(SOURCES))
OTFS  := $(patsubst otf/%.otf,fonts/otf/%.otf,$(OTFNAMES))
TTFS  := $(patsubst ttf/%.ttf,fonts/ttf/%.ttf,$(TTFNAMES))
WOFFS := $(patsubst woff/%.woff,fonts/woff/%.woff,$(WOFFNAMES))
WOFF2S := $(patsubst woff2/%.woff2,fonts/woff2/%.woff2,$(WOFF2NAMES))

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

fonts/otf/%.otf: sources/%.ufo
	@mkdir -p $(@D)
	tools/process-font.sh $< $@

fonts/ttf/%.ttf: sources/%.ufo
	@mkdir -p $(@D)
	tools/process-font.sh $< $@

fonts/woff/%.woff: fonts/ttf/%.ttf
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
	  --html fontbakery-variable-report.html variable_ttf/*.ttf
	-fontbakery check-universal --verbose --full-lists \
	  --html fontbakery-static-report.html fonts/ttf/Dinsy/*.ttf
