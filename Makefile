.PHONY: install typecheck test check

# Install all workspace dependencies and register every extension with pi.
install:
	npm install
	npm run install:pi

typecheck:
	npm run typecheck --workspaces

test:
	npm run test --workspaces --if-present

check: typecheck test
